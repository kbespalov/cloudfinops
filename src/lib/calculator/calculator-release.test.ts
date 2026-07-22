/**
 * Pre-release regression suite for calculator truthfulness.
 *
 * Focus: never invent unavailable SKUs / host compositions; best offer = cheapest
 * real quote; VM/GPU/self-host paths agree on money and VRAM.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {INFERENCE_MODELS} from '@/data/inference-models';
import {buildGpuCardPresets, buildGpuFlavorPresets, perGpuMemoryGb} from '@/lib/calculator/gpu-shapes';
import {getModelPickerCatalog} from '@/lib/calculator/model-picker-catalog';
import {
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
  type ComputePreset,
  type DiskMedia,
  type GpuPreset,
  type PurchaseModel,
  type VcpuShare,
} from '@/lib/calculator/presets';
import {
  addPublicIpParts,
  quotePreset,
  toViewQuote,
} from '@/lib/calculator/quote';
import {
  buildVramBreakdown,
  canonicalRecipeTotalGiB,
  defaultGpuMemoryGiB,
} from '@/lib/calculator/vram-breakdown';
import {recommendInferenceInfra} from '@/lib/chat/inference-recommend';
import {amountNumber, catalog} from '@/lib/catalog';

const MONTH_HOURS = 720;
const GPU_FLAVORS = buildGpuFlavorPresets();
const GPU_CARDS = buildGpuCardPresets(GPU_FLAVORS);

/** Mirrors POST /api/calculator/quote compute path used by the UI. */
function adhocCompute(args: {
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  family?: ComputeFamily;
  diskMedia?: DiskMedia;
  purchaseModel?: PurchaseModel;
  vcpuShare?: VcpuShare;
  vmCount?: number;
  publicIpCount?: number;
  period?: 'unit' | 'month' | 'year';
}) {
  const period = args.period ?? 'month';
  const family = args.family ?? 'general';
  const diskMedia = args.diskMedia ?? 'ssd';
  const purchaseModel = args.purchaseModel ?? 'on-demand';
  const vcpuShare = args.vcpuShare ?? '100%';
  const vmCount = args.vmCount ?? 1;
  const publicIpCount = Math.min(Math.max(0, args.publicIpCount ?? 0), vmCount);
  const preset: ComputePreset = {
    id: `adhoc-${family}-${args.vcpu}-${args.ramGiB}-${args.diskGiB}-${diskMedia}-${purchaseModel}-${vcpuShare}`,
    kind: 'compute',
    family,
    title: `${args.vcpu} / ${args.ramGiB}`,
    subtitle: `${args.vcpu} vCPU · ${args.ramGiB} GiB · ${args.diskGiB} GiB`,
    vcpu: args.vcpu,
    ramGiB: args.ramGiB,
    diskGiB: args.diskGiB,
    diskMedia,
    purchaseModel,
    vcpuShare,
  };
  const view = addPublicIpParts(
    scaleQuote(toViewQuote(quotePreset(preset, period)), vmCount),
    publicIpCount,
    period,
  );
  return view;
}

function scaleQuote<T extends ReturnType<typeof toViewQuote>>(view: T, factor: number): T {
  if (factor === 1) return view;
  const scale = (q: NonNullable<T['best']>) => ({
    ...q,
    total: q.total * factor,
    parts: q.parts.map((p) => ({...p, amount: p.amount * factor})),
  });
  return {
    ...view,
    quotes: view.quotes.map(scale),
    alternateQuotes: view.alternateQuotes.map(scale),
    best: view.best ? scale(view.best) : null,
  };
}

/** Mirrors POST /api/calculator/quote gpu path used by the UI. */
function adhocGpu(preset: GpuPreset, period: 'unit' | 'month' | 'year' = 'month') {
  const p: GpuPreset = {
    ...preset,
    id: `adhoc-gpu-${preset.gpuModelMatch}-${preset.gpuCount}`,
    title: `${preset.gpuModelMatch} ×${preset.gpuCount}`,
    subtitle: 'release-test ad-hoc',
  };
  return toViewQuote(quotePreset(p, period));
}

