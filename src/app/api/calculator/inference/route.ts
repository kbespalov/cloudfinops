import {NextResponse} from 'next/server';
import type {InferenceDtype} from '@/data/inference-models';
import {recommendInferenceInfra} from '@/lib/chat/inference-recommend';

const QUANTS = new Set<InferenceDtype | 'auto'>(['auto', 'bf16', 'fp8', 'int4', 'int8']);

/** Server-side inference recommender for the calculator AI tab. */
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const model = searchParams.get('model')?.trim() ?? '';
  const quantRaw = (searchParams.get('quant') ?? 'auto') as InferenceDtype | 'auto';
  const maxConfigsRaw = Number(searchParams.get('maxConfigs') ?? 5);

  if (!model) {
    return NextResponse.json({error: 'model required'}, {status: 400});
  }
  const quant = QUANTS.has(quantRaw) ? quantRaw : 'auto';
  const maxConfigs =
    Number.isFinite(maxConfigsRaw) && maxConfigsRaw >= 1
      ? Math.min(Math.round(maxConfigsRaw), 5)
      : 5;

  const result = recommendInferenceInfra({model, quant, maxConfigs});
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
