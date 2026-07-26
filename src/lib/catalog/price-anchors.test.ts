/**
 * Golden spot-check: critical public anchors verified against vendor pages
 * on 2026-07-26. Failures mean catalog drift or a bad edit — re-check source.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {amountNumber, catalog} from '@/lib/catalog';

const EPS = 1e-4;

function meter(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, `missing sku ${sku}`);
  return m;
}

function hour(sku: string): number {
  const h = amountNumber(meter(sku), 'unit');
  assert.ok(h != null, `${sku}: amount`);
  return h;
}

function nearly(a: number, b: number, eps = EPS) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a}`);
}

describe('price anchors — live-verified 2026-07-26', () => {
  it('Yandex Ice Lake compute (docs/compute/pricing)', () => {
    nearly(hour('yc.compute.ice-lake-100.vcpu'), 1.24);
    nearly(hour('yc.compute.ice-lake.ram'), 0.33);
  });

  it('Yandex Object Storage Standard example rate (docs/storage/pricing)', () => {
    const m = meter('yc.object-storage.standard');
    nearly(amountNumber(m, 'month')!, 2.376);
  });

  it('MWS compute current rates (docs; hike from 2026-08-01 in dimensions)', () => {
    nearly(hour('mws.compute.vcpu'), 1.1522);
    nearly(hour('mws.compute.ram'), 0.3067);
    assert.equal(meter('mws.compute.vcpu').dimensions?.futureRateFrom, '2026-08-01');
    assert.equal(meter('mws.compute.vcpu').dimensions?.futureHourlyAmount, '1.267458');
  });

  it('MWS AI keeps Aug-1 Model Hub list rates (promo until 31.07 intentionally skipped)', () => {
    nearly(hour('mws.ai.gpt-oss-120b.input'), 13.42);
    nearly(hour('mws.ai.gpt-oss-120b.output'), 54.9);
    nearly(hour('mws.ai.qwen3.6-35b-a3b.input'), 70.76);
    assert.equal(meter('mws.ai.gpt-oss-120b.input').effectiveFrom, '2026-08-01');
  });

  it('VK Ice Lake + H200 flavor (cloud.vk.com/pricelist)', () => {
    nearly(hour('vk.compute.ice-lake.vcpu'), 1.1796); // 0.019660 ₽/min × 60
    nearly(hour('vk.compute.ram'), 0.30924); // 0.005154 × 60
    nearly(hour('vk.gpu.h200-1'), 1101.6); // 18.36 × 60
    nearly(hour('vk.gpu.h200-8'), 8811); // 146.85 × 60
  });

  it('Selectel / T1 H200 unit anchors still match integrity suite', () => {
    nearly(hour('selectel.gpu.h200-141'), 587.6712);
    nearly(hour('t1.gpu.h200'), 593.0555554);
  });

  it('zero free-tier meters keep explanatory notes', () => {
    for (const sku of [
      'mws.traffic.interzone.ingress',
      'selectel.object-storage.traffic.ingress',
      't1.traffic.internet.ingress',
    ]) {
      const m = meter(sku);
      assert.equal(Number(m.normalizedAmount ?? m.nativeAmount), 0);
      assert.ok((m.notes || '').trim().length > 10, `${sku} needs notes`);
    }
  });
});
