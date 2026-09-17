import {operationResponse,optionsResponse,rateLimitOrNull} from '@/lib/public-api/http';
export const OPTIONS=optionsResponse;
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return rateLimitOrNull(request) ?? operationResponse('list_product_alternatives',request,await context.params);
}