function assertBestIsCheapest(
  label: string,
  result: {best: {total: number; provider: string} | null; quotes: {total: number; provider: string}[]},
) {
  assert.ok(result.best, `${label}: missing best`);
  assert.ok(result.quotes.length >= 1, `${label}: no quotes`);
  const cheapest = Math.min(...result.quotes.map((q) => q.total));
  assert.equal(result.best!.total, cheapest, `${label}: best is not cheapest`);
  assert.equal(result.best!.total, result.quotes[0]!.total, `${label}: quotes[0] != best`);
  for (let i = 1; i < result.quotes.length; i++) {
    assert.ok(
      result.quotes[i - 1]!.total <= result.quotes[i]!.total,
      `${label}: quotes not sorted at ${i}`,
    );
  }
}

describe('release: ad-hoc VM calculator (UI path)', () => {
  const shapes: Array<{family: ComputeFamily; vcpu: number; ramGiB: number}> = [
    {family: 'general', vcpu: 4, ramGiB: 16},
    {family: 'high-cpu', vcpu: 8, ramGiB: 16},
    {family: 'high-memory', vcpu: 8, ramGiB: 64},
    {family: 'low-cost', vcpu: 4, ramGiB: 8},
    {family: 'general', vcpu: 16, ramGiB: 64},
    {family: 'general', vcpu: 32, ramGiB: 128},
  ];

  it('quotes every ad-hoc shape with a priced best offer', () => {
    for (const s of shapes) {
      const view = adhocCompute({...s, diskGiB: 50});
      assertBestIsCheapest(`${s.family} ${s.vcpu}/${s.ramGiB}`, view);
      assert.ok(view.best!.total > 0);
      assert.ok(view.best!.parts.length >= 1);
    }
  });

  it('matches catalog preset totals for the same compute shape', () => {
    for (const family of ['general', 'high-cpu', 'high-memory', 'low-cost'] as const) {
      const preset = computePresetsByFamily(family)[1]!;
      const fromPreset = toViewQuote(quotePreset(preset, 'month'));
      const fromAdhoc = adhocCompute({
        family,
        vcpu: preset.vcpu,
        ramGiB: preset.ramGiB,
        diskGiB: preset.diskGiB,
        diskMedia: preset.diskMedia ?? 'ssd',
      });
      assert.ok(fromPreset.best && fromAdhoc.best, preset.id);
      assert.equal(
        Math.round(fromAdhoc.best!.total),
        Math.round(fromPreset.best!.total),
        `${preset.id}: adhoc != preset best`,
      );
      assert.equal(fromAdhoc.best!.provider, fromPreset.best!.provider, `${preset.id}: provider`);
    }
  });

  it('scales linearly with vmCount and adds public IP once', () => {
    const one = adhocCompute({family: 'general', vcpu: 4, ramGiB: 16, diskGiB: 50, vmCount: 1});
    const four = adhocCompute({family: 'general', vcpu: 4, ramGiB: 16, diskGiB: 50, vmCount: 4});
    assert.ok(one.best && four.best);
    assert.ok(Math.abs(four.best!.total - one.best!.total * 4) < 1, 'vmCount scale');

    const withIp = adhocCompute({
      family: 'general',
      vcpu: 4,
      ramGiB: 16,
      diskGiB: 50,
      vmCount: 2,
      publicIpCount: 2,
    });
    assert.ok(withIp.best);
    const ip = withIp.best!.parts.find((p) => p.id === 'ip');
    assert.ok(ip, 'ip part');
    assert.ok(ip!.amount > 0);
    assert.ok(withIp.best!.total > four.best!.total / 2);
  });

  it('never returns empty primary quotes for standard UI ladder', () => {
    const ladder = [2, 4, 8, 16, 32];
    for (const family of ['general', 'high-cpu', 'high-memory', 'low-cost'] as const) {
      const ratio = family === 'high-cpu' || family === 'low-cost' ? 2 : family === 'high-memory' ? 8 : 4;
      for (const vcpu of ladder) {
        if (family === 'low-cost' && vcpu > 16) continue;
        const view = adhocCompute({family, vcpu, ramGiB: vcpu * ratio, diskGiB: 50});
        assert.ok(view.best, `${family} ${vcpu}: no best`);
        assert.ok(view.quotes.length >= 2, `${family} ${vcpu}: expected ≥2 providers`);
      }
    }
  });
});

