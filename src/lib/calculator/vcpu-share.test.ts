import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  clampShapeToShare,
  inferComputeFamily,
  ramOptionsForShare,
  shapeAllowedForShare,
  vcpuStepsForShare,
} from '@/lib/calculator/vcpu-share';

describe('vcpu share limits', () => {
  it('Yandex fractional shares allow only 2/4 cores and cap RAM at 4 GiB/core', () => {
    assert.deepEqual(vcpuStepsForShare('20%', 'general'), [2, 4]);
    assert.deepEqual(vcpuStepsForShare('50%', 'high-memory'), [2, 4]);
    assert.ok(shapeAllowedForShare('20%', 4, 16));
    assert.ok(!shapeAllowedForShare('20%', 8, 16));
    assert.ok(!shapeAllowedForShare('20%', 4, 32));
    assert.ok(shapeAllowedForShare('5%', 4, 8));
    assert.ok(!shapeAllowedForShare('5%', 4, 16));
  });

  it('Cloud.ru 10%/30% expose published flavor shapes', () => {
    assert.deepEqual(vcpuStepsForShare('10%', 'general'), [1, 2, 4, 8]);
    assert.ok(shapeAllowedForShare('10%', 8, 32));
    assert.ok(!shapeAllowedForShare('10%', 16, 32));
    assert.ok(shapeAllowedForShare('30%', 32, 64));
    assert.deepEqual(ramOptionsForShare('10%', 'general', 4), [8, 16, 32]);
  });

  it('dedicated 100% exposes free vCPU/RAM ladders (not family-ratio locked)', () => {
    const vcpu = vcpuStepsForShare('100%', 'general');
    const ram = ramOptionsForShare('100%', 'high-cpu', 2);
    assert.ok(vcpu.includes(1) && vcpu.includes(128));
    assert.ok(ram.includes(24), 'custom sizes like 24 GiB must be reachable');
    assert.ok(ram.includes(128));
    assert.ok(ram.includes(1024));
    // Same ladder regardless of active family chip.
    assert.deepEqual(ram, ramOptionsForShare('100%', 'high-memory', 2));
  });

  it('inferComputeFamily follows GiB/vCPU ratio and keeps low-cost sticky', () => {
    assert.equal(inferComputeFamily(4, 8, 'general'), 'high-cpu');
    assert.equal(inferComputeFamily(4, 16, 'high-cpu'), 'general');
    assert.equal(inferComputeFamily(2, 24, 'general'), 'high-memory');
    assert.equal(inferComputeFamily(2, 4, 'low-cost'), 'low-cost');
    assert.equal(inferComputeFamily(2, 4, 'general'), 'high-cpu');
    assert.equal(inferComputeFamily(4, 20, 'low-cost'), 'general');
    assert.equal(inferComputeFamily(4, 24, 'general'), 'high-memory');
  });

  it('clampShapeToShare snaps oversized configs down to allowed envelope', () => {
    const yandex = clampShapeToShare('20%', 'general', 16, 64);
    assert.equal(yandex.vcpu, 4);
    assert.ok(yandex.ramGiB <= 16);

    const cloud = clampShapeToShare('10%', 'low-cost', 16, 64);
    assert.equal(cloud.vcpu, 8);
    assert.ok(cloud.ramGiB <= 32);
  });
});
