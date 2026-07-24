import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareUnitPrice} from './analytics';

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
