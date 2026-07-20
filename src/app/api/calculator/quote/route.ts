import {NextResponse} from 'next/server';
import {quotePreset, toViewQuote} from '@/lib/calculator/quote';
import type {ComputeFamily, ComputePreset, GpuPreset} from '@/lib/calculator/presets';
import type {PeriodMode, ViewPresetQuote} from '@/lib/calculator/quote-view';

const PERIODS = new Set<PeriodMode>(['unit', 'month', 'year']);
const FAMILIES = new Set<ComputeFamily>(['low-cost', 'general', 'high-cpu', 'high-memory']);

type ComputeBody = {
  kind: 'compute';
  period: PeriodMode;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  family?: ComputeFamily;
  vmCount?: number;
};

type GpuBody = {
  kind: 'gpu';
  period: PeriodMode;
  gpuModelMatch: string;
  gpuCount: number;
  vcpu?: number;
  ramGiB?: number;
  diskGiB?: number;
  gpuInterconnect?: string | null;
  dedicated?: boolean;
};

type QuoteBody = ComputeBody | GpuBody;

function scaleQuote(view: ViewPresetQuote, factor: number): ViewPresetQuote {
  if (factor === 1) return view;
  const scale = (q: NonNullable<ViewPresetQuote['best']>) => ({
    ...q,
    total: q.total * factor,
    parts: q.parts.map((p) => ({...p, amount: p.amount * factor})),
  });
  return {
    ...view,
    quotes: view.quotes.map(scale),
    alternateQuotes: view.alternateQuotes.map(scale),
    best: view.best ? scale(view.best) : null,
  };
}

function parsePositiveInt(value: unknown, fallback?: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback ?? null;
  return Math.round(n);
}

/** Ad-hoc compute / GPU quote for the redesigned calculator (not limited to cached presets). */
export async function POST(request: Request) {
  let body: QuoteBody;
  try {
    body = (await request.json()) as QuoteBody;
  } catch {
    return NextResponse.json({error: 'invalid json'}, {status: 400});
  }

  if (!body?.period || !PERIODS.has(body.period)) {
    return NextResponse.json({error: 'period required'}, {status: 400});
  }

  if (body.kind === 'compute') {
    const vcpu = parsePositiveInt(body.vcpu);
    const ramGiB = parsePositiveInt(body.ramGiB);
    const diskGiB = parsePositiveInt(body.diskGiB);
    const vmCount = parsePositiveInt(body.vmCount, 1) ?? 1;
    if (!vcpu || !ramGiB || !diskGiB) {
      return NextResponse.json({error: 'vcpu, ramGiB, diskGiB required'}, {status: 400});
    }
    if (vmCount > 64) {
      return NextResponse.json({error: 'vmCount too large'}, {status: 400});
    }
    const family: ComputeFamily =
      body.family && FAMILIES.has(body.family) ? body.family : 'general';
    const preset: ComputePreset = {
      id: `adhoc-${family}-${vcpu}-${ramGiB}-${diskGiB}`,
      kind: 'compute',
      family,
      title: `${vcpu} / ${ramGiB}`,
      subtitle: `${vcpu} vCPU · ${ramGiB} GiB · ${diskGiB} GiB SSD`,
      vcpu,
      ramGiB,
      diskGiB,
    };
    const view = scaleQuote(toViewQuote(quotePreset(preset, body.period)), vmCount);
    return NextResponse.json(view);
  }

  if (body.kind === 'gpu') {
    const gpuCount = parsePositiveInt(body.gpuCount);
    const gpuModelMatch =
      typeof body.gpuModelMatch === 'string' ? body.gpuModelMatch.trim() : '';
    if (!gpuCount || !gpuModelMatch) {
      return NextResponse.json({error: 'gpuModelMatch and gpuCount required'}, {status: 400});
    }
    const vcpu = body.vcpu != null ? parsePositiveInt(body.vcpu) : undefined;
    const ramGiB = body.ramGiB != null ? parsePositiveInt(body.ramGiB) : undefined;
    const diskGiB = body.diskGiB != null ? parsePositiveInt(body.diskGiB) : undefined;
    const preset: GpuPreset = {
      id: `adhoc-gpu-${gpuModelMatch}-${gpuCount}`,
      kind: 'gpu',
      title: `${gpuModelMatch} ×${gpuCount}`,
      subtitle: 'Calculator ad-hoc GPU',
      gpuModelMatch,
      gpuCount,
      vcpu: vcpu ?? undefined,
      ramGiB: ramGiB ?? undefined,
      diskGiB: diskGiB ?? 100,
      gpuInterconnect: body.gpuInterconnect ?? null,
      dedicated: body.dedicated,
    };
    const view = toViewQuote(quotePreset(preset, body.period));
    return NextResponse.json(view);
  }

  return NextResponse.json({error: 'kind must be compute or gpu'}, {status: 400});
}
