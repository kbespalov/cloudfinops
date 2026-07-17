import {NextResponse} from 'next/server';
import {getPresetQuote} from '@/lib/calculator/quotes-cache';
import type {PeriodMode} from '@/lib/calculator/quote-view';

const PERIODS = new Set<PeriodMode>(['unit', 'month', 'year']);

/** Full quote (with cost parts) for the calculator drawer — keeps page props slim. */
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const presetId = searchParams.get('presetId');
  const period = searchParams.get('period') as PeriodMode | null;

  if (!presetId || !period || !PERIODS.has(period)) {
    return NextResponse.json({error: 'presetId and period required'}, {status: 400});
  }

  const quote = getPresetQuote(presetId, period);
  if (!quote) {
    return NextResponse.json({error: 'not found'}, {status: 404});
  }

  return NextResponse.json(quote, {
    headers: {
      // Quotes are derived from static catalog — cache at the edge/CDN.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
