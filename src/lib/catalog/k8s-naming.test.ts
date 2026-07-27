import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalog,
  displayMeterName,
  formatKubernetesParamsLabel,
  meterNativeName,
  paramsLabel,
} from '@/lib/catalog';

function bySku(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, sku);
  return m;
}

describe('Kubernetes catalog naming', () => {
  it('uses canonical names from the price book (not runtime rendering)', () => {
    assert.equal(
      bySku('cloudru.kubernetes.master-zonal-2-4').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 4 ГиБ',
    );
    assert.equal(
      bySku('cloudru.kubernetes.master-ha-2-4.synthetic').name,
      'Мастер Kubernetes · региональный · 3 × 2 vCPU / 4 ГиБ *',
    );
    assert.equal(
      displayMeterName(bySku('cloudru.kubernetes.master-zonal-2-4')),
      bySku('cloudru.kubernetes.master-zonal-2-4').name,
    );
    assert.match(formatKubernetesParamsLabel(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')), /3 мастера/);
    assert.match(formatKubernetesParamsLabel(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')), /оценка \*/);
  });

  it('keeps Selectel / MWS / T1 titles in YAML taxonomy form', () => {
    assert.equal(
      bySku('selectel.kubernetes.master-basic').name,
      'Мастер Kubernetes · зональный · фиксированная плата',
    );
    assert.equal(
      bySku('selectel.kubernetes.master-ha').name,
      'Мастер Kubernetes · региональный · фиксированная плата',
    );
    assert.equal(
      bySku('mws.kubernetes.master-ha').name,
      'Мастер Kubernetes · региональный · фиксированная плата',
    );
    assert.equal(bySku('t1.kubernetes.master-small').name, 'Мастер Kubernetes · зональный · Small');
    assert.equal(
      bySku('t1.kubernetes.master-ha-medium').name,
      'Мастер Kubernetes · региональный · Medium',
    );
    assert.equal(formatKubernetesParamsLabel(bySku('selectel.kubernetes.master-ha')), '3 мастера');
    assert.equal(formatKubernetesParamsLabel(bySku('t1.kubernetes.master-ha-large')), '3 мастера');
  });

  it('stores provider-original titles in dimensions.nativeName', () => {
    const selectelHa = bySku('selectel.kubernetes.master-ha');
    assert.equal(meterNativeName(selectelHa), 'Отказоустойчивый кластер, 3 master');
    assert.equal(selectelHa.name, 'Мастер Kubernetes · региональный · фиксированная плата');

    assert.equal(meterNativeName(bySku('yc.kubernetes.master-vcpu')), 'Master vCPU');
    assert.equal(meterNativeName(bySku('vk.kubernetes.master-vcpu')), 'Master CPU, Intel Cascade Lake');
    assert.equal(
      meterNativeName(bySku('cloudru.kubernetes.master-zonal-2-4')),
      'Зональный мастер 2 vCPU / 4 ГиБ',
    );
  });

  it('normalizes Yandex/VK unit rates and synthetic bundles in YAML name', () => {
    assert.equal(bySku('yc.kubernetes.master-vcpu').name, 'Ресурсы мастера Kubernetes · vCPU');
    assert.equal(bySku('yc.kubernetes.master-ram').name, 'Ресурсы мастера Kubernetes · RAM');
    assert.equal(bySku('vk.kubernetes.master-ram').name, 'Ресурсы мастера Kubernetes · RAM');
    assert.equal(
      bySku('yc.kubernetes.master-zonal').name,
      'Мастер Kubernetes · зональный · фиксированная плата',
    );
    assert.equal(
      bySku('yc.kubernetes.master-basic-2-8.synthetic').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 8 ГиБ *',
    );
    assert.equal(
      bySku('yc.kubernetes.master-ha-2-8.synthetic').name,
      'Мастер Kubernetes · региональный · 3 × 2 vCPU / 8 ГиБ *',
    );
    assert.equal(
      catalog.meters.some((m) => m.sku === 'yc.kubernetes.master-basic-2-4.synthetic'),
      false,
    );
    assert.equal(
      bySku('vk.kubernetes.master-basic-2-6.synthetic').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 6 ГиБ *',
    );
    assert.equal(
      bySku('vk.kubernetes.master-basic-2-4.synthetic').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 4 ГиБ *',
    );
    assert.equal(
      bySku('vk.kubernetes.master-basic-2-8.synthetic').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 8 ГиБ *',
    );
    assert.equal(
      bySku('yc.kubernetes.master-basic-2-6.synthetic').name,
      'Мастер Kubernetes · зональный · 2 vCPU / 6 ГиБ *',
    );
    assert.equal(
      bySku('yc.kubernetes.master-basic-4-8.synthetic').name,
      'Мастер Kubernetes · зональный · 4 vCPU / 8 ГиБ *',
    );
    assert.equal(
      bySku('yc.kubernetes.master-ha-16-32.synthetic').name,
      'Мастер Kubernetes · региональный · 3 × 16 vCPU / 32 ГиБ *',
    );
  });


  it('paramsLabel for k8s uses the structured helper', () => {
    assert.equal(paramsLabel(bySku('selectel.kubernetes.master-ha')), '3 мастера');
    assert.match(paramsLabel(bySku('yc.kubernetes.master-vcpu')), /vCPU/);
  });

  it('every k8s meter has a taxonomy title in name', () => {
    const k8s = catalog.meters.filter((m) => m.categoryKey === 'kubernetes');
    assert.ok(k8s.length >= 20);
    for (const m of k8s) {
      assert.ok(m.name.trim().length > 0, m.sku);
      assert.match(m.name, /Kubernetes|мастер|Мастер/i, m.sku);
      assert.equal(displayMeterName(m), m.name, m.sku);
    }
  });
});
