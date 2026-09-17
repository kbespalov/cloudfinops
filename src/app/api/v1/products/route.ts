import {operationResponse,optionsResponse,rateLimitOrNull,csvParam,jsonError} from '@/lib/public-api/http';
export const OPTIONS=optionsResponse;
export function GET(request:Request) {
  const limited=rateLimitOrNull(request);if(limited) return limited;
  const params=new URL(request.url).searchParams;
  const input:Record<string,unknown>={};
  for(const [key,value] of params) {
    if(params.getAll(key).length>1) return jsonError(400,'invalid_parameter','Use comma-separated filters',[{path:'/'+key,code:'duplicate_parameter'}]);
    input[key]=['providers','categories','regions'].includes(key)?csvParam(value):key==='limit'?Number(value):value;
  }
  return operationResponse('search_products',request,input);
}
