import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {OPERATIONS,OPERATION_IDS,runOperation} from './operations';
import {clientIp,publicApiRateLimiter} from './rate-limit';
import {readJsonBody} from './http';

export function createMcpServer():McpServer {
  const server=new McpServer({name:'cloudfinops',version:'1.0.0'},{instructions:'CloudFinOps catalog and estimates. Prices are estimates, capacity is not verified.'});
  for(const name of OPERATION_IDS) {
    const op=OPERATIONS[name];
    server.registerTool(name,{
      description:op.description,inputSchema:op.inputSchema,
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    },async(args:unknown)=>{
      const result=runOperation(name,args);
      const payload=(result.ok?result.data:{error:{code:result.code,message:result.message,details:result.details}}) as Record<string,unknown>;
      return {content:[{type:'text' as const,text:JSON.stringify(payload)}],structuredContent:payload,isError:!result.ok};
    });
  }
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
  const headers={'content-type':'application/json','Request-Id':crypto.randomUUID(),'cache-control':'no-store'};
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
    out.headers.set('Request-Id',headers['Request-Id']);out.headers.set('Cache-Control','no-store');
    return out;
  } finally { await server.close(); }
}
