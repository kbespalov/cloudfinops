/**
 * Self-check: GPU catalog / synthetic / calculator prices are honest.
 * Every synthetic must equal published unit rates; calculator must not use synthetics.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  amountNumber,
  catalog,
  displayMeterName,
  formatGpuLabel,
  gpuPriceBasisLabel,
} from '@/lib/catalog';
import {buildGpuCardPresets} from '@/lib/calculator/gpu-shapes';
import {quotePreset} from '@/lib/calculator/quote';
import type {GpuPreset} from '@/lib/calculator/presets';

const HOURS = 720;
const EPS = 0.02; // round-trip YAML amounts are 3 decimals

function meter(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, `missing sku ${sku}`);
  return m;
}

function hour(sku: string): number {
  const h = amountNumber(meter(sku), 'unit');
  assert.ok(h != null && h > 0, `${sku}: hour`);
  return h;
}

function month(sku: string): number {
  const m = meter(sku);
  return amountNumber(m, 'month') ?? hour(sku) * HOURS;
}

function nearly(a: number, b: number, eps = EPS): void {
  assert.ok(Math.abs(a - b) <= eps, `expected ${b}, got ${a} (eps ${eps})`);
}

describe('GPU price integrity — published unit anchors', () => {
  it('1. Selectel H200 on-demand unit matches catalog anchor', () => {
    nearly(hour('selectel.gpu.h200-141'), 587.6712, 1e-4);
    nearly(month('selectel.gpu.h200-141'), 587.6712 * HOURS, 0.1);
  });

  it('2. T1 H200 SXM unit matches VAT-included normalized rate', () => {
    nearly(hour('t1.gpu.h200'), 593.0555554, 1e-4);
    nearly(month('t1.gpu.h200'), 427_000, 1);
  });

  it('3. VK H200 ×1 / ×8 published flavor hours', () => {
    nearly(hour('vk.gpu.h200-1'), 1101.6, 1e-4);
    nearly(month('vk.gpu.h200-1'), 793_152, 1);
    nearly(hour('vk.gpu.h200-8'), 8811, 1e-4);
    nearly(month('vk.gpu.h200-8'), 6_343_920, 1);
  });

  it('4. Selectel host units used in synthetics are live on-demand meters', () => {
    const v = meter('selectel.compute.vcpu-2250');
    const r = meter('selectel.compute.ram-2133-2933');
    assert.equal(v.synthetic, false);
    assert.equal(r.synthetic, false);
    nearly(hour(v.sku), 1.0071, 1e-4);
    nearly(hour(r.sku), 0.3662, 1e-4);
  });

  it('5. T1 a1 vCPU + RAM units used in synthetics are live meters', () => {
    assert.equal(meter('t1.compute.a1.vcpu').synthetic, false);
    assert.equal(meter('t1.compute.ram').synthetic, false);
    nearly(hour('t1.compute.a1.vcpu'), 1.2482635, 1e-4);
    nearly(hour('t1.compute.ram'), 0.3021367, 1e-4);
  });
});

describe('GPU price integrity — VK-host parity synthetics (no fiction)', () => {
  it('6. Selectel ×1 synthetic = H200 + 44×vCPU + 256×RAM (no disk)', () => {
    const expect =
      hour('selectel.gpu.h200-141') +
      44 * hour('selectel.compute.vcpu-2250') +
      256 * hour('selectel.compute.ram-2133-2933');
    nearly(hour('selectel.gpu.h200-141.vk-host-1.synthetic'), expect);
    nearly(expect, 725.7308, 1e-3);
  });

  it('7. T1 ×1 synthetic = H200 + 44×a1.vCPU + 256×RAM (no disk)', () => {
    const expect =
      hour('t1.gpu.h200') + 44 * hour('t1.compute.a1.vcpu') + 256 * hour('t1.compute.ram');
    nearly(hour('t1.gpu.h200.vk-host-1.synthetic'), expect);
  });

  it('8. Selectel ×8 synthetic = 8×H200 + 240×vCPU + 2048×RAM', () => {
    const expect =
      8 * hour('selectel.gpu.h200-141') +
      240 * hour('selectel.compute.vcpu-2250') +
      2048 * hour('selectel.compute.ram-2133-2933');
    nearly(hour('selectel.gpu.h200-141.vk-host-8.synthetic'), expect);
  });

  it('9. T1 ×8 synthetic = 8×H200 + 240×a1.vCPU + 2048×RAM', () => {
    const expect =
      8 * hour('t1.gpu.h200') + 240 * hour('t1.compute.a1.vcpu') + 2048 * hour('t1.compute.ram');
    nearly(hour('t1.gpu.h200.vk-host-8.synthetic'), expect);
  });

  it('10. Parity synthetics share VK host dimensions exactly', () => {
    for (const sku of [
      'selectel.gpu.h200-141.vk-host-1.synthetic',
      't1.gpu.h200.vk-host-1.synthetic',
    ]) {
      const m = meter(sku);
      assert.equal(Number(m.dimensions.vcpu), 44);
      assert.equal(Number(m.dimensions.ramGiB ?? m.dimensions.ramGb), 256);
      assert.equal(Number(m.dimensions.gpuCount), 1);
      assert.equal(Number(m.dimensions.gpuMemoryGb), 141);
    }
    for (const sku of [
      'selectel.gpu.h200-141.vk-host-8.synthetic',
      't1.gpu.h200.vk-host-8.synthetic',
    ]) {
      const m = meter(sku);
      assert.equal(Number(m.dimensions.vcpu), 240);
      assert.equal(Number(m.dimensions.ramGiB ?? m.dimensions.ramGb), 2048);
      assert.equal(Number(m.dimensions.gpuCount), 8);
    }
  });

  it('11. Synthetics are marked derived / synthetic / * / Russian disclosure', () => {
    for (const sku of [
      'selectel.gpu.h200-141.vk-host-1.synthetic',
      'selectel.gpu.h200-141.vk-host-8.synthetic',
      't1.gpu.h200.vk-host-1.synthetic',
      't1.gpu.h200.vk-host-8.synthetic',
    ]) {
      const m = meter(sku);
      assert.equal(m.synthetic, true);
      assert.equal(m.priceProvenance, 'derived');
      assert.ok(m.name.includes('*'), sku);
      assert.match(m.notes || '', /синтетич/i, sku);
      assert.match(m.notes || '', /VK/i, sku);
      assert.equal(gpuPriceBasisLabel(m), 'целиком', sku);
      assert.match(formatGpuLabel(m) || '', /оценка \*/, sku);
    }
  });

  it('12. Full-node synthetics cost more than GPU-only (host is not free)', () => {
    assert.ok(hour('selectel.gpu.h200-141.vk-host-1.synthetic') > hour('selectel.gpu.h200-141'));
    assert.ok(hour('t1.gpu.h200.vk-host-1.synthetic') > hour('t1.gpu.h200'));
    const hostOnlySel =
      hour('selectel.gpu.h200-141.vk-host-1.synthetic') - hour('selectel.gpu.h200-141');
    nearly(hostOnlySel, 44 * 1.0071 + 256 * 0.3662, 0.01);
  });

  it('13. Selectel/T1 full-node undercut VK flavor on the same host (honest delta)', () => {
    const vk1 = hour('vk.gpu.h200-1');
    const sel1 = hour('selectel.gpu.h200-141.vk-host-1.synthetic');
    const t11 = hour('t1.gpu.h200.vk-host-1.synthetic');
    assert.ok(sel1 < vk1);
    assert.ok(t11 < vk1);
    // ~+52% VK vs Selectel assemble — keep the band honest, not flip signs
    const uplift = vk1 / sel1 - 1;
    assert.ok(uplift > 0.4 && uplift < 0.7, `VK uplift ${uplift}`);
  });

  it('14. ×8 synthetics are not a silent 8× of ×1 (host scales with VK matrix)', () => {
    const sel1 = hour('selectel.gpu.h200-141.vk-host-1.synthetic');
    const sel8 = hour('selectel.gpu.h200-141.vk-host-8.synthetic');
    assert.ok(Math.abs(sel8 - 8 * sel1) > 1, 'VK ×8 host is not 8× of 44/256');
    // Per-GPU flavor hour at VK is almost linear; our assemble uses 240/2048 not 352/2048
    nearly(sel8 / 8, 711.6314, 0.05);
  });

  it('15. Month prices are 720× hour for parity synthetics', () => {
    for (const sku of [
      'selectel.gpu.h200-141.vk-host-1.synthetic',
      't1.gpu.h200.vk-host-1.synthetic',
      'vk.gpu.h200-1',
    ]) {
      nearly(month(sku), hour(sku) * HOURS, 1);
    }
  });
});

