import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {GET as getAttributes} from '@/app/api/v1/attributes/route';
import {GET as getProducts} from '@/app/api/v1/products/route';
import {compileAttributeDrafts, emptyAttributeDraft} from '@/components/api/attribute-form';
import {catalog} from '@/lib/catalog';
import {listAttributes} from './attributes';
import {attributeDefinitions, attributeOperators, type AttributeFilters} from './attribute-registry';
import {listProducts, type ProductListQuery} from './catalog';
import {createMcpServer} from './mcp';
import {productQuerySchema} from './schemas';
import {responseSchemas} from './responses';
import {buildOpenApi} from './openapi';
import {buildApiReference} from './documentation';
import {meterToProduct} from './product';

function allProducts(query: ProductListQuery) {
  const first = listProducts({...query, limit: 100});
  const rows = [...first.items]; let cursor = first.nextCursor;
  while (cursor) {const page = listProducts({cursor, limit: 100}); rows.push(...page.items); cursor = page.nextCursor;}
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  return rows;
}

test('every observed attribute value round-trips with exact category counts and coverage', () => {
  const products = catalog.meters.map(meterToProduct);
  for (const group of listAttributes()) {
    const rows = products.filter(p => p.category === group.category);
    assert.equal(group.productCount, rows.length);
    for (const def of group.attributes) {
      assert.deepEqual(def.operators, attributeOperators(attributeDefinitions.find(d => d.id === def.id)!));
      assert.equal(def.knownCount + def.missingCount, rows.length);
      assert.equal(def.knownCount, rows.filter(p => p.attributes[def.id] !== null).length);
      assert.equal(def.knownCount, def.values.reduce((sum, value) => sum + value.productCount, 0));
      for (const {value, productCount} of def.values) {
        const found = allProducts({categories: [group.category as 'gpu'], attributes: {[def.id]: {eq: value}}});
        assert.equal(found.length, productCount, `${group.category}/${def.id}/${value}`);
        assert.ok(found.every(p => p.attributes[def.id] === value));
      }
    }
  }
});

test('exact GPU names exclude L40S/vGPU; lists combine with OR and attributes with AND', () => {
  const exact = allProducts({categories: ['gpu'], attributes: {gpuModel: {eq: 'NVIDIA L4'}}});
  assert.ok(exact.length > 0);
  assert.ok(exact.every(p => p.attributes.gpuModel === 'NVIDIA L4'));
  assert.equal(listProducts({attributes: {gpuModel: {eq: 'nvidia l4'}}}).items.length, 0);
  const rows = allProducts({categories: ['gpu'], attributes: {gpuModel: {in: ['NVIDIA L4', 'NVIDIA H100', 'NVIDIA L4']}, gpuCount: {eq: 1}}});
  const expected = catalog.meters.map(meterToProduct).filter(p => p.category === 'gpu' && ['NVIDIA L4', 'NVIDIA H100'].includes(p.attributes.gpuModel ?? '') && p.attributes.gpuCount === 1);
  assert.deepEqual(rows.map(p => p.id).sort(), expected.map(p => p.id).sort());
});

test('numeric ranges include boundaries, support open ends and never treat null as zero', () => {
  for (const range of [{min: 4, max: 16}, {min: 8}, {max: 4}, {min: 4, max: 4}, {max: 0}]) {
    const rows = allProducts({categories: ['compute'], attributes: {vcpu: {range}}});
    const expected = catalog.meters.map(meterToProduct).filter(p => p.category === 'compute' && p.attributes.vcpu !== null && (range.min === undefined || p.attributes.vcpu >= range.min) && (range.max === undefined || p.attributes.vcpu <= range.max));
    assert.deepEqual(rows.map(p => p.id).sort(), expected.map(p => p.id).sort());
  }
  const rows = allProducts({categories: ['gpu'], attributes: {memoryGiB: {range: {min: 8.5, max: 192}}, gpuCount: {in: [1, 2]}}});
  assert.ok(rows.length > 0);
  assert.ok(rows.every(p => p.attributes.memoryGiB! >= 8.5 && p.attributes.memoryGiB! <= 192 && [1, 2].includes(p.attributes.gpuCount!)));
});

