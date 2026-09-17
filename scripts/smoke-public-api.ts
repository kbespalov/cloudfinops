import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {responseSchemas,errorSchema} from '../src/lib/public-api/responses';
const base=process.argv[2]??'http://127.0.0.1:3107';
const resource={type:'compute',vcpu:4,memoryGiB:8};
async function request(path:string,options:RequestInit={}) {
  const response=await fetch(base+path,options);
  assert.ok(response.headers.get('Request-Id'),path);
  return {response,body:await response.json()};
}
async function main() {
  for(const [path,schema] of [['providers','list_providers'],['categories','list_categories'],['regions','list_regions']] as const) {
    const r=await request('/api/v1/'+path);assert.equal(r.response.status,200);responseSchemas[schema].parse(r.body);
    assert.equal(r.response.headers.get('access-control-allow-origin'),'*');
  }
  const first=await request('/api/v1/products?limit=2&providers=vk-cloud');
  responseSchemas.search_products.parse(first.body);assert.equal(first.body.data.length,2);
  const id=first.body.data[0].id;
  for(const [path,schema] of [[`products/${id}`,'get_product'],[`products/${id}/alternatives`,'list_product_alternatives']] as const) {
    const r=await request('/api/v1/'+path);assert.equal(r.response.status,200);responseSchemas[schema].parse(r.body);
  }
  const second=await request('/api/v1/products?limit=2&cursor='+encodeURIComponent(first.body.pagination.nextCursor));
  assert.ok(second.body.data.every((p:{provider:{id:string}})=>p.provider.id==='vk-cloud'));assert.notEqual(first.body.data[0].id,second.body.data[0].id);
  const post={method:'POST',headers:{'content-type':'application/json'}};
  const estimate=await request('/api/v1/estimates',{...post,body:JSON.stringify({resource})});
  assert.equal(estimate.response.status,200);responseSchemas.create_estimate.parse(estimate.body);
  assert.ok(estimate.body.data.quotes.some((q:{status:string})=>q.status==='priced'));
  for(const q of estimate.body.data.quotes) if(q.status==='priced') {
    const cents=(s:string)=>BigInt(s.replace('.',''));
    assert.equal(cents(q.total.amount),q.lineItems.reduce((n:bigint,l:{amount:{amount:string}})=>n+cents(l.amount.amount),0n));
  }
  const invalid=await request('/api/v1/estimates',{...post,body:JSON.stringify({resource:{...resource,vcpu:-1}})});
  assert.equal(invalid.response.status,400);errorSchema.parse(invalid.body);
  const expired=JSON.parse(Buffer.from(first.body.pagination.nextCursor,'base64url').toString());expired.v='old';
  const stale=await request('/api/v1/products?cursor='+Buffer.from(JSON.stringify(expired)).toString('base64url'));
  assert.equal(stale.response.status,409);
  const options=await fetch(base+'/api/v1/estimates',{method:'OPTIONS',headers:{origin:'https://example.com'}});assert.equal(options.status,204);
  const doc=await request('/api/v1/openapi.json');assert.equal(doc.body.openapi,'3.1.0');assert.ok(doc.body.components.schemas.create_estimateRequest);
  const forbidden=await fetch(base+'/mcp',{...post,headers:{...post.headers,origin:'https://evil.example'},body:'{}'});assert.equal(forbidden.status,403);
  const client=new Client({name:'release-smoke',version:'1'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
    const listed=await client.listTools();assert.equal(listed.tools.length,5);
    for(const name of ['list_providers','search_products','get_product','list_product_alternatives','create_estimate'] as const) {
      const args=name==='create_estimate'?{resource}:name==='get_product'||name==='list_product_alternatives'?{id}:{};
      const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,name);responseSchemas[name].parse(result.structuredContent);
    }
  } finally {await client.close();}
  assert.equal((await fetch(base+'/api')).status,200);
  assert.ok((await (await fetch(base+'/llms.txt')).text()).includes('/api/v1'));
  console.log(`PASS: REST catalog, pagination, estimates, errors, CORS, OpenAPI, MCP 5 tools, docs (${base})`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