describe('release: GPU calculator compositions', () => {
  it('every UI GPU card has a full-config primary quote (not bare gpu-only as best)', () => {
    for (const card of GPU_CARDS) {
      const view = adhocGpu(card);
      assertBestIsCheapest(card.title, view);
      assert.ok(
        view.best!.scope === 'bundle' || view.best!.scope === 'gpu-synthetic',
        `${card.title}: best scope ${view.best!.scope}`,
      );
      for (const q of view.quotes) {
        assert.notEqual(q.scope, 'gpu-only', `${card.title}/${q.provider}: gpu-only in primary`);
      }
    }
  });

  it('composed hosts match requested vCPU/RAM; bundles keep catalog GPU memory', () => {
    for (const preset of GPU_FLAVORS) {
      if (preset.vcpu == null && !preset.dedicated) continue;
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        if (q.scope === 'gpu-synthetic') {
          assert.equal(q.hostConfig?.vcpu, preset.vcpu, `${preset.id}: synthetic vCPU`);
          assert.equal(q.hostConfig?.ramGiB, preset.ramGiB, `${preset.id}: synthetic RAM`);
          assert.ok(
            q.parts.some((p) => p.id === 'gpu'),
            `${preset.id}/${q.providerName}: missing gpu part`,
          );
          assert.ok(
            q.parts.some((p) => p.id === 'vcpu' || p.id === 'ram' || p.id === 'bundle'),
            `${preset.id}/${q.providerName}: missing host parts`,
          );
        }
        if (q.scope === 'bundle' && preset.gpuMemoryGb != null) {
          const gpuMeter =
            q.meters.find((m) => m.categoryKey === 'gpu' || /gpu/i.test(m.meter)) ?? q.meters[0]!;
          const mem = perGpuMemoryGb(gpuMeter);
          if (mem != null) {
            assert.equal(mem, preset.gpuMemoryGb, `${preset.id}/${q.providerName}: mem mismatch`);
          }
        }
        // Every meter in the quote must exist in the live catalog.
        for (const m of q.meters) {
          const hit = catalog.meters.find((x) => x.sku === m.sku);
          assert.ok(hit, `${preset.id}: unknown sku ${m.sku}`);
        }
      }
    }
  });

  it('GPU family tokens never cross-contaminate (L4≠L40, H100≠H200)', () => {
    const checks: Array<{family: string; ok: RegExp; bad: RegExp}> = [
      {family: 'L4', ok: /\bL4\b/i, bad: /L40/i},
      {family: 'H100', ok: /H100/i, bad: /H200/i},
      {family: 'H200', ok: /H200/i, bad: /H100(?!\d)/i},
      {family: 'A100', ok: /A100/i, bad: /\bL4\b|H100|H200/i},
      {family: 'B300', ok: /B300/i, bad: /H100|H200|A100/i},
    ];
    for (const {family, ok, bad} of checks) {
      const preset = GPU_FLAVORS.find((p) => p.gpuModelMatch === family && p.gpuCount === 1)
        ?? GPU_FLAVORS.find((p) => p.gpuModelMatch === family);
      if (!preset) continue;
      const result = quotePreset(preset, 'month');
      for (const q of [...result.quotes, ...result.alternateQuotes]) {
        const model = String(q.meters[0]!.dimensions.gpuModel || q.meters[0]!.name);
        assert.match(model, ok, `${family}: ${model}`);
        assert.doesNotMatch(model, bad, `${family}: contaminated ${model}`);
      }
    }
  });

  it('hour↔month scale holds for GPU best offers (720h)', () => {
    for (const card of GPU_CARDS.slice(0, 6)) {
      const hour = adhocGpu(card, 'unit');
      const month = adhocGpu(card, 'month');
      if (!hour.best || !month.best) continue;
      // Same provider preferred when present in both.
      const h = hour.quotes.find((q) => q.provider === month.best!.provider) ?? hour.best;
      const m = month.quotes.find((q) => q.provider === h.provider) ?? month.best;
      assert.ok(Math.abs(h.total * MONTH_HOURS - m.total) / m.total < 0.002, card.title);
    }
  });
});

