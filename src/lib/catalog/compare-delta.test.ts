import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  bestAmount,
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

  it('returns null for unusable inputs', () => {
    assert.equal(priceDeltaVsBest(10, 0), null);
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

describe('priceDeltaTitle', () => {
  it('describes best and above', () => {
    assert.match(priceDeltaTitle({kind: 'best', pct: 0}, '100 ₽'), /Лучший оффер/);
    assert.match(
      priceDeltaTitle({kind: 'above', pct: 34}, '100,00 ₽'),
      /На 34% дороже лучшего оффера \(100,00 ₽\)/,
    );
  });
});
