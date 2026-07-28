import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {buildGpuFlavorPresets} from '@/lib/calculator/gpu-shapes';
import {
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  addCdnEgressParts,
  addInternetEgressParts,
  addObjectStorageParts,
  addPublicIpParts,
  buildQuotesByPeriod,
  quoteAllPresets,
  quotePreset,
  toViewQuote,
} from '@/lib/calculator/quote';

const MONTH_HOURS = 720;
const GPU_PRESETS = buildGpuFlavorPresets();
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

  it('prefers SSD disk media when available in the region', () => {
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

  it('defaults Yandex "Сетевой SSD" to network-ssd, not non-replicated', () => {
    const preset = COMPUTE_PRESETS.find((p) => p.id === 'gen-4-16');
    assert.ok(preset);
    const result = quotePreset({...preset, diskMedia: 'ssd'}, 'month');
    const yandex = result.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(yandex, 'expected Yandex quote');
    const disk = yandex.meters.find((m) => m.meter === 'storage.block.capacity');
    assert.ok(disk, 'expected Yandex disk');
    assert.equal(String(disk.dimensions.diskType ?? ''), 'network-ssd');
    assert.ok(
      !/non-?replic|нереплиц/i.test(disk.name),
      `unexpected non-replicated disk: ${disk.name}`,
    );
  });

  it('matches official Yandex Compute pricing anchors for fractional shares', () => {
    // Docs: 2×20% Ice Lake + 2 GiB RAM = 1224 ₽ / 720h (compute only).
    const share20 = quotePreset(
      {
        id: 'anchor-20',
        kind: 'compute',
        family: 'general',
        title: '2/2',
        subtitle: '',
        vcpu: 2,
        ramGiB: 2,
        diskGiB: 10,
        diskMedia: 'ssd',
        vcpuShare: '20%',
      },
      'month',
    );
    const y20 = share20.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(y20);
    const compute20 = y20.parts
      .filter((p) => p.id === 'vcpu' || p.id === 'ram')
      .reduce((s, p) => s + p.amount, 0);
    assert.ok(Math.abs(compute20 - 1224) < 0.5, `20% compute ${compute20} != 1224`);
    assert.equal(String(y20.meters[0]?.dimensions.guaranteedVcpuShare ?? ''), '20%');

    // Docs: Cascade Lake 5% on-demand = 0.1897 ₽/vCPU·h → 4 vCPU = 546.336 ₽/mo.
    const share5 = quotePreset(
      {
        id: 'anchor-5',
        kind: 'compute',
        family: 'general',
        title: '4/8',
        subtitle: '',
        vcpu: 4,
        ramGiB: 8,
        diskGiB: 20,
        diskMedia: 'ssd',
        vcpuShare: '5%',
      },
      'month',
    );
    const y5 = share5.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(y5);
    const cpu5 = y5.parts.find((p) => p.id === 'vcpu')?.amount ?? 0;
    assert.ok(Math.abs(cpu5 - 0.1897 * 4 * 720) < 0.5, `5% cpu ${cpu5}`);
    assert.equal(String(y5.meters[0]?.dimensions.guaranteedVcpuShare ?? ''), '5%');
    const disk5 = y5.meters.find((m) => m.meter === 'storage.block.capacity');
    assert.equal(String(disk5?.dimensions.diskType ?? ''), 'network-ssd');
    const diskPart = y5.parts.find((p) => p.id === 'disk')?.amount ?? 0;
    assert.ok(Math.abs(diskPart - 0.0199 * 20 * 720) < 0.5, `disk ${diskPart} != network-ssd`);

    // Docs: Cascade Lake 5% preemptible = 0.1185 ₽/vCPU·h.
    const share5p = quotePreset(
      {
        id: 'anchor-5p',
        kind: 'compute',
        family: 'general',
        title: '4/8',
        subtitle: '',
        vcpu: 4,
        ramGiB: 8,
        diskGiB: 10,
        diskMedia: 'ssd',
        vcpuShare: '5%',
        purchaseModel: 'preemptible',
      },
      'month',
    );
    const y5p = share5p.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(y5p);
    const cpu5p = y5p.parts.find((p) => p.id === 'vcpu')?.amount ?? 0;
    assert.ok(Math.abs(cpu5p - 0.1185 * 4 * 720) < 0.5, `5% preempt cpu ${cpu5p}`);
  });

  it('keeps Yandex share CPU costs monotonic 5% < 20% < 50% < 100%', () => {
    const shares = ['5%', '20%', '50%', '100%'] as const;
    let prev = -1;
    for (const share of shares) {
      const result = quotePreset(
        {
          id: `mono-${share}`,
          kind: 'compute',
          family: 'general',
          title: '4/8',
          subtitle: '',
          vcpu: 4,
          ramGiB: 8,
          diskGiB: 10,
          diskMedia: 'ssd',
          vcpuShare: share,
        },
        'month',
      );
      const yandex = result.quotes.find((q) => q.provider === 'yandex-cloud');
      assert.ok(yandex, `missing Yandex for ${share}`);
      const cpu = yandex.parts.find((p) => p.id === 'vcpu')?.amount ?? -1;
      assert.ok(cpu > prev, `share ${share}: cpu ${cpu} should exceed ${prev}`);
      prev = cpu;
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

  it('preemptible purchase model quotes only preemptible compute and known providers', () => {
    const base = COMPUTE_PRESETS.find((p) => p.id === 'gen-4-16');
    assert.ok(base);
    const result = quotePreset({...base, purchaseModel: 'preemptible'}, 'month');
    assert.ok(result.best, 'expected at least one preemptible offer');
    const providers = new Set(result.quotes.map((q) => q.provider));
    assert.ok(providers.has('yandex-cloud'), 'expected Yandex Cloud preemptible quote');
    assert.ok(providers.has('selectel'), 'expected Selectel preemptible quote');
    for (const q of result.quotes) {
      const core = q.meters[0]!;
      assert.ok(
        isPreemptibleMeter(core.name, core.dimensions.purchaseModel ?? core.purchaseModel),
        `${q.providerName}: expected preemptible core, got ${core.name}`,
      );
      assert.match(q.note ?? '', /Прерываем/i);
    }
    // Providers without preemptible SKUs in the catalog must not appear.
    assert.ok(!providers.has('vk-cloud'));
    assert.ok(!providers.has('mws-cloud'));
    assert.ok(!providers.has('t1-cloud'));
    assert.ok(!providers.has('cloud-ru'));
  });

  it('default low-cost no longer mixes in preemptible when purchaseModel is on-demand', () => {
    const low = COMPUTE_PRESETS.filter((p) => p.family === 'low-cost');
    for (const preset of low) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const core = q.meters[0]!;
        if (core.meter === 'compute.flavor') continue;
        assert.ok(
          !isPreemptibleMeter(core.name, core.dimensions.purchaseModel ?? core.purchaseModel),
          `${preset.id}/${q.providerName}: preemptible slipped into on-demand low-cost`,
        );
      }
    }
  });

  it('includes Cloud.ru via exact compute.flavor when unit vCPU/RAM are not public', () => {
    // Cloud.ru publishes VM flavors, not unit compute.vcpu/ram rates.
    const withExactFlavor = [
      // Balanced 1:4
      'gen-2-8',
      'gen-4-16',
      'gen-8-32',
      'gen-16-64',
      'gen-32-128',
      // CPU optimized 1:2
      'cpu-2-4',
      'cpu-4-8',
      'cpu-8-16',
      'cpu-16-32',
      'cpu-32-64',
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

    // Large CPU-optimized presets must use 100% flavors from the PDF (not only share30).
    for (const id of ['cpu-16-32', 'cpu-32-64']) {
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

  it('low-cost fractional share is cheaper than dedicated CPU-optimized for the same 4/8 shape', () => {
    const low = COMPUTE_PRESETS.find((p) => p.id === 'low-4-8');
    const cpu = COMPUTE_PRESETS.find((p) => p.id === 'cpu-4-8');
    assert.ok(low && cpu);
    const lowBest = quotePreset({...low, vcpuShare: '10%'}, 'month').best!;
    const cpuBest = quotePreset(cpu, 'month').best!;
    assert.ok(
      lowBest.total < cpuBest.total,
      `expected low-cost 10% ${lowBest.total} < high-cpu ${cpuBest.total}`,
    );
  });

  it('UI low-cost defaults (on-demand 10% HDD 1/1) surface Cloud.ru economy flavors', () => {
    const low = COMPUTE_PRESETS.find((p) => p.id === 'low-1-1');
    assert.ok(low);
    const result = quotePreset(
      {
        ...low,
        purchaseModel: 'on-demand',
        vcpuShare: '10%',
        diskMedia: 'hdd',
      },
      'month',
    );
    assert.ok(result.best, 'expected Cloud.ru economy quote');
    assert.equal(result.best!.provider, 'cloud-ru');
    const core = result.best!.meters[0]!;
    assert.equal(core.meter, 'compute.flavor');
    assert.match(String(core.dimensions.guaranteedVcpuShare ?? ''), /^10%/);
    // ~300₽ class: flavor + small HDD, not Selectel spot.
    assert.ok(result.best!.total < 500, `expected sub-500₽ budget VM, got ${result.best!.total}`);
  });

  it('explicit vcpuShare filters unit cores and clamps Yandex fractional sizes', () => {
    const base = COMPUTE_PRESETS.find((p) => p.id === 'gen-4-16');
    assert.ok(base);
    const share20 = quotePreset({...base, vcpuShare: '20%'}, 'month');
    assert.ok(share20.best, 'expected Yandex 20% quote for 4/16');
    for (const q of share20.quotes) {
      const core = q.meters[0]!;
      const share = String(core.dimensions.guaranteedVcpuShare ?? '');
      assert.match(share, /^20%/);
      assert.match(q.note ?? '', /20%/);
    }
    // Oversized fractional shape must not invent a quote.
    const oversized = quotePreset(
      {...base, vcpu: 8, ramGiB: 32, vcpuShare: '20%'},
      'month',
    );
    assert.equal(oversized.quotes.length, 0, '8 vCPU @ 20% is not orderable');
  });

  it('skips VK Cloud when shape exceeds self-serve STD envelope (16 vCPU / 64 GiB)', () => {
    const ok = COMPUTE_PRESETS.find((p) => p.id === 'gen-16-64');
    const big = COMPUTE_PRESETS.find((p) => p.id === 'gen-32-128');
    assert.ok(ok && big);
    const okQuote = quotePreset(ok, 'month');
    assert.ok(
      okQuote.quotes.some((q) => q.provider === 'vk-cloud'),
      'expected VK quote for 16/64',
    );
    const bigQuote = quotePreset(big, 'month');
    assert.ok(
      !bigQuote.quotes.some((q) => q.provider === 'vk-cloud'),
      'VK must not quote 32/128 (beyond self-serve STD)',
    );
    const miss = bigQuote.missingProviders.find((m) => m.provider === 'vk-cloud');
    assert.ok(miss, 'expected VK in missing providers for 32/128');
    assert.match(miss.reason, /STD|16|self-serve/i);

    const helicopter = quotePreset({...ok, vcpu: 52, ramGiB: 208}, 'month');
    assert.ok(!helicopter.quotes.some((q) => q.provider === 'vk-cloud'));
  });

  it('Selectel quotes inside Standard dedicated 2–32 / 4–256 and misses outside', () => {
    const tiny = COMPUTE_PRESETS.find((p) => p.id === 'low-1-1');
    const edge = COMPUTE_PRESETS.find((p) => p.id === 'mem-32-256');
    const mid = COMPUTE_PRESETS.find((p) => p.id === 'gen-32-128');
    assert.ok(tiny && edge && mid);

    const tinyQuote = quotePreset(tiny, 'month');
    assert.ok(
      !tinyQuote.quotes.some((q) => q.provider === 'selectel'),
      'Selectel Standard min is 2/4 — must not invent 1/1',
    );
    const tinyMiss = tinyQuote.missingProviders.find((m) => m.provider === 'selectel');
    assert.ok(tinyMiss);
    assert.match(tinyMiss.reason, /2–32|вне каталога/i);

    assert.ok(quotePreset(mid, 'month').quotes.some((q) => q.provider === 'selectel'));
    assert.ok(quotePreset(edge, 'month').quotes.some((q) => q.provider === 'selectel'));

    const overDocsArbitrary = quotePreset({...mid, vcpu: 96, ramGiB: 384}, 'month');
    assert.ok(!overDocsArbitrary.quotes.some((q) => q.provider === 'selectel'));
    const overMiss = overDocsArbitrary.missingProviders.find((m) => m.provider === 'selectel');
    assert.ok(overMiss);
    assert.match(overMiss.reason, /2–32|256|вне каталога/i);

    // Docs platformMax 232/1200 must not be treated as quoteable self-serve.
    const platformClaim = quotePreset({...mid, vcpu: 232, ramGiB: 1200}, 'month');
    assert.ok(!platformClaim.quotes.some((q) => q.provider === 'selectel'));
  });

  it('skips Cloud.ru when shape exceeds console self-serve 32/128', () => {
    const ok = COMPUTE_PRESETS.find((p) => p.id === 'gen-32-128');
    const fatRam = COMPUTE_PRESETS.find((p) => p.id === 'mem-32-256');
    assert.ok(ok && fatRam);
    assert.ok(quotePreset(ok, 'month').quotes.some((q) => q.provider === 'cloud-ru'));
    const missQuote = quotePreset(fatRam, 'month');
    assert.ok(!missQuote.quotes.some((q) => q.provider === 'cloud-ru'));
    const miss = missQuote.missingProviders.find((m) => m.provider === 'cloud-ru');
    assert.ok(miss);
    assert.match(miss.reason, /flavor|32|128|вне каталога/i);
  });

  it('GPU host composition still quotes Selectel shapes above general-compute max', () => {
    const fatHost = GPU_PRESETS.find(
      (p) =>
        p.gpuModelMatch === 'H200' &&
        p.gpuCount === 1 &&
        (p.vcpu ?? 0) >= 40 &&
        (p.ramGiB ?? 0) >= 256,
    );
    assert.ok(fatHost, 'expected Selectel-style H200 host ≥40/256');
    const result = quotePreset(fatHost, 'month');
    assert.ok(
      result.quotes.some((q) => q.provider === 'selectel'),
      'GPU forGpuHost must bypass general 32/256 envelope',
    );
  });

  it('skips MWS when shape is not a published vmType (exact lattice)', () => {
    const ok = COMPUTE_PRESETS.find((p) => p.id === 'gen-32-128');
    const bad = COMPUTE_PRESETS.find((p) => p.id === 'mem-32-256');
    assert.ok(ok && bad);
    assert.ok(quotePreset(ok, 'month').quotes.some((q) => q.provider === 'mws-cloud'));
    const missQuote = quotePreset(bad, 'month');
    assert.ok(!missQuote.quotes.some((q) => q.provider === 'mws-cloud'));
    const miss = missQuote.missingProviders.find((m) => m.provider === 'mws-cloud');
    assert.ok(miss);
    assert.match(miss.reason, /vmType/i);
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
    const sample: ComputePreset = COMPUTE_PRESETS.find((p) => p.id === 'cpu-4-8')!;
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
          assert.match(q.note!, /Прерываем/i);
        } else if (/\b1\s*:\s*[2-9]\d*\b/i.test(core.name)) {
          assert.match(q.note!, /Shared/i);
        } else if (preset.family === 'low-cost') {
          assert.match(q.note!, /Обычн|выделен/i);
        } else {
          assert.match(q.note!, /Обычн|выделен/i);
        }
      }
    }
  });

  it('compute parts include vCPU, RAM and disk with expected labels', () => {
    const preset = COMPUTE_PRESETS.find((p) => p.id === 'cpu-8-16')!;
    const result = quotePreset(preset, 'month');
    for (const q of result.quotes) {
      assert.equal(q.scope, 'compute');
      if (q.parts.some((p) => p.id === 'bundle')) {
        assert.equal(q.parts[0]!.label, 'ВМ: 8 vCPU · 16 GiB RAM');
        assert.equal(q.parts.at(-1)!.id, 'disk');
        assert.match(q.parts.at(-1)!.label, /^Диск: (SSD|NVMe), 10 GiB$/);
        continue;
      }
      assert.deepEqual(
        q.parts.map((p) => p.id),
        ['vcpu', 'ram', 'disk'],
      );
      assert.equal(q.parts[0]!.label, 'CPU: 8 vCPU');
      assert.equal(q.parts[1]!.label, 'RAM: 16 GiB');
      assert.match(q.parts[2]!.label, /^Диск: (SSD|NVMe), 10 GiB$/);
    }
  });

  it('primary GPU quotes for flavor shapes are full configs (bundle or composed host)', () => {
    for (const preset of GPU_PRESETS) {
      if (preset.vcpu == null && !preset.dedicated) continue;
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        assert.ok(
          q.scope === 'bundle' || q.scope === 'gpu-synthetic',
          `${preset.id}/${q.provider}: unexpected primary scope ${q.scope}`,
        );
      }
      // Bare GPU-only must not sit next to a flavor/composed best offer in primary.
      assert.ok(
        !result.quotes.some((q) => q.scope === 'gpu-only'),
        `${preset.id}: bare gpu-only leaked into primary`,
      );
    }
  });

  it('prefers exact Cloud.ru flavor bundle over composed host when shape matches', () => {
    const cloudRuFlavor = GPU_PRESETS.find(
      (p) => p.shapeSource === 'cloud-ru' && p.vcpu != null && p.gpuCount === 1,
    )!;
    const result = quotePreset(cloudRuFlavor, 'month');
    const cloud = result.quotes.find((q) => q.provider === 'cloud-ru');
    assert.ok(cloud, 'Cloud.ru should quote its own flavor shape');
    assert.equal(cloud.scope, 'bundle');
    assert.match(cloud.parts[0]!.label, /Flavor целиком/i);
  });

  it('quotes Selectel B300 dedicated as highlighted bundle', () => {
    const b300 = GPU_PRESETS.find((p) => p.gpuModelMatch === 'B300')!;
    assert.ok(b300.dedicated);
    const result = quotePreset(b300, 'month');
    assert.ok(result.best);
    assert.equal(result.best!.provider, 'selectel');
    assert.equal(result.best!.scope, 'bundle');
    assert.ok(result.best!.total >= 7_000_000);
  });

  it('matches GPU model family without L40/H200 cross-contamination', () => {
    const cases: Array<{family: string; must: RegExp; mustNot: RegExp}> = [
      {family: 'L4', must: /\bL4\b/i, mustNot: /L40/i},
      {family: 'H100', must: /H100/i, mustNot: /H200/i},
      {family: 'H200', must: /H200/i, mustNot: /H100(?!\d)/i},
      {family: 'A100', must: /A100/i, mustNot: /H100|H200|L4/i},
    ];
    for (const {family, must, mustNot} of cases) {
      const preset = GPU_PRESETS.find((p) => p.gpuModelMatch === family && p.gpuCount === 1);
      if (!preset) continue;
      const result = quotePreset(preset, 'month');
      const all = [...result.quotes, ...result.alternateQuotes];
      assert.ok(all.length >= 1, `${family}: no GPU quotes`);
      for (const q of all) {
        const model = String(q.meters[0]!.dimensions.gpuModel || q.meters[0]!.name);
        assert.match(model, must, `${family}/${q.providerName}: ${model}`);
        assert.doesNotMatch(model, mustNot, `${family}/${q.providerName}: ${model}`);
        assert.ok(!/vGPU/i.test(model), `${family}: vGPU leaked`);
      }
    }
  });

  it('respects gpuCount for 1× and 8× H200 shapes', () => {
    const one = GPU_PRESETS.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 1);
    const eight = GPU_PRESETS.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 8);
    if (!one || !eight) return;
    const oneResult = quotePreset(one, 'month');
    const eightResult = quotePreset(eight, 'month');
    assert.ok(oneResult.best);
    assert.ok(eightResult.best);
    assert.ok(
      eightResult.best!.total > oneResult.best!.total,
      '8× H200 should cost more than 1× H200 best offer',
    );
  });

  it('composes unit GPU + host for providers without matching flavor', () => {
    const shape = GPU_PRESETS.find(
      (p) => p.shapeSource === 'cloud-ru' && p.vcpu != null && p.gpuModelMatch === 'H100',
    )!;
    const result = quotePreset(shape, 'month');
    const composed = result.quotes.find((q) => q.scope === 'gpu-synthetic');
    // Yandex/Selectel/T1 typically compose; Cloud.ru is bundle.
    if (composed) {
      assert.equal(composed.hostConfig?.vcpu, shape.vcpu);
      assert.equal(composed.hostConfig?.ramGiB, shape.ramGiB);
      assert.ok(composed.parts.some((p) => p.id === 'gpu'));
    }
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
    assert.ok(view.best?.hostConfig);
    assert.equal(view.best?.hostConfig?.scope, 'compute');
  });

  it('lists short reasons for providers missing from a GPU quote', () => {
    const preset = GPU_PRESETS.find((p) => /H200/i.test(p.gpuModelMatch) && p.gpuCount === 1);
    assert.ok(preset, 'expected an H200 GPU preset');
    const view = toViewQuote(quotePreset(preset!, 'month'));
    const present = new Set([
      ...view.quotes.map((q) => q.provider),
      ...view.alternateQuotes.map((q) => q.provider),
    ]);
    assert.ok(view.missingProviders.length > 0, 'expected at least one missing provider');
    for (const note of view.missingProviders) {
      assert.ok(!present.has(note.provider), note.provider);
      assert.ok(note.providerName.length > 0);
      assert.ok(note.reason.length > 0 && note.reason.length <= 80, note.reason);
    }
    const yandex = view.missingProviders.find((m) => m.provider === 'yandex-cloud');
    if (yandex) {
      assert.match(yandex.reason, /нет|каталог|пресет|flavor|хост/i);
    }
  });

  it('toViewQuote exposes host config for flavor / composed GPU quotes', () => {
    const preset = GPU_PRESETS.find(
      (p) => p.shapeSource === 'cloud-ru' && p.vcpu != null && p.gpuCount === 1,
    )!;
    const result = quotePreset(preset, 'month');
    const view = toViewQuote(result);
    assert.ok(view.best?.hostConfig);
    assert.ok(
      view.best!.hostConfig!.scope === 'bundle' ||
        view.best!.hostConfig!.scope === 'gpu-synthetic',
    );
    if (preset.vcpu != null) {
      assert.equal(view.best!.hostConfig!.vcpu, preset.vcpu);
      assert.equal(view.best!.hostConfig!.ramGiB, preset.ramGiB);
    }
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
    const sampleId = 'cpu-4-8';
    const unitBest = byPeriod.unit[sampleId]!.best!;
    const monthBest = byPeriod.month[sampleId]!.best!;
    assert.ok(monthBest.total > unitBest.total * 100);
  });

  it('addPublicIpParts appends attached IPv4 without double-scaling VMs', () => {
    const base = toViewQuote(quotePreset(COMPUTE_PRESETS[0]!, 'month'));
    const withIp = addPublicIpParts(base, 2, 'month');
    assert.ok(withIp.best);
    const ipPart = withIp.best!.parts.find((p) => p.id === 'ip');
    assert.ok(ipPart, 'expected ip cost part');
    assert.equal(ipPart!.label, 'Публичный IP: 2');
    assert.ok(ipPart!.amount > 0);
    assert.ok(withIp.best!.total > base.best!.total);
    // Idempotent: second call must not stack another IP line.
    const twice = addPublicIpParts(withIp, 2, 'month');
    assert.equal(twice.best!.parts.filter((p) => p.id === 'ip').length, 1);
  });

  it('addCdnEgressParts folds 1 TiB CDN egress into the basket total', () => {
    const base = toViewQuote(quotePreset(COMPUTE_PRESETS[0]!, 'month'));
    const withCdn = addCdnEgressParts(base, 1024, 'month');
    assert.ok(withCdn.best);
    const cdnPart = withCdn.best!.parts.find((p) => p.id === 'cdn');
    assert.ok(cdnPart, 'expected cdn cost part on a provider with CDN rates');
    assert.match(cdnPart!.label, /CDN egress/);
    assert.ok(cdnPart!.amount > 0);
    assert.ok(withCdn.best!.total > base.best!.total);
    const again = addCdnEgressParts(withCdn, 1024, 'month');
    assert.equal(again.best!.parts.filter((p) => p.id === 'cdn').length, 1);
  });

  it('addObjectStorageParts folds standard S3 capacity into the basket', () => {
    const base = toViewQuote(quotePreset(COMPUTE_PRESETS[0]!, 'month'));
    const withS3 = addObjectStorageParts(base, 2048, 'month');
    assert.ok(withS3.best);
    const part = withS3.best!.parts.find((p) => p.id === 'storage');
    assert.ok(part, 'expected object storage part');
    assert.match(part!.label, /Object Storage/);
    assert.ok(part!.amount > 0);
    assert.ok(withS3.best!.total > base.best!.total);
  });

  it('addInternetEgressParts folds internet egress (not CDN) into the basket', () => {
    const base = toViewQuote(quotePreset(COMPUTE_PRESETS[0]!, 'month'));
    const withEgress = addInternetEgressParts(base, 512, 'month');
    assert.ok(withEgress.best);
    const part = withEgress.best!.parts.find((p) => p.id === 'egress');
    assert.ok(part, 'expected internet egress part');
    assert.match(part!.label, /Internet egress/);
    assert.ok(part!.amount > 0);
  });
});
