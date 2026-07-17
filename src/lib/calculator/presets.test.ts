import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  COMPUTE_FAMILY_HINT,
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  GPU_PRESETS,
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

  it('keeps unique preset ids across compute and GPU', () => {
    const ids = [...COMPUTE_PRESETS, ...GPU_PRESETS].map((p) => p.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('uses expected vCPU:RAM ratios inside each compute family', () => {
    for (const p of computePresetsByFamily('general')) {
      assert.equal(p.ramGiB, p.vcpu * 2, p.id);
    }
    for (const p of computePresetsByFamily('high-cpu')) {
      assert.equal(p.ramGiB, p.vcpu, p.id);
    }
    for (const p of computePresetsByFamily('high-memory')) {
      assert.equal(p.ramGiB, p.vcpu * 8, p.id);
    }
    for (const p of computePresetsByFamily('low-cost')) {
      assert.ok(p.ramGiB >= p.vcpu, p.id);
      assert.ok(p.diskGiB === 100, p.id);
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

  it('defines GPU presets with positive counts and model matchers', () => {
    assert.ok(GPU_PRESETS.length >= 4);
    for (const p of GPU_PRESETS) {
      assert.equal(p.kind, 'gpu');
      assert.ok(p.gpuCount >= 1);
      assert.ok(p.gpuModelMatch.length >= 2);
      assert.ok(p.title.includes(String(p.gpuCount)) || p.title.includes('×'));
    }
    const fullNode = GPU_PRESETS.find((p) => p.id === 'gpu-h200-8');
    assert.ok(fullNode?.preferBundle);
    assert.equal(fullNode?.gpuCount, 8);
  });
});