describe('release: Self-host LLM models + VRAM + prices', () => {
  it('model picker catalogs every inference profile exactly once', () => {
    const catalogItems = getModelPickerCatalog();
    const ids = new Set(catalogItems.map((m) => m.id));
    assert.equal(ids.size, catalogItems.length);
    for (const m of INFERENCE_MODELS) {
      assert.ok(ids.has(m.id), `picker missing ${m.id}`);
    }
  });

  it('every model: api-only has no invented GPUs; others return configs with sane VRAM', () => {
    for (const profile of INFERENCE_MODELS) {
      const result = recommendInferenceInfra({model: profile.displayName, maxConfigs: 6});
      assert.equal(result.ok, true, profile.id);
      assert.equal(result.model?.id, profile.id);

      if ((profile.deployment ?? 'self-host') === 'api-only') {
        assert.equal(result.configs?.length ?? 0, 0, `${profile.id}: api-only invented configs`);
        assert.equal(result.primaryRecommendation, null);
        continue;
      }

      assert.ok((result.configs?.length ?? 0) >= 1, `${profile.id}: no configs`);
      for (const c of result.configs!) {
        assert.ok(c.gpuCount >= 1 && c.gpuCount <= 64, `${profile.id}: bad gpuCount`);
        assert.ok(c.estimatedVramGiB > 0, `${profile.id}: bad VRAM estimate`);
        const perCard =
          c.host?.gpuMemoryGb ?? defaultGpuMemoryGiB(c.gpuFamily) ?? null;
        if (perCard != null) {
          const capacity = perCard * c.gpuCount;
          // Light-load estimate should not wildly exceed node capacity for non-overload recipes.
          // Allow headroom for weights-pending cluster hints.
          if ((profile.deployment ?? 'self-host') === 'self-host') {
            assert.ok(
              c.estimatedVramGiB <= capacity * 1.15,
              `${profile.id}: ${c.gpuCount}×${c.gpuFamily} estimate ${c.estimatedVramGiB} > capacity ${capacity}`,
            );
          }
        }
        // Re-quote must match recommender best when priced.
        if (c.best?.totalMonth != null && c.host) {
          const preset: GpuPreset = {
            id: `check-${profile.id}-${c.gpuFamily}-${c.gpuCount}`,
            kind: 'gpu',
            title: `${c.gpuFamily}×${c.gpuCount}`,
            subtitle: 'parity',
            gpuModelMatch: c.gpuFamily,
            gpuCount: c.gpuCount,
            vcpu: c.host.dedicated || c.host.unitOnly ? undefined : c.host.vcpu,
            ramGiB: c.host.dedicated || c.host.unitOnly ? undefined : c.host.ramGiB,
            diskGiB: c.host.dedicated || c.host.unitOnly ? undefined : c.host.diskGiB,
            dedicated: c.host.dedicated || undefined,
            gpuMemoryGb: c.host.gpuMemoryGb ?? null,
          };
          const requote = quotePreset(preset, 'month');
          assert.ok(requote.best, `${profile.id}: re-quote empty for ${c.gpuFamily}`);
          assert.ok(
            Math.abs(requote.best!.total - c.best.totalMonth) < 2,
            `${profile.id}: price drift ${c.best.totalMonth} vs ${requote.best!.total}`,
          );
        }
      }
    }
  });

  it('VRAM breakdown parts always sum to total; capacity matches host memory', () => {
    const samples = INFERENCE_MODELS.filter((m) => (m.deployment ?? 'self-host') === 'self-host');
    for (const profile of samples) {
      const result = recommendInferenceInfra({model: profile.displayName, maxConfigs: 3});
      for (const c of result.configs ?? []) {
        const weight = profile.weights.find((w) => w.dtype === c.quant) ?? profile.weights[0];
        if (!weight) continue;
        const recipes = profile.recommended
          .filter((r) => r.quant === c.quant)
          .map((r) => r.estimatedVramGiB);
        const bd = buildVramBreakdown({
          weightsGiB: weight.weightsVramGiB,
          recipeTotalGiB: canonicalRecipeTotalGiB(
            weight.weightsVramGiB,
            recipes.length ? recipes : [c.estimatedVramGiB],
            profile.contextDefault,
          ),
          contextDefault: profile.contextDefault,
          avgContextTokens: Math.min(32_768, profile.contextDefault),
          maxContextTokens: profile.contextDefault,
          batchSize: 1,
          concurrentUsers: 1,
          quant: c.quant,
          gpuCount: c.gpuCount,
          gpuFamily: c.gpuFamily,
          gpuMemoryGb: c.host?.gpuMemoryGb ?? null,
        });
        const sum = bd.parts.reduce((s, p) => s + p.gib, 0);
        assert.ok(Math.abs(sum - bd.totalGiB) < 0.6, `${profile.id}: parts != total`);
        assert.ok(bd.parts.every((p) => p.gib >= 0), `${profile.id}: negative VRAM part`);
        const per = c.host?.gpuMemoryGb ?? defaultGpuMemoryGiB(c.gpuFamily);
        if (per != null) {
          assert.equal(bd.capacityGiB, per * c.gpuCount, `${profile.id}: capacity`);
        }
      }
    }
  });

  it('primary recommendation is among configs and is a priced row when any price exists', () => {
    for (const profile of INFERENCE_MODELS) {
      if ((profile.deployment ?? 'self-host') === 'api-only') continue;
      const result = recommendInferenceInfra({model: profile.displayName, maxConfigs: 5});
      const primary = result.primaryRecommendation;
      assert.ok(primary, profile.id);
      assert.ok(
        result.configs?.some(
          (c) =>
            c.gpuFamily === primary.gpuFamily &&
            c.gpuCount === primary.gpuCount &&
            c.quant === primary.quant,
        ),
        `${profile.id}: primary not in configs`,
      );
      const anyPriced = result.configs?.some((c) => c.best?.totalMonth != null);
      if (anyPriced) {
        assert.ok(
          primary.bestMonth != null || result.configs?.[0]?.best?.totalMonth == null,
          `${profile.id}: priced configs exist but primary has no month price`,
        );
      }
    }
  });
});

describe('release: money integrity spot-checks', () => {
  it('Cloud.ru GPU catalog hours still match known PDF anchors', () => {
    const anchors: Array<{sku: string; hourVat: number}> = [
      {sku: 'cloudru.gpu.h100-80-nvlink-1', hourVat: 854},
      {sku: 'cloudru.gpu.h100-94-pcie-1', hourVat: 646.6},
      {sku: 'cloudru.gpu.a100-80-pcie-1', hourVat: 317.2},
    ];
    for (const {sku, hourVat} of anchors) {
      const meter = catalog.meters.find((m) => m.sku === sku);
      assert.ok(meter, sku);
      const hour = amountNumber(meter!, 'unit');
      assert.ok(hour != null);
      assert.ok(Math.abs(hour! - hourVat) < 0.01, `${sku}: ${hour} vs ${hourVat}`);
    }
  });

  it('compute best offers stay positive and parts sum to total across all presets', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      assertBestIsCheapest(preset.id, result);
      for (const q of result.quotes) {
        const sum = q.parts.reduce((s, p) => s + p.amount, 0);
        assert.ok(Math.abs(sum - q.total) < 0.02, `${preset.id}/${q.providerName}`);
      }
    }
  });
});
