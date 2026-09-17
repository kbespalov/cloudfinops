import {NextResponse} from 'next/server';
import {buildOpenApi} from '@/lib/public-api/openapi';
import {optionsResponse, rateLimitOrNull, withHeaders} from '@/lib/public-api/http';

export function OPTIONS() {
  return optionsResponse();
}

export function GET(request: Request) {
  const limited = rateLimitOrNull(request);
  if (limited) return limited;
  return withHeaders(NextResponse.json(buildOpenApi()));
}
