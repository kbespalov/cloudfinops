import {NextResponse} from 'next/server';
import {
  resolveLakehouseInput,
  type LakehouseSize,
} from '@/lib/calculator/lakehouse-presets';
import {quoteLakehouse} from '@/lib/calculator/lakehouse-quote';
import type {PeriodMode} from '@/lib/calculator/quote-view';

const PERIODS = new Set<PeriodMode>(['unit', 'month', 'year']);
const SIZES = new Set<LakehouseSize>(['small', 'medium', 'large']);

type Body = {
  period: PeriodMode;
  presetId?: LakehouseSize;
  lakeTiB?: number;
  hotPercent?: number;
  k8sTier?: 'basic' | 'ha';
  etlHoursPerDay?: number;
  queryHoursPerDay?: number;
};

function parseFinite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({error: 'invalid json'}, {status: 400});
  }

  if (!body?.period || !PERIODS.has(body.period)) {
    return NextResponse.json({error: 'period required'}, {status: 400});
  }

  const presetId =
    body.presetId && SIZES.has(body.presetId) ? body.presetId : ('medium' as LakehouseSize);

  const lakeTiB = parseFinite(body.lakeTiB);
  const hotPercent = parseFinite(body.hotPercent);
  const etlHoursPerDay = parseFinite(body.etlHoursPerDay);
  const queryHoursPerDay = parseFinite(body.queryHoursPerDay);

  if (lakeTiB != null && (lakeTiB < 1 || lakeTiB > 2048)) {
    return NextResponse.json({error: 'lakeTiB out of range'}, {status: 400});
  }
  if (hotPercent != null && (hotPercent < 0 || hotPercent > 100)) {
    return NextResponse.json({error: 'hotPercent out of range'}, {status: 400});
  }
  if (etlHoursPerDay != null && (etlHoursPerDay < 0 || etlHoursPerDay > 24)) {
    return NextResponse.json({error: 'etlHoursPerDay out of range'}, {status: 400});
  }
  if (queryHoursPerDay != null && (queryHoursPerDay < 0 || queryHoursPerDay > 24)) {
    return NextResponse.json({error: 'queryHoursPerDay out of range'}, {status: 400});
  }

  const k8sTier =
    body.k8sTier === 'basic' || body.k8sTier === 'ha' ? body.k8sTier : undefined;

  const input = resolveLakehouseInput(presetId, {
    lakeTiB: lakeTiB ?? undefined,
    hotPercent: hotPercent ?? undefined,
    k8sTier,
    etlHoursPerDay: etlHoursPerDay ?? undefined,
    queryHoursPerDay: queryHoursPerDay ?? undefined,
  });

  return NextResponse.json(quoteLakehouse(input, body.period));
}
