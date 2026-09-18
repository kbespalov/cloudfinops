import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {catalog} from '@/lib/catalog';
import {GET as getProducts} from '@/app/api/v1/products/route';
import {GET as getServices} from '@/app/api/v1/services/route';
import {listProducts, listServices, type ProductListQuery} from './catalog';
import {PRODUCT_ARRAY_FILTERS} from './constants';
import {createMcpServer} from './mcp';
import {buildOpenApi} from './openapi';
import {meterToProduct} from './product';
import {responseSchemas} from './responses';
import type {PublicProduct} from './types';

const skuList = (items: PublicProduct[]) => items.map(item => item.providerSku).sort();
const tokenQuery: ProductListQuery = {services: ['ai'], units: ['token']};
const modelQuery: ProductListQuery = {...tokenQuery, modelIds: ['gpt-oss-120b'], tokenDirections: ['input']};

test('AI token search needs no text and excludes GPU, requests and non-token inference services', () => {
  const tokens = listProducts({...tokenQuery, limit: 100});
  assert.equal(tokens.nextCursor, null);
  const expected = catalog.meters.filter(m => m.service === 'ai' && m.unitQuantity?.includes('token')).map(m => m.sku).sort();
  assert.ok(expected.length > 60);
  assert.deepEqual(skuList(tokens.items), expected);
  assert.ok(tokens.items.every(p => p.service === 'ai' && p.layer === 'paas' && p.prices.every(price => price.unit === 'token')));
  assert.ok(tokens.items.some(p => p.meter === 'ai.embeddings.tokens'));
  assert.ok(!tokens.items.some(p => p.providerSku === 'selectel.fmc.inference-service' || p.providerSku.includes('.ml.')));
  assert.deepEqual(skuList(listProducts({...modelQuery, limit: 100}).items), [
    'cloudru.ai.gpt-oss-120b.input', 'mws.ai.gpt-oss-120b.input', 'yc.ai.gpt-oss-120b.input',
  ]);
});

test('service and category represent distinct source dimensions', () => {
  const gpu = listProducts({services: ['compute'], categories: ['gpu'], limit: 100});
  assert.ok(gpu.items.length > 0);
  assert.ok(gpu.items.every(p => p.service === 'compute' && p.category === 'gpu'));
  const disks = listProducts({services: ['storage'], categories: ['compute'], limit: 100});
  assert.ok(disks.items.length > 0);
  assert.ok(disks.items.every(p => p.meter.startsWith('storage.')));
  assert.equal(listProducts({services: ['storage'], units: ['token']}).items.length, 0);
});

test('AI fields are explicit, preserve provider dimensions and do not guess unknown values', () => {
  const meter = catalog.meters.find(m => m.sku === 'cloudru.ai.gpt-oss-120b.input')!;
  const product = meterToProduct(meter);
  assert.equal(product.attributes.modelId, 'gpt-oss-120b');
  assert.equal(product.attributes.modelFamily, 'gpt-oss-120b');
  assert.equal(product.attributes.tokenDirection, 'input');
  assert.equal(product.attributes.serviceProduct, 'foundation-models');
  assert.equal(product.providerAttributes.modelId, meter.dimensions.modelId);
  const gpu = meterToProduct(catalog.meters.find(m => m.sku === 'selectel.gpu.l4-24')!);
  assert.equal(gpu.attributes.modelId, null);
  assert.equal(gpu.attributes.tokenDirection, null);
  const missing = meterToProduct({...meter, meter: 'ai.embeddings.tokens', dimensions: {modelFamily: 'Friendly name'}});
  assert.equal(missing.attributes.modelId, null);
  assert.equal(missing.attributes.tokenDirection, null);
  assert.equal(listProducts({...modelQuery, modelIds: ['GPT-OSS-120B']}).items.length, 0);
});

test('exact meters, service products, modes and direction filter independently with OR/AND semantics', () => {
  const embeddings = listProducts({...tokenQuery, meters: ['ai.embeddings.tokens'], limit: 100}).items;
  assert.ok(embeddings.length >= 6);
  assert.ok(embeddings.every(p => p.meter === 'ai.embeddings.tokens'));
  assert.ok(embeddings.some(p => p.attributes.tokenDirection === null));
  const knownInput = listProducts({...tokenQuery, meters: ['ai.embeddings.tokens'], tokenDirections: ['input'], limit: 100}).items;
  assert.ok(knownInput.length > 0 && knownInput.length < embeddings.length);
  assert.ok(knownInput.every(p => p.attributes.tokenDirection === 'input'));
  const family = listProducts({...tokenQuery, serviceProducts: ['foundation-models'], limit: 100}).items;
  assert.ok(family.length > 0);
  assert.ok(family.every(p => p.attributes.serviceProduct === 'foundation-models'));
  const batch = listProducts({...tokenQuery, inferenceModes: ['batch'], limit: 100}).items;
  assert.ok(batch.length > 0);
  assert.ok(batch.every(p => p.attributes.inferenceMode === 'batch'));
  const both = listProducts({...tokenQuery, modelIds: ['gpt-oss-120b', 'gpt-oss-120b'], tokenDirections: ['input', 'output'], limit: 100}).items;
  assert.equal(both.length, 6);
  assert.equal(new Set(both.map(p => p.id)).size, both.length);
  assert.equal(listProducts({...tokenQuery, meters: ['ai.inference.tokens']}).items.length, 0);
});

