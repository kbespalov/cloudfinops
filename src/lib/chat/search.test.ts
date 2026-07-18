import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {detectStorageClass, searchPricesDetailed} from './search';

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
