/**
 * Golden spot-check of public anchors in the 2026-09-25 catalog snapshot.
 * A failure means the catalog drifted from these figures — re-check the source.
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

describe('price anchors — snapshot 2026-09-25', () => {
  it('Yandex Ice Lake compute (docs/compute/pricing)', () => {
    nearly(hour('yc.compute.ice-lake-100.vcpu'), 1.24);
    nearly(hour('yc.compute.ice-lake.ram'), 0.33);
  });

  it('Yandex Object Storage Standard example rate (docs/storage/pricing)', () => {
    const m = meter('yc.object-storage.standard');
    nearly(amountNumber(m, 'month')!, 2.376);
  });

  it('MWS compute rates: general Sapphire + cheaper base Ice Lake (docs/compute + all-prices)', () => {
    nearly(hour('mws.compute.vcpu'), 1.2674);
    nearly(hour('mws.compute.ram'), 0.3373);
    nearly(hour('mws.compute.base.vcpu'), 1.1408);
    nearly(hour('mws.compute.base.ram'), 0.3204);
    assert.equal(meter('mws.compute.vcpu').effectiveFrom, '2026-08-01');
    assert.equal(meter('mws.compute.vcpu').dimensions?.futureRateFrom, undefined);
    assert.equal(meter('mws.compute.vcpu').dimensions?.vmCategory, 'general');
    assert.equal(meter('mws.compute.base.vcpu').dimensions?.vmCategory, 'base');
    assert.equal(meter('mws.compute.base.vcpu').dimensions?.cpuPlatformFamily, 'intel-ice-lake');
  });

  it('MWS Object Storage Cold (docs/storage + all-prices, 2026-08-25)', () => {
    const cap = meter('mws.object-storage.cold');
    nearly(amountNumber(cap, 'month')!, 1.26);
    assert.equal(cap.dimensions?.storageClass, 'cold');
    const put = meter('mws.object-storage.cold.requests.put');
    const get = meter('mws.object-storage.cold.requests.get');
    assert.equal(put.nativeAmount, '0.00106');
    assert.equal(get.nativeAmount, '0.0001');
    nearly(amountNumber(put, 'unit')!, 10.6); // ₽ / 10k requests
    nearly(amountNumber(get, 'unit')!, 1);
  });

  it('MWS AI Model Hub list rates (effectiveFrom 2026-08-01)', () => {
    nearly(hour('mws.ai.gpt-oss-120b.input'), 13.42);
    nearly(hour('mws.ai.gpt-oss-120b.output'), 54.9);
    nearly(hour('mws.ai.qwen3.6-35b-a3b.input'), 70.76);
    nearly(hour('mws.ai.bge-m3.input'), 0.61);
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

  it('Selectel Token Factory, panel 2026-10-22, ₽ per 1M tokens', () => {
    nearly(hour('selectel.ai.glm-5.3-flash.input'), 74.64);
    nearly(hour('selectel.ai.glm-5.3-flash.output'), 248.55);
    nearly(hour('selectel.ai.glm-5.3-flash.cached'), 7.46);
    nearly(hour('selectel.ai.kimi-k2.7-code.input'), 157.2);
    nearly(hour('selectel.ai.kimi-k2.7-code.output'), 628.7);
    nearly(hour('selectel.ai.qwen3.8-27b.input'), 37.01);
    nearly(hour('selectel.ai.qwen3.8-27b.output'), 206.5);
    nearly(hour('selectel.ai.qwen3.8-flash-next.input'), 20.85);
    nearly(hour('selectel.ai.qwen3.8-flash-next.cached'), 2.09);
    nearly(hour('selectel.ai.deepseek-v4-flash.input'), 75.42);
    nearly(hour('selectel.ai.deepseek-v4-flash.output'), 186.29);
    nearly(hour('selectel.ai.deepseek-v4-flash.reasoning'), 186.29);
    assert.equal(meter('selectel.ai.deepseek-v4-flash.input').dimensions.modelId, 'deepseek-v4-flash');
    assert.equal(meter('selectel.ai.glm-5.3-flash.input').dimensions.modelId, 'glm-5.3-flash');
    assert.notEqual(
      meter('selectel.ai.glm-5.3-flash.input').dimensions.modelId,
      meter('mws.ai.glm-5.3.input').dimensions.modelId,
    );
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