test('service discovery counts and meter IDs round-trip through structured filters', async () => {
  const services = listServices();
  assert.equal(services.reduce((sum, service) => sum + service.productCount, 0), catalog.meters.length);
  for (const service of services) {
    assert.equal(service.productCount, catalog.meters.filter(m => m.service === service.id).length);
    for (const meter of service.meters) {
      const items = listProducts({services: [service.id], meters: [meter], limit: 100}).items;
      assert.ok(items.length > 0);
      assert.ok(items.every(p => p.service === service.id && p.meter === meter));
    }
  }
  const response = await getServices(new Request('http://localhost/api/v1/services'));
  assert.equal(response.status, 200);
  const body = await response.json();
  responseSchemas.list_services.parse(body);
  assert.deepEqual(body.data, services);
});

test('every new filter persists in cursors, rejects changes and old cursors still decode', () => {
  const scenarios: Array<[ProductListQuery, ProductListQuery]> = [
    [{services: ['ai']}, {services: ['storage']}],
    [{serviceProducts: ['foundation-models']}, {serviceProducts: ['ai-studio']}],
    [{meters: ['ai.embeddings.tokens']}, {meters: ['ai.inference.tokens.input']}],
    [{units: ['token']}, {units: ['operation']}],
    [{modelIds: ['gpt-oss-120b']}, {modelIds: ['missing']}],
    [{tokenDirections: ['input']}, {tokenDirections: ['output']}],
    [{inferenceModes: ['synchronous']}, {inferenceModes: ['batch']}],
  ];
  for (const [filters, changed] of scenarios) {
    const expected = listProducts({...filters, limit: 2}).items;
    const first = listProducts({...filters, limit: 1});
    assert.ok(first.nextCursor);
    const second = listProducts({cursor: first.nextCursor, limit: 1});
    assert.deepEqual([...first.items, ...second.items].map(p => p.id), expected.map(p => p.id));
    assert.throws(() => listProducts({...changed, cursor: first.nextCursor!}), /filters/);
  }
  const first = listProducts({providers: ['vk-cloud'], limit: 1});
  const old = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
  for (const key of PRODUCT_ARRAY_FILTERS) if (!['providers', 'categories', 'regions'].includes(key)) delete old[key];
  const legacy = Buffer.from(JSON.stringify(old)).toString('base64url');
  assert.deepEqual(listProducts({cursor: legacy, limit: 1}).items, listProducts({cursor: first.nextCursor!, limit: 1}).items);
});

test('REST accepts structured CSV filters and returns useful errors for invalid values', async () => {
  const response = await getProducts(new Request('http://localhost/api/v1/products?services=ai&units=token&modelIds=gpt-oss-120b&tokenDirections=input,output'));
  assert.equal(response.status, 200);
  const body = await response.json();
  responseSchemas.search_products.parse(body);
  assert.equal(body.data.length, 6);
  for (const query of ['units=bananas', 'tokenDirections=sideways', 'services=ai&services=compute']) {
    const invalid = await getProducts(new Request('http://localhost/api/v1/products?' + query));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'invalid_parameter');
  }
});

test('MCP search uses structured AI filters and exposes the added schema', async () => {
  const server = createMcpServer(), client = new Client({name: 'ai-search-test', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const {tools} = await client.listTools();
    const search = tools.find(tool => tool.name === 'search_products')!;
    for (const field of ['services', 'meters', 'units', 'modelIds', 'tokenDirections']) assert.ok(search.inputSchema.properties?.[field]);
    const result = await client.callTool({name: 'search_products', arguments: modelQuery});
    assert.ok(!result.isError);
    responseSchemas.search_products.parse(result.structuredContent);
    const data = (result.structuredContent as {data: PublicProduct[]}).data;
    assert.deepEqual(skuList(data), skuList(listProducts(modelQuery).items));
  } finally {await client.close(); await server.close();}
  const doc = buildOpenApi();
  assert.ok(doc.paths['/services']);
  const path = doc.paths['/products'] as {get: {parameters: Array<{name: string; explode?: boolean}>}};
  assert.equal(path.get.parameters.find(p => p.name === 'modelIds')?.explode, false);
});
