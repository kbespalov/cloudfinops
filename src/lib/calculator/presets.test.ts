import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildGpuCardPresets,
  buildGpuFlavorPresets,
} from '@/lib/calculator/gpu-shapes';
import {
  COMPUTE_FAMILY_HINT,
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
} from '@/lib/calculator/presets';

const FAMILIES: ComputeFamily[] = ['low-cost', 'general', 'high-cpu', 'high-memory'];

describe('calculator presets', () => {
  it('defines five compute examples per family', () => {
    for (const family of FAMILIES) {
      const presets = computePresetsByFamily(family);
      assert.equal(presets.length, 5, family);
      assert.ok(COMPUTE_FAMILY_TITLE[family]);
      assert.ok(COMPUTE_FAMILY_HINT[family]);
    }
    assert.equal(COMPUTE_PRESETS.length, 20);
  });

  it('keeps unique preset ids across compute and GPU shapes', () => {
    const gpu = buildGpuFlavorPresets();
    const ids = [...COMPUTE_PRESETS, ...gpu].map((p) => p.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('uses expected vCPU:RAM ratios inside each compute family', () => {
    for (const p of computePresetsByFamily('general')) {
      assert.equal(p.ramGiB, p.vcpu * 4, p.id);
    }
    for (const p of computePresetsByFamily('high-cpu')) {
      assert.equal(p.ramGiB, p.vcpu * 2, p.id);
    }
    for (const p of computePresetsByFamily('high-memory')) {
      assert.equal(p.ramGiB, p.vcpu * 8, p.id);
    }
    for (const p of computePresetsByFamily('low-cost')) {
      assert.ok(p.ramGiB >= p.vcpu, p.id);
      assert.ok(p.diskGiB === 10, p.id);
    }
  });

  it('orders compute sizes ascending within each family', () => {
    for (const family of FAMILIES) {
      const presets = computePresetsByFamily(family);
      for (let i = 1; i < presets.length; i++) {
        const prev = presets[i - 1]!;
        const next = presets[i]!;
        assert.ok(
          next.vcpu > prev.vcpu || (next.vcpu === prev.vcpu && next.ramGiB > prev.ramGiB),
          `${family}: ${prev.id} should be smaller than ${next.id}`,
        );
      }
    }
  });

  it('builds GPU flavor shapes from Cloud.ru plus unique others', () => {
    const all = buildGpuFlavorPresets();
    assert.ok(all.length >= 40, `expected many shapes, got ${all.length}`);
    const cloudRu = all.filter((p) => p.shapeSource === 'cloud-ru');
    assert.ok(cloudRu.length >= 30, `expected Cloud.ru flavors, got ${cloudRu.length}`);
    const b300 = all.find((p) => p.gpuModelMatch === 'B300');
    assert.ok(b300, 'Selectel B300 must be present');
    assert.ok(b300.dedicated);
    assert.ok(b300.highlight);
    const cards = buildGpuCardPresets(all);
    assert.ok(cards.length >= 4);
    assert.ok(cards.some((p) => p.gpuModelMatch === 'B300'));
  });
});
