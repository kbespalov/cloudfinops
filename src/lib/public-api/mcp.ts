import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {OPERATIONS,OPERATION_IDS,runOperation} from './operations';
import {clientIp,publicApiRateLimiter} from './rate-limit';
import {readJsonBody} from './http';
import {OPERATION_DOCS, MCP_INSTRUCTIONS} from './operation-docs';
import {responseSchemas} from './responses';
import {buildApiReference} from './documentation';
import {buildOpenApi} from './openapi';
import {SITE_URL, API_URL, DISCOVERY_LINKS} from './discovery';

export function createMcpServer():McpServer {
  const server=new McpServer({name:'cloudfinops',title:'CloudFinOps Public API',version:'1.0.0',websiteUrl:`${SITE_URL}/api/mcp`},{instructions:MCP_INSTRUCTIONS});
  for(const name of OPERATION_IDS) {
    const op=OPERATIONS[name];
    server.registerTool(name,{
      title:OPERATION_DOCS[name].title, description:OPERATION_DOCS[name].description,
      inputSchema:op.inputSchema, outputSchema:responseSchemas[name],
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    },async(args:unknown)=>{
      const result=runOperation(name,args);
      const payload=(result.ok?result.data:{error:{code:result.code,message:result.message,details:result.details}}) as Record<string,unknown>;
      // SDK clients validate any structuredContent against outputSchema, even on
      // isError results. Keep errors in text content, outside the success schema.
      return {content:[{type:'text' as const,text:JSON.stringify(payload)}],...(result.ok ? {structuredContent:payload} : {}),isError:!result.ok};
    });
  }
  server.registerResource('api-reference', `${SITE_URL}/llms-full.txt`, {
    title:'CloudFinOps API usage guide', description:'How to select tools, interpret SKU attributes and compare monthly cloud costs. Includes runnable examples, limits and source attribution.', mimeType:'text/markdown',
  }, async uri => ({contents:[{uri:uri.href,mimeType:'text/markdown',text:buildApiReference()}]}));
  server.registerResource('openapi', `${API_URL}/openapi.json`, {
    title:'CloudFinOps OpenAPI 3.1', description:'REST request and response schemas, operation IDs and examples. REST and MCP use the same operation registry.', mimeType:'application/json',
  }, async uri => ({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(buildOpenApi())}]}));
  return server;
}
const HOSTS=new Set(['cloudfinops.ru','www.cloudfinops.ru','localhost','127.0.0.1','[::1]']);
function allowedHost(host:string) {
  return HOSTS.has(host) || host.endsWith('.localhost') || (process.env.MCP_ALLOWED_HOSTS??'').split(',').map(s=>s.trim()).includes(host);
}
export function mcpHostAllowed(request:Request):boolean {
  try { return allowedHost(new URL(`http://${request.headers.get('host')??new URL(request.url).host}`).hostname.toLowerCase()); }
  catch { return false; }
}
export function mcpOriginAllowed(request:Request):boolean {
  const origin=request.headers.get('origin');
  if(!origin) return true;
  try { const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&allowedHost(url.hostname.toLowerCase()); } catch { return false; }
}
export async function handleMcpRequest(request:Request):Promise<Response> {
  const headers={'content-type':'application/json','Request-Id':crypto.randomUUID(),'cache-control':'no-store',Link:DISCOVERY_LINKS};
  if(!mcpHostAllowed(request)||!mcpOriginAllowed(request)) return new Response(JSON.stringify({error:{code:'forbidden',message:'Host/Origin not allowed'}}),{status:403,headers});
  const gate=publicApiRateLimiter.tryAcquire(clientIp(request));
  if(!gate.ok) return new Response(JSON.stringify({error:{code:'rate_limited'}}),{status:429,headers:{...headers,'Retry-After':String(gate.retryAfterSec)}});
  if(Number(request.headers.get('content-length')??0)>65536) return new Response(null,{status:413,headers});
  if (request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      request = new Request(request.url, {method: 'POST', headers: request.headers, body: JSON.stringify(body)});
    } catch (error) {
      const large = (error as {status?: number}).status === 413;
      return new Response(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: large ? -32600 : -32700, message: large ? 'Request body too large' : 'Invalid JSON'}}), {status: large ? 413 : 400, headers});
    }
  }
  const server=createMcpServer();
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try {
    await server.connect(transport);
    const response=await transport.handleRequest(request);
    // JSON mode has no long-lived SSE stream. Consume before closing to release SDK resources.
    const body=await response.arrayBuffer();
    const out=new Response(body.byteLength?body:null,{status:response.status,headers:response.headers});
    out.headers.set('Request-Id',headers['Request-Id']);out.headers.set('Cache-Control','no-store');out.headers.set('Link',DISCOVERY_LINKS);
    return out;
  } finally { await server.close(); }
}
