import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {amountNumber} from '@/lib/catalog';
import {resolveLakehouseInput} from '@/lib/calculator/lakehouse-presets';
import {
  pickObjectStorageCapacity,
  quoteLakehouse,
} from '@/lib/calculator/lakehouse-quote';

describe('lakehouse object storage pick', () => {
  it('prefers durable standard over single-zone', () => {
    const cloudRu = pickObjectStorageCapacity('cloud-ru', 'standard');
    assert.ok(cloudRu);
    assert.equal(cloudRu.sku, 'cloudru.object-storage.standard');

    const t1 = pickObjectStorageCapacity('t1-cloud', 'standard');
    assert.ok(t1);
    assert.match(t1.sku, /multi-zone/);
  });

  it('maps VK Hotbox/Icebox and finds cold where published', () => {
    const vkHot = pickObjectStorageCapacity('vk-cloud', 'standard');
    const vkCold = pickObjectStorageCapacity('vk-cloud', 'cold');
    assert.ok(vkHot);
    assert.ok(vkCold);
    assert.equal(vkHot.dimensions.storageClass, 'standard');
    assert.equal(vkCold.dimensions.storageClass, 'cold');

    const mwsCold = pickObjectStorageCapacity('mws-cloud', 'cold');
    assert.ok(mwsCold);
    assert.equal(mwsCold.sku, 'mws.object-storage.cold');
    assert.equal(amountNumber(mwsCold, 'month'), 1.26);
  });

  it('Cloud.ru standard is cheaper than Yandex/Selectel/VK', () => {
    const rates = ['yandex-cloud', 'selectel', 'vk-cloud', 'cloud-ru'].map((p) => {
      const m = pickObjectStorageCapacity(p, 'standard');
      assert.ok(m, p);
      const rate = amountNumber(m, 'month');
      assert.ok(rate != null, p);
      return {p, rate};
    });
    const cloudRu = rates.find((r) => r.p === 'cloud-ru')!;
    for (const r of rates) {
      if (r.p === 'cloud-ru') continue;
      assert.ok(
        cloudRu.rate < r.rate,
        `expected Cloud.ru ${cloudRu.rate} < ${r.p} ${r.rate}`,
      );
    }
  });
});

describe('quoteLakehouse', () => {
  it('returns sorted provider quotes for medium preset', () => {
    const input = resolveLakehouseInput('medium');
    const view = quoteLakehouse(input, 'month');
    assert.ok(view.best);
    assert.ok(view.quotes.length >= 3);
    for (let i = 1; i < view.quotes.length; i++) {
      assert.ok(view.quotes[i]!.total >= view.quotes[i - 1]!.total);
    }
    const parts = new Set(view.best.parts.map((p) => p.id));
    assert.ok(parts.has('storage'));
    assert.ok(parts.has('k8s'));
    assert.ok(parts.has('platform'));
    assert.ok(parts.has('etl'));
    assert.ok(parts.has('query'));
  });

  it('HA tier uses real/synthetic HA masters and drops providers without them', () => {
    const ha = quoteLakehouse(resolveLakehouseInput('medium', {k8sTier: 'ha'}), 'month');
    const basic = quoteLakehouse(resolveLakehouseInput('medium', {k8sTier: 'basic'}), 'month');
    const haProviders = new Set(ha.quotes.map((q) => q.provider));
    const basicProviders = new Set(basic.quotes.map((q) => q.provider));
    // Cloud.ru HA = 3× zonal master (synthetic); T1 now publishes real HA masters.
    assert.ok(haProviders.has('cloud-ru'));
    assert.ok(haProviders.has('t1-cloud'));
    assert.ok(basicProviders.has('cloud-ru'));
    // Every HA quote must carry a high-availability master line, never basic.
    for (const q of ha.quotes) {
      const k8s = q.parts.find((p) => p.id === 'k8s');
      assert.ok(k8s && /\bHA\b/.test(k8s.label), q.provider);
      assert.ok(!/\*/.test(k8s.label), q.provider);
    }
    // Synthetic HA math stays in catalog; quote UI does not surface provenance notes.
    const cloudRu = ha.quotes.find((q) => q.provider === 'cloud-ru');
    assert.ok(cloudRu);
    assert.equal(cloudRu.note, null);
    const selectel = ha.quotes.find((q) => q.provider === 'selectel');
    assert.ok(selectel);
    assert.equal(selectel.note, null);
  });

  it('higher lake volume increases storage share', () => {
    const small = quoteLakehouse(resolveLakehouseInput('small'), 'month');
    const large = quoteLakehouse(resolveLakehouseInput('large'), 'month');
    assert.ok(small.best && large.best);
    const smallStorage = small.best.parts.find((p) => p.id === 'storage')!.amount;
    const largeStorage = large.best.parts.find((p) => p.id === 'storage')!.amount;
    assert.ok(largeStorage > smallStorage * 10);
  });
});
