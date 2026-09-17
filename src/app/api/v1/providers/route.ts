import {operationResponse,optionsResponse,rateLimitOrNull} from '@/lib/public-api/http';
export const OPTIONS=optionsResponse;
export function GET(request:Request) {
  return rateLimitOrNull(request) ?? operationResponse('list_providers',request,{});
}
