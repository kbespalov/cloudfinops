/**
 * Integrity checks for Cloud.ru synthetic per-GPU unit estimates.
 * Derived from H100 flavor lattice minus catalog host unit rates.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  amountNumber,
  catalog,
  formatGpuLabel,
  gpuPriceBasisLabel,
  meterPriceLabel,
} from '@/lib/catalog';
import {quotePreset} from '@/lib/calculator/quote';
import type {GpuPreset} from '@/lib/calculator/presets';

function nearlyEqual(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) <= eps;
}

describe('Cloud.ru H100 synthetic GPU units', () => {
  const vcpuHour = () =>
    amountNumber(
      catalog.meters.find((m) => m.sku === 'cloudru.compute.cascade-lake.vcpu.synthetic')!,
      'unit',
    )!;
  const ramHour = () =>
    amountNumber(
      catalog.meters.find((m) => m.sku === 'cloudru.compute.cascade-lake.ram.synthetic')!,
      'unit',
    )!;

  it('PCIe unit = flavor − host (20 vCPU / 110 GiB) on the lattice', () => {
    const synth = catalog.meters.find(
      (m) => m.sku === 'cloudru.gpu.h100-80-pcie.unit.synthetic',
    );
    const flavor = catalog.meters.find((m) => m.sku === 'cloudru.gpu.h100-80-pcie-1');
    assert.ok(synth && flavor);
    assert.equal(synth.synthetic, true);
    assert.equal(synth.priceProvenance, 'derived');
    assert.match(synth.notes || '', /синтетич/i);
    assert.ok(synth.name.includes('*'));

    const flavorHour = amountNumber(flavor, 'unit')!;
    const implied = flavorHour - 20 * vcpuHour() - 110 * ramHour();
    const synthHour = amountNumber(synth, 'unit')!;
    assert.ok(
      nearlyEqual(synthHour, implied),
      `expected ${implied}, got ${synthHour}`,
    );

    for (const m of catalog.meters.filter((x) =>
      /^cloudru\.gpu\.h100-80-pcie-\d+$/.test(x.sku),
    )) {
      const n = Number(m.dimensions.gpuCount);
      const hour = amountNumber(m, 'unit')!;
      assert.ok(
        nearlyEqual(hour / n, flavorHour),
        `${m.sku}: per-GPU lattice drift`,
      );
    }
  });

  it('NVLink unit = flavor − host (20 vCPU / 186 GiB); not 2× PCIe', () => {
    const synth = catalog.meters.find(
      (m) => m.sku === 'cloudru.gpu.h100-80-nvlink.unit.synthetic',
    );
    const flavor = catalog.meters.find((m) => m.sku === 'cloudru.gpu.h100-80-nvlink-1');
    const pcie = catalog.meters.find((m) => m.sku === 'cloudru.gpu.h100-80-pcie-1');
    assert.ok(synth && flavor && pcie);
    assert.match(synth.notes || '', /синтетич/i);

    const flavorHour = amountNumber(flavor, 'unit')!;
    const implied = flavorHour - 20 * vcpuHour() - 186 * ramHour();
    const synthHour = amountNumber(synth, 'unit')!;
    assert.ok(nearlyEqual(synthHour, implied), `expected ${implied}, got ${synthHour}`);

    const pcieHour = amountNumber(pcie, 'unit')!;
    assert.ok(flavorHour < pcieHour * 2, 'NVLink ×1 must not equal PCIe ×2');
    assert.ok(flavorHour > pcieHour, 'NVLink flavor is priced above PCIe flavor');
  });

  it('catalog GPU labels distinguish card-only vs full flavor', () => {
    const unit = catalog.meters.find((m) => m.sku === 'selectel.gpu.h100-80')!;
    const bundle = catalog.meters.find((m) => m.sku === 'cloudru.gpu.h100-80-pcie-1')!;
    const synth = catalog.meters.find(
      (m) => m.sku === 'cloudru.gpu.h100-80-pcie.unit.synthetic',
    )!;
    assert.equal(gpuPriceBasisLabel(unit), 'только GPU');
    assert.equal(gpuPriceBasisLabel(bundle), 'целиком');
    assert.equal(gpuPriceBasisLabel(synth), 'только GPU');
    assert.equal(formatGpuLabel(unit), 'только GPU');
    assert.equal(formatGpuLabel(bundle), 'целиком · 20 vCPU · 110 GiB');
    assert.equal(formatGpuLabel(synth), 'только GPU · оценка *');
    assert.match(meterPriceLabel(unit, 'month'), /только GPU/);
    assert.match(meterPriceLabel(bundle, 'month'), /целиком/);
  });

  it('calculator ignores synthetic GPU units and keeps Cloud.ru flavor quotes', () => {
    const preset: GpuPreset = {
      id: 'h100-parity-probe',
      kind: 'gpu',
      title: 'H100 probe',
      subtitle: '20/110',
      gpuModelMatch: 'H100',
      gpuCount: 1,
      vcpu: 20,
      ramGiB: 110,
      diskGiB: 100,
      gpuMemoryGb: 80,
    };
    const result = quotePreset(preset, 'month');
    const cloud = result.quotes.find((q) => q.provider === 'cloud-ru');
    assert.ok(cloud, 'Cloud.ru quote present');
    assert.equal(cloud.scope, 'bundle');
    assert.ok(
      !cloud.meters.some((m) => m.synthetic),
      'synthetic GPU must not appear in calculator meters',
    );
    assert.ok(
      nearlyEqual(cloud.total, 549 * 720, 1),
      `Cloud.ru flavor month expected ~${549 * 720}, got ${cloud.total}`,
    );
  });
});

describe('Selectel/T1 H200 full-node synthetics', () => {
  it('assembles Selectel/T1 full nodes as 44/256 synthetic bundles', () => {
    const vk = catalog.meters.find((m) => m.sku === 'vk.gpu.h200-1')!;
    const sel = catalog.meters.find((m) => m.sku === 'selectel.gpu.h200-141.44-256.synthetic')!;
    const t1 = catalog.meters.find((m) => m.sku === 't1.gpu.h200.44-256.synthetic')!;
    assert.ok(vk && sel && t1);
    assert.equal(sel.synthetic, true);
    assert.equal(t1.synthetic, true);
    assert.equal(gpuPriceBasisLabel(sel), 'целиком');
    assert.equal(formatGpuLabel(sel), 'целиком · 44 vCPU · 256 GiB · оценка *');

    const vkH = amountNumber(vk, 'unit')!;
    const selH = amountNumber(sel, 'unit')!;
    const t1H = amountNumber(t1, 'unit')!;
    assert.ok(nearlyEqual(selH, 725.731, 0.01));
    assert.ok(nearlyEqual(t1H, 725.326, 0.01));
    assert.ok(selH < vkH, 'Selectel assemble must undercut VK flavor');
    assert.ok(t1H < vkH, 'T1 assemble must undercut VK flavor');

    const gpu = amountNumber(
      catalog.meters.find((m) => m.sku === 'selectel.gpu.h200-141')!,
      'unit',
    )!;
    const vcpu = amountNumber(
      catalog.meters.find((m) => m.sku === 'selectel.compute.vcpu-2250')!,
      'unit',
    )!;
    const ram = amountNumber(
      catalog.meters.find((m) => m.sku === 'selectel.compute.ram-2133-2933')!,
      'unit',
    )!;
    assert.ok(nearlyEqual(selH, gpu + 44 * vcpu + 256 * ram, 0.01));
  });

  it('calculator still composes Selectel/T1 for VK H200 host (ignores synthetic bundles)', () => {
    const preset: GpuPreset = {
      id: 'h200-vk-parity',
      kind: 'gpu',
      title: 'H200 VK host',
      subtitle: '44/256',
      gpuModelMatch: 'H200',
      gpuCount: 1,
      vcpu: 44,
      ramGiB: 256,
      diskGiB: 100,
      gpuMemoryGb: 141,
      shapeSource: 'vk-cloud',
    };
    const result = quotePreset(preset, 'month');
    const sel = result.quotes.find((q) => q.provider === 'selectel');
    const t1 = result.quotes.find((q) => q.provider === 't1-cloud');
    const vk = result.quotes.find((q) => q.provider === 'vk-cloud');
    assert.ok(sel && t1 && vk);
    assert.equal(sel.scope, 'gpu-synthetic');
    assert.equal(t1.scope, 'gpu-synthetic');
    assert.equal(vk.scope, 'bundle');
    assert.ok(!sel.meters.some((m) => m.synthetic));
    assert.ok(sel.total < vk.total);
    assert.ok(t1.total < vk.total);
  });
});

describe('VK H200 synthetic GPU unit (card-only estimate)', () => {
  it('unit = flavor − Cascade Lake host (44 vCPU / 256 GiB)', () => {
    const synth = catalog.meters.find((m) => m.sku === 'vk.gpu.h200.unit.synthetic')!;
    const flavor = catalog.meters.find((m) => m.sku === 'vk.gpu.h200-1')!;
    const vcpu = catalog.meters.find((m) => m.sku === 'vk.compute.cascade-lake.vcpu')!;
    const ram = catalog.meters.find((m) => m.sku === 'vk.compute.cascade-lake.ram')!;
    assert.ok(synth && flavor && vcpu && ram);
    assert.equal(synth.synthetic, true);
    assert.equal(synth.priceProvenance, 'derived');
    assert.equal(gpuPriceBasisLabel(synth), 'только GPU');
    assert.equal(formatGpuLabel(synth), 'только GPU · оценка *');
    assert.match(synth.notes || '', /синтетич/i);
    assert.ok(synth.name.includes('*'));

    const implied =
      amountNumber(flavor, 'unit')! -
      44 * amountNumber(vcpu, 'unit')! -
      256 * amountNumber(ram, 'unit')!;
    const synthHour = amountNumber(synth, 'unit')!;
    assert.ok(
      nearlyEqual(synthHour, implied, 0.01),
      `expected ${implied}, got ${synthHour}`,
    );
    assert.ok(nearlyEqual(synthHour, 972.348, 0.01));
    assert.ok(synthHour < amountNumber(flavor, 'unit')!);
  });

  it('calculator ignores VK synthetic GPU unit and keeps flavor quote', () => {
    const preset: GpuPreset = {
      id: 'h200-vk-unit',
      kind: 'gpu',
      title: 'H200 VK',
      subtitle: '44/256',
      gpuModelMatch: 'H200',
      gpuCount: 1,
      vcpu: 44,
      ramGiB: 256,
      diskGiB: 100,
      gpuMemoryGb: 141,
      shapeSource: 'vk-cloud',
    };
    const result = quotePreset(preset, 'month');
    const vk = result.quotes.find((q) => q.provider === 'vk-cloud');
    assert.ok(vk);
    assert.equal(vk.scope, 'bundle');
    assert.ok(!vk.meters.some((m) => m.synthetic));
    assert.ok(vk.meters.some((m) => m.sku === 'vk.gpu.h200-1'));
  });
});

describe('Cloud.ru A100 synthetic GPU units', () => {
  const vcpuHour = () =>
    amountNumber(
      catalog.meters.find((m) => m.sku === 'cloudru.compute.cascade-lake.vcpu.synthetic')!,
      'unit',
    )!;
  const ramHour = () =>
    amountNumber(
      catalog.meters.find((m) => m.sku === 'cloudru.compute.cascade-lake.ram.synthetic')!,
      'unit',
    )!;

  it('A100 80GB PCIe unit = flavor − host (20 vCPU / 125 GiB)', () => {
    const synth = catalog.meters.find(
      (m) => m.sku === 'cloudru.gpu.a100-80-pcie.unit.synthetic',
    );
    const flavor = catalog.meters.find((m) => m.sku === 'cloudru.gpu.a100-80-pcie-1');
    assert.ok(synth && flavor);
    assert.equal(synth.synthetic, true);
    assert.match(synth.notes || '', /синтетич/i);
    assert.equal(gpuPriceBasisLabel(synth), 'только GPU');
    assert.equal(formatGpuLabel(synth), 'только GPU · оценка *');

    const flavorHour = amountNumber(flavor, 'unit')!;
    const implied = flavorHour - 20 * vcpuHour() - 125 * ramHour();
    const synthHour = amountNumber(synth, 'unit')!;
    assert.ok(nearlyEqual(synthHour, implied), `expected ${implied}, got ${synthHour}`);

    for (const m of catalog.meters.filter((x) =>
      /^cloudru\.gpu\.a100-80-pcie-\d+$/.test(x.sku),
    )) {
      const n = Number(m.dimensions.gpuCount);
      const hour = amountNumber(m, 'unit')!;
      assert.ok(
        nearlyEqual(hour / n, flavorHour),
        `${m.sku}: per-GPU lattice drift`,
      );
    }
  });

  it('A100 40GB PCIe unit = flavor − host (24 vCPU / 220 GiB)', () => {
    const synth = catalog.meters.find(
      (m) => m.sku === 'cloudru.gpu.a100-40-pcie.unit.synthetic',
    );
    const flavor = catalog.meters.find((m) => m.sku === 'cloudru.gpu.a100-40-pcie-1');
    assert.ok(synth && flavor);
    assert.match(synth.notes || '', /синтетич/i);

    const flavorHour = amountNumber(flavor, 'unit')!;
    const implied = flavorHour - 24 * vcpuHour() - 220 * ramHour();
    const synthHour = amountNumber(synth, 'unit')!;
    assert.ok(nearlyEqual(synthHour, implied), `expected ${implied}, got ${synthHour}`);

    for (const m of catalog.meters.filter((x) =>
      /^cloudru\.gpu\.a100-40-pcie-\d+$/.test(x.sku),
    )) {
      const n = Number(m.dimensions.gpuCount);
      const hour = amountNumber(m, 'unit')!;
      assert.ok(
        nearlyEqual(hour / n, flavorHour),
        `${m.sku}: per-GPU lattice drift`,
      );
    }
  });

  it('calculator ignores A100 synthetic GPU units', () => {
    const preset: GpuPreset = {
      id: 'a100-parity-probe',
      kind: 'gpu',
      title: 'A100 probe',
      subtitle: '20/125',
      gpuModelMatch: 'A100',
      gpuCount: 1,
      vcpu: 20,
      ramGiB: 125,
      diskGiB: 100,
      gpuMemoryGb: 80,
    };
    const result = quotePreset(preset, 'month');
    const cloud = result.quotes.find((q) => q.provider === 'cloud-ru');
    assert.ok(cloud, 'Cloud.ru quote present');
    assert.equal(cloud.scope, 'bundle');
    assert.ok(!cloud.meters.some((m) => m.synthetic));
  });
});
