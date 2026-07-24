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
    const selectelFlavors = all.filter((p) => p.shapeSource === 'selectel' && p.vcpu != null);
    assert.ok(selectelFlavors.length >= 40, `expected Selectel GPU Line shapes, got ${selectelFlavors.length}`);
    assert.ok(
      selectelFlavors.some((p) => p.gpuModelMatch === 'H100' && p.vcpu === 12 && p.ramGiB === 128),
      'Selectel H100 12/128',
    );
    assert.ok(
      selectelFlavors.some((p) => p.gpuModelMatch === 'H200' && p.vcpu === 24 && p.ramGiB === 180),
      'Selectel H200 24/180',
    );

    const cards = buildGpuCardPresets(all);
    assert.ok(cards.length >= 4);
    assert.ok(cards.some((p) => p.gpuModelMatch === 'B300'));
    const l40s = cards.find((p) => p.gpuModelMatch === 'L40S');
    assert.ok(l40s, 'L40S must be on the GPU card shelf');
    assert.equal(l40s.gpuCount, 1);
    assert.equal(l40s.gpuMemoryGb, 48);

    // Shelf prefers multi-provider hosts that keep Cloud.ru when it publishes the flavor.
    const l4 = cards.find((p) => p.gpuModelMatch === 'L4');
    assert.equal(l4?.shapeSource, 'vk-cloud');
    assert.equal(l4?.vcpu, 16);
    assert.equal(l4?.ramGiB, 72);

    const a100 = cards.find((p) => p.gpuModelMatch === 'A100');
    assert.equal(a100?.shapeSource, 'cloud-ru');
    assert.equal(a100?.gpuMemoryGb, 80);
    assert.equal(a100?.vcpu, 20);
    assert.equal(a100?.ramGiB, 125);

    const h100x1 = cards.find((p) => p.gpuModelMatch === 'H100' && p.gpuCount === 1);
    assert.ok(h100x1);
    assert.equal(h100x1.gpuMemoryGb, 80);
    assert.equal(h100x1.shapeSource, 'cloud-ru');
    assert.equal(h100x1.gpuInterconnect, 'PCIe');
    assert.equal(h100x1.vcpu, 20);
    assert.equal(h100x1.ramGiB, 110);

    // H200: no Cloud.ru — VK host for Selectel/T1/VK.
    const h200x1 = cards.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 1);
    assert.equal(h200x1?.shapeSource, 'vk-cloud');
    assert.equal(h200x1?.vcpu, 44);
    assert.equal(h200x1?.ramGiB, 256);

    const h100x8 = cards.find((p) => p.gpuModelMatch === 'H100' && p.gpuCount === 8);
    assert.ok(h100x8);
    assert.equal(h100x8.shapeSource, 'cloud-ru');
    assert.equal(h100x8.gpuMemoryGb, 80);
    assert.equal(h100x8.gpuInterconnect, 'PCIe');
  });
});
