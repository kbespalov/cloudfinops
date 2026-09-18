import {operationResponse,optionsResponse,rateLimitOrNull,csvParam,jsonError} from '@/lib/public-api/http';
import {listRegions} from '@/lib/public-api/catalog';
import {parseRegionFilters} from '@/lib/public-api/regions';
import {PRODUCT_ARRAY_FILTERS} from '@/lib/public-api/constants';
export const OPTIONS=optionsResponse;
export function GET(request:Request) {
  const limited=rateLimitOrNull(request);if(limited) return limited;
  const params=new URL(request.url).searchParams;
  const input:Record<string,unknown>={};
  if(params.has('regions')) input.regions=parseRegionFilters(params.getAll('regions'),listRegions().map(region=>region.label));
  for(const [key,value] of params) {
    if(key==='regions') continue;
    if(params.getAll(key).length>1) return jsonError(400,'invalid_parameter','Use comma-separated filters',[{path:'/'+key,code:'duplicate_parameter'}]);
    input[key]=(PRODUCT_ARRAY_FILTERS as readonly string[]).includes(key)?csvParam(value):key==='limit'?Number(value):value;
  }
  return operationResponse('search_products',request,input);
}