test('registry rejects unknown paths/operators, wrong types, invalid enums/lists/ranges and category conflicts', () => {
  for (const attributes of [
    {gpuModel: {contains: 'L4'}}, {gpuModel: {eq: 'NVIDIA L4', in: ['NVIDIA L4']}},
    {gpuModel: {range: {min: 1}}}, {vcpu: {eq: '4'}}, {vcpu: {eq: 1.5}}, {memoryGiB: {eq: -1}},
    {vcpu: {range: {}}}, {vcpu: {range: {min: 5, max: 4}}}, {vcpu: {range: {min: Infinity}}},
    {gpuCount: {in: []}}, {gpuModel: {eq: null}}, {tokenDirection: {eq: 'sideways'}},
    {providerAttributes: {gpuInterconnect: 'PCIe'}}, {'providerAttributes.gpuInterconnect': {eq: 'PCIe'}},
    JSON.parse('{"__proto__":{"eq":"x"}}'), {gpuModel: {in: Array(100).fill('x'.repeat(200))}},
  ]) assert.equal(productQuerySchema.safeParse({attributes}).success, false, JSON.stringify(attributes));
  assert.throws(() => listProducts({categories: ['storage'], attributes: {gpuModel: {eq: 'NVIDIA L4'}}}), /category/);
  assert.throws(() => listProducts({attributes: {gpuModel: {eq: 'NVIDIA L4'}, storageClass: {eq: 'standard'}}}), /category/);
  assert.ok(listProducts({categories: ['storage', 'gpu'], attributes: {gpuModel: {eq: 'NVIDIA L4'}}}).items.length > 0);
  assert.equal(listProducts({attributes: {gpuModel: {eq: 'not-yet-observed'}}}).items.length, 0);
});

test('AI aliases preserve results, and simultaneous old/new filters are both applied', () => {
  const common: ProductListQuery = {services: ['ai'], units: ['token']};
  const attributes: AttributeFilters = {modelId: {eq: 'gpt-oss-120b'}, tokenDirection: {eq: 'input'}};
  assert.deepEqual(allProducts({...common, attributes}), allProducts({...common, modelIds: ['gpt-oss-120b'], tokenDirections: ['input']}));
  assert.equal(listProducts({...common, attributes, tokenDirections: ['output']}).items.length, 0);
  assert.equal(listProducts({modelIds: ['null']}).items.length, 0);
  const embeddings = allProducts({meters: ['ai.embeddings.tokens']});
  assert.ok(embeddings.some(p => p.attributes.tokenDirection === null));
  assert.ok(allProducts({meters: ['ai.embeddings.tokens'], attributes: {tokenDirection: {in: ['input', 'output']}}}).every(p => p.attributes.tokenDirection !== null));
});

test('cursor retains attributes and accepts reordered keys/list values; old cursors still work', () => {
  const attributes: AttributeFilters = {gpuModel: {in: ['NVIDIA H100', 'NVIDIA L4']}, gpuCount: {range: {min: 1, max: 8}}};
  const first = listProducts({categories: ['gpu'], attributes, limit: 1});
  assert.ok(first.nextCursor);
  const cursor = first.nextCursor;
  const second = listProducts({cursor, limit: 1});
  assert.deepEqual(second.items, listProducts({cursor, limit: 1, attributes: {gpuCount: {range: {max: 8, min: 1}}, gpuModel: {in: ['NVIDIA L4', 'NVIDIA H100', 'NVIDIA L4']}}}).items);
  assert.deepEqual([...first.items, ...second.items], listProducts({categories: ['gpu'], attributes, limit: 2}).items);
  assert.throws(() => listProducts({cursor, attributes: {gpuCount: {eq: 1}}}), /filters/);
  const unfiltered = listProducts({limit: 1}).nextCursor!;
  const old = JSON.parse(Buffer.from(unfiltered, 'base64url').toString()); delete old.attributes;
  assert.deepEqual(listProducts({cursor: Buffer.from(JSON.stringify(old)).toString('base64url')}).items, listProducts({cursor: unfiltered}).items);
});

test('UTF-8 filter budgets prevent generating unusable oversized cursors', () => {
  const longValues = Array.from({length: 10}, (_, i) => 'я'.repeat(199) + i);
  const attributes: AttributeFilters = {gpuModel: {in: ['NVIDIA L4', ...longValues]}};
  const first = listProducts({attributes, limit: 1});
  assert.ok(first.nextCursor && first.nextCursor.length < 16000);
  assert.ok(listProducts({cursor: first.nextCursor, limit: 1}).items.length);
  assert.equal(productQuerySchema.safeParse({attributes: {gpuModel: {in: ['NVIDIA L4', ...Array(30).fill('я'.repeat(200))]}}}).success, false);
  assert.throws(() => listProducts({attributes, providers: ['selectel', ...Array(40).fill('я'.repeat(200))]}), /combined filters/);
  assert.deepEqual(listProducts({modelIds: [' gpt-oss-120b ']}).items, listProducts({modelIds: ['gpt-oss-120b']}).items);
});

