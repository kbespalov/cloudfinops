import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {quoteCheapestVmPerProvider} from '@/lib/calculator/quote-cheapest-vm';
import {runToolSync} from '@/lib/chat/tools';

describe('quoteCheapestVmPerProvider', () => {
  it('returns a full VM BOM for every RU provider with vCPU+RAM+disk', () => {
    const result = quoteCheapestVmPerProvider({period: 'month', diskGiB: 10});
    assert.ok(result.quotes.length >= 6, `expected ≥6 providers, got ${result.quotes.length}`);
    assert.ok(result.best);
    assert.equal(result.best!.provider, result.quotes[0]!.provider);
    for (const q of result.quotes) {
      assert.ok(q.vcpu >= 1 && q.ramGiB >= 1, `${q.provider}: shape`);
      assert.ok(q.parts.length >= 2, `${q.provider}: need compute+disk parts`);
      assert.ok(q.total > 0);
      assert.ok(
        q.parts.some((p) => /диск|disk|hdd|ssd/i.test(p.label)),
        `${q.provider}: missing disk part`,
      );
    }
    // Sorted ascending
    for (let i = 1; i < result.quotes.length; i++) {
      assert.ok(result.quotes[i - 1]!.total <= result.quotes[i]!.total);
    }
  });

  it('surfaces Cloud.ru economy and Selectel/Yandex spot in the cheap tier', () => {
    const result = quoteCheapestVmPerProvider({period: 'month'});
    const byId = Object.fromEntries(result.quotes.map((q) => [q.provider, q]));
    assert.ok(byId['cloud-ru']);
    assert.equal(byId['cloud-ru']!.vcpuShare, '10%');
    assert.equal(byId['cloud-ru']!.purchaseModel, 'on-demand');
    assert.ok(byId['cloud-ru']!.total < 500);

    assert.ok(byId['selectel']);
    assert.equal(byId['selectel']!.purchaseModel, 'preemptible');
    assert.ok(byId['selectel']!.total < 500);

    assert.ok(byId['yandex-cloud']);
    assert.equal(byId['yandex-cloud']!.purchaseModel, 'preemptible');
    assert.ok(byId['yandex-cloud']!.total < 500);
  });

  it('get_quote mode=cheapest-per-provider exposes the same scan via chat tools', () => {
    const raw = runToolSync(
      'get_quote',
      JSON.stringify({mode: 'cheapest-per-provider', period: 'month', diskGiB: 10}),
    );
    const data = JSON.parse(raw) as {
      mode: string;
      quotes: {provider: string; total: number; shape: string; vcpuShare: string}[];
      best: {provider: string; total: number} | null;
    };
    assert.equal(data.mode, 'cheapest-per-provider');
    assert.ok(data.best);
    assert.ok(data.quotes.length >= 6);
    assert.ok(data.quotes.some((q) => /Cloud\.ru/i.test(q.provider) && q.vcpuShare === '10%'));
  });
});
