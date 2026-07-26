/**
 * Integrity checks for synthetic Kubernetes HA masters.
 * Synthetic SKUs must stay mathematically tied to their source meters and
 * stay disclosed (synthetic flag / .synthetic sku / notes).
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {amountNumber, catalog} from '@/lib/catalog';
import {isK8sComparableMaster} from '@/lib/chat/search';
import {pickK8sMasterMeter} from '@/lib/calculator/lakehouse-quote';

function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

describe('k8s synthetic HA integrity', () => {
  it('Cloud.ru HA = 3 × zonal basic master (VAT-incl. hourly)', () => {
    const basic = catalog.meters.find((m) => m.sku === 'cloudru.kubernetes.master-zonal-2-4');
    const ha = catalog.meters.find((m) => m.sku === 'cloudru.kubernetes.master-ha-2-4.synthetic');
    assert.ok(basic, 'basic zonal master');
    assert.ok(ha, 'synthetic HA master');
    assert.equal(ha.synthetic, true);
    assert.equal(ha.comparableTier, 'ha');
    assert.equal(ha.priceProvenance, 'derived');
    assert.equal(Number(ha.dimensions.masterCount), 3);
    assert.ok((ha.notes || '').length > 40, 'HA synthetic must carry provenance notes');

    const basicHour = amountNumber(basic, 'unit');
    const haHour = amountNumber(ha, 'unit');
    assert.ok(basicHour != null && haHour != null);
    assert.ok(
      nearlyEqual(haHour, basicHour * 3),
      `expected ${basicHour}*3=${basicHour * 3}, got ${haHour}`,
    );
  });

  it('Yandex / VK synthetic HA = 3 × synthetic basic 2/4', () => {
    const cases = [
      {
        basic: 'yc.kubernetes.master-basic-2-4.synthetic',
        ha: 'yc.kubernetes.master-ha-2-4.synthetic',
      },
      {
        basic: 'vk.kubernetes.master-basic-2-4.synthetic',
        ha: 'vk.kubernetes.master-ha-2-4.synthetic',
      },
    ] as const;

    for (const c of cases) {
      const basic = catalog.meters.find((m) => m.sku === c.basic);
      const ha = catalog.meters.find((m) => m.sku === c.ha);
      assert.ok(basic, c.basic);
      assert.ok(ha, c.ha);
      assert.equal(ha.synthetic, true);
      assert.equal(ha.comparableTier, 'ha');
      assert.equal(Number(ha.dimensions.masterCount), 3);
      const basicHour = amountNumber(basic, 'unit');
      const haHour = amountNumber(ha, 'unit');
      assert.ok(basicHour != null && haHour != null);
      assert.ok(
        nearlyEqual(haHour, basicHour * 3),
        `${c.ha}: expected ${basicHour}*3=${basicHour * 3}, got ${haHour}`,
      );
    }
  });

  it('pickK8sMasterMeter discloses synthetic HA for Cloud.ru', () => {
    const picked = pickK8sMasterMeter('cloud-ru', 'ha');
    assert.ok(picked);
    assert.equal(picked.synthetic, true);
    assert.equal(picked.effectiveTier, 'ha');
    assert.ok(isK8sComparableMaster(picked.meter, 'ha'));
  });

  it('every synthetic k8s comparable has user-facing notes and * marker', () => {
    for (const m of catalog.meters) {
      if (!m.synthetic && !m.sku.includes('.synthetic')) continue;
      if (m.categoryKey !== 'kubernetes') continue;
      if (m.comparableTier !== 'basic' && m.comparableTier !== 'ha') continue;
      const notes = (m.notes || '').trim();
      assert.ok(notes.length > 40, `${m.sku}: notes too short`);
      assert.match(
        notes,
        /синтетич/i,
        `${m.sku}: notes must explicitly say this is a synthetic catalog position`,
      );
      assert.match(
        notes,
        /не публичный тариф|приблизительно сравн|оценка для сравнения|не отдельная строка/i,
        `${m.sku}: notes must explain this is an estimate for comparison`,
      );
      assert.doesNotMatch(
        notes,
        /\bPDF\b|Прил\.|7\.EVO|sourceRefs|syntheticFrom/i,
        `${m.sku}: notes must stay user-facing (no internal tariff jargon)`,
      );
      assert.ok(
        m.name.includes('*'),
        `${m.sku}: synthetic SKU name must carry * marker`,
      );
    }
  });

  it('every synthetic catalog meter discloses «синтетическ…» in notes', () => {
    const synthetics = catalog.meters.filter(
      (m) => m.synthetic || m.sku.includes('.synthetic'),
    );
    assert.ok(synthetics.length >= 9, `expected ≥9 synthetics, got ${synthetics.length}`);
    for (const m of synthetics) {
      const notes = (m.notes || '').trim();
      assert.ok(notes.length > 40, `${m.sku}: notes too short`);
      assert.match(
        notes,
        /синтетич/i,
        `${m.sku}: synthetic SKU notes must contain «синтетическ…»`,
      );
      assert.ok(m.name.includes('*'), `${m.sku}: name must carry * marker`);
    }
  });
});

