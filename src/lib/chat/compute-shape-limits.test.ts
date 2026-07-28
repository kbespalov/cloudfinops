import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {getComputeShapeLimits} from '@/lib/chat/compute-shape-limits';
import {runToolSync} from '@/lib/chat/tools';
import {CALCULATOR_PROVIDER_IDS} from '@/lib/calculator/quote-view';

describe('get_compute_shape_limits', () => {
  it('returns min/max general-compute shapes for all providers (no GPU, no prices)', () => {
    const result = getComputeShapeLimits();
    assert.equal(result.ok, true);
    assert.equal(result.includesGpu, false);
    assert.equal(result.scope, 'general-compute');
    assert.equal(result.providers.length, CALCULATOR_PROVIDER_IDS.length);

    const byId = Object.fromEntries(result.providers.map((p) => [p.providerId, p]));

    assert.deepEqual(byId['vk-cloud']!.max, {vcpu: 16, ramGiB: 64});
    assert.ok(byId['vk-cloud']!.min);
    assert.ok((byId['vk-cloud']!.min!.vcpu ?? 99) <= 2);

    assert.deepEqual(byId['t1-cloud']!.max, {vcpu: 64, ramGiB: 640});
    assert.deepEqual(byId['t1-cloud']!.min, {vcpu: 2, ramGiB: 4});

    assert.deepEqual(byId['mws-cloud']!.max, {vcpu: 48, ramGiB: 192});
    assert.deepEqual(byId['mws-cloud']!.min, {vcpu: 2, ramGiB: 4});
    assert.equal(byId['mws-cloud']!.shapeMode, 'exact-vm-types');

    assert.ok(byId['cloud-ru']!.min);
    assert.equal(byId['cloud-ru']!.min!.vcpu, 1);
    assert.deepEqual(byId['cloud-ru']!.max, {vcpu: 32, ramGiB: 128});
    assert.deepEqual(byId['cloud-ru']!.platformMax, {vcpu: 64, ramGiB: 320});

    assert.ok(byId['yandex-cloud']!.max);
    assert.ok(byId['yandex-cloud']!.max!.vcpu >= 80);
    // Union of Ice (96/640) + Cascade (80/1280) — not one orderable pair.
    assert.deepEqual(byId['yandex-cloud']!.max, {vcpu: 96, ramGiB: 1280});
    assert.match(byId['yandex-cloud']!.note ?? '', /объединение потолков|не одна orderable/i);
    assert.match(byId['yandex-cloud']!.note ?? '', /96×1280|96 vCPU \/ 640|80 vCPU \/ 1280/);
    assert.deepEqual(byId['selectel']!.min, {vcpu: 2, ramGiB: 4});
    assert.deepEqual(byId['selectel']!.max, {vcpu: 32, ramGiB: 256});
    assert.deepEqual(byId['selectel']!.platformMax, {vcpu: 232, ramGiB: 1200});

    for (const p of result.providers) {
      assert.ok(p.min && p.max, p.providerId);
      assert.ok(p.max!.vcpu >= p.min!.vcpu, `${p.providerId}: max vCPU < min`);
    }
  });

  it('filters by providers arg and is wired as a chat tool', () => {
    const filtered = getComputeShapeLimits({providers: ['vk-cloud', 't1-cloud']});
    assert.deepEqual(
      filtered.providers.map((p) => p.providerId).sort(),
      ['t1-cloud', 'vk-cloud'],
    );

    const raw = runToolSync('get_compute_shape_limits', '{"providers":["mws-cloud"]}');
    const parsed = JSON.parse(raw) as ReturnType<typeof getComputeShapeLimits>;
    assert.equal(parsed.ok, true);
    assert.equal(parsed.providers.length, 1);
    assert.equal(parsed.providers[0]!.providerId, 'mws-cloud');
  });

  it('ignores unknown providers and falls back to the full calculator set', () => {
    const result = getComputeShapeLimits({providers: ['aws', 'gcp', 'not-a-cloud']});
    assert.equal(result.providers.length, CALCULATOR_PROVIDER_IDS.length);
  });

  it('notes that results are footprints without prices or GPU', () => {
    const result = getComputeShapeLimits();
    assert.match(result.note, /без GPU/i);
    assert.match(result.note, /не самая дешёвая/i);
    assert.match(result.note, /get_quote/);
    assert.equal(result.includesGpu, false);
    for (const p of result.providers) {
      assert.equal('total' in p, false, p.providerId);
      assert.equal('price' in p, false, p.providerId);
      assert.ok(p.min && p.max);
    }
  });

  it('Selectel quote max stays below docs platformMax (arbitrary 232/1200)', () => {
    const sel = getComputeShapeLimits({providers: ['selectel']}).providers[0]!;
    assert.ok(sel.max && sel.platformMax);
    assert.ok(sel.max.vcpu < sel.platformMax.vcpu);
    assert.ok(sel.max.ramGiB < sel.platformMax.ramGiB);
    assert.equal(sel.max.vcpu, 32);
    assert.equal(sel.platformMax.vcpu, 232);
  });
});
