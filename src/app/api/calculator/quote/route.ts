import {NextResponse} from 'next/server';
import {addPublicIpParts, quotePreset, toViewQuote} from '@/lib/calculator/quote';
import type {
  ComputeFamily,
  ComputePreset,
  DiskMedia,
  GpuPreset,
  PurchaseModel,
  VcpuShare,
} from '@/lib/calculator/presets';
import type {PeriodMode, ViewPresetQuote} from '@/lib/calculator/quote-view';
import {parseVcpuShare} from '@/lib/calculator/vcpu-share';

const PERIODS = new Set<PeriodMode>(['unit', 'month', 'year']);
const FAMILIES = new Set<ComputeFamily>(['low-cost', 'general', 'high-cpu', 'high-memory']);
const DISK_MEDIA = new Set<DiskMedia>(['ssd', 'hdd']);
const PURCHASE_MODELS = new Set<PurchaseModel>(['on-demand', 'preemptible']);

type ComputeBody = {
  kind: 'compute';
  period: PeriodMode;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  diskMedia?: DiskMedia;
  family?: ComputeFamily;
  vmCount?: number;
  /** Public IPv4 count; capped by vmCount. */
  publicIpCount?: number;
  purchaseModel?: PurchaseModel;
  vcpuShare?: VcpuShare;
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
  gpuMemoryGb?: number | null;
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
    if (vcpu > 256) {
      return NextResponse.json({error: 'vcpu too large'}, {status: 400});
    }
    if (vmCount > 64) {
      return NextResponse.json({error: 'vmCount too large'}, {status: 400});
    }
    if (diskGiB > 10240) {
      return NextResponse.json({error: 'diskGiB too large'}, {status: 400});
    }
    const rawIps = Number(body.publicIpCount ?? 0);
    const publicIpCount = Number.isFinite(rawIps)
      ? Math.min(Math.max(0, Math.round(rawIps)), vmCount)
      : 0;
    const family: ComputeFamily =
      body.family && FAMILIES.has(body.family) ? body.family : 'general';
    const diskMedia: DiskMedia =
      body.diskMedia && DISK_MEDIA.has(body.diskMedia) ? body.diskMedia : 'ssd';
    const purchaseModel: PurchaseModel =
      body.purchaseModel && PURCHASE_MODELS.has(body.purchaseModel)
        ? body.purchaseModel
        : 'on-demand';
    const vcpuShare: VcpuShare = parseVcpuShare(body.vcpuShare) ?? '100%';
    const diskLabel = diskMedia === 'hdd' ? 'HDD' : 'SSD';
    const preset: ComputePreset = {
      id: `adhoc-${family}-${vcpu}-${ramGiB}-${diskGiB}-${diskMedia}-${purchaseModel}-${vcpuShare}`,
      kind: 'compute',
      family,
      title: `${vcpu} / ${ramGiB}`,
      subtitle: `${vcpu} vCPU · ${ramGiB} GiB · ${diskGiB} GiB ${diskLabel}`,
      vcpu,
      ramGiB,
      diskGiB,
      diskMedia,
      purchaseModel,
      vcpuShare,
    };
    const view = addPublicIpParts(
      scaleQuote(toViewQuote(quotePreset(preset, body.period)), vmCount),
      publicIpCount,
      body.period,
    );
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
    const dedicated = body.dedicated === true;
    const gpuMemoryGb =
      typeof body.gpuMemoryGb === 'number' && Number.isFinite(body.gpuMemoryGb)
        ? body.gpuMemoryGb
        : undefined;
    const preset: GpuPreset = {
      id: `adhoc-gpu-${gpuModelMatch}-${gpuCount}${dedicated ? '-dedicated' : ''}`,
      kind: 'gpu',
      title: `${gpuModelMatch} ×${gpuCount}`,
      subtitle: 'Calculator ad-hoc GPU',
      gpuModelMatch,
      gpuCount,
      vcpu: vcpu ?? undefined,
      ramGiB: ramGiB ?? undefined,
      // Dedicated nodes have no cloud boot disk in the SKU — omit default 100 GiB.
      diskGiB: diskGiB ?? (dedicated ? undefined : 100),
      gpuInterconnect: body.gpuInterconnect ?? null,
      dedicated: dedicated || undefined,
      gpuMemoryGb: gpuMemoryGb ?? null,
    };
    const view = toViewQuote(quotePreset(preset, body.period));
    return NextResponse.json(view);
  }

  return NextResponse.json({error: 'kind must be compute or gpu'}, {status: 400});
}
