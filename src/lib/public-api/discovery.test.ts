import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMcpServer} from './mcp';
import {OPERATIONS, type RestOperationId, runOperation} from './operations';
import {responseSchemas, estimateSchema} from './responses';
import {operationExamples} from './examples';
import {buildOpenApi} from './openapi';
import {buildApiReference, buildLlmIndex} from './documentation';
import {DOCUMENTATION_PAGES, SITE_URL} from './discovery';
import sitemap from '@/app/sitemap';

test('all published operation examples execute and conform to the response contract', () => {
  for (const [name, examples] of Object.entries(operationExamples())) {
    const id = name as RestOperationId;
    for (const example of examples) {
      const args = OPERATIONS[id].inputSchema.parse(example.value);
      const result = runOperation(id, args);
      assert.ok(result.ok, `${id}/${example.name}`);
      responseSchemas[id].parse(result.data);
      if (id === 'create_estimate') {
        assert.ok(estimateSchema.parse(responseSchemas.create_estimate.parse(result.data).data).coverage.priced > 0);
      }
    }
  }
  const openapi = buildOpenApi();
  assert.deepEqual(openapi.security, []);
  assert.ok(JSON.stringify(openapi).includes('Exact product.id returned by search_products'));
});

test('documentation pages have unique canonical routes in the sitemap and discoverable references', () => {
  const paths = DOCUMENTATION_PAGES.map(page => page.path);
  assert.equal(new Set(paths).size, paths.length);
  const urls = new Set(sitemap().map(entry => entry.url));
  for (const path of paths) {
    assert.ok(!path.includes('#'));
    assert.ok(urls.has(SITE_URL + path), path);
  }
  const index = buildLlmIndex(), reference = buildApiReference();
  for (const path of ['/api/reference.md', '/api/v1/openapi.json', '/api/mcp', '/llms-full.txt']) assert.ok(index.includes(SITE_URL + path));
  for (const [id, op] of Object.entries(OPERATIONS)) {
    assert.ok(reference.includes(`Operation ID: \`${id}\``));
    assert.ok(reference.includes(`${op.method.toUpperCase()} ${op.path}`));
  }
  assert.ok(reference.includes('Null means unknown or not applicable'));
});

test('MCP discovers output schemas and can read documentation resources while retaining tool error results', async () => {
  const server = createMcpServer(), client = new Client({name: 'discovery-test', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const {tools} = await client.listTools();
    assert.equal(tools.length, 5);
    for (const tool of tools) {
      assert.ok(tool.title); assert.ok(tool.outputSchema);
      assert.ok((tool.description?.length ?? 0) > 100);
      assert.equal(tool.annotations?.readOnlyHint, true);
    }
    const {resources} = await client.listResources();
    assert.equal(resources.length, 2);
    for (const resource of resources) {
      const {contents} = await client.readResource({uri: resource.uri});
      assert.ok('text' in contents[0]);
      if (resource.mimeType === 'application/json') assert.equal(JSON.parse(contents[0].text as string).openapi, '3.1.0');
      else assert.ok((contents[0].text as string).includes('## Estimate constraints'));
    }
    const error = await client.callTool({name: 'get_product', arguments: {id: 'prod_00000000000000000000'}});
    assert.equal(error.isError, true);
  } finally {await client.close(); await server.close();}
});
