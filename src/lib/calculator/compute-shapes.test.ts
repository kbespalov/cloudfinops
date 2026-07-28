import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  explainShapeMiss,
  isComputeShapeAllowed,
  providerEnvelope,
  providerShapeLimits,
  providerVmTypes,
  shapeAllowedForProvider,
  shapeModeOf,
} from '@/lib/calculator/compute-shapes';
import {catalog} from '@/lib/catalog';

describe('compute-shapes', () => {
  it('marks general compute meters with shape dimensions for every provider', () => {
    for (const provider of [
      'vk-cloud',
      'yandex-cloud',
      'selectel',
      't1-cloud',
      'mws-cloud',
      'cloud-ru',
    ]) {
      const meters = catalog.meters.filter(
        (m) =>
          m.provider === provider &&
          !m.synthetic &&
          (m.meter === 'compute.vcpu' ||
            m.meter === 'compute.ram' ||
            (m.meter === 'compute.flavor' && m.categoryKey === 'compute')),
      );
      assert.ok(meters.length > 0, provider);
      const withEnvelope = meters.some(
        (m) => m.dimensions.maxVcpu != null && m.dimensions.maxRamGiB != null,
      );
      const withTypes = meters.some((m) => Array.isArray(m.dimensions.availableVmTypes));
      assert.ok(withEnvelope || withTypes, `${provider}: missing shape markup`);
      assert.ok(shapeModeOf(provider), `${provider}: missing shapeMode`);
    }
  });

  it('one yes/no API works for all providers (isComputeShapeAllowed)', () => {
    assert.equal(isComputeShapeAllowed, shapeAllowedForProvider);

    assert.ok(isComputeShapeAllowed('vk-cloud', 16, 64));
    assert.ok(!isComputeShapeAllowed('vk-cloud', 32, 128));
    assert.ok(!isComputeShapeAllowed('vk-cloud', 52, 208));
    assert.match(explainShapeMiss('vk-cloud', 52, 208) ?? '', /STD|16/);

    assert.ok(isComputeShapeAllowed('mws-cloud', 32, 128));
    assert.ok(!isComputeShapeAllowed('mws-cloud', 32, 256));

    assert.ok(isComputeShapeAllowed('cloud-ru', 32, 128));
    assert.ok(isComputeShapeAllowed('cloud-ru', 32, 64));
    assert.ok(!isComputeShapeAllowed('cloud-ru', 40, 320)); // price book, not console self-serve
    assert.ok(!isComputeShapeAllowed('cloud-ru', 64, 256));
    assert.ok(!isComputeShapeAllowed('cloud-ru', 52, 208));

    assert.ok(isComputeShapeAllowed('yandex-cloud', 80, 640));
    assert.ok(isComputeShapeAllowed('yandex-cloud', 32, 512)); // 16 GiB/vCPU Ice Lake
    assert.ok(!isComputeShapeAllowed('yandex-cloud', 32, 520)); // above maxRamGiBPerVcpu
    assert.ok(!isComputeShapeAllowed('yandex-cloud', 96, 1000));

    assert.ok(isComputeShapeAllowed('selectel', 32, 256));
    assert.ok(!isComputeShapeAllowed('selectel', 96, 1000)); // docs arbitrary, not quote envelope
    assert.ok(!isComputeShapeAllowed('selectel', 232, 1200));
    assert.ok(!isComputeShapeAllowed('selectel', 256, 2048));

    assert.ok(isComputeShapeAllowed('t1-cloud', 64, 640));
    assert.ok(!isComputeShapeAllowed('t1-cloud', 64, 896));
    assert.ok(!isComputeShapeAllowed('t1-cloud', 128, 512));
  });

  it('MWS uses exact published vmTypes lattice', () => {
    assert.equal(shapeModeOf('mws-cloud'), 'exact-vm-types');
    assert.ok(providerVmTypes('mws-cloud').length >= 20);
  });

  it('T1 console envelope is 64 vCPU / 640 GiB', () => {
    const env = providerEnvelope('t1-cloud');
    assert.ok(env);
    assert.equal(env!.maxVcpu, 64);
    assert.equal(env!.maxRamGiB, 640);
    assert.equal(shapeModeOf('t1-cloud'), 'envelope');
  });

  it('Selectel Standard dedicated quote envelope is 32/256; docs arbitrary is platformMax', () => {
    const meters = catalog.meters.filter(
      (m) =>
        m.provider === 'selectel' &&
        (m.meter === 'compute.vcpu' || m.meter === 'compute.ram') &&
        !m.synthetic,
    );
    assert.ok(meters.length >= 4);
    for (const m of meters) {
      assert.equal(m.dimensions.maxVcpu, 32);
      assert.equal(m.dimensions.maxRamGiB, 256);
      assert.equal(m.dimensions.platformMaxVcpu, 232);
      assert.equal(m.dimensions.platformMaxRamGiB, 1200);
      assert.equal(m.dimensions.minVcpu, 2);
      assert.equal(m.dimensions.minRamGiB, 4);
    }
    const lim = providerShapeLimits('selectel');
    assert.deepEqual(lim.max, {vcpu: 32, ramGiB: 256});
    assert.deepEqual(lim.platformMax, {vcpu: 232, ramGiB: 1200});
  });

  it('VK STD meters publish 16/64 self-serve envelope via the shared path', () => {
    const meters = catalog.meters.filter(
      (m) =>
        m.provider === 'vk-cloud' &&
        (m.meter === 'compute.vcpu' || m.meter === 'compute.ram') &&
        !m.synthetic,
    );
    assert.ok(meters.length >= 4);
    for (const m of meters) {
      assert.equal(m.dimensions.maxVcpu, 16);
      assert.equal(m.dimensions.maxRamGiB, 64);
      assert.equal(m.dimensions.platformMaxVcpu, 32);
      assert.equal(m.dimensions.platformMaxRamGiB, 1024);
    }
    assert.equal(shapeModeOf('vk-cloud'), 'envelope');
  });

  it('providerShapeLimits exposes min/max compute footprint (not price)', () => {
    const vk = providerShapeLimits('vk-cloud');
    assert.deepEqual(vk.max, {vcpu: 16, ramGiB: 64});
    const mws = providerShapeLimits('mws-cloud');
    assert.deepEqual(mws.min, {vcpu: 2, ramGiB: 4});
    assert.deepEqual(mws.max, {vcpu: 48, ramGiB: 192});
  });

  it('explainShapeMiss describes envelope / lattice rejects', () => {
    assert.equal(explainShapeMiss('selectel', 32, 256), null);
    assert.match(explainShapeMiss('selectel', 1, 1) ?? '', /2–32|вне каталога/);
    assert.match(explainShapeMiss('selectel', 232, 1200) ?? '', /2–32|256|вне каталога/);
    assert.match(explainShapeMiss('vk-cloud', 32, 128) ?? '', /STD|self-serve|16/);
    assert.match(explainShapeMiss('mws-cloud', 32, 256) ?? '', /vmType/);
    assert.match(explainShapeMiss('cloud-ru', 32, 256) ?? '', /flavor|вне каталога|32/);
  });
});
