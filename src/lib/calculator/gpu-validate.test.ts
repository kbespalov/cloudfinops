import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {buildGpuFlavorPresets, perGpuMemoryGb} from '@/lib/calculator/gpu-shapes';
import {amountNumber, catalog} from '@/lib/catalog';
import {quotePreset} from '@/lib/calculator/quote';

const PDF_SPOT_CHECKS: Array<{sku: string; hourVat: number}> = [
  {sku: 'cloudru.gpu.a100-80-pcie-1', hourVat: 317.2},
  {sku: 'cloudru.gpu.a100-40-pcie-1', hourVat: 256.2},
  {sku: 'cloudru.gpu.h100-94-pcie-1', hourVat: 646.6},
  {sku: 'cloudru.gpu.h100-80-nvlink-1', hourVat: 854},
  {sku: 'cloudru.gpu.v100-32-1', hourVat: 244},
];

describe('GPU cross-validation', () => {
  it('Cloud.ru catalog hours match Evolution Compute GPU PDF (VAT included)', () => {
    for (const {sku, hourVat} of PDF_SPOT_CHECKS) {
      const meter = catalog.meters.find((m) => m.sku === sku);
      assert.ok(meter, `missing ${sku}`);
      const hour = amountNumber(meter!, 'unit');
      assert.ok(hour != null);
      assert.ok(
        Math.abs(hour! - hourVat) < 0.01,
        `${sku}: catalog ${hour} vs PDF ${hourVat}`,
      );
      const month = amountNumber(meter!, 'month');
      assert.ok(month != null);
      assert.ok(Math.abs(month! - hourVat * 720) < 1, `${sku}: month scale`);
    }
  });

  it('every GPU shape has at least one quote and Cloud.ru flavors quote as bundle', () => {
    for (const preset of buildGpuFlavorPresets()) {
      const result = quotePreset(preset, 'month');
      assert.ok(result.best, `no quote for ${preset.id}`);
      if (preset.shapeSource === 'cloud-ru' && preset.vcpu != null) {
        const cr = result.quotes.find((q) => q.provider === 'cloud-ru');
        assert.ok(cr, `Cloud.ru missing for ${preset.title}`);
        assert.equal(cr!.scope, 'bundle');
        const catalogMonth = amountNumber(cr!.meters[0]!, 'month');
        assert.ok(catalogMonth != null);
        assert.ok(Math.abs(catalogMonth! - cr!.total) < 1);
      }
    }
  });

  it('does not substitute A100 40GB for 80GB shapes (or vice versa)', () => {
    const presets = buildGpuFlavorPresets().filter((p) => p.gpuModelMatch === 'A100');
    for (const preset of presets) {
      if (preset.gpuMemoryGb == null) continue;
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const gpuMeter =
          q.meters.find((m) => m.categoryKey === 'gpu' || /gpu/i.test(m.meter)) ?? q.meters[0]!;
        if (q.scope === 'bundle') {
          assert.equal(perGpuMemoryGb(gpuMeter), preset.gpuMemoryGb, `${preset.title}/${q.provider}`);
          continue;
        }
        const mem = perGpuMemoryGb(gpuMeter);
        assert.equal(
          mem,
          preset.gpuMemoryGb,
          `${preset.title}/${q.provider}: used ${gpuMeter.sku} mem=${mem}`,
        );
      }
    }
  });

  it('does not substitute H100 80GB for 94GB shapes', () => {
    const presets = buildGpuFlavorPresets().filter(
      (p) => p.gpuModelMatch === 'H100' && p.gpuMemoryGb === 94,
    );
    assert.ok(presets.length >= 1);
    for (const preset of presets) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const gpuMeter = q.meters[0]!;
        assert.equal(perGpuMemoryGb(gpuMeter), 94, `${preset.title}/${q.provider} ${gpuMeter.sku}`);
      }
    }
  });

  it('Selectel B300 stays 8_000_000 ₽/month dedicated', () => {
    const b300 = buildGpuFlavorPresets().find((p) => p.gpuModelMatch === 'B300')!;
    const result = quotePreset(b300, 'month');
    assert.equal(result.best?.provider, 'selectel');
    assert.equal(result.best?.total, 8_000_000);
  });

  it('composed quote parts always sum to total', () => {
    for (const preset of buildGpuFlavorPresets()) {
      const result = quotePreset(preset, 'month');
      for (const q of [...result.quotes, ...result.alternateQuotes]) {
        const sum = q.parts.reduce((s, p) => s + p.amount, 0);
        assert.ok(Math.abs(sum - q.total) < 0.05, `${preset.id}/${q.provider}`);
      }
    }
  });
});
