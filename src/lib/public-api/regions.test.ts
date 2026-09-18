import assert from 'node:assert/strict';
import {test} from 'node:test';
import {catalog, type CatalogData} from '@/lib/catalog';
import {GET as getProducts} from '@/app/api/v1/products/route';
import {listProducts, listRegions, type ProductListQuery} from './catalog';
import {createEstimate} from './estimates';
import {buildOpenApi} from './openapi';
import {runOperation} from './operations';
import {regionCode, regionCodes, matchesRegion} from './regions';
import {responseSchemas} from './responses';
import type {PublicProduct} from './types';

const group = 'Россия / ru-1, ru-3, ru-7';
const groupSkus = [
  'selectel.object-storage.traffic.ingress',
  'selectel.object-storage.standard.traffic.egress',
  'selectel.object-storage.cold.traffic.egress',
].sort();

function allProducts(query: ProductListQuery) {
  const items: PublicProduct[] = [];
  let cursor: string | undefined;
  do {
    const page = listProducts({...query, limit: 100, cursor});
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

test('region codes preserve every distinct explicit code and reject partial tokens', () => {
  assert.deepEqual(regionCodes(group), ['ru-1', 'ru-3', 'ru-7']);
  assert.equal(regionCode(group), null);
  assert.deepEqual(regionCodes('RU-3, ru-3, RU-7'), ['ru-3', 'ru-7']);
  for (const [label, code] of [
    ['Москва / MZ1', 'mz1'], ['Москва / ru-msk', 'ru-msk'],
    ['Москва / ru-7b', 'ru-7b'], ['ru-central1', 'ru-central1'],
    ['ru-central2-a', 'ru-central2-a'], ['Казахстан / kz-1a', 'kz-1a'],
    ['(RU-3)', 'ru-3'],
  ]) {
    assert.deepEqual(regionCodes(label), [code]);
    assert.equal(regionCode(label), code);
  }
  for (const label of [null, '', '—', 'Москва', 'Все регионы', 'Базовая сеть', 'APAC',
    'foo-ru-3', 'ru-central1-a-extra', 'ru-7abc', 'MZ1suffix', '_ru-3', 'Москваru-3']) {
    assert.deepEqual(regionCodes(label), [], String(label));
    assert.equal(regionCode(label), null, String(label));
  }
});

test('region matching keeps exact labels, accepts case-insensitive codes, and infers no hierarchy', () => {
  assert.ok(matchesRegion(group, group));
  assert.ok(matchesRegion(group, 'RU-7'));
  assert.ok(matchesRegion('Москва / MZ1', 'MZ1'));
  assert.ok(matchesRegion('Москва / ru-msk', 'RU-MSK'));
  assert.ok(!matchesRegion('Москва / ru-7a', 'ru-7'));
  assert.ok(!matchesRegion(group, 'Россия'));
  assert.ok(!matchesRegion('Москва', 'москва'));
  assert.ok(!matchesRegion('Москва', 'Все регионы'));
  assert.ok(!matchesRegion(null, '—'));
});

test('all observed labels round-trip with their exact counts and all codes are exposed on products', () => {
  const regions = listRegions();
  assert.equal(regions.reduce((sum, region) => sum + region.productCount, 0), catalog.meters.filter(m => m.region).length);
  for (const region of regions) {
    const items = allProducts({regions: [region.label]});
    assert.equal(items.length, region.productCount, region.label);
    for (const item of items) {
      assert.equal(item.region, region.label);
      assert.equal(item.regionCode, region.code);
      assert.deepEqual(item.regionCodes, region.codes);
    }
  }
  const result = runOperation('list_regions', {});
  assert.ok(result.ok);
  responseSchemas.list_regions.parse(result.data);
  assert.deepEqual(regions.find(region => region.label === group), {
    label: group, code: null, codes: ['ru-1', 'ru-3', 'ru-7'], productCount: 3,
  });
});

test('each composite code finds shared tariffs; OR filters deduplicate and respect providers', () => {
  for (const code of ['ru-1', 'ru-3', 'RU-7']) {
    const items = allProducts({regions: [code], providers: ['selectel']});
    assert.deepEqual(items.filter(item => item.region === group).map(item => item.providerSku).sort(), groupSkus);
  }
  const items = allProducts({regions: ['ru-1', 'ru-3', 'ru-7', group]});
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.deepEqual(items.filter(item => item.region === group).map(item => item.providerSku).sort(), groupSkus);
  assert.equal(allProducts({regions: ['MZ1'], providers: ['t1-cloud']}).length, 1);
  assert.equal(allProducts({regions: ['ru-msk'], providers: ['vk-cloud']}).length, 3);
  assert.equal(allProducts({regions: ['ru-msk'], providers: ['t1-cloud']}).length, 0);
});

test('estimates use the same code matching and retain strict component region compatibility', () => {
  const base = ['t1.compute.a1.vcpu', 't1.compute.ram', 't1.disk.basic'].map(sku => {
    const meter = catalog.meters.find(m => m.sku === sku);
    assert.ok(meter);
    return meter;
  });
  for (const [label, codes] of [[group, ['ru-1', 'ru-3', 'RU-7']], ['Москва / MZ1', ['MZ1']], ['Москва / ru-msk', ['RU-MSK']]] as const) {
    const data: CatalogData = {...catalog, meters: base.map(m => ({...m, region: label}))};
    for (const region of codes) {
      const result = createEstimate({resource: {type: 'compute', vcpu: 4, memoryGiB: 8, region}, providers: ['t1-cloud']}, data);
      assert.equal(result.quotes[0].status, 'priced', region);
      assert.equal(result.quotes[0].matchedResource?.region, label);
      assert.equal(result.quotes[0].lineItems.length, 3);
    }
    const unmatched = createEstimate({resource: {type: 'compute', vcpu: 4, memoryGiB: 8, region: 'ru-9'}, providers: ['t1-cloud']}, data);
    assert.equal(unmatched.quotes[0].status, 'unavailable');
  }
  const incompatible: CatalogData = {...catalog, meters: base.map(m => ({...m, region: m.meter === 'compute.ram' ? 'Санкт-Петербург / ru-3' : group}))};
  assert.equal(createEstimate({resource: {type: 'compute', vcpu: 4, memoryGiB: 8, region: 'ru-3'}, providers: ['t1-cloud']}, incompatible).quotes[0].status, 'unavailable');
});

async function restProducts(entries: Array<[string, string]>) {
  const url = new URL('http://localhost/api/v1/products');
  for (const [key, value] of entries) url.searchParams.append(key, value);
  const response = await getProducts(new Request(url));
  assert.equal(response.status, 200);
  const body = await response.json();
  responseSchemas.search_products.parse(body);
  return body as {data: PublicProduct[]; pagination: {nextCursor: string | null}};
}

test('REST preserves labels containing commas, accepts repeated regions and keeps legacy CSV codes', async () => {
  const exact = await restProducts([['regions', group]]);
  assert.deepEqual(exact.data.map(item => item.providerSku).sort(), groupSkus);
  const repeated = await restProducts([['regions', group], ['regions', 'Москва / ru-msk']]);
  assert.equal(repeated.data.length, 6);
  assert.ok(repeated.data.every(item => item.region === group || item.region === 'Москва / ru-msk'));
  const csv = await restProducts([['regions', 'ru-3,ru-7'], ['limit', '100']]);
  assert.deepEqual(csv.data.map(item => item.id), allProducts({regions: ['ru-3', 'ru-7']}).map(item => item.id));
  const code = await restProducts([['regions', 'MZ1']]);
  assert.equal(code.data.length, 1);
  assert.deepEqual(code.data[0].regionCodes, ['mz1']);
});

test('REST cursor retains compound labels and still rejects changed filters and duplicate scalar parameters', async () => {
  const first = await restProducts([['regions', group], ['limit', '2']]);
  assert.ok(first.pagination.nextCursor);
  const second = await restProducts([['cursor', first.pagination.nextCursor], ['limit', '2']]);
  assert.equal(second.data.length, 1);
  assert.equal(second.pagination.nextCursor, null);
  assert.deepEqual([...first.data, ...second.data].map(item => item.providerSku).sort(), groupSkus);
  const changed = new URL('http://localhost/api/v1/products');
  changed.searchParams.set('cursor', first.pagination.nextCursor);
  changed.searchParams.set('regions', 'ru-3');
  assert.equal((await getProducts(new Request(changed))).status, 400);
  assert.equal((await getProducts(new Request('http://localhost/api/v1/products?limit=1&limit=2'))).status, 400);
});

test('OpenAPI exposes multi-code fields and repeated regions serialization', () => {
  const doc = buildOpenApi();
  const path = doc.paths['/products'] as {get: {parameters: Array<{name: string; style?: string; explode?: boolean}>}};
  assert.equal(path.get.parameters.find(parameter => parameter.name === 'regions')?.explode, true);
  assert.equal(path.get.parameters.find(parameter => parameter.name === 'providers')?.explode, false);
  const schemas = doc.components.schemas as Record<string, {properties: {data: {items: {properties: Record<string, unknown>}}}}>;
  assert.ok(schemas.list_regionsResponse.properties.data.items.properties.codes);
  assert.ok(schemas.search_productsResponse.properties.data.items.properties.regionCodes);
});
