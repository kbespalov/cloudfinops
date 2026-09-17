import {buildLlmIndex, documentationResponse} from '@/lib/public-api/documentation';

export const dynamic = 'force-static';
export function GET() { return documentationResponse(buildLlmIndex()); }