test('REST discovery and JSON filters agree with the registry and reject malformed query parameters', async () => {
  const response = await getAttributes(new Request('http://localhost/api/v1/attributes?categories=ai,gpu'));
  assert.equal(response.status, 200);
  const body = responseSchemas.list_attributes.parse(await response.json());
  assert.deepEqual(body.data, listAttributes(undefined, ['ai', 'gpu']));
  for (const query of ['categories=missing', 'unknown=x', 'categories=gpu&categories=ai']) assert.equal((await getAttributes(new Request('http://localhost/api/v1/attributes?' + query))).status, 400);
  const attributes: AttributeFilters = {gpuModel: {eq: 'NVIDIA L4'}, gpuCount: {range: {min: 1}}};
  const params = new URLSearchParams({categories: 'gpu', attributes: JSON.stringify(attributes), limit: '100'});
  const result = await getProducts(new Request('http://localhost/api/v1/products?' + params));
  assert.equal(result.status, 200);
  assert.deepEqual(responseSchemas.search_products.parse(await result.json()).data, allProducts({categories: ['gpu'], attributes}));
  for (const raw of ['{', 'null', '[]', '{"vcpu":{"eq":"4"}}', '{"gpuModel":{"contains":"L4"}}']) {
    const result = await getProducts(new Request('http://localhost/api/v1/products?' + new URLSearchParams({attributes: raw})));
    assert.equal(result.status, 400);
    assert.ok((await result.json()).error.details.some((d: {path: string}) => d.path.startsWith('/attributes')));
  }
  assert.equal((await getProducts(new Request('http://localhost/api/v1/products?attributes=%7B%7D&attributes=%7B%7D'))).status, 400);
});

test('MCP, OpenAPI and Markdown expose the same typed attribute contract', async () => {
  const server = createMcpServer(), client = new Client({name: 'attribute-test', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const {tools} = await client.listTools();
    const schema = tools.find(tool => tool.name === 'search_products')!.inputSchema.properties!.attributes as {properties: Record<string, unknown>};
    assert.deepEqual(Object.keys(schema.properties).sort(), attributeDefinitions.map(def => def.id).sort());
    const query = {categories: ['gpu'] as ['gpu'], attributes: {gpuModel: {eq: 'NVIDIA L4'}}};
    const result = await client.callTool({name: 'search_products', arguments: query});
    assert.ok(!result.isError);
    assert.deepEqual(responseSchemas.search_products.parse(result.structuredContent).data, listProducts(query).items);
    const bad = await client.callTool({name: 'search_products', arguments: {attributes: {vcpu: {eq: '4'}}}});
    assert.equal(bad.isError, true);
  } finally {await client.close(); await server.close();}
  const openapi = buildOpenApi();
  assert.ok(openapi.paths['/attributes']);
  const params = (openapi.paths['/products'] as {get: {parameters: Array<{name: string; schema?: unknown; content?: Record<string, unknown>}>}}).get.parameters;
  assert.ok(params.find(param => param.name === 'attributes')!.content!['application/json']);
  assert.equal(params.find(param => param.name === 'attributes')!.schema, undefined);
  const markdown = buildApiReference();
  for (const def of attributeDefinitions) assert.ok(markdown.includes(`| ${def.id} | ${def.type} |`));
});

test('form converts typed equality/lists/ranges and blocks incomplete or invalid drafts using API rules', () => {
  const base = emptyAttributeDraft();
  assert.deepEqual(compileAttributeDrafts({gpuModel: {...base, value: 'NVIDIA L4'}, gpuCount: {...base, operator: 'in', values: ['1', '2']}, memoryGiB: {...base, operator: 'range', min: '8.5', max: '32'}}), {
    filters: {gpuModel: {eq: 'NVIDIA L4'}, gpuCount: {in: [1, 2]}, memoryGiB: {range: {min: 8.5, max: 32}}}, error: '',
  });
  for (const draft of [base, {...base, value: '1.5'}, {...base, operator: 'range' as const, min: '4', max: '2'}, {...base, operator: 'in' as const}]) assert.ok(compileAttributeDrafts({vcpu: draft}).error);
  assert.deepEqual(compileAttributeDrafts({vcpu: {...base, value: '0'}}).filters, {vcpu: {eq: 0}});
});

test('incomplete native number inputs never silently remove a range bound', () => {
  const base = {...emptyAttributeDraft(), operator: 'range' as const};
  for (const draft of [{...base, min: '', max: '4', invalidMin: true}, {...base, min: '4', max: '', invalidMax: true}]) {
    const compiled = compileAttributeDrafts({vcpu: draft});
    assert.ok(compiled.error.includes('завершите ввод числа'));
    assert.deepEqual(compiled.filters, {});
  }
  assert.deepEqual(compileAttributeDrafts({vcpu: {...base, min: '', max: '4', invalidMin: false}}), {filters: {vcpu: {range: {max: 4}}}, error: ''});
  // Invalid text in an inactive operator does not block the active list filter.
  assert.deepEqual(compileAttributeDrafts({vcpu: {...base, operator: 'in', values: ['2', '4'], invalidMin: true}}), {filters: {vcpu: {in: [2, 4]}}, error: ''});
});
