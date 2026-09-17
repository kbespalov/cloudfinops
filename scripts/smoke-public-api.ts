import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {responseSchemas,errorSchema} from '../src/lib/public-api/responses';
import {DOCUMENTATION_PAGES, SITE_URL} from '../src/lib/public-api/discovery';
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
    assert.ok(listed.tools.every(tool=>tool.outputSchema&&tool.title));
    for(const name of ['list_providers','search_products','get_product','list_product_alternatives','create_estimate'] as const) {
      const args=name==='create_estimate'?{resource}:name==='get_product'||name==='list_product_alternatives'?{id}:{};
      const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,name);responseSchemas[name].parse(result.structuredContent);
    }
    const resources=await client.listResources();assert.equal(resources.resources.length,2);
    for(const resource of resources.resources) {
      const result=await client.readResource({uri:resource.uri});assert.ok(result.contents.some(content=>'text' in content&&content.text.length>100));
    }
    const missing=await client.callTool({name:'get_product',arguments:{id:'prod_00000000000000000000'}});assert.equal(missing.isError,true);
  } finally {await client.close();}
  const sitemap=await (await fetch(base+'/sitemap.xml')).text();
  for(const page of DOCUMENTATION_PAGES) {
    const response=await fetch(base+page.path);assert.equal(response.status,200,page.path);
    const html=await response.text();
    const rendered=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.ok(rendered.includes('<h1>'),`${page.path}: server-rendered heading`);
    assert.ok(rendered.includes(`href="${SITE_URL}${page.path}"`),`${page.path}: canonical`);
    assert.ok(rendered.includes('rel="describedby"'),`${page.path}: discovery`);
    assert.ok(html.includes('application/ld+json'),`${page.path}: structured data`);
    assert.ok(sitemap.includes(`${SITE_URL}${page.path}</loc>`),`${page.path}: sitemap`);
    if(page.section==='mcp-connect') assert.ok(rendered.includes('Добавьте удалённый MCP-сервер'));
    if(page.section==='estimates') assert.ok(rendered.includes('resource.memoryGiB'));
    if(page.section==='models') assert.ok(rendered.includes('Price.unitQuantity'));
  }
  assert.equal((await fetch(base+'/api/not-a-documentation-page')).status,404);
  for(const [path,type] of [['/llms.txt','text/plain'],['/llms-full.txt','text/plain'],['/api/reference.md','text/markdown']]) {
    const response=await fetch(base+path);assert.equal(response.status,200,path);
    assert.ok(response.headers.get('content-type')?.includes(type));
    assert.ok(response.headers.get('link')?.includes('service-desc'));
    assert.ok((await response.text()).includes('/api/v1'));
  }
  console.log(`PASS: REST, pagination, estimates, errors, CORS, OpenAPI, MCP tools/resources, ${DOCUMENTATION_PAGES.length} indexed documentation pages and Markdown (${base})`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
