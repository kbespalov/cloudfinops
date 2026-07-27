/**
 * Cross-category market snapshot on comparable baskets.
 * Aggregates unit prices / card rates / master / S3 — no invented ₽.
 */

import {compareUnitPrice} from './analytics';
import {searchPricesDetailed} from './search';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {pickK8sMasterMeter} from '@/lib/calculator/lakehouse-quote';
import {
  CALCULATOR_PROVIDER_IDS,
  CALCULATOR_PROVIDER_NAMES,
  type CalculatorProviderId,
} from '@/lib/calculator/quote-view';
import {amountNumber} from '@/lib/catalog';

export type MarketRadarItem =
  | 'vcpu'
  | 'ram'
  | 'ssd'
  | 'nvme'
  | 'gpu_h100'
  | 's3_standard'
  | 'k8s_basic';

export type MarketRadarArgs = {
  /** Subset of baskets. Default = core FinOps mix. */
  basket?: MarketRadarItem[];
  /** outliers focuses on spread; snapshot is the default ranking view. */
  mode?: 'snapshot' | 'outliers';
};

type ProviderPoint = {
  provider: string;
  providerId: string;
  monthlyRub: number;
  unitLabel: string;
  note?: string;
};

export type MarketRadarSeries = {
  id: MarketRadarItem;
  title: string;
  unitLabel: string;
  providers: ProviderPoint[];
  stats: {
    count: number;
    min: number;
    max: number;
    median: number;
    spreadMaxVsMinPct: number;
    cheapest: {provider: string; monthlyRub: number};
    dearest: {provider: string; monthlyRub: number};
  } | null;
  outliers: Array<{
    provider: string;
    monthlyRub: number;
    vsMedianPct: number;
    side: 'cheap' | 'expensive';
  }>;
  insight: string;
};

export type MarketRadarResult = {
  ok: boolean;
  mode: 'snapshot' | 'outliers';
  basket: MarketRadarItem[];
  series: MarketRadarSeries[];
  highlights: string[];
  currency: 'RUB';
  vatIncluded: true;
  catalogAsOf: string;
  note: string;
  error?: string;
};

const DEFAULT_BASKET: MarketRadarItem[] = [
  'vcpu',
  'ram',
  'ssd',
  'gpu_h100',
  's3_standard',
  'k8s_basic',
];

