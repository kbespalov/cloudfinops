import {operationResponse, optionsResponse, rateLimitOrNull, csvParam, jsonError} from '@/lib/public-api/http';
export const OPTIONS = optionsResponse;
export function GET(request: Request) {
  const limited = rateLimitOrNull(request); if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const input: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (params.getAll(key).length > 1) return jsonError(400, 'invalid_parameter', 'Duplicate parameter', [{path: '/' + key, code: 'duplicate_parameter'}]);
    input[key] = key === 'categories' ? csvParam(value) : value;
  }
  return operationResponse('list_attributes', request, input);
}