describe('GPU price integrity — calculator must not launder synthetics', () => {
  const vkHostPreset: GpuPreset = {
    id: 'integrity-h200-vk-host',
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

  it('16. Quote for VK host composes Selectel/T1 from units, not synthetic SKUs', () => {
    const result = quotePreset(vkHostPreset, 'month');
    for (const q of result.quotes.filter((x) => x.provider === 'selectel' || x.provider === 't1-cloud')) {
      assert.equal(q.scope, 'gpu-synthetic');
      assert.ok(!q.meters.some((m) => m.synthetic), `${q.provider}: synthetic leak`);
      assert.ok(q.meters.some((m) => /h200/i.test(m.sku) && !m.sku.includes('synthetic')));
    }
    const vk = result.quotes.find((q) => q.provider === 'vk-cloud');
    assert.equal(vk?.scope, 'bundle');
    assert.ok(!vk?.meters.some((m) => m.synthetic));
  });

  it('17. Calculator Selectel total ≈ synthetic + SSD (disk is extra vs catalog parity row)', () => {
    const result = quotePreset(vkHostPreset, 'month');
    const sel = result.quotes.find((q) => q.provider === 'selectel')!;
    const synMonth = month('selectel.gpu.h200-141.vk-host-1.synthetic');
    const disk = sel.parts.find((p) => p.id === 'disk')?.amount ?? 0;
    nearly(sel.total, synMonth + disk, 2);
    assert.ok(disk > 0, 'boot disk present in calculator');
  });

  it('18. Best offer on VK host is not VK (Selectel/T1 cheaper on same shape)', () => {
    const result = quotePreset(vkHostPreset, 'month');
    assert.ok(result.best);
    assert.notEqual(result.best!.provider, 'vk-cloud');
    assert.ok(
      result.best!.provider === 'selectel' || result.best!.provider === 't1-cloud',
      result.best!.provider,
    );
  });

  it('19. Shelf H200 uses VK host; H100/A100 1× keep Cloud.ru in the compare set', () => {
    const cards = buildGpuCardPresets();
    const h200 = cards.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 1);
    assert.equal(h200?.vcpu, 44);
    assert.equal(h200?.ramGiB, 256);

    const h100 = cards.find((p) => p.gpuModelMatch === 'H100' && p.gpuCount === 1)!;
    const a100 = cards.find((p) => p.gpuModelMatch === 'A100' && p.gpuCount === 1)!;
    assert.equal(h100.vcpu, 20);
    assert.equal(h100.ramGiB, 110);
    assert.equal(a100.vcpu, 20);
    assert.equal(a100.ramGiB, 125);

    const h100Quote = quotePreset(h100, 'month');
    const a100Quote = quotePreset(a100, 'month');
    assert.ok(h100Quote.quotes.some((q) => q.provider === 'cloud-ru'));
    assert.ok(a100Quote.quotes.some((q) => q.provider === 'cloud-ru'));
    assert.ok(h100Quote.quotes.length >= 3, `H100 providers: ${h100Quote.quotes.length}`);
    assert.ok(a100Quote.quotes.length >= 3, `A100 providers: ${a100Quote.quotes.length}`);
  });

  it('20. Card-only Selectel/T1 rows stay «только GPU»; parity rows stay «целиком»', () => {
    assert.equal(gpuPriceBasisLabel(meter('selectel.gpu.h200-141')), 'только GPU');
    assert.equal(gpuPriceBasisLabel(meter('t1.gpu.h200')), 'только GPU');
    assert.equal(gpuPriceBasisLabel(meter('vk.gpu.h200-1')), 'целиком');
    assert.equal(
      gpuPriceBasisLabel(meter('selectel.gpu.h200-141.vk-host-1.synthetic')),
      'целиком',
    );
    assert.doesNotMatch(displayMeterName(meter('selectel.gpu.h200-141')), /44\/256|целиком/);
  });

  it('20b. VK H200 unit synthetic = flavor − 44×Cascade Lake vCPU − 256×RAM', () => {
    const flavor = hour('vk.gpu.h200-1');
    const v = hour('vk.compute.cascade-lake.vcpu');
    const r = hour('vk.compute.cascade-lake.ram');
    nearly(hour('vk.gpu.h200.unit.synthetic'), flavor - 44 * v - 256 * r);
    assert.equal(gpuPriceBasisLabel(meter('vk.gpu.h200.unit.synthetic')), 'только GPU');
    assert.match(meter('vk.gpu.h200.unit.synthetic').notes || '', /синтетич/i);
  });
});

