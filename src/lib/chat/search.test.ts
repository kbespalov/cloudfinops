import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  aiModelMatchesNeedle,
  compactAiModelId,
  detectAiModelNeedle,
  detectStorageClass,
  searchPricesDetailed,
} from './search';
import {catalog} from '@/lib/catalog';

describe('detectStorageClass', () => {
  it('maps RU/EN aliases when a single class is intended', () => {
    assert.equal(detectStorageClass('стандартный класс S3'), 'standard');
    assert.equal(detectStorageClass('Hotbox'), 'standard');
    assert.equal(detectStorageClass('холодное хранилище'), 'cold');
    assert.equal(detectStorageClass('Icebox'), 'cold');
    assert.equal(detectStorageClass('класс Ice'), 'ice');
    assert.equal(detectStorageClass('Warm'), 'warm');
  });

  it('ignores classes mentioned only in disclaimers', () => {
    assert.equal(
      detectStorageClass(
        'Сравни объектное хранилище стандартного класса. Не смешивай с Cold/Ice.',
      ),
      'standard',
    );
    assert.equal(
      detectStorageClass('Есть ли Standard у Cloud.ru? Не путай с Ice.'),
      'standard',
    );
  });

  it('returns null when several classes are positively mentioned', () => {
    assert.equal(detectStorageClass('Сравни Standard и Ice по цене'), null);
  });
});

describe('searchPricesDetailed object storage', () => {
  it('filters by SKU dimensions.storageClass, not display-name heuristics', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище',
      category: 'storage',
      storageClass: 'standard',
      meterKind: 'capacity',
      limit: 30,
    });
    assert.ok(r.providers.length >= 4);
    assert.ok(r.providers.every((p) => p.cheapest.storageClass === 'standard'));
    assert.ok(r.rows.every((row) => row.storageClass === 'standard'));
  });

  it('does not pick Ice or free PUT as cheapest Standard', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище standard',
      category: 'storage',
      limit: 30,
    });
    assert.equal(r.applied?.storageClass, 'standard');
    assert.equal(r.applied?.meterKind, 'capacity');
    const byName = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest]));
    assert.match(byName['cloud-ru']?.name ?? '', /Standard/i);
    assert.doesNotMatch(byName['cloud-ru']?.name ?? '', /Ice/i);
    assert.equal(byName['vk-cloud']?.meterKind, 'capacity');
    assert.ok((byName['vk-cloud']?.month ?? 0) > 0);
    assert.match(byName['selectel']?.name ?? '', /Standard/i);
    assert.equal(r.providers[0]?.provider, 'cloud-ru');
  });

  it('hard-filters Ice so T1/MWS Standard do not appear', () => {
    const r = searchPricesDetailed({
      query: 'объектное хранилище ice',
      category: 'storage',
      storageClass: 'ice',
      meterKind: 'capacity',
      limit: 20,
    });
    const ids = r.providers.map((p) => p.provider);
    assert.ok(ids.includes('cloud-ru'));
    assert.ok(ids.includes('yandex-cloud'));
    assert.ok(ids.includes('selectel'));
    assert.ok(!ids.includes('t1-cloud'));
    assert.ok(!ids.includes('mws-cloud'));
    assert.ok(r.providers.every((p) => p.cheapest.storageClass === 'ice'));
  });

  it('detects Russian request wording as meterKind=requests', () => {
    const r = searchPricesDetailed({
      query: 'Сколько стоят операции в объектном хранилище за 10 000 запросов?',
      category: 'storage',
      limit: 20,
    });
    assert.equal(r.applied?.meterKind, 'requests');
    assert.ok(r.rows.length > 0);
    assert.ok(r.rows.every((row) => row.meterKind === 'requests'));
  });

  it('returns volumeEstimates for DWH-sized capacity', () => {
    const volumeGiB = 50 * 1024;
    const r = searchPricesDetailed({
      query: 'объектное хранилище standard',
      category: 'storage',
      storageClass: 'standard',
      meterKind: 'capacity',
      volumeGiB,
      limit: 30,
    });
    assert.ok((r.volumeEstimates?.length ?? 0) >= 4);
    const best = r.volumeEstimates![0];
    assert.equal(best.provider, 'cloud-ru');
    assert.ok(Math.abs(best.totalMonth - best.rateGiBMonth * volumeGiB) < 1);
  });
});

