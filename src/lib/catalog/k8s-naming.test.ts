import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalog,
  displayMeterName,
  extractKubernetesPresetFamily,
  formatKubernetesDisplayName,
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
  it('uses unified taxonomy: базовый/HA, плата за кластер, family, share', () => {
    assert.equal(
      displayMeterName(bySku('cloudru.kubernetes.master-zonal-2-4')),
      'Мастер Kubernetes · базовый · 2 vCPU / 4 ГиБ · 100% vCPU',
    );
    assert.equal(
      displayMeterName(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')),
      'Мастер Kubernetes · HA · 3 × 2 vCPU / 4 ГиБ · 100% vCPU · оценка',
    );
    assert.equal(
      bySku('cloudru.kubernetes.master-zonal-2-4').dimensions.guaranteedVcpuShare,
      '100%',
    );
    assert.match(formatKubernetesParamsLabel(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')), /3 мастера/);
    assert.match(formatKubernetesParamsLabel(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')), /оценка/);
    assert.doesNotMatch(
      formatKubernetesParamsLabel(bySku('cloudru.kubernetes.master-ha-2-4.synthetic')),
      /\*/,
    );
  });

  it('keeps Selectel / MWS as cluster-fee; T1 as marketing tier', () => {
    assert.equal(
      displayMeterName(bySku('selectel.kubernetes.master-basic')),
      'Мастер Kubernetes · базовый · плата за кластер',
    );
    assert.equal(
      displayMeterName(bySku('selectel.kubernetes.master-ha')),
      'Мастер Kubernetes · HA · плата за кластер',
    );
    assert.equal(
      displayMeterName(bySku('mws.kubernetes.master-ha')),
      'Мастер Kubernetes · HA · плата за кластер',
    );
    assert.equal(
      displayMeterName(bySku('t1.kubernetes.master-small')),
      'Мастер Kubernetes · базовый · Small',
    );
    assert.equal(
      displayMeterName(bySku('t1.kubernetes.master-ha-medium')),
      'Мастер Kubernetes · HA · Medium',
    );
    assert.equal(formatKubernetesParamsLabel(bySku('selectel.kubernetes.master-ha')), '3 мастера');
    assert.equal(formatKubernetesParamsLabel(bySku('t1.kubernetes.master-ha-large')), '3 мастера');
  });

  it('stores provider-original titles in dimensions.nativeName', () => {
    const selectelHa = bySku('selectel.kubernetes.master-ha');
    assert.equal(meterNativeName(selectelHa), 'Отказоустойчивый кластер, 3 master');
    assert.equal(meterNativeName(bySku('yc.kubernetes.master-vcpu')), 'Master vCPU');
    assert.equal(meterNativeName(bySku('vk.kubernetes.master-vcpu')), 'Master CPU, Intel Cascade Lake');
    assert.equal(
      meterNativeName(bySku('cloudru.kubernetes.master-zonal-2-4')),
      'Зональный мастер 2 vCPU / 4 ГиБ',
    );
  });

  it('marks Yandex family-aware presets and legacy fixed-fee', () => {
    assert.equal(displayMeterName(bySku('yc.kubernetes.master-vcpu')), 'Ресурсы мастера · vCPU');
    assert.equal(displayMeterName(bySku('yc.kubernetes.master-ram')), 'Ресурсы мастера · RAM');
    assert.equal(displayMeterName(bySku('vk.kubernetes.master-ram')), 'Ресурсы мастера · RAM');
    assert.equal(
      displayMeterName(bySku('yc.kubernetes.master-zonal')),
      'Мастер Kubernetes · базовый · плата за кластер',
    );
    assert.equal(bySku('yc.kubernetes.master-zonal').dimensions.legacy, true);
    assert.equal(bySku('yc.kubernetes.master-zonal').dimensions.parityOnly, true);
    assert.equal(
      displayMeterName(bySku('yc.kubernetes.master-basic-2-8.synthetic')),
      'Мастер Kubernetes · базовый · Standard · 2 vCPU / 8 ГиБ · оценка',
    );
    assert.equal(
      displayMeterName(bySku('yc.kubernetes.master-basic-4-8.synthetic')),
      'Мастер Kubernetes · базовый · CPU-optimized · 4 vCPU / 8 ГиБ · оценка',
    );
    assert.equal(
      displayMeterName(bySku('yc.kubernetes.master-basic-4-16.synthetic')),
      'Мастер Kubernetes · базовый · Standard · 4 vCPU / 16 ГиБ · оценка',
    );
    assert.equal(
      extractKubernetesPresetFamily(bySku('yc.kubernetes.master-basic-4-8.synthetic')),
      'cpu-optimized',
    );
    assert.equal(
      displayMeterName(bySku('yc.kubernetes.master-ha-2-8.synthetic')),
      'Мастер Kubernetes · HA · Standard · 3 × 2 vCPU / 8 ГиБ · оценка',
    );
    assert.equal(
      catalog.meters.some((m) => m.sku === 'yc.kubernetes.master-basic-2-4.synthetic'),
      false,
    );
    assert.equal(
      displayMeterName(bySku('vk.kubernetes.master-basic-2-6.synthetic')),
      'Мастер Kubernetes · базовый · 2 vCPU / 6 ГиБ · оценка',
    );
  });

  it('paramsLabel for k8s uses the structured helper', () => {
    assert.equal(paramsLabel(bySku('selectel.kubernetes.master-ha')), '3 мастера');
    assert.match(paramsLabel(bySku('yc.kubernetes.master-vcpu')), /vCPU/);
  });

  it('every k8s meter has taxonomy title via displayMeterName', () => {
    const k8s = catalog.meters.filter((m) => m.categoryKey === 'kubernetes');
    assert.ok(k8s.length >= 20);
    for (const m of k8s) {
      const title = displayMeterName(m);
      assert.ok(title.trim().length > 0, m.sku);
      assert.match(title, /Kubernetes|Ресурсы мастера|Мастер/i, m.sku);
      assert.equal(formatKubernetesDisplayName(m), title, m.sku);
      assert.equal(m.name, title, m.sku);
      assert.doesNotMatch(title, /\*/, m.sku);
    }
  });
});