describe('GPU price integrity — Cloud.ru unit synthetics still consistent', () => {
  it('21. Cloud.ru H100 PCIe unit = flavor − 20 vCPU − 110 GiB lattice host', () => {
    const flavor = hour('cloudru.gpu.h100-80-pcie-1');
    const v = hour('cloudru.compute.cascade-lake.vcpu.synthetic');
    const r = hour('cloudru.compute.cascade-lake.ram.synthetic');
    nearly(hour('cloudru.gpu.h100-80-pcie.unit.synthetic'), flavor - 20 * v - 110 * r);
  });

  it('22. Cloud.ru A100 80 PCIe unit = flavor − 20 vCPU − 125 GiB', () => {
    const flavor = hour('cloudru.gpu.a100-80-pcie-1');
    const v = hour('cloudru.compute.cascade-lake.vcpu.synthetic');
    const r = hour('cloudru.compute.cascade-lake.ram.synthetic');
    nearly(hour('cloudru.gpu.a100-80-pcie.unit.synthetic'), flavor - 20 * v - 125 * r);
  });

  it('23. Cloud.ru GPU unit synthetics never enter calculator quotes', () => {
    const preset: GpuPreset = {
      id: 'integrity-h100',
      kind: 'gpu',
      title: 'H100',
      subtitle: '20/110',
      gpuModelMatch: 'H100',
      gpuCount: 1,
      vcpu: 20,
      ramGiB: 110,
      diskGiB: 100,
      gpuMemoryGb: 80,
    };
    const result = quotePreset(preset, 'month');
    for (const q of result.quotes) {
      assert.ok(!q.meters.some((m) => m.synthetic), `${q.provider}: synthetic leak`);
    }
  });
});

