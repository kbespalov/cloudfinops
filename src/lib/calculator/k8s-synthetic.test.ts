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
  it('Cloud.ru HA = 3 × zonal basic master for every native shape (VAT-incl. hourly)', () => {
    const shapes = [
      {basic: 'cloudru.kubernetes.master-zonal-2-4', ha: 'cloudru.kubernetes.master-ha-2-4.synthetic', vcpu: 2, ramGiB: 4},
      {basic: 'cloudru.kubernetes.master-zonal-4-8', ha: 'cloudru.kubernetes.master-ha-4-8.synthetic', vcpu: 4, ramGiB: 8},
      {basic: 'cloudru.kubernetes.master-zonal-8-16', ha: 'cloudru.kubernetes.master-ha-8-16.synthetic', vcpu: 8, ramGiB: 16},
      {basic: 'cloudru.kubernetes.master-zonal-16-32', ha: 'cloudru.kubernetes.master-ha-16-32.synthetic', vcpu: 16, ramGiB: 32},
    ] as const;

    for (const c of shapes) {
      const basic = catalog.meters.find((m) => m.sku === c.basic);
      const ha = catalog.meters.find((m) => m.sku === c.ha);
      assert.ok(basic, c.basic);
      assert.ok(ha, c.ha);
      assert.equal(ha.synthetic, true);
      assert.equal(ha.comparableTier, 'ha');
      assert.equal(basic.comparableTier, 'basic');
      assert.equal(ha.priceProvenance, 'derived');
      assert.equal(Number(ha.dimensions.masterCount), 3);
      assert.equal(Number(basic.dimensions.vcpu), c.vcpu);
      assert.equal(Number(basic.dimensions.ramGiB), c.ramGiB);
      assert.ok((ha.notes || '').length > 40, `${c.ha}: notes`);

      const basicHour = amountNumber(basic, 'unit');
      const haHour = amountNumber(ha, 'unit');
      assert.ok(basicHour != null && haHour != null);
      assert.ok(
        nearlyEqual(haHour, basicHour * 3),
        `${c.ha}: expected ${basicHour}*3=${basicHour * 3}, got ${haHour}`,
      );
    }

    assert.equal(pickK8sMasterMeter('cloud-ru', 'basic')?.meter.sku, 'cloudru.kubernetes.master-zonal-2-4');
    assert.equal(pickK8sMasterMeter('cloud-ru', 'ha')?.meter.sku, 'cloudru.kubernetes.master-ha-2-4.synthetic');
  });

  it('T1 Cloud HA is native-fixed 3 × Master Small/Medium/Large (not synthetic)', () => {
    const cases = [
      {
        basic: 't1.kubernetes.master-small',
        ha: 't1.kubernetes.master-ha-small',
      },
      {
        basic: 't1.kubernetes.master-medium',
        ha: 't1.kubernetes.master-ha-medium',
      },
      {
        basic: 't1.kubernetes.master-large',
        ha: 't1.kubernetes.master-ha-large',
      },
    ] as const;

    for (const c of cases) {
      const basic = catalog.meters.find((m) => m.sku === c.basic);
      const ha = catalog.meters.find((m) => m.sku === c.ha);
      assert.ok(basic, c.basic);
      assert.ok(ha, c.ha);
      assert.equal(ha.synthetic, false);
      assert.equal(ha.comparableTier, 'ha');
      assert.equal(ha.dimensions.comparabilityClass, 'native-fixed');
      assert.equal(Number(ha.dimensions.masterCount), 3);
      assert.equal(basic.comparableTier, 'basic');
      assert.equal(basic.dimensions.comparabilityClass, 'native-fixed');
      assert.doesNotMatch(ha.name, /\*/);
      assert.doesNotMatch(ha.notes || '', /синтетич/i);
      const basicHour = amountNumber(basic, 'unit');
      const haHour = amountNumber(ha, 'unit');
      assert.ok(basicHour != null && haHour != null);
      assert.ok(
        nearlyEqual(haHour, basicHour * 3),
        `${c.ha}: expected ${basicHour}*3=${basicHour * 3}, got ${haHour}`,
      );
    }

    const picked = pickK8sMasterMeter('t1-cloud', 'ha');
    assert.ok(picked);
    assert.equal(picked.meter.sku, 't1.kubernetes.master-ha-small');
    assert.equal(picked.synthetic, false);
  });

  it('Yandex exposes orderable presets; VK exposes 2/6 · 2/8 · 2/4; HA = 3 × basic', () => {
    const cases = [
      {
        basic: 'yc.kubernetes.master-basic-2-8.synthetic',
        ha: 'yc.kubernetes.master-ha-2-8.synthetic',
        vcpu: 2,
        ramGiB: 8,
      },
      {
        basic: 'yc.kubernetes.master-basic-4-8.synthetic',
        ha: 'yc.kubernetes.master-ha-4-8.synthetic',
        vcpu: 4,
        ramGiB: 8,
      },
      {
        basic: 'yc.kubernetes.master-basic-4-16.synthetic',
        ha: 'yc.kubernetes.master-ha-4-16.synthetic',
        vcpu: 4,
        ramGiB: 16,
      },
      {
        basic: 'yc.kubernetes.master-basic-8-16.synthetic',
        ha: 'yc.kubernetes.master-ha-8-16.synthetic',
        vcpu: 8,
        ramGiB: 16,
      },
      {
        basic: 'yc.kubernetes.master-basic-8-32.synthetic',
        ha: 'yc.kubernetes.master-ha-8-32.synthetic',
        vcpu: 8,
        ramGiB: 32,
      },
      {
        basic: 'yc.kubernetes.master-basic-16-32.synthetic',
        ha: 'yc.kubernetes.master-ha-16-32.synthetic',
        vcpu: 16,
        ramGiB: 32,
      },
      {
        basic: 'vk.kubernetes.master-basic-2-6.synthetic',
        ha: 'vk.kubernetes.master-ha-2-6.synthetic',
        vcpu: 2,
        ramGiB: 6,
      },
      {
        basic: 'vk.kubernetes.master-basic-2-4.synthetic',
        ha: 'vk.kubernetes.master-ha-2-4.synthetic',
        vcpu: 2,
        ramGiB: 4,
      },
      {
        basic: 'vk.kubernetes.master-basic-2-8.synthetic',
        ha: 'vk.kubernetes.master-ha-2-8.synthetic',
        vcpu: 2,
        ramGiB: 8,
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
      assert.equal(Number(basic.dimensions.vcpu), c.vcpu);
      assert.equal(Number(basic.dimensions.ramGiB), c.ramGiB);
      const basicHour = amountNumber(basic, 'unit');
      const haHour = amountNumber(ha, 'unit');
      assert.ok(basicHour != null && haHour != null);
      assert.ok(
        nearlyEqual(haHour, basicHour * 3),
        `${c.ha}: expected ${basicHour}*3=${basicHour * 3}, got ${haHour}`,
      );
    }
  });

  it('Yandex has no 2/4 or 2/6 (console min 2/8); VK default is 2/6; VK 2/4 is parity-only', () => {
    const ycOrderable = catalog.meters.find((m) => m.sku === 'yc.kubernetes.master-basic-2-8.synthetic');
    const vkDefault = catalog.meters.find((m) => m.sku === 'vk.kubernetes.master-basic-2-6.synthetic');
    const vkParity24 = catalog.meters.find((m) => m.sku === 'vk.kubernetes.master-basic-2-4.synthetic');
    assert.ok(ycOrderable && vkDefault && vkParity24);
    assert.equal(
      catalog.meters.some((m) => m.sku.startsWith('yc.kubernetes.master-') && m.sku.includes('-2-4.')),
      false,
    );
    assert.equal(
      catalog.meters.some((m) => m.sku.startsWith('yc.kubernetes.master-') && m.sku.includes('-2-6.')),
      false,
    );
    assert.equal(ycOrderable.dimensions.hostType, 's-c2-m8');
    assert.equal(vkDefault.dimensions.hostType, 'STD2-2-6');
    assert.equal(vkParity24.dimensions.parityOnly, true);
    assert.equal(isK8sComparableMaster(vkParity24, 'basic'), false);
    assert.equal(isK8sComparableMaster(ycOrderable, 'basic'), true);
    assert.equal(isK8sComparableMaster(vkDefault, 'basic'), true);
    assert.equal(pickK8sMasterMeter('vk-cloud', 'basic')?.meter.sku, 'vk.kubernetes.master-basic-2-6.synthetic');
    assert.equal(pickK8sMasterMeter('yandex-cloud', 'basic')?.meter.sku, 'yc.kubernetes.master-basic-2-8.synthetic');
  });

  it('pickK8sMasterMeter discloses synthetic HA for Cloud.ru', () => {
    const picked = pickK8sMasterMeter('cloud-ru', 'ha');
    assert.ok(picked);
    assert.equal(picked.synthetic, true);
    assert.equal(picked.effectiveTier, 'ha');
    assert.ok(isK8sComparableMaster(picked.meter, 'ha'));
  });

  it('every synthetic k8s comparable has user-facing notes and оценка marker', () => {
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
      assert.match(
        m.name,
        /оценка/i,
        `${m.sku}: synthetic K8s name must carry «оценка» marker`,
      );
      assert.doesNotMatch(m.name, /\*/, `${m.sku}: K8s synthetic names use «оценка», not *`);
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
      // K8s: «оценка»; GPU/other: legacy «*» or «оценка *».
      assert.ok(
        /оценка/i.test(m.name) || m.name.includes('*'),
        `${m.sku}: name must carry synthetic marker (оценка or *)`,
      );
    }
  });
});

