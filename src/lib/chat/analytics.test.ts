import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareUnitPrice} from './analytics';

describe('compareUnitPrice vCPU / RAM (Cloud.ru derived)', () => {
  it('surfaces Cloud.ru vCPU via derivedFromFlavors, not as comparable unit meter', () => {
    const r = compareUnitPrice('vcpu');
    assert.equal(r.providers.some((p) => p.provider === 'cloud-ru'), false);
    const derived = r.derivedFromFlavors.find((d) => d.provider === 'cloud-ru');
    assert.ok(derived, 'Cloud.ru must appear in derivedFromFlavors');
    assert.ok((derived.month ?? 0) > 0);
    assert.ok((derived.hour ?? 0) > 0);
    assert.match(derived.method, /оценк/i);
    // Like-for-like floor stays on published unit meters (Selectel today).
    assert.equal(r.stats?.cheapest?.provider, 'Selectel');
    assert.ok(
      (derived.month as number) < (r.providers[0]?.priceMonth as number),
      'Cloud.ru* estimate is typically below the unit-meter floor',
    );
  });

  it('surfaces Cloud.ru RAM via derivedFromFlavors; T1 is unit-meter floor', () => {
    const r = compareUnitPrice('ram');
    assert.equal(r.providers.some((p) => p.provider === 'cloud-ru'), false);
    const derived = r.derivedFromFlavors.find((d) => d.provider === 'cloud-ru');
    assert.ok(derived, 'Cloud.ru must appear in derivedFromFlavors');
    assert.ok((derived.month ?? 0) > 0);
    assert.equal(r.stats?.cheapest?.provider, 'T1 Cloud');
    const selectel = r.providers.find((p) => p.provider === 'selectel');
    assert.ok(selectel?.priceMonth != null);
    assert.ok(
      (selectel!.priceMonth as number) > (r.stats!.cheapest!.price as number),
      'Selectel RAM is not the unit-meter floor (inversion vs vCPU)',
    );
  });

  it('unit-meter spread stays in a sane band for vCPU and RAM', () => {
    const vcpu = compareUnitPrice('vcpu');
    const ram = compareUnitPrice('ram');
    assert.ok((vcpu.stats?.spreadMaxVsMinPct ?? 0) > 10);
    assert.ok((vcpu.stats?.spreadMaxVsMinPct ?? 0) < 40);
    assert.ok((ram.stats?.spreadMaxVsMinPct ?? 0) > 10);
    assert.ok((ram.stats?.spreadMaxVsMinPct ?? 0) < 40);
    assert.equal(vcpu.providers.length, 5);
    assert.equal(ram.providers.length, 5);
  });
});

describe('compareUnitPrice disk media', () => {
  it('diskMedia=nvme does not pick T1 Basic SSD as NVMe', () => {
    const r = compareUnitPrice('ssd', {diskMedia: 'nvme'});
    assert.equal(r.diskMedia, 'nvme');
    const t1 = r.providers.find((p) => p.provider === 't1-cloud');
    assert.ok(t1);
    assert.equal(t1.diskMedia, 'NVMe');
    assert.match(t1.name ?? '', /Average|High/i);
    assert.doesNotMatch(t1.name ?? '', /Basic/i);
    // Network NVMe floor is MWS NBS-PL2, not T1 Basic SSD.
    assert.equal(r.stats?.cheapest?.provider, 'MWS Cloud');
    assert.ok((t1.priceMonth ?? 0) > 10);
  });

  it('diskMedia=ssd excludes NVMe tiers (T1 Average, Selectel Fast)', () => {
    const r = compareUnitPrice('ssd', {diskMedia: 'ssd'});
    assert.equal(r.diskMedia, 'ssd');
    for (const p of r.providers) {
      assert.equal(p.diskMedia, 'SSD');
      assert.doesNotMatch(p.name ?? '', /Average|High|быстрый|NBS-PL2|Low Latency/i);
    }
    const t1 = r.providers.find((p) => p.provider === 't1-cloud');
    assert.match(t1?.name ?? '', /Basic/i);
  });

  it('default any still returns a disk name/sku for transparency', () => {
    const r = compareUnitPrice('ssd');
    assert.equal(r.diskMedia, 'any');
    assert.ok(r.providers.every((p) => p.name || p.sku));
  });
});
