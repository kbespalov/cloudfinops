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
