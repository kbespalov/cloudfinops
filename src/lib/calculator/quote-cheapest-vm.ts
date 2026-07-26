/**
 * Per-provider cheapest *orderable full VM* (vCPU+RAM+boot disk), not unit
 * components. Scans a small economy lattice of shapes × share × purchase × disk.
 */
import {quotePreset, type ProviderQuote} from '@/lib/calculator/quote';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import type {
  ComputeFamily,
  ComputePreset,
  DiskMedia,
  PurchaseModel,
} from '@/lib/calculator/presets';
import type {VcpuShare} from '@/lib/calculator/vcpu-share';
import {catalog} from '@/lib/catalog';

export type CheapestVmCandidate = {
  provider: string;
  providerName: string;
  total: number;
  period: PeriodMode;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  diskMedia: DiskMedia;
  purchaseModel: PurchaseModel;
  vcpuShare: VcpuShare;
  family: ComputeFamily;
  /** Core / flavor meter name. */
  computeName: string;
  note: string | null;
  parts: {label: string; amount: number}[];
};

export type CheapestVmPerProviderResult = {
  currency: 'RUB';
  vatIncluded: true;
  period: PeriodMode;
  periodNote: string;
  diskGiB: number;
  publicIpCount: number;
  mode: 'cheapest-per-provider';
  note: string;
  /** Sorted ascending by total. */
  quotes: CheapestVmCandidate[];
  best: CheapestVmCandidate | null;
};

const SHAPES: Array<{vcpu: number; ramGiB: number}> = [
  {vcpu: 1, ramGiB: 1},
  {vcpu: 1, ramGiB: 2},
  {vcpu: 2, ramGiB: 2},
  {vcpu: 2, ramGiB: 4},
  {vcpu: 4, ramGiB: 4},
  {vcpu: 4, ramGiB: 8},
];

const SHARES: VcpuShare[] = ['10%', '30%', '5%', '20%', '50%', '100%'];
const PURCHASES: PurchaseModel[] = ['preemptible', 'on-demand'];
const DISKS: DiskMedia[] = ['hdd', 'ssd'];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCandidate(
  q: ProviderQuote,
  period: PeriodMode,
  shape: {vcpu: number; ramGiB: number},
  diskGiB: number,
  diskMedia: DiskMedia,
  purchaseModel: PurchaseModel,
  vcpuShare: VcpuShare,
): CheapestVmCandidate {
  const core = q.meters[0];
  return {
    provider: q.provider,
    providerName: q.providerName,
    total: round(q.total),
    period,
    vcpu: shape.vcpu,
    ramGiB: shape.ramGiB,
    diskGiB,
    diskMedia,
    purchaseModel,
    vcpuShare,
    family: 'low-cost',
    computeName: core?.name ?? 'compute',
    note: q.note,
    parts: q.parts.map((p) => ({label: p.label, amount: round(p.amount)})),
  };
}

/**
 * For each catalog provider, find the cheapest launchable full VM in the
 * economy lattice (min shapes, fractional shares, spot, cheap boot disk).
 */
export function quoteCheapestVmPerProvider(options?: {
  period?: PeriodMode;
  diskGiB?: number;
  publicIpCount?: number;
}): CheapestVmPerProviderResult {
  const period: PeriodMode = options?.period ?? 'month';
  const diskGiB = Math.max(10, Math.round(options?.diskGiB ?? 10));
  const publicIpCount = Math.max(0, Math.round(options?.publicIpCount ?? 0));

  const best = new Map<string, CheapestVmCandidate>();

  for (const shape of SHAPES) {
    for (const vcpuShare of SHARES) {
      for (const purchaseModel of PURCHASES) {
        for (const diskMedia of DISKS) {
          const preset: ComputePreset = {
            id: `cheapest-${shape.vcpu}-${shape.ramGiB}-${vcpuShare}-${purchaseModel}-${diskMedia}`,
            kind: 'compute',
            family: 'low-cost',
            title: `${shape.vcpu}/${shape.ramGiB}`,
            subtitle: '',
            vcpu: shape.vcpu,
            ramGiB: shape.ramGiB,
            diskGiB,
            diskMedia,
            purchaseModel,
            vcpuShare,
          };
          const result = quotePreset(preset, period);
          for (const q of result.quotes) {
            const next = toCandidate(
              q,
              period,
              shape,
              diskGiB,
              diskMedia,
              purchaseModel,
              vcpuShare,
            );
            const cur = best.get(q.provider);
            if (!cur || next.total < cur.total) best.set(q.provider, next);
          }
        }
      }
    }
  }

  // Ensure we only report known catalog providers (stable names/order by price).
  const providerIds = new Set(catalog.providers.map((p) => p.id));
  const quotes = [...best.values()]
    .filter((q) => providerIds.has(q.provider))
    .sort((a, b) => a.total - b.total || a.providerName.localeCompare(b.providerName, 'ru'));

  return {
    currency: 'RUB',
    vatIncluded: true,
    period,
    periodNote:
      period === 'month' ? 'месяц = 720 ч' : period === 'year' ? 'год = 8640 ч' : 'цена за час',
    diskGiB,
    publicIpCount,
    mode: 'cheapest-per-provider',
    note:
      'У каждого провайдера — своя самая дешёвая *полноценная* ВМ из каталога (vCPU+RAM+системный диск), не unit-компоненты. Конфигурации могут различаться (доля vCPU, preemptible, HDD/SSD): это нормально для «минимума, который можно запустить». Preemptible/долевые помечены в note. Публичный IP не включён, пока не запрошен. НДС вкл.',
    quotes,
    best: quotes[0] ?? null,
  };
}
