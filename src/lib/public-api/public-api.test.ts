import assert from 'node:assert/strict';
import {test} from 'node:test';
import {catalog,type CatalogData,type CatalogMeter} from '@/lib/catalog';
import {parseDecimal,toMoney,linearAmount,sumAmounts} from './money';
import {priceLine} from './price-engine';
import {meterToProduct,meterToPrice,findMeterByProductId} from './product';
import {createEstimate,validateEstimateRequest} from './estimates';
import {listProducts} from './catalog';
import {catalogVersion} from './envelope';
import {encodeCursor} from './pagination';
import {runOperation,OPERATION_IDS} from './operations';
import {responseSchemas} from './responses';
import {buildOpenApi} from './openapi';
import {createMcpServer,handleMcpRequest,mcpHostAllowed,mcpOriginAllowed} from './mcp';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const meter=(sku:string)=>{const m=catalog.meters.find(m=>m.sku===sku);assert.ok(m,sku);return m;};
const resource={type:'compute' as const,vcpu:4,memoryGiB:8};

test('exact decimal arithmetic and half-up rounding happen only after multiplication',()=>{
  assert.equal(toMoney(parseDecimal('1')).amount,'1.00');
  assert.equal(toMoney(parseDecimal('1.235')).amount,'1.24');
  assert.equal(toMoney(parseDecimal('-1.235')).amount,'-1.24');
  assert.equal(toMoney(linearAmount('0.89616384','1000000','1')).amount,'896163.84');
  assert.equal(toMoney(linearAmount('0.000000012345','1000000000','1')).amount,'12.35');
  assert.equal(toMoney(sumAmounts([parseDecimal('1.23'),parseDecimal('4.56')])).amount,'5.79');
});
test('all real catalog products satisfy the public response schema',()=>{
  for(const m of catalog.meters) responseSchemas.get_product.parse({data:meterToProduct(m),meta:{apiVersion:'v1',catalogVersion:catalogVersion(),taxonomyVersion:catalog.taxonomyVersion,generatedAt:catalog.generatedAt,disclaimer:''}});
});
test('normalized price uses its normalized unit, preserving all source precision',()=>{
  const ram=meterToPrice(meter('t1.compute.ram'));
  assert.equal(ram.unit,'memory_gib_hour');assert.equal(ram.unitPrice?.amount,'0.3021367');
  assert.equal(meterToPrice(meter('vk.compute.snapshot.capacity')).unit,'gib_hour');
});
test('Selectel free allowance and paid boundary are calculated as graduated tiers',()=>{
  const m=meter('selectel.traffic.internet.egress');
  for(const [q,wanted] of [[0,'0.00'],[3072,'0.00'],[3073,'0.90'],[4072,'896.16']] as const) {
    const line=priceLine(m,q);assert.ok('amount' in line);assert.equal(line.amount.amount,wanted);
  }
});
test('CDN tier denominator retains the 100k request pack',()=>{
  const m=meter('yc.cdn.requests'), p=meterToPrice(m);
  assert.equal(p.unitQuantity,'100000');assert.equal(p.tiers?.[1].unitPrice.amount,'1');
  const l=priceLine(m,100100000);assert.ok('amount' in l);assert.equal(l.amount.amount,'1.00');
});
test('missing VAT/currency and malformed tiers are not billable',()=>{
  const m=meter('t1.compute.ram');
  assert.deepEqual(priceLine({...m,normalizedAmount:null,normalizedVat:null},1),{error:'vat'});
  assert.deepEqual(priceLine({...m,normalizedCurrency:'USD'},1),{error:'currency'});
  const traffic=meter('selectel.traffic.internet.egress');
  assert.deepEqual(priceLine({...traffic,rateTiers:traffic.rateTiers!.map((t,i)=>i?{...t,from:'3073'}:t)},3074),{error:'rate'});
});
test('product IDs survive a price change; price IDs include tiers/VAT but not rechecks',()=>{
  const m=meter('selectel.traffic.internet.egress'), original=meterToProduct(m);
  const changed=meterToProduct({...m,rateTiers:m.rateTiers!.map((t,i)=>i?{...t,amount:'2'}:t)});
  assert.equal(original.id,changed.id);assert.notEqual(original.prices[0].id,changed.prices[0].id);
  assert.equal(original.prices[0].id,meterToPrice({...m,checkedAt:'2099-01-01'}).id);
  assert.notEqual(original.prices[0].id,meterToPrice({...m,nativeVat:'excluded'}).id);
  assert.equal(findMeterByProductId('%bad'),undefined);
});
test('strict validation rejects rather than coerces invalid inputs',()=>{
  for(const bad of [
    {resource:{...resource,vcpu:4.4}}, {resource:{...resource,vcpu:'4'}}, {resource:{...resource,memoryGiB:0}},
    {resource:{...resource,purchaseModel:'spot'}},{resource:{...resource,disk:{sizeGiB:-1,media:'ssd'}}},
    {resource:{...resource,family:'low-cost'}},
    {resource,period:'year'},{resource,addons:{publicIpCount:-1}},{resource,providers:['a','a']},
    {resource:{type:'gpu',gpuModel:'L4',gpuCount:1,scope:'gpu_only',vcpu:4}},
  ]) assert.throws(()=>validateEstimateRequest(bad));
});
test('actual compute shapes are at least the requested size and differences are explicit',()=>{
  const r=createEstimate({resource:{type:'compute',vcpu:3,memoryGiB:7},providers:['cloud-ru']});
  const q=r.quotes[0];assert.equal(q.status,'priced');assert.equal(q.matchedResource?.vcpu,4);assert.equal(q.matchedResource?.memoryGiB,8);
  assert.ok(q.differences.some(d=>d.dimension==='vcpu'));
  assert.equal(q.lineItems.filter(l=>l.role==='bundle').length,1);
  assert.ok(!q.lineItems.some(l=>l.role==='vcpu'||l.role==='ram'));
});
test('every total is the sum of displayed lines, and only priced quotes win',()=>{
  for(const res of [resource,{type:'gpu' as const,gpuModel:'L4',gpuCount:1}]) {
    const r=createEstimate({resource:res});
    for(const q of r.quotes) if(q.status==='priced') assert.equal(q.total?.amount,toMoney(sumAmounts(q.lineItems.map(l=>parseDecimal(l.amount!.amount)))).amount); else assert.equal(q.total,null);
    for(const p of r.lowestPriceProviderIds) assert.equal(r.quotes.find(q=>q.provider.id===p)?.status,'priced');
    assert.equal(r.coverage.requested,r.coverage.priced+r.coverage.incomplete+r.coverage.unavailable+r.coverage.error);
  }
});
test('GPU disk is preserved, model excludes vGPU, and host lattice can increase sizes',()=>{
  const r=createEstimate({resource:{type:'gpu',gpuModel:'L4',gpuCount:1,disk:{sizeGiB:500,media:'hdd'}},providers:['vk-cloud']});
  const q=r.quotes[0];assert.equal(q.status,'priced');assert.equal(q.matchedResource?.vcpu,16);
  assert.deepEqual(q.matchedResource?.disk,{sizeGiB:500,media:'hdd'});
  assert.deepEqual(r.input.resource.disk,{sizeGiB:500,media:'hdd'});
});
test('GPU interconnect, region, scope, and purchase model are never relaxed',()=>{
  const scenarios=[
    {type:'gpu' as const,gpuModel:'L4',gpuCount:1,scope:'gpu_only' as const},
    {type:'gpu' as const,gpuModel:'L4',gpuCount:1,interconnect:'NVLink'},
    {type:'gpu' as const,gpuModel:'L4',gpuCount:1,region:'nonexistent'},
    {type:'gpu' as const,gpuModel:'L4',gpuCount:1,purchaseModel:'preemptible' as const},
  ];
  for(const res of scenarios) assert.equal(createEstimate({resource:res,providers:['vk-cloud']}).quotes[0].status,'unavailable');
});
test('synthetic GPU cannot enter an estimate',()=>{
  const data={...catalog,meters:catalog.meters.map(m=>m.categoryKey==='gpu'?{...m,synthetic:true}:m)};
  assert.equal(createEstimate({resource:{type:'gpu',gpuModel:'L4',gpuCount:1}},data).coverage.priced,0);
});
test('seventh provider needs only data; missing disk or excluded VAT becomes incomplete',()=>{
  const cpu=meter('t1.compute.a1.vcpu'),ram=meter('t1.compute.ram'),disk=meter('t1.disk.basic');
  const copy=(m:CatalogMeter)=>({...m,id:`test-cloud:${m.sku}`,provider:'test-cloud',providerName:'Test Cloud',dimensions:{...m.dimensions}});
  const fixture:CatalogData={...catalog,providers:[...catalog.providers,{id:'test-cloud',name:'Test Cloud',count:3}],meters:[...catalog.meters,...[cpu,ram,disk].map(copy)]};
  assert.equal(createEstimate({resource,providers:['test-cloud']},fixture).quotes[0].status,'priced');
  const noDisk={...fixture,meters:fixture.meters.filter(m=>!(m.provider==='test-cloud'&&m.meter==='storage.block.capacity'))};
  assert.equal(createEstimate({resource,providers:['test-cloud']},noDisk).quotes[0].status,'incomplete');
  const noVat={...fixture,meters:fixture.meters.map(m=>m.provider==='test-cloud'?{...m,normalizedAmount:null,normalizedVat:null}:m)};
  assert.equal(createEstimate({resource,providers:['test-cloud']},noVat).quotes[0].status,'incomplete');
});
test('cursor preserves filters/order, rejects mismatches, malformed and expired snapshots',()=>{
  const first=listProducts({providers:['vk-cloud'],limit:2});assert.ok(first.nextCursor);
  const second=listProducts({cursor:first.nextCursor,limit:2});
  assert.ok(second.items.every(p=>p.provider.id==='vk-cloud'));assert.notEqual(first.items[0].id,second.items[0].id);
  assert.throws(()=>listProducts({cursor:first.nextCursor!,providers:['t1-cloud']}),/filters/);
  assert.throws(()=>listProducts({cursor:'%%%'}),/invalid/);
  const payload=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString());
  assert.throws(()=>listProducts({cursor:encodeCursor({...payload,v:'old'})}),/snapshot/);
  assert.throws(()=>listProducts({cursor:encodeCursor({...payload,offset:-1})}),/invalid/);
});
test('one registry produces full OpenAPI and schema-valid operation responses',()=>{
  const doc=buildOpenApi();assert.equal(Object.keys(doc.paths).length,9);
  const pid=meterToProduct(catalog.meters[0]).id;
  for(const id of OPERATION_IDS) {
    const input=id==='create_estimate'?{resource}:id==='get_product'||id==='list_product_alternatives'?{id:pid}:{};
    const result=runOperation(id,input);assert.ok(result.ok,id);responseSchemas[id].parse(result.data);
  }
});
test('official MCP client can discover and call all five tools',async()=>{
  const server=createMcpServer(), client=new Client({name:'test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  try {
    assert.equal((await client.listTools()).tools.length,5);
    const pid=meterToProduct(catalog.meters[0]).id;
    for(const name of OPERATION_IDS) {
      const args=name==='create_estimate'?{resource}:name==='get_product'||name==='list_product_alternatives'?{id:pid}:{};
      const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,name);
      responseSchemas[name].parse(result.structuredContent);
    }
  } finally {await client.close();await server.close();}
});
test('MCP transport initializes and enforces Host/Origin separately from REST CORS',async()=>{
  assert.ok(mcpHostAllowed(new Request('http://[::1]:3000/mcp',{headers:{host:'[::1]:3000'}})));
  assert.ok(!mcpOriginAllowed(new Request('http://localhost/mcp',{headers:{origin:'https://evil.example'}})));
  const response=await handleMcpRequest(new Request('http://localhost/mcp',{method:'POST',headers:{host:'localhost','content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}})}));
  assert.equal(response.status,200);assert.ok((await response.json()).result.serverInfo);assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('Internet add-on uses VPC internet rates, never S3 or interzone prices',()=>{
  const q=createEstimate({resource,providers:['mws-cloud'],addons:{internetEgressGiB:1000}}).quotes[0];
  assert.equal(q.status,'priced');const egress=q.lineItems.find(l=>l.role==='egress');assert.ok(egress);
  assert.equal(findMeterByProductId(egress.productId!)?.sku,'mws.traffic.internet.egress');
  assert.equal(egress.amount?.amount,'1525.00');
});
test('ties are retained, missing IP cannot become zero, and errors are isolated',()=>{
  const base=[meter('t1.compute.a1.vcpu'),meter('t1.compute.ram'),meter('t1.disk.basic')];
  const clone=(provider:string)=>base.map(m=>({...m,provider,providerName:provider,id:provider+':'+m.sku}));
  const providers=[{id:'a',name:'a',count:3},{id:'b',name:'b',count:3}];
  const data:CatalogData={...catalog,providers,meters:[...clone('a'),...clone('b')]};
  assert.deepEqual(createEstimate({resource},data).lowestPriceProviderIds,['a','b']);
  assert.equal(createEstimate({resource,addons:{publicIpCount:1}},data).coverage.incomplete,2);
  const broken={...data,meters:data.meters.map(m=>m.provider==='a'?{...m,normalizedAmount:'broken'}:m)};
  const result=createEstimate({resource},broken);assert.equal(result.coverage.error,1);assert.equal(result.coverage.priced,1);
  assert.deepEqual(result.lowestPriceProviderIds,['b']);
});
test('native minute and monthly bundle rules retain their own consumption basis',()=>{
  const m=meter('t1.compute.a1.vcpu');
  const native={...m,normalizedAmount:null,normalizedVat:null,nativeVat:'included'};
  const p=meterToPrice(native);assert.equal(p.unit,'vcpu_minute');
  const l=priceLine(native,1);assert.ok('amount' in l);assert.equal(l.quantity,'43200');
  const monthly={...m,pricingMode:'bundle',nativeAmount:'123.45',nativeVat:'included',unitQuantity:'flavor',unitPeriod:'month',normalizedAmount:null};
  const ml=priceLine(monthly,1);assert.ok('amount' in ml);assert.equal(ml.amount.amount,'123.45');
});
test('tiny positive numeric volumes are represented exactly instead of failing exponent parsing',()=>{
  assert.equal(toMoney(linearAmount('0.89616384','1000000000','1')).amount,'896163840.00');
  assert.equal(toMoney(parseDecimal(1e-7)).amount,'0.00');
});