describe('AI model matching', () => {
  it('compacts naming variants of Qwen 3.6', () => {
    assert.equal(compactAiModelId('Qwen 3.6'), 'qwen36');
    assert.equal(compactAiModelId('Qwen3.6-35B-A3B').startsWith('qwen36'), true);
    assert.equal(detectAiModelNeedle('Сравни цены Qwen 3.6 за 1M токенов'), 'qwen 3.6');
    assert.equal(detectAiModelNeedle('qwen3.6 у Cloud.ru'), 'qwen 3.6');
  });

  it('matches Yandex / Cloud.ru / MWS Qwen 3.6 SKUs to one needle', () => {
    const meters = catalog.meters.filter((m) =>
      /qwen.*3\.6|qwen3\.6/i.test(`${m.name} ${m.sku}`),
    );
    assert.ok(meters.length >= 6, `expected ≥6 Qwen 3.6 meters, got ${meters.length}`);
    for (const m of meters) {
      assert.ok(
        aiModelMatchesNeedle('Qwen 3.6', m, `${m.name} ${m.sku}`),
        `should match ${m.sku}`,
      );
    }
  });

  it('finds Qwen 3.6 on Yandex, Cloud.ru and MWS — not only Yandex', () => {
    const r = searchPricesDetailed({
      query: 'Сравни цены Qwen 3.6 по провайдерам за 1M токенов',
      category: 'ai',
      aiModel: 'Qwen 3.6',
      limit: 20,
    });
    const ids = r.providers.map((p) => p.provider).sort();
    assert.deepEqual(ids, ['cloud-ru', 'mws-cloud', 'yandex-cloud']);
    for (const p of r.providers) {
      assert.match(p.cheapest.name, /3\.6|3\.6/i);
      assert.doesNotMatch(p.cheapest.name, /Coder|3\.5|235/i);
    }
    const by = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest.hour]));
    assert.equal(by['yandex-cloud'], 200);
    assert.equal(by['cloud-ru'], 219.6);
    assert.equal(by['mws-cloud'], 1098);
  });

  it('infers aiModel from query so Coder-Next is not cheapest Cloud.ru for Qwen 3.6', () => {
    const r = searchPricesDetailed({
      query: 'Qwen 3.6',
      category: 'ai',
      limit: 20,
    });
    const cloud = r.providers.find((p) => p.provider === 'cloud-ru');
    assert.ok(cloud);
    assert.match(cloud!.cheapest.name, /Qwen3\.6|3\.6/i);
    assert.doesNotMatch(cloud!.cheapest.name, /Coder/i);
  });
});

describe('searchPricesDetailed kubernetes masters', () => {
  it('compares zonal masters, not 0₽ фикс or unit vCPU/RAM', () => {
    const r = searchPricesDetailed({
      query: 'Сравни Managed Kubernetes по провайдерам',
      category: 'kubernetes',
      limit: 20,
    });
    assert.equal(r.applied?.k8sTier, 'basic');
    assert.ok(r.providers.length >= 5, `expected ≥5 providers, got ${r.providers.length}`);

    const byId = Object.fromEntries(r.providers.map((p) => [p.provider, p.cheapest]));
    assert.match(byId['vk-cloud']?.name ?? '', /Зональный мастер 2 vCPU/i);
    assert.ok((byId['vk-cloud']?.hour ?? 0) > 1);
    assert.match(byId['yandex-cloud']?.name ?? '', /Зональный мастер 2 vCPU/i);
    assert.ok((byId['yandex-cloud']?.hour ?? 0) > 1);
    assert.doesNotMatch(byId['yandex-cloud']?.name ?? '', /фикс/i);
    assert.match(byId['cloud-ru']?.name ?? '', /2 vCPU|2 vCPU/i);
    assert.ok(byId['selectel']?.k8sTier === 'basic');
    assert.ok((byId['selectel']?.hour ?? 0) > 1);

    for (const p of r.providers) {
      assert.equal(p.cheapest.k8sTier, 'basic');
      assert.notEqual(p.cheapest.k8sTier, 'fixed-component');
      assert.ok((p.cheapest.hour ?? 0) > 0, `${p.provider} hour must be > 0`);
    }
    assert.equal(r.providers[0]?.provider, 'vk-cloud');
  });

  it('prefers HA masters when query asks for отказоустойчивый', () => {
    const r = searchPricesDetailed({
      query: 'отказоустойчивый Managed Kubernetes HA',
      category: 'kubernetes',
      limit: 20,
    });
    assert.equal(r.applied?.k8sTier, 'ha');
    assert.ok(r.providers.length >= 2);
    assert.ok(r.providers.every((p) => p.cheapest.k8sTier === 'ha'));
  });
});
