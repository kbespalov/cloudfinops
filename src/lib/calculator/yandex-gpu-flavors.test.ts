import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {catalog} from '@/lib/catalog';
import {buildGpuFlavorPresets} from '@/lib/calculator/gpu-shapes';
import {quotePreset} from '@/lib/calculator/quote';
import {
  buildYandexGpuFlavorPresets,
  hostConfigsOf,
} from '@/lib/calculator/yandex-gpu-flavors';

function bySku(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, sku);
  return m;
}

describe('Yandex GPU host lattices', () => {
  it('stores console/docs hostConfigs on Gen2 / Platform V4 / T4 / A100', () => {
    const gen2 = hostConfigsOf(bySku('yc.gpu.gen2'));
    assert.deepEqual(
      gen2.map((c) => [c.gpuCount, c.vcpu, c.ramGiB]),
      [
        [1, 18, 144],
        [2, 36, 288],
        [4, 72, 576],
        [8, 180, 1440],
      ],
    );
    assert.equal(bySku('yc.gpu.gen2').dimensions.cpuPlatformNative, 'AMD EPYC 9474F');
    assert.equal(bySku('yc.gpu.gen2').dimensions.platformId, 'gpu-standard-v3i');

    const v4 = hostConfigsOf(bySku('yc.gpu.platform-v4'));
    assert.ok(v4.some((c) => c.gpuCount === 8 && c.vcpu === 180 && c.ramGiB === 1800));

    const t4 = hostConfigsOf(bySku('yc.gpu.t4'));
    assert.equal(t4.length, 4);
    assert.ok(t4.every((c) => c.gpuCount === 1));

    const a100 = hostConfigsOf(bySku('yc.gpu.a100'));
    assert.ok(a100.some((c) => c.gpuCount === 8 && c.vcpu === 224 && c.ramGiB === 952));
  });

  it('publishes Yandex Gen2 / T4i / Platform V4 flavors without aliasing to H200', () => {
    const yandex = buildYandexGpuFlavorPresets();
    assert.ok(yandex.length >= 20, `expected Yandex hosts, got ${yandex.length}`);

    const gen2x8 = yandex.find(
      (p) => p.gpuModelMatch === 'Gen2' && p.gpuCount === 8 && p.vcpu === 180 && p.ramGiB === 1440,
    );
    assert.ok(gen2x8, 'Gen2 8× 180/1440');
    assert.equal(gen2x8.gpuMemoryGb, 80);

    const t4i = yandex.find((p) => p.gpuModelMatch === 'T4i' && p.vcpu === 32 && p.ramGiB === 128);
    assert.ok(t4i);

    const platformV4 = yandex.filter((p) => p.gpuModelMatch === 'Platform V4');
    assert.ok(platformV4.some((p) => p.gpuCount === 8));
    assert.ok(platformV4.every((p) => p.gpuModelMatch !== 'H200'));

    const all = buildGpuFlavorPresets();
    assert.ok(all.some((p) => p.shapeSource === 'yandex-cloud' && p.gpuModelMatch === 'Gen2'));
    assert.ok(!all.some((p) => p.gpuModelMatch === 'H200' && p.shapeSource === 'yandex-cloud'));
  });

  it('quotes Yandex Gen2 8× as composed GPU + host', () => {
    const preset = buildYandexGpuFlavorPresets().find(
      (p) => p.gpuModelMatch === 'Gen2' && p.gpuCount === 8,
    )!;
    const result = quotePreset(preset, 'month');
    const yc = result.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(yc, 'expected Yandex Gen2 quote');
    assert.equal(yc.scope, 'gpu-synthetic');
    assert.ok(yc.parts.some((p) => /GPU/i.test(p.label) && p.amount > 0));
    assert.ok(yc.parts.some((p) => /CPU|vCPU/i.test(p.label)));
    assert.ok(yc.parts.some((p) => /RAM/i.test(p.label)));
    // 8 × 757.63 ₽/h × 720 ≈ 4.36M ₽/mo GPU alone — total must be above that floor.
    assert.ok(yc.total > 4_000_000, `unexpected total ${yc.total}`);
  });

  it('has preemptible GPU SKUs for A100/Gen2/T4i with 1/2/4 lattices', () => {
    const a100 = bySku('yc.gpu.a100.preemptible');
    assert.deepEqual(a100.dimensions.availableGpuCounts, [1, 2, 4]);
    assert.ok(hostConfigsOf(a100).every((c) => c.gpuCount <= 4));

    assert.ok(bySku('yc.gpu.gen2.preemptible'));
    assert.ok(bySku('yc.gpu.t4i.preemptible'));
    assert.ok(bySku('yc.gpu.v100-broadwell.preemptible'));
    assert.equal(Number(bySku('yc.gpu.a100.preemptible').nativeAmount), 163.25);
  });

  it('quotes Yandex A100 preemptible cheaper than on-demand for 1×', () => {
    const base = buildYandexGpuFlavorPresets().find(
      (p) => p.gpuModelMatch === 'A100' && p.gpuCount === 1 && p.vcpu === 28,
    )!;
    const onDemand = quotePreset({...base, purchaseModel: 'on-demand'}, 'month');
    const spot = quotePreset({...base, purchaseModel: 'preemptible'}, 'month');
    const od = onDemand.quotes.find((q) => q.provider === 'yandex-cloud');
    const pre = spot.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.ok(od && pre, 'expected both Yandex quotes');
    assert.ok(pre.total < od.total * 0.55, `spot ${pre.total} vs od ${od.total}`);
    assert.ok(
      pre.meters?.some((m) => /preemptible/i.test(m.sku)),
      'expected preemptible GPU meter',
    );
  });

  it('does not quote Yandex Gen2 8× as preemptible (catalog 1/2/4 only)', () => {
    const preset = buildYandexGpuFlavorPresets().find(
      (p) => p.gpuModelMatch === 'Gen2' && p.gpuCount === 8,
    )!;
    const result = quotePreset({...preset, purchaseModel: 'preemptible'}, 'month');
    const yc = result.quotes.find((q) => q.provider === 'yandex-cloud');
    assert.equal(yc, undefined);
    const miss = result.missingProviders.find((m) => m.provider === 'yandex-cloud');
    assert.ok(miss?.reason && /прерыв|1\/2\/4/i.test(miss.reason));
  });
});
