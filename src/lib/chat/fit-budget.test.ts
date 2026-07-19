import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {fitBudget} from './fit-budget';

describe('fitBudget', () => {
  it('fits ~100k RUB into whole general VMs with util ≤ 100%', () => {
    const r = fitBudget({budgetMonthRub: 100_000, profile: 'general'});
    assert.equal(r.budgetMonthRub, 100_000);
    assert.ok(r.scenarios.length >= 3);
    assert.ok(r.highlights.length >= 1);

    for (const h of r.highlights) {
      assert.ok(h.count >= 1);
      assert.ok(h.spendMonth <= 100_000 + 0.01);
      assert.ok(h.utilPct > 0 && h.utilPct <= 100.01);
      assert.ok(h.unitMonth * h.count <= 100_000 + 1);
    }

    const shape4 = r.scenarios.find((s) => s.shapeId === '4-16');
    assert.ok(shape4?.best);
    assert.ok((shape4!.best!.count as number) >= 1);
  });

  it('returns zero counts when budget is below any unit price', () => {
    const r = fitBudget({budgetMonthRub: 1000, profile: 'gpu-h100'});
    const anyAffordable = r.scenarios.some((s) => s.best && s.best.count >= 1);
    // 1k ₽ cannot buy H100 — highlights empty or all zero
    assert.equal(anyAffordable, false);
    assert.equal(r.highlights.length, 0);
  });

  it('keeps tool payload compact for the model', () => {
    const r = fitBudget({budgetMonthRub: 100_000, profile: 'general'});
    const json = JSON.stringify(r);
    assert.ok(json.length < 5500, `payload too large: ${json.length}`);
    assert.ok(!('packs' in (r.scenarios[0] as object)));
  });
});
