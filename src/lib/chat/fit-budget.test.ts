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
    assert.equal(r.valuePick, null);
  });

  it('keeps tool payload compact for the model', () => {
    const r = fitBudget({budgetMonthRub: 100_000, profile: 'general'});
    const json = JSON.stringify(r);
    assert.ok(json.length < 6500, `payload too large: ${json.length}`);
    assert.ok(!('packs' in (r.scenarios[0] as object)));
  });

  it('at ~10k RUB quotes Cloud.ru; denser 2/8 packs win util top-6, valuePick surfaces cheaper same vCPU', () => {
    const budget = 10_000;
    const r = fitBudget({budgetMonthRub: budget, profile: 'general'});

    const shape28 = r.scenarios.find((s) => s.shapeId === '2-8');
    const shape416 = r.scenarios.find((s) => s.shapeId === '4-16');
    assert.ok(shape28?.best);
    assert.ok(shape416?.best);

    // Cloud.ru must be quoted (flavor SKUs exist) — not filtered out of catalog.
    const cloud28 = [...(shape28!.best ? [shape28!.best] : []), ...shape28!.also].find((p) =>
      /cloud\.ru/i.test(p.provider),
    );
    // May be outside best/also (util top-3) — recover via valuePick / flat ranking check.
    const cloud416Cheap = shape416!.cheapestSameResources;
    assert.ok(
      cloud416Cheap && /cloud\.ru/i.test(cloud416Cheap.provider),
      'Cloud.ru 4/16 should be cheapestSameResources (lowest unit among 4 vCPU ×1)',
    );
    assert.equal(cloud416Cheap.count, 1);
    assert.ok(cloud416Cheap.unitMonth < shape416!.best!.unitMonth);

    // 2/8: VK/Selectel/T1/MWS fit ×2; Cloud.ru unit is ~5.1k → only ×1 (half the vCPU).
    assert.ok(shape28!.best!.count >= 2, 'best 2/8 pack should fit at least 2 VMs in 10k');
    assert.ok((shape28!.best!.totalVcpu ?? 0) >= 4);

    // Highlights: max totalVcpu then util% — Cloud.ru 2/8×1 and low-util 4/16 drop out of top-6.
    assert.ok(r.highlights.every((h) => (h.totalVcpu ?? 0) >= 4));
    assert.ok(
      !r.highlights.some((h) => /cloud\.ru/i.test(h.provider)),
      'Cloud.ru must lose util top-6 at 10k (documented ranking nuance)',
    );

    // valuePick: same max resources, cheaper unit — Cloud.ru 4/16 (not «нет в каталоге»).
    assert.ok(r.valuePick, 'valuePick should surface Cloud.ru when truncated from highlights');
    assert.match(r.valuePick!.provider, /cloud\.ru/i);
    assert.equal(r.valuePick!.shapeId, '4-16');
    assert.equal(r.valuePick!.totalVcpu, r.highlights[0]!.totalVcpu);
    assert.ok(r.valuePick!.spendMonth <= budget + 0.01);
    assert.ok(r.valuePick!.utilPct < (r.highlights[0]?.utilPct ?? 100));
    assert.ok(
      r.valuePick!.unitMonth <= cloud416Cheap.unitMonth + 0.01,
      'valuePick should be the cheapest same-resource unit (Cloud.ru 4/16)',
    );

    // 2/8 Cloud.ru is usually outside best/also (only ×1); absence there is OK if valuePick covers 4/16.
    void cloud28;
  });
});
