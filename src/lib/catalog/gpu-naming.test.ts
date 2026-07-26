import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalog,
  displayMeterName,
  formatGpuLabel,
  formatGpuTariffName,
  gpuDisplayIdentity,
  gpuInterconnectFacetOf,
  gpuPriceBasisLabel,
  meterMatchesGpuInterconnectFacet,
} from '@/lib/catalog';

function bySku(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, sku);
  return m;
}

describe('GPU catalog naming', () => {
  it('normalizes Selectel / T1 / VK H200 to NVIDIA · memory · attrs', () => {
    assert.equal(
      displayMeterName(bySku('selectel.gpu.h200-141')),
      'NVIDIA H200 141 ГБ · NVLink · ×1',
    );
    assert.equal(
      displayMeterName(bySku('selectel.gpu.h200-141.preemptible')),
      'NVIDIA H200 141 ГБ · NVLink · ×1 · прерываемая',
    );
    assert.equal(displayMeterName(bySku('t1.gpu.h200')), 'NVIDIA H200 141 ГБ · SXM · ×1');
    assert.equal(displayMeterName(bySku('vk.gpu.h200-1')), 'NVIDIA H200 141 ГБ · NVLink · ×1');
    assert.equal(displayMeterName(bySku('vk.gpu.h200-8')), 'NVIDIA H200 141 ГБ · NVLink · ×8');
    assert.equal(
      displayMeterName(bySku('vk.gpu.h200.unit.synthetic')),
      'NVIDIA H200 141 ГБ · NVLink · ×1',
    );
    assert.equal(
      formatGpuLabel(bySku('vk.gpu.h200.unit.synthetic')),
      'только GPU · оценка *',
    );
  });

  it('puts billing basis only in the Состав column, without repeating the card name', () => {
    const unit = bySku('selectel.gpu.h200-141');
    const bundle = bySku('cloudru.gpu.h100-80-pcie-1');
    assert.equal(displayMeterName(unit), 'NVIDIA H200 141 ГБ · NVLink · ×1');
    assert.doesNotMatch(displayMeterName(unit), /только GPU|целиком|\*/);
    assert.equal(formatGpuLabel(unit), 'только GPU');
    assert.equal(formatGpuLabel(bundle), 'целиком · 20 vCPU · 110 GiB');
    assert.equal(gpuPriceBasisLabel(unit), 'только GPU');
    assert.equal(gpuPriceBasisLabel(bundle), 'целиком');
  });

  it('normalizes Cloud.ru H100 flavors and synthetic units', () => {
    assert.equal(
      displayMeterName(bySku('cloudru.gpu.h100-80-pcie-1')),
      'NVIDIA H100 80 ГБ · PCIe · ×1',
    );
    assert.equal(
      displayMeterName(bySku('cloudru.gpu.h100-80-nvlink-1')),
      'NVIDIA H100 80 ГБ · NVLink · ×1',
    );
    assert.equal(
      displayMeterName(bySku('cloudru.gpu.h100-80-pcie.unit.synthetic')),
      'NVIDIA H100 80 ГБ · PCIe · ×1',
    );
    assert.equal(
      formatGpuLabel(bySku('cloudru.gpu.h100-80-pcie.unit.synthetic')),
      'только GPU · оценка *',
    );
    assert.equal(
      formatGpuLabel(bySku('cloudru.gpu.h100-80-nvlink-1')),
      'целиком · 20 vCPU · 186 GiB',
    );
  });

  it('keeps Yandex unnamed platforms without inventing NVIDIA chips', () => {
    assert.equal(
      displayMeterName(bySku('yc.gpu.platform-v4')),
      'Yandex Platform V4 141 ГБ · чип не указан · ×1',
    );
    assert.equal(
      displayMeterName(bySku('yc.gpu.gen2')),
      'Yandex Gen2 80 ГБ · чип не указан · ×1',
    );
    assert.equal(
      displayMeterName(bySku('yc.gpu.t4i')),
      'Yandex T4i 24 ГБ · чип не указан · ×1',
    );
    assert.equal(gpuDisplayIdentity(bySku('yc.gpu.platform-v4'))?.unknownChip, true);
    assert.equal(displayMeterName(bySku('yc.gpu.a100')), 'NVIDIA A100 80 ГБ · ×1');
  });

  it('covers VK GPU1A codes and T1 g-series prefixes via display layer', () => {
    assert.equal(displayMeterName(bySku('vk.gpu.a100-40-1')), 'NVIDIA A100 40 ГБ · ×1');
    assert.equal(displayMeterName(bySku('t1.gpu.a100')), 'NVIDIA A100 40 ГБ · PCIe · ×1');
    assert.match(displayMeterName(bySku('t1.gpu.metax-c550')), /^Metax C550 64 ГБ/);
  });

  it('classifies PCIe vs NVLink interconnect facets', () => {
    assert.equal(gpuInterconnectFacetOf(bySku('cloudru.gpu.h100-80-pcie-1')), 'pcie');
    assert.equal(gpuInterconnectFacetOf(bySku('cloudru.gpu.h100-80-nvlink-1')), 'nvlink');
    assert.equal(gpuInterconnectFacetOf(bySku('t1.gpu.h200')), 'nvlink');
    assert.equal(gpuInterconnectFacetOf(bySku('selectel.gpu.l4-24')), 'pcie');
    assert.equal(gpuInterconnectFacetOf(bySku('selectel.dedicated.hgx-b300-8')), 'nvlink');
    assert.equal(meterMatchesGpuInterconnectFacet(bySku('selectel.gpu.l4-24'), 'pcie'), true);
    assert.equal(meterMatchesGpuInterconnectFacet(bySku('selectel.gpu.l4-24'), 'nvlink'), false);
    assert.equal(meterMatchesGpuInterconnectFacet(bySku('t1.gpu.h100-sxm5'), 'nvlink'), true);
  });

  it('formatGpuTariffName is used for every GPU meter without basis suffix', () => {
    const gpus = catalog.meters.filter((m) => m.categoryKey === 'gpu');
    assert.ok(gpus.length >= 100);
    for (const m of gpus) {
      const title = formatGpuTariffName(m);
      assert.ok(title, m.sku);
      assert.equal(displayMeterName(m), title);
      assert.doesNotMatch(title, /только GPU|целиком|\*/, m.sku);
      // No provider flavor codes / host BOM as the visible title.
      assert.doesNotMatch(title, /^GPU-\d|^GPU\d+-|^vGPU-|^GPU g\d/i, m.sku);
      assert.doesNotMatch(title, /^\d+vCPU\//i, m.sku);
      const composition = formatGpuLabel(m);
      assert.ok(composition, m.sku);
      assert.doesNotMatch(composition, /^NVIDIA |^Yandex |^Metax /i, m.sku);
    }
  });
});
