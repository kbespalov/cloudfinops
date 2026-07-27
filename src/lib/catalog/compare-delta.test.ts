import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  bestAmount,
  buildExactPriceComparison,
  buildPriceDeltaById,
  priceDeltaTitle,
  priceDeltaVsBest,
} from './compare-delta';

describe('bestAmount', () => {
  it('picks the minimum among finite non-negative amounts', () => {
    assert.equal(bestAmount([10, 3, 7]), 3);
    assert.equal(bestAmount([null, 5, undefined, 2]), 2);
  });

  it('ignores negatives and non-finite values', () => {
    assert.equal(bestAmount([-1, Number.NaN, Infinity, 4]), 4);
  });

  it('returns null when nothing usable', () => {
    assert.equal(bestAmount([]), null);
    assert.equal(bestAmount([null, undefined, -2]), null);
  });
});

describe('priceDeltaVsBest', () => {
  it('marks the minimum as best', () => {
    assert.deepEqual(priceDeltaVsBest(100, 100), {kind: 'best', pct: 0});
  });

  it('rounds percent above best', () => {
    assert.deepEqual(priceDeltaVsBest(134, 100), {kind: 'above', pct: 34});
    assert.deepEqual(priceDeltaVsBest(150, 100), {kind: 'above', pct: 50});
  });

  it('treats tiny float noise at the floor as best', () => {
    assert.deepEqual(priceDeltaVsBest(100.004, 100), {kind: 'best', pct: 0});
  });

  it('handles zero baseline without Infinity', () => {
    assert.deepEqual(priceDeltaVsBest(0, 0), {kind: 'equal-free'});
    assert.deepEqual(priceDeltaVsBest(10, 0), {kind: 'free-vs-paid'});
  });

  it('switches huge percent vs tiny best to ×N', () => {
    assert.deepEqual(priceDeltaVsBest(0.4, 0.005), {kind: 'times', times: 80});
    assert.deepEqual(priceDeltaVsBest(1.5, 1), {kind: 'above', pct: 50});
  });

  it('returns null for unusable inputs', () => {
    assert.equal(priceDeltaVsBest(Number.NaN, 10), null);
    assert.equal(priceDeltaVsBest(-1, 10), null);
  });
});

describe('buildPriceDeltaById', () => {
  it('returns empty map with fewer than two priced rows', () => {
    assert.equal(buildPriceDeltaById([{id: 'a', amount: 10}]).size, 0);
    assert.equal(
      buildPriceDeltaById([
        {id: 'a', amount: 10},
        {id: 'b', amount: null},
      ]).size,
      0,
    );
  });

  it('marks ties as best and others as above', () => {
    const map = buildPriceDeltaById([
      {id: 'a', amount: 100},
      {id: 'b', amount: 100},
      {id: 'c', amount: 134},
      {id: 'd', amount: null},
    ]);
    assert.equal(map.get('a')?.kind, 'best');
    assert.equal(map.get('b')?.kind, 'best');
    assert.deepEqual(map.get('c'), {kind: 'above', pct: 34});
    assert.equal(map.has('d'), false);
  });
});

describe('buildExactPriceComparison', () => {
  it('gates: <2 providers → empty deltas', () => {
    const cmp = buildExactPriceComparison([{id: 'a', amount: 10}]);
    assert.equal(cmp.deltasByMeterId.size, 0);
  });

  it('2 providers → vs best only (no median)', () => {
    const cmp = buildExactPriceComparison([
      {id: 'a', amount: 100},
      {id: 'b', amount: 150},
    ]);
    assert.equal(cmp.medianPrice, null);
    assert.equal(cmp.deltasByMeterId.get('a')?.vsBest.kind, 'best');
    assert.deepEqual(cmp.deltasByMeterId.get('b')?.vsBest, {kind: 'above', pct: 50});
    assert.equal(cmp.deltasByMeterId.get('b')?.vsMedianPct, undefined);
  });

  it('≥3 providers → median allowed when median > 0', () => {
    const cmp = buildExactPriceComparison([
      {id: 'a', amount: 100},
      {id: 'b', amount: 200},
      {id: 'c', amount: 300},
    ]);
    assert.equal(cmp.medianPrice, 200);
    assert.equal(cmp.deltasByMeterId.get('c')?.vsMedianPct, 50);
  });

  it('zero baseline marks free-vs-paid and skips vsMedianPct', () => {
    const cmp = buildExactPriceComparison([
      {id: 'a', amount: 0},
      {id: 'b', amount: 0.01},
      {id: 'c', amount: 0.4},
      {id: 'd', amount: 0.5},
    ]);
    assert.equal(cmp.zeroBaseline, true);
    assert.equal(cmp.deltasByMeterId.get('a')?.vsBest.kind, 'equal-free');
    assert.equal(cmp.deltasByMeterId.get('c')?.vsBest.kind, 'free-vs-paid');
    assert.equal(cmp.deltasByMeterId.get('c')?.vsMedianPct, undefined);
  });
});

describe('priceDeltaTitle', () => {
  it('describes best and above for exact peers', () => {
    assert.match(priceDeltaTitle({kind: 'best', pct: 0}, '100 ₽'), /точных аналогов/);
    assert.match(
      priceDeltaTitle({kind: 'above', pct: 34}, '100,00 ₽'),
      /На 34% дороже лучшего точного аналога \(100,00 ₽\)/,
    );
  });

  it('describes free cases', () => {
    assert.match(priceDeltaTitle({kind: 'equal-free'}, '0 ₽'), /Бесплатно/);
    assert.match(priceDeltaTitle({kind: 'free-vs-paid'}, '0 ₽'), /0 ₽/);
  });
});
