import {
  amountNumber,
  catalog,
  extractGpuCount,
  formatAsOf,
  formatRub,
  meterMatchesGpuFacet,
  type CatalogMeter,
  type GpuFacet,
  type PeriodMode,
} from '@/lib/catalog';
import {
  catalogHrefForLanding,
  featuredGpuLandings,
  type GpuLandingDef,
} from '@/data/gpu-landings';
import {catalogCompareScopeHint} from '@/lib/catalog/compare-disclaimer';

export type GpuOfferSummary = {
  meterId: string;
  provider: string;
  providerName: string;
  name: string;
  amountLabel: string;
  period: PeriodMode;
  gpuCount: number | null;
  synthetic: boolean;
  basis: 'только GPU' | 'целиком' | null;
};

export type GpuLandingStats = {
  asOfLabel: string;
  updatedLabel: string;
  offerCount: number;
  providerCount: number;
  /** Cheapest plausible single-GPU / card-oriented row (hourly). */
  cheapestSingle: GpuOfferSummary | null;
  /** Cheapest multi-GPU / node-ish row (monthly when source is month, else hour). */
  cheapestNode: GpuOfferSummary | null;
  catalogHref: string;
  scopeHint: string;
};

function gpuMetersForFacet(facet: Exclude<GpuFacet, 'all'>): CatalogMeter[] {
  return catalog.meters.filter(
    (m) => m.categoryKey === 'gpu' && meterMatchesGpuFacet(m, facet),
  );
}

function matchesQuery(meter: CatalogMeter, q: string | undefined): boolean {
  if (!q?.trim()) return true;
  const needle = q.trim().toLowerCase();
  const hay = `${meter.name} ${meter.sku} ${meter.dimensions.gpuModel ?? ''}`.toLowerCase();
  return hay.includes(needle);
}

function isSingleGpuOriented(meter: CatalogMeter): boolean {
  const count = extractGpuCount(meter);
  if (count != null && count > 1) return false;
  if (meter.unitQuantity === 'GPU') return true;
  if (count === 1) return true;
  // Avoid counting 4×/5× flavors as "one H100"
  if (count == null && meter.unitQuantity === 'flavor') {
    if (/\b[2-9]x\b|×\s*[2-9]|\b[2-9]\s*GPU\b|\b[2-9] GPU\b/i.test(meter.name)) return false;
  }
  return count === 1;
}

function isNodeOriented(meter: CatalogMeter): boolean {
  const count = extractGpuCount(meter);
  if (count != null && count >= 8) return true;
  if (/HGX|×\s*8|\b8x\b|\b8\s*GPU\b|выделенн/i.test(`${meter.name} ${meter.sku}`)) return true;
  return false;
}

/** Landing/UI money: 2 dp for ₽/час; whole rubles for ₽/мес (no «,00»). Catalog keeps finer precision. */
export function formatGpuUiAmount(value: number, period: PeriodMode): string {
  if (period === 'unit') return formatRub(value, 2);
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function toSummary(meter: CatalogMeter, period: PeriodMode): GpuOfferSummary | null {
  const amount = amountNumber(meter, period);
  if (amount == null || !(amount > 0)) return null;
  const basis =
    meter.pricingMode === 'bundle' || meter.unitQuantity === 'flavor'
      ? 'целиком'
      : meter.meter === 'compute.gpu'
        ? 'только GPU'
        : null;
  return {
    meterId: meter.id,
    provider: meter.provider,
    providerName: meter.providerName,
    name: meter.name,
    amountLabel: formatGpuUiAmount(amount, period),
    period,
    gpuCount: extractGpuCount(meter),
    synthetic: Boolean(meter.synthetic || meter.sku.includes('.synthetic')),
    basis,
  };
}

function pickCheapest(
  meters: CatalogMeter[],
  period: PeriodMode,
): GpuOfferSummary | null {
  let best: {meter: CatalogMeter; amount: number} | null = null;
  for (const meter of meters) {
    const amount = amountNumber(meter, period);
    if (amount == null || !(amount > 0)) continue;
    if (!best || amount < best.amount) best = {meter, amount};
  }
  return best ? toSummary(best.meter, period) : null;
}

export function buildGpuLandingStats(def: GpuLandingDef): GpuLandingStats {
  const facet = def.gpuFacet;
  const pool = facet
    ? gpuMetersForFacet(facet).filter((m) => matchesQuery(m, def.catalogQuery))
    : catalog.meters.filter((m) => m.categoryKey === 'gpu');

  const providers = new Set(pool.map((m) => m.provider));
  const singles = pool.filter(isSingleGpuOriented);
  const nodes = pool.filter(isNodeOriented);

  // Nodes often published monthly (dedicated); prefer month, fall back to hour.
  const cheapestNode =
    pickCheapest(nodes, 'month') ?? pickCheapest(nodes, 'unit') ?? null;
  const cheapestSingle = pickCheapest(singles, 'unit');

  return {
    asOfLabel: formatAsOf(catalog.asOf),
    updatedLabel: formatUpdatedRu(catalog.asOf),
    offerCount: pool.length,
    providerCount: providers.size,
    cheapestSingle,
    cheapestNode,
    catalogHref: catalogHrefForLanding(def),
    scopeHint: catalogCompareScopeHint(),
  };
}

export function hubGpuStats(): {
  asOfLabel: string;
  /** «25 июля 2026» for body-size meta lines. */
  updatedLabel: string;
  gpuOfferCount: number;
  providerCount: number;
  familyCards: {
    slug: string;
    shortTitle: string;
    catalogHref: string;
    offerCount: number;
    providerCount: number;
    fromLabel: string | null;
    fromProvider: string | null;
    preferNode: boolean;
    hubFacts: string[];
  }[];
  scopeHint: string;
} {
  const gpuAll = catalog.meters.filter((m) => m.categoryKey === 'gpu');
  const featured = featuredGpuLandings();
  const providerCount = new Set(gpuAll.map((m) => m.provider)).size;

  return {
    asOfLabel: formatAsOf(catalog.asOf),
    updatedLabel: formatUpdatedRu(catalog.asOf),
    gpuOfferCount: gpuAll.length,
    providerCount,
    scopeHint: catalogCompareScopeHint(),
    familyCards: featured.map((def) => {
      const stats = buildGpuLandingStats(def);
      const pick = def.preferNode
        ? stats.cheapestNode ?? stats.cheapestSingle
        : stats.cheapestSingle ?? stats.cheapestNode;
      const periodRu =
        pick?.period === 'month' ? 'мес' : pick?.period === 'year' ? 'год' : 'час';
      return {
        slug: def.slug,
        shortTitle: def.shortTitle,
        catalogHref: catalogHrefForLanding(def),
        offerCount: stats.offerCount,
        providerCount: stats.providerCount,
        fromLabel: pick ? `от ${pick.amountLabel}/${periodRu}` : null,
        fromProvider: pick?.providerName ?? null,
        preferNode: Boolean(def.preferNode),
        hubFacts: def.hubFacts,
      };
    }),
  };
}

export function periodWord(period: PeriodMode): string {
  if (period === 'month') return 'месяц';
  if (period === 'year') return 'год';
  return 'час';
}

/** Full Russian date for “обновлено …” lines (13–14px body, not captions). */
export function formatUpdatedRu(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d
    .toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})
    .replace(/\s*г\.?\s*$/u, '');
}
