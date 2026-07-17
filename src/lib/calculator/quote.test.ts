import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  COMPUTE_PRESETS,
  GPU_PRESETS,
  computePresetsByFamily,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  buildQuotesByPeriod,
  quoteAllPresets,
  quotePreset,
  toViewQuote,
} from '@/lib/calculator/quote';

const MONTH_HOURS = 720;
const ALL_PRESETS = [...COMPUTE_PRESETS, ...GPU_PRESETS];

function isPreemptibleMeter(name: string, purchaseModel: unknown): boolean {
  return /preempt/i.test(String(purchaseModel ?? '')) || /preempt/i.test(name);
}

function sharePercent(meter: {dimensions: Record<string, unknown>}): number | null {
  const share = String(meter.dimensions.guaranteedVcpuShare ?? '');
  const pct = share.match(/(\d+)\s*%/);
  return pct ? Number(pct[1]) : null;
}

describe('calculator quote arbitration', () => {
  it('quotes every compute preset with at least one provider', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      assert.ok(result.best, `expected a best offer for ${preset.id}`);
      assert.ok(result.quotes.length >= 1, `expected quotes for ${preset.id}`);
      assert.equal(result.alternateQuotes.length, 0);
    }
  });

  it('keeps compute quotes sorted ascending and best = cheapest', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (let i = 1; i < result.quotes.length; i++) {
        assert.ok(
          result.quotes[i - 1]!.total <= result.quotes[i]!.total,
          `${preset.id}: quotes not sorted`,
        );
      }
      assert.equal(result.best?.total, result.quotes[0]?.total);
    }
  });

  it('builds orderable compute combos (region + platform + disk)', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const isFlavor = q.parts.some((p) => p.id === 'bundle');
        if (isFlavor) {
          const [flavor, disk] = q.meters;
          assert.ok(flavor, `${q.providerName}: missing flavor`);
          assert.equal(flavor.meter, 'compute.flavor');
          assert.ok(disk, `${q.providerName}: missing disk beside flavor`);
          assert.equal(
            String(disk.region ?? ''),
            String(flavor.region ?? ''),
            `${q.providerName}: disk region mismatch vs flavor`,
          );
          continue;
        }
        const [vcpu, ram, disk] = q.meters;
        assert.ok(vcpu && ram, `${q.providerName}: missing vcpu/ram`);
        assert.equal(
          String(vcpu.region ?? ''),
          String(ram.region ?? ''),
          `${q.providerName}: region mismatch vCPU/RAM`,
        );
        const vp = String(vcpu.dimensions.cpuPlatformFamily ?? '');
        const rp = String(ram.dimensions.cpuPlatformFamily ?? '');
        if (vp && rp) {
          assert.equal(vp, rp, `${q.providerName}: platform mismatch`);
        }
        assert.ok(disk, `${q.providerName}: missing disk`);
        assert.equal(
          String(disk.region ?? ''),
          String(vcpu.region ?? ''),
          `${q.providerName}: disk region mismatch`,
        );
      }
    }
  });

  it('prefers SSD/NVMe disk media when available in the region', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const disk = q.meters.find((m) => m.meter === 'storage.block.capacity');
        if (!disk) continue;
        const hay =
          `${disk.dimensions.performanceTier || ''} ${disk.dimensions.storageMedia || ''} ${disk.name}`.toLowerCase();
        if (/hdd/.test(hay) && !/ssd|nvme/.test(hay)) {
          assert.fail(`${preset.id}/${q.providerName}: picked HDD without SSD fallback check`);
        }
      }
    }
  });

  it('excludes fractional-guarantee unit cores from low-cost (flavor shares allowed)', () => {
    const lowCost = COMPUTE_PRESETS.filter((p) => p.family === 'low-cost');
    assert.ok(lowCost.length >= 1);
    for (const preset of lowCost) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const core = q.meters[0]!;
        // Cloud.ru-style fractional flavors are the cheap tier; unit 5%/20% cores are not.
        if (core.meter === 'compute.flavor') continue;
        const pct = sharePercent(core);
        if (pct != null) {
          assert.ok(pct >= 100, `${preset.id}/${q.providerName}: fractional unit core ${pct}%`);
        }
      }
    }
  });

  it('uses dedicated/on-demand cores for non-low-cost compute families', () => {
    const onDemandFamilies = COMPUTE_PRESETS.filter((p) => p.family !== 'low-cost');
    for (const preset of onDemandFamilies) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const core = q.meters[0]!;
        assert.ok(
          !isPreemptibleMeter(core.name, core.dimensions.purchaseModel ?? core.purchaseModel),
          `${preset.id}/${q.providerName}: preemptible vCPU in ${preset.family}`,
        );
        // Shared oversubscription (1:N / burst) must not win general/high tiers.
        assert.ok(
          !/\b1\s*:\s*[2-9]\d*\b/i.test(core.name),
          `${preset.id}/${q.providerName}: shared 1:N vCPU in ${preset.family}`,
        );
        const pct = sharePercent(core);
        if (pct != null) {
          assert.equal(pct, 100, `${preset.id}/${q.providerName}: expected 100% share, got ${pct}%`);
        }
      }
    }
  });

  it('includes Cloud.ru via exact compute.flavor when unit vCPU/RAM are not public', () => {
    // Cloud.ru publishes VM flavors, not unit compute.vcpu/ram rates.
    const withExactFlavor = [
      'gen-2-4',
      'gen-4-8',
      'gen-8-16',
      'gen-16-32',
      'gen-32-64',
      'low-2-4',
      'low-4-8',
      'low-8-16',
      'mem-4-32',
      'mem-16-128',
    ];
    for (const id of withExactFlavor) {
      const preset = COMPUTE_PRESETS.find((p) => p.id === id);
      assert.ok(preset, id);
      const result = quotePreset(preset, 'month');
      const cloudRu = result.quotes.find((q) => q.provider === 'cloud-ru');
      assert.ok(cloudRu, `${id}: expected Cloud.ru quote from flavor catalog`);
      assert.equal(cloudRu.meters[0]!.meter, 'compute.flavor');
      assert.ok(
        cloudRu.parts.some((p) => p.id === 'bundle'),
        `${id}: Cloud.ru should expose flavor as a bundle part`,
      );
      assert.ok(
        cloudRu.parts.some((p) => p.id === 'disk'),
        `${id}: Cloud.ru flavor quote must still include SSD`,
      );
    }

    // Large General presets must use 100% flavors from the PDF (not only share30).
    for (const id of ['gen-16-32', 'gen-32-64']) {
      const preset = COMPUTE_PRESETS.find((p) => p.id === id)!;
      const cloudRu = quotePreset(preset, 'month').quotes.find((q) => q.provider === 'cloud-ru')!;
      assert.equal(
        cloudRu.meters[0]!.dimensions.guaranteedVcpuShare,
        '100%',
        `${id}: expected dedicated 100% Cloud.ru flavor`,
      );
    }
  });

  it('never quotes meters whose notes mark availability as unconfirmed', () => {
    for (const preset of ALL_PRESETS) {
      const result = quotePreset(preset, 'month');
      const allQuotes = [...result.quotes, ...result.alternateQuotes];
      for (const q of allQuotes) {
        for (const meter of q.meters) {
          const note = String(meter.notes ?? '');
          assert.ok(
            !/не\s+подтвержд|not\s+confirmed|недоступ|снят[аоы]?\s+с/i.test(note),
            `${preset.id}/${q.providerName}: unconfirmed meter "${meter.name}"`,
          );
        }
      }
    }
  });

  it('low-cost is cheaper than general for the same 4/8 shape', () => {
    const low = COMPUTE_PRESETS.find((p) => p.id === 'low-4-8');
    const gen = COMPUTE_PRESETS.find((p) => p.id === 'gen-4-8');
    assert.ok(low && gen);
    const lowBest = quotePreset(low, 'month').best!;
    const genBest = quotePreset(gen, 'month').best!;
    assert.ok(
      lowBest.total < genBest.total,
      `expected low-cost ${lowBest.total} < general ${genBest.total}`,
    );
  });

  it('larger compute presets cost at least as much as smaller ones per provider', () => {
    for (const family of ['general', 'high-cpu', 'high-memory', 'low-cost'] as const) {
      const presets = computePresetsByFamily(family);
      assert.ok(presets.length >= 2);
      const byProvider = new Map<string, number[]>();
      for (const preset of presets) {
        for (const q of quotePreset(preset, 'month').quotes) {
          const arr = byProvider.get(q.provider) ?? [];
          arr.push(q.total);
          byProvider.set(q.provider, arr);
        }
      }
      for (const [provider, totals] of byProvider) {
        // Only compare when the provider quoted every size in the family.
        if (totals.length !== presets.length) continue;
        for (let i = 1; i < totals.length; i++) {
          assert.ok(
            totals[i]! + 0.01 >= totals[i - 1]!,
            `${family}/${provider}: size step not monotonic ${totals[i - 1]} -> ${totals[i]}`,
          );
        }
      }
    }
  });

  it('scales period amounts with 720h month (hour ↔ month ↔ year)', () => {
    const sample: ComputePreset = COMPUTE_PRESETS.find((p) => p.id === 'gen-4-8')!;
    const hour = quotePreset(sample, 'unit');
    const month = quotePreset(sample, 'month');
    const year = quotePreset(sample, 'year');
    assert.ok(hour.best && month.best && year.best);

    for (const provider of month.quotes.map((q) => q.provider)) {
      const h = hour.quotes.find((q) => q.provider === provider);
      const m = month.quotes.find((q) => q.provider === provider);
      const y = year.quotes.find((q) => q.provider === provider);
      if (!h || !m || !y) continue;
      assert.ok(
        Math.abs(h.total * MONTH_HOURS - m.total) / m.total < 0.001,
        `${provider}: hour*720 != month`,
      );
      assert.ok(Math.abs(m.total * 12 - y.total) / y.total < 0.001, `${provider}: month*12 != year`);
    }
  });

  it('compute notes describe the actual chosen vCPU class', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        assert.ok(q.note, `${preset.id}/${q.providerName}: missing note`);
        const core = q.meters[0]!;
        if (core.meter === 'compute.flavor') {
          assert.match(q.note!, /Flavor/i);
          continue;
        }
        const preemptible = isPreemptibleMeter(
          core.name,
          core.dimensions.purchaseModel ?? core.purchaseModel,
        );
        if (preemptible) {
          assert.match(q.note!, /Preemptible/i);
        } else if (/\b1\s*:\s*[2-9]\d*\b/i.test(core.name)) {
          assert.match(q.note!, /Shared/i);
        } else if (preset.family === 'low-cost') {
          assert.match(q.note!, /On-demand|выделен/i);
        } else {
          assert.match(q.note!, /On-demand|выделен/i);
        }
      }
    }
  });

  it('compute parts include vCPU, RAM and disk with expected labels', () => {
    const preset = COMPUTE_PRESETS.find((p) => p.id === 'gen-8-16')!;
    const result = quotePreset(preset, 'month');
    for (const q of result.quotes) {
      assert.equal(q.scope, 'compute');
      if (q.parts.some((p) => p.id === 'bundle')) {
        assert.equal(q.parts[0]!.label, '8 vCPU + 16 GiB RAM');
        assert.equal(q.parts.at(-1)!.id, 'disk');
        assert.equal(q.parts.at(-1)!.label, '100 GiB SSD');
        continue;
      }
      assert.deepEqual(
        q.parts.map((p) => p.id),
        ['vcpu', 'ram', 'disk'],
      );
      assert.equal(q.parts[0]!.label, '8 vCPU');
      assert.equal(q.parts[1]!.label, '16 GiB RAM');
      assert.equal(q.parts[2]!.label, '100 GiB SSD');
    }
  });

  it('never mixes gpu-only and bundle in the primary ranking', () => {
    for (const preset of GPU_PRESETS) {
      const result = quotePreset(preset, 'month');
      if (!result.quotes.length) continue;
      const scopes = new Set(result.quotes.map((q) => q.scope));
      assert.equal(scopes.size, 1, `${preset.id}: mixed scopes in primary quotes`);
      for (const alt of result.alternateQuotes) {
        assert.notEqual(
          alt.scope,
          result.quotes[0]!.scope,
          `${preset.id}: alternate leaked into same scope`,
        );
      }
      if (result.best) {
        assert.equal(result.best.scope, result.quotes[0]!.scope);
      }
    }
  });

  it('defaults GPU cards to gpu-only primary (unless preferBundle)', () => {
    for (const preset of GPU_PRESETS) {
      const result = quotePreset(preset, 'month');
      if (!result.best) continue;
      if (preset.preferBundle) {
        assert.equal(result.best.scope, 'bundle', `${preset.id} should prefer bundle`);
      } else if (result.quotes.some((q) => q.scope === 'gpu-only')) {
        assert.equal(result.best.scope, 'gpu-only', `${preset.id} should prefer gpu-only`);
      }
    }
  });

  it('matches GPU model family without L40/H200 cross-contamination', () => {
    const cases: Array<{presetId: string; must: RegExp; mustNot: RegExp}> = [
      {presetId: 'gpu-l4-1', must: /\bL4\b/i, mustNot: /L40/i},
      {presetId: 'gpu-h100-1', must: /H100/i, mustNot: /H200/i},
      {presetId: 'gpu-h200-1', must: /H200/i, mustNot: /H100(?!\d)/i},
      {presetId: 'gpu-a100-1', must: /A100/i, mustNot: /H100|H200|L4/i},
    ];
    for (const {presetId, must, mustNot} of cases) {
      const preset = GPU_PRESETS.find((p) => p.id === presetId) as GpuPreset;
      const result = quotePreset(preset, 'month');
      const all = [...result.quotes, ...result.alternateQuotes];
      assert.ok(all.length >= 1, `${presetId}: no GPU quotes`);
      for (const q of all) {
        const model = String(q.meters[0]!.dimensions.gpuModel || q.meters[0]!.name);
        assert.match(model, must, `${presetId}/${q.providerName}: ${model}`);
        assert.doesNotMatch(model, mustNot, `${presetId}/${q.providerName}: ${model}`);
        assert.ok(!/vGPU/i.test(model), `${presetId}: vGPU leaked`);
      }
    }
  });

  it('respects gpuCount for 1× and 8× H200 presets', () => {
    const one = GPU_PRESETS.find((p) => p.id === 'gpu-h200-1')!;
    const eight = GPU_PRESETS.find((p) => p.id === 'gpu-h200-8')!;
    const oneResult = quotePreset(one, 'month');
    const eightResult = quotePreset(eight, 'month');
    assert.ok(oneResult.best);
    assert.ok(eightResult.best);

    for (const q of [...oneResult.quotes, ...oneResult.alternateQuotes]) {
      const count = q.meters[0]!.dimensions.gpuCount;
      assert.equal(count, 1, `${q.providerName}: expected gpuCount=1, got ${count}`);
    }
    for (const q of [...eightResult.quotes, ...eightResult.alternateQuotes]) {
      const count = q.meters[0]!.dimensions.gpuCount;
      assert.equal(count, 8, `${q.providerName}: expected gpuCount=8, got ${count}`);
    }
    assert.ok(
      eightResult.best!.total > oneResult.best!.total,
      '8× H200 should cost more than 1× H200 best offer',
    );
  });

  it('keeps one primary quote per provider (no duplicate providers)', () => {
    for (const preset of ALL_PRESETS) {
      const result = quotePreset(preset, 'month');
      const providers = result.quotes.map((q) => q.provider);
      assert.equal(
        providers.length,
        new Set(providers).size,
        `${preset.id}: duplicate providers in primary list`,
      );
      const altProviders = result.alternateQuotes.map((q) => `${q.scope}:${q.provider}`);
      assert.equal(
        altProviders.length,
        new Set(altProviders).size,
        `${preset.id}: duplicate providers in alternate list`,
      );
    }
  });

  it('GPU on-demand primary quotes exclude preemptible purchase models', () => {
    for (const preset of GPU_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of [...result.quotes, ...result.alternateQuotes]) {
        const m = q.meters[0]!;
        const pm = String(m.purchaseModel || m.dimensions.purchaseModel || 'on-demand');
        assert.ok(!/preempt/i.test(pm), `${preset.id}/${q.providerName}: preemptible GPU ${pm}`);
      }
    }
  });

  it('breakdown parts sum to the quote total', () => {
    for (const preset of ALL_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of [...result.quotes, ...result.alternateQuotes]) {
        const sum = q.parts.reduce((s, p) => s + p.amount, 0);
        assert.ok(
          Math.abs(sum - q.total) < 0.02,
          `${preset.id}/${q.providerName}: parts ${sum} != total ${q.total}`,
        );
      }
    }
  });

  it('breakdown percentages land near 100% after rounding', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        if (q.total <= 0) continue;
        const pctSum = q.parts.reduce((s, p) => s + Math.round((p.amount / q.total) * 100), 0);
        assert.ok(
          pctSum >= 98 && pctSum <= 102,
          `${preset.id}/${q.providerName}: pct sum ${pctSum}`,
        );
      }
    }
  });

  it('quoteAllPresets covers every preset id once', () => {
    const map = quoteAllPresets('month');
    for (const preset of ALL_PRESETS) {
      assert.ok(map.has(preset.id), `missing ${preset.id}`);
    }
    assert.equal(map.size, ALL_PRESETS.length);
  });

  it('toViewQuote strips meters but keeps totals/scopes', () => {
    const preset = COMPUTE_PRESETS[0]!;
    const result = quotePreset(preset, 'month');
    const view = toViewQuote(result);
    assert.equal(view.presetId, preset.id);
    assert.equal(view.best?.total, result.best?.total);
    assert.equal(view.quotes.length, result.quotes.length);
    assert.ok(!('meters' in (view.best as object)));
    assert.equal(view.best?.provider, result.best?.provider);
  });

  it('buildQuotesByPeriod returns unit/month/year maps for all presets', () => {
    const byPeriod = buildQuotesByPeriod();
    for (const period of ['unit', 'month', 'year'] as const) {
      assert.ok(byPeriod[period]);
      assert.equal(Object.keys(byPeriod[period]).length, ALL_PRESETS.length);
      for (const preset of ALL_PRESETS) {
        const view = byPeriod[period][preset.id];
        assert.ok(view, `missing ${period}/${preset.id}`);
        assert.equal(view.presetId, preset.id);
        if (view.best) {
          assert.ok(view.best.total > 0);
          assert.ok(view.best.parts.length >= 1);
        }
      }
    }
    // Month totals should dominate unit totals for the same preset/provider.
    const sampleId = 'gen-4-8';
    const unitBest = byPeriod.unit[sampleId]!.best!;
    const monthBest = byPeriod.month[sampleId]!.best!;
    assert.ok(monthBest.total > unitBest.total * 100);
  });
});