describe('GPU price integrity — shelf multi-provider coverage (H200/A100/L4/L40S)', () => {
  it('26. H200 shelf maxes Selectel+T1+VK (Cloud.ru has no H200)', () => {
    const cards = buildGpuCardPresets();
    for (const count of [1, 8] as const) {
      const card = cards.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === count)!;
      const q = quotePreset(card, 'month');
      const providers = new Set(q.quotes.map((x) => x.provider));
      assert.ok(providers.has('selectel'), `${count}× missing selectel`);
      assert.ok(providers.has('t1-cloud'), `${count}× missing t1`);
      assert.ok(providers.has('vk-cloud'), `${count}× missing vk`);
      assert.ok(!providers.has('cloud-ru'), `${count}× unexpected cloud-ru`);
      assert.equal(q.quotes.length, 3);
    }
  });

  it('27. A100 80GB shelf keeps Cloud.ru (+Selectel/Yandex); T1 is 40GB-only', () => {
    const cards = buildGpuCardPresets();
    const x1 = cards.find((p) => p.gpuModelMatch === 'A100' && p.gpuCount === 1)!;
    const x8 = cards.find((p) => p.gpuModelMatch === 'A100' && p.gpuCount === 8)!;
    assert.equal(x1.shapeSource, 'cloud-ru');
    assert.equal(x1.vcpu, 20);
    assert.equal(x1.ramGiB, 125);
    assert.ok(x8, '8× A100 on shelf');
    assert.equal(x8.shapeSource, 'cloud-ru');
    assert.equal(x8.gpuMemoryGb, 80);

    for (const card of [x1, x8]) {
      const providers = new Set(quotePreset(card, 'month').quotes.map((x) => x.provider));
      assert.ok(providers.has('cloud-ru'), card.title);
      assert.ok(providers.has('selectel'), card.title);
      assert.ok(providers.has('yandex-cloud'), card.title);
      assert.ok(!providers.has('t1-cloud'), `T1 A100 is 40GB only: ${card.title}`);
    }
  });

  it('28. L4 shelf is VK 16/72 (Selectel+VK); no Cloud.ru L4 in catalog', () => {
    const card = buildGpuCardPresets().find((p) => p.gpuModelMatch === 'L4')!;
    assert.equal(card.vcpu, 16);
    assert.equal(card.ramGiB, 72);
    const providers = new Set(quotePreset(card, 'month').quotes.map((x) => x.provider));
    assert.deepEqual([...providers].sort(), ['selectel', 'vk-cloud']);
  });

  it('29. L40S shelf is VK 16/112 (T1+VK); bare L40 and Selectel L40S absent', () => {
    const card = buildGpuCardPresets().find((p) => p.gpuModelMatch === 'L40S')!;
    assert.equal(card.vcpu, 16);
    assert.equal(card.ramGiB, 112);
    const providers = new Set(quotePreset(card, 'month').quotes.map((x) => x.provider));
    assert.deepEqual([...providers].sort(), ['t1-cloud', 'vk-cloud']);
    assert.equal(
      catalog.meters.filter(
        (m) =>
          m.categoryKey === 'gpu' &&
          /\bL40\b/i.test(String(m.dimensions.gpuModel || m.name)) &&
          !/L40S/i.test(String(m.dimensions.gpuModel || m.name)),
      ).length,
      0,
    );
  });
});

describe('GPU price integrity — no silent preemptible / wrong SKU', () => {
  it('24. Parity synthetics are on-demand only', () => {
    for (const sku of [
      'selectel.gpu.h200-141.vk-host-1.synthetic',
      't1.gpu.h200.vk-host-1.synthetic',
    ]) {
      assert.equal(meter(sku).dimensions.purchaseModel, 'on-demand');
    }
  });

  it('25. Selectel preemptible H200 is cheaper than on-demand card and not used in synthetic', () => {
    const pre = hour('selectel.gpu.h200-141.preemptible');
    const on = hour('selectel.gpu.h200-141');
    assert.ok(pre < on);
    const synFrom = meter('selectel.gpu.h200-141.vk-host-1.synthetic').dimensions
      .syntheticFrom as string[];
    assert.ok(synFrom.includes('selectel.gpu.h200-141'));
    assert.ok(!synFrom.some((s) => /preemptible/i.test(s)));
  });
});