const ALL_ITEMS: MarketRadarItem[] = [
  'vcpu',
  'ram',
  'ssd',
  'nvme',
  'gpu_h100',
  's3_standard',
  'k8s_basic',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function buildStats(points: ProviderPoint[]): MarketRadarSeries['stats'] {
  if (!points.length) return null;
  const values = points.map((p) => p.monthlyRub);
  const minP = [...points].sort((a, b) => a.monthlyRub - b.monthlyRub)[0]!;
  const maxP = [...points].sort((a, b) => b.monthlyRub - a.monthlyRub)[0]!;
  const med = medianOf(values)!;
  return {
    count: points.length,
    min: round2(minP.monthlyRub),
    max: round2(maxP.monthlyRub),
    median: round2(med),
    spreadMaxVsMinPct: round2(((maxP.monthlyRub - minP.monthlyRub) / minP.monthlyRub) * 100),
    cheapest: {provider: minP.provider, monthlyRub: round2(minP.monthlyRub)},
    dearest: {provider: maxP.provider, monthlyRub: round2(maxP.monthlyRub)},
  };
}

function outliersOf(
  points: ProviderPoint[],
  median: number,
  thresholdPct = 35,
): MarketRadarSeries['outliers'] {
  const out: MarketRadarSeries['outliers'] = [];
  for (const p of points) {
    if (!(median > 0)) continue;
    const vs = ((p.monthlyRub - median) / median) * 100;
    if (Math.abs(vs) < thresholdPct) continue;
    out.push({
      provider: p.provider,
      monthlyRub: round2(p.monthlyRub),
      vsMedianPct: round2(vs),
      side: vs > 0 ? 'expensive' : 'cheap',
    });
  }
  return out.sort((a, b) => Math.abs(b.vsMedianPct) - Math.abs(a.vsMedianPct));
}

function seriesFromUnit(
  id: MarketRadarItem,
  title: string,
  component: 'vcpu' | 'ram' | 'ssd',
  diskMedia?: 'ssd' | 'nvme',
): MarketRadarSeries {
  const unit = compareUnitPrice(component, diskMedia ? {diskMedia} : undefined);
  const points: ProviderPoint[] = [];
  for (const p of unit.providers ?? []) {
    const month =
      p.priceMonth ?? (p.priceHour != null ? p.priceHour * 720 : null);
    if (month == null || !(month > 0)) continue;
    points.push({
      provider: p.providerName,
      providerId: p.provider,
      monthlyRub: round2(month),
      unitLabel: component === 'ssd' ? '₽/GiB·мес' : component === 'vcpu' ? '₽/vCPU·мес' : '₽/GiB RAM·мес',
      note: typeof p.coreType === 'string' ? p.coreType : undefined,
    });
  }
  // Include derived flavors as marked estimates (same table spirit as compare_unit_price).
  for (const d of unit.derivedFromFlavors ?? []) {
    const month = d.month ?? (d.hour != null ? d.hour * 720 : null);
    if (month == null || !(month > 0)) continue;
    if (points.some((x) => x.providerId === d.provider)) continue;
    points.push({
      provider: d.providerName,
      providerId: d.provider,
      monthlyRub: round2(month),
      unitLabel: component === 'ssd' ? '₽/GiB·мес' : component === 'vcpu' ? '₽/vCPU·мес' : '₽/GiB RAM·мес',
      note: 'оценка (*)',
    });
  }
  points.sort((a, b) => a.monthlyRub - b.monthlyRub);
  const stats = buildStats(points);
  const outliers = stats ? outliersOf(points, stats.median) : [];
  const insight = stats
    ? `Дешевле всех ${stats.cheapest.provider} (${stats.cheapest.monthlyRub}); медиана ${stats.median}; разброс max/min ${stats.spreadMaxVsMinPct}%.`
    : 'Нет сопоставимых ставок.';
  return {
    id,
    title,
    unitLabel: points[0]?.unitLabel ?? '₽/мес',
    providers: points,
    stats,
    outliers,
    insight,
  };
}

function seriesGpuH100(): MarketRadarSeries {
  const hit = searchPricesDetailed({
    category: 'gpu',
    gpuModel: 'H100',
    query: 'H100',
    limit: 40,
  });
  const points: ProviderPoint[] = [];
  for (const p of hit.providers) {
    const month = p.cheapest.month;
    if (month == null || !(month > 0)) continue;
    // Skip GB-GPU share rows if they somehow win.
    const hay = `${p.cheapest.name} ${p.cheapest.unit} ${p.cheapest.config}`;
    if (/GB-GPU|1\s*GB\s*GPU/i.test(hay)) continue;
    points.push({
      provider: p.providerName,
      providerId: p.cheapest.provider,
      monthlyRub: round2(month),
      unitLabel: '₽/мес card-only (или flavor)',
      note: p.cheapest.config || undefined,
    });
  }
  points.sort((a, b) => a.monthlyRub - b.monthlyRub);
  const stats = buildStats(points);
  const outliers = stats ? outliersOf(points, stats.median) : [];
  return {
    id: 'gpu_h100',
    title: 'GPU H100 (card / flavor floor)',
    unitLabel: '₽/мес',
    providers: points,
    stats,
    outliers,
    insight: stats
      ? `H100 floor: ${stats.cheapest.provider} ${stats.cheapest.monthlyRub} ₽; медиана ${stats.median}. Card-only ≠ полный хост.`
      : 'H100 не найден в каталоге.',
  };
}

function seriesS3Standard(): MarketRadarSeries {
  const hit = searchPricesDetailed({
    category: 'storage',
    storageClass: 'standard',
    meterKind: 'capacity',
    query: 'object storage standard',
    volumeGiB: 1024,
    limit: 40,
  });
  const points: ProviderPoint[] = [];
  for (const est of hit.volumeEstimates ?? []) {
    if (!(est.totalMonth > 0)) continue;
    points.push({
      provider: est.providerName,
      providerId: est.provider,
      monthlyRub: round2(est.totalMonth),
      unitLabel: '₽/мес за 1 TiB Standard',
      note: est.storageClass || 'standard',
    });
  }
  // Fallback: per-GiB × 1024 from providersMatched
  if (!points.length) {
    for (const p of hit.providers) {
      const perGiB = p.cheapest.month;
      if (perGiB == null || !(perGiB > 0)) continue;
      points.push({
        provider: p.providerName,
        providerId: p.cheapest.provider,
        monthlyRub: round2(perGiB * 1024),
        unitLabel: '₽/мес за 1 TiB Standard',
      });
    }
  }
  points.sort((a, b) => a.monthlyRub - b.monthlyRub);
  const stats = buildStats(points);
  const outliers = stats ? outliersOf(points, stats.median) : [];
  return {
    id: 's3_standard',
    title: 'Object Storage Standard · 1 TiB',
    unitLabel: '₽/мес',
    providers: points,
    stats,
    outliers,
    insight: stats
      ? `S3 Standard 1 TiB: ${stats.cheapest.provider} ${stats.cheapest.monthlyRub} ₽; медиана ${stats.median}.`
      : 'Standard capacity не найден.',
  };
}

function seriesK8sBasic(): MarketRadarSeries {
  const points: ProviderPoint[] = [];
  for (const id of CALCULATOR_PROVIDER_IDS) {
    const picked = pickK8sMasterMeter(id, 'basic');
    if (!picked) continue;
    const month = amountNumber(picked.meter, 'month');
    if (month == null || !(month > 0)) continue;
    const vcpu = Number(picked.meter.dimensions.vcpu);
    const ram = Number(picked.meter.dimensions.ramGiB ?? picked.meter.dimensions.ramGb);
    const shape =
      Number.isFinite(vcpu) && Number.isFinite(ram) && vcpu > 0
        ? `${vcpu}/${ram}`
        : 'native-fixed';
    points.push({
      provider: CALCULATOR_PROVIDER_NAMES[id as CalculatorProviderId],
      providerId: id,
      monthlyRub: round2(month),
      unitLabel: '₽/мес control plane',
      note: `default basic ${shape}${picked.synthetic ? ' (synthetic)' : ''}`,
    });
  }
  points.sort((a, b) => a.monthlyRub - b.monthlyRub);
  const stats = buildStats(points);
  const outliers = stats ? outliersOf(points, stats.median) : [];
  return {
    id: 'k8s_basic',
    title: 'Managed Kubernetes master · basic default',
    unitLabel: '₽/мес',
    providers: points,
    stats,
    outliers,
    insight: stats
      ? `K8s basic default: ${stats.cheapest.provider} ${stats.cheapest.monthlyRub} ₽; формы у провайдеров разные — не card-only сравнение.`
      : 'Мастера не найдены.',
  };
}

function buildSeries(id: MarketRadarItem): MarketRadarSeries {
  switch (id) {
    case 'vcpu':
      return seriesFromUnit('vcpu', 'Compute · 1 vCPU on-demand 100%', 'vcpu');
    case 'ram':
      return seriesFromUnit('ram', 'Compute · 1 GiB RAM', 'ram');
    case 'ssd':
      return seriesFromUnit('ssd', 'Block disk · 1 GiB SSD', 'ssd', 'ssd');
    case 'nvme':
      return seriesFromUnit('nvme', 'Block disk · 1 GiB NVMe', 'ssd', 'nvme');
    case 'gpu_h100':
      return seriesGpuH100();
    case 's3_standard':
      return seriesS3Standard();
    case 'k8s_basic':
      return seriesK8sBasic();
  }
}

export function marketRadar(args: MarketRadarArgs = {}): MarketRadarResult {
  const mode = args.mode === 'outliers' ? 'outliers' : 'snapshot';
  const raw = args.basket?.length ? args.basket : DEFAULT_BASKET;
  const basket = raw.filter((x): x is MarketRadarItem => ALL_ITEMS.includes(x as MarketRadarItem));
  if (!basket.length) {
    return {
      ok: false,
      mode,
      basket: [],
      series: [],
      highlights: [],
      currency: 'RUB',
      vatIncluded: true,
      catalogAsOf: catalogAsOfIso(),
      note: '',
      error: 'Пустая корзина. Допустимо: vcpu, ram, ssd, nvme, gpu_h100, s3_standard, k8s_basic.',
    };
  }

  const series = basket.map(buildSeries);
  const highlights: string[] = [];
  for (const s of series) {
    if (!s.stats) continue;
    highlights.push(`${s.id}: cheapest ${s.stats.cheapest.provider} (${s.stats.cheapest.monthlyRub})`);
    if (mode === 'outliers' && s.outliers[0]) {
      const o = s.outliers[0];
      highlights.push(
        `${s.id} outlier: ${o.provider} ${o.side} ${o.vsMedianPct > 0 ? '+' : ''}${o.vsMedianPct}% vs median`,
      );
    }
  }

  return {
    ok: series.some((s) => s.stats != null),
    mode,
    basket,
    series: series.map((s) =>
      mode === 'outliers'
        ? s
        : {
            ...s,
            // Keep payload compact for snapshot mode.
            outliers: s.outliers.slice(0, 3),
            providers: s.providers.slice(0, 8),
          },
    ),
    highlights: highlights.slice(0, 12),
    currency: 'RUB',
    vatIncluded: true,
    catalogAsOf: catalogAsOfIso(),
    note: 'Сопоставимые корзины; GPU card-only ≠ хост; K8s defaults разных форм. Цены только из каталога. Не смешивай unit ₽/vCPU с полной ВМ.',
  };
}
