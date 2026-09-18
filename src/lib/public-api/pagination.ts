import {createHash} from 'node:crypto';
import {z} from 'zod';
import {attributeFiltersSchema} from './attribute-schemas';
import {catalogVersion} from './envelope';
import {DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT} from './constants';
const cursorSchema = z.strictObject({
  v:z.string(),offset:z.number().int().nonnegative().max(1e7),q:z.string().max(500),
  providers:z.array(z.string()),categories:z.array(z.string()),regions:z.array(z.string()),status:z.string(),
  services:z.array(z.string()).default([]),serviceProducts:z.array(z.string()).default([]),
  meters:z.array(z.string()).default([]),units:z.array(z.string()).default([]),
  modelIds:z.array(z.string()).default([]),tokenDirections:z.array(z.string()).default([]),inferenceModes:z.array(z.string()).default([]),
  attributes:attributeFiltersSchema.default({}),
  order:z.enum(['lexical-v1','provider-sku-v1']),
});
export type CursorPayload = z.infer<typeof cursorSchema>;
export function invalidParameter(message:string,path='/cursor') {
  return Object.assign(new Error(message),{apiCode:'invalid_parameter',details:[{path,code:'invalid_parameter'}]});
}
export function encodeCursor(payload:CursorPayload):string { return Buffer.from(JSON.stringify(payload)).toString('base64url'); }
export function decodeCursor(raw:string,version=catalogVersion()):CursorPayload {
  let parsed:CursorPayload;
  try {
    if (raw.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    parsed=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8')));
    if(parsed.order !== (parsed.q ? 'lexical-v1' : 'provider-sku-v1')) throw new Error();
  } catch { throw invalidParameter('cursor is invalid'); }
  if(parsed.v!==version) throw Object.assign(new Error('catalog snapshot changed'),{apiCode:'cursor_expired',details:[{path:'/cursor',code:'cursor_expired'}]});
  return parsed;
}
export function parseLimit(raw:string|null):number {
  if(raw==null||raw==='') return DEFAULT_PAGE_LIMIT;
  const n=Number(raw);
  if(!Number.isInteger(n)||n<1||n>MAX_PAGE_LIMIT) throw invalidParameter(`limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`,'/limit');
  return n;
}
export function etagFor(parts:string) { return `"${createHash('sha256').update(parts).digest('hex').slice(0,16)}"`; }
