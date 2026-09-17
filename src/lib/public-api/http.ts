import {NextResponse} from 'next/server';
import {errorBody, successBody} from './envelope';
import {CALCULATION_VERSION} from './constants';
import {etagFor} from './pagination';
import {clientIp, publicApiRateLimiter} from './rate-limit';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version, MCP-Session-Id',
  'Access-Control-Expose-Headers': 'Request-Id, ETag, Retry-After',
};

export function requestId(): string {
  return crypto.randomUUID();
}

export function withHeaders(
  response: NextResponse,
  extra?: Record<string, string>,
): NextResponse {
  const id = requestId();
  response.headers.set('Request-Id', id);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) response.headers.set(k, v);
  }
  return response;
}

export function optionsResponse(): NextResponse {
  return withHeaders(new NextResponse(null, {status: 204}));
}

export function rateLimitOrNull(request: Request): NextResponse | null {
  const gate = publicApiRateLimiter.tryAcquire(clientIp(request));
  if (gate.ok) return null;
  const res = NextResponse.json(
    errorBody('rate_limited', 'Too many requests from this IP'),
    {status: 429},
  );
  res.headers.set('Retry-After', String(gate.retryAfterSec));
  return withHeaders(res);
}

export function jsonOk(data: unknown, extraMeta?: Record<string, unknown>, etagKey?: string) {
  const body = successBody(data, extraMeta as never);
  const res = NextResponse.json(body);
  if (etagKey) {
    const tag = etagFor(etagKey);
    res.headers.set('ETag', tag);
    res.headers.set('Cache-Control', 'public, max-age=300');
  } else {
    res.headers.set('Cache-Control', 'no-store');
  }
  return withHeaders(res);
}

export function jsonList(items: unknown, pagination: {nextCursor: string | null; limit: number}, etagKey: string) {
  const body = successBody(items, undefined, pagination);
  const res = NextResponse.json(body);
  res.headers.set('ETag', etagFor(etagKey));
  res.headers.set('Cache-Control', 'public, max-age=300');
  return withHeaders(res);
}
export function jsonEstimate(data: unknown) {
  const body = successBody(data, {calculationVersion: CALCULATION_VERSION});
  const res = NextResponse.json(body);
  res.headers.set('Cache-Control', 'no-store');
  return withHeaders(res);
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Array<{path: string; code: string; value?: unknown}>,
) {
  return withHeaders(NextResponse.json(errorBody(code, message, details ?? []), {status}));
}

export function csvParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

/** REST and MCP dispatch the same registry and return the same envelope. */
export async function operationResponse(id: import('./operations').RestOperationId, request: Request, input: unknown) {
  const {runOperation}=await import('./operations');
  const result=runOperation(id,input);
  if(!result.ok) {
    const status=({not_found:404,cursor_expired:409,internal_error:500} as Record<string,number>)[result.code]??400;
    return jsonError(status,result.code,result.message,result.details);
  }
  const res=NextResponse.json(result.data);
  res.headers.set('Cache-Control',request.method==='GET'?'public, max-age=300':'no-store');
  if(request.method==='GET') res.headers.set('ETag',etagFor(JSON.stringify(result.data)));
  return withHeaders(res);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if(Number(request.headers.get('content-length')??0)>65536) throw Object.assign(new Error('Request body too large'),{status:413});
  const reader=request.body?.getReader();
  if(!reader) throw new Error('Empty body');
  let size=0;
  const chunks:Uint8Array[]=[];
  while(true) {
    const {done,value}=await reader.read();if(done) break;
    size+=value.byteLength;
    if(size>65536) {await reader.cancel();throw Object.assign(new Error('Request body too large'),{status:413});}
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
