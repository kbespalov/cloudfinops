import {operationResponse,optionsResponse,rateLimitOrNull,jsonError,readJsonBody} from '@/lib/public-api/http';
export const OPTIONS=optionsResponse;
export async function POST(request:Request) {
  const limited=rateLimitOrNull(request);if(limited) return limited;
  let body:unknown;
  try {body=await readJsonBody(request);} catch(error) {
    const tooLarge=(error as {status?:number}).status===413;
    return jsonError(tooLarge?413:400,tooLarge?'request_too_large':'invalid_parameter',tooLarge?'Request body too large':'Invalid JSON',[{path:'/',code:tooLarge?'too_large':'invalid_json'}]);
  }
  return operationResponse('create_estimate',request,body);
}
