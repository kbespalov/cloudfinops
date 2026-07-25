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
  type GpuLandingSlug,
} from '@/data/gpu-landings';
import {catalogCompareScopeHint} from '@/lib/catalog/compare-disclaimer';
import {INFERENCE_MODELS} from '@/data/inference-models';
import {detectModelFamily, type ModelFamily} from '@/lib/calculator/model-family';
import {selfHostCalculatorUrl} from '@/lib/calculator/self-host-links';

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

/** Compact catalog teaser column (not a full SKU list). */
export type CatalogTeaserBucket = {
  title: string;
  price: string | null;
  meta: string;
};

export type GpuLandingStats = {
  asOfLabel: string;
  updatedLabel: string;
  offerCount: number;
  providerCount: number;
  /** Cheapest card-only / unit GPU (hourly). */
  cheapestSingle: GpuOfferSummary | null;
  /** Cheapest 1× GPU + host flavor (hourly). */
  cheapestHost: GpuOfferSummary | null;
  /** Cheapest multi-GPU / node-ish row (monthly when source is month, else hour). */
  cheapestNode: GpuOfferSummary | null;
  /** Three teaser columns for the catalog invite. */
  teaserBuckets: CatalogTeaserBucket[];
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

function isGpuOnly(meter: CatalogMeter): boolean {
  return (
    isSingleGpuOriented(meter) &&
    (meter.meter === 'compute.gpu' || meter.unitQuantity === 'GPU') &&
    meter.pricingMode !== 'bundle'
  );
}

function isGpuHost(meter: CatalogMeter): boolean {
  return isSingleGpuOriented(meter) && !isGpuOnly(meter);
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

function providerSummary(meters: CatalogMeter[], limit = 2): string {
  const names = [...new Set(meters.map((m) => m.providerName))];
  if (names.length === 0) return 'нет в срезе';
  if (names.length <= limit) return names.join(', ');
  return 'несколько провайдеров';
}

function priceFrom(offer: GpuOfferSummary | null): string | null {
  if (!offer) return null;
  const periodRu =
    offer.period === 'month' ? 'мес' : offer.period === 'year' ? 'год' : 'час';
  return `от ${offer.amountLabel}/${periodRu}`;
}

/** Human labels for the two hero price columns. */
export function heroPriceTitles(def: GpuLandingDef): {single: string; node: string} {
  const family = def.shortTitle.replace(/^HGX\s+/i, '');
  return {
    single: `Одна ${family}`,
    node: `Сервер 8× ${family}`,
  };
}

export function formatHeroOfferLine(offer: GpuOfferSummary | null): {
  price: string;
  meta: string;
} | null {
  if (!offer) return null;
  const periodRu =
    offer.period === 'month' ? 'мес' : offer.period === 'year' ? 'год' : 'час';
  const format =
    offer.gpuCount != null && offer.gpuCount >= 8
      ? 'выделенный узел'
      : offer.basis === 'только GPU'
        ? 'только GPU'
        : 'GPU + хост';
  return {
    price: `от ${offer.amountLabel}/${periodRu}`,
    meta: `${offer.providerName} · ${format}`,
  };
}

function buildTeaserBuckets(
  def: GpuLandingDef,
  gpuOnly: CatalogMeter[],
  gpuHost: CatalogMeter[],
  nodes: CatalogMeter[],
  cheapestSingle: GpuOfferSummary | null,
  cheapestHost: GpuOfferSummary | null,
  cheapestNode: GpuOfferSummary | null,
): CatalogTeaserBucket[] {
  const family = def.shortTitle.replace(/^HGX\s+/i, '');
  return [
    {
      title: 'Отдельная GPU',
      price: priceFrom(cheapestSingle),
      meta: providerSummary(gpuOnly),
    },
    {
      title: 'GPU с хостом',
      price: priceFrom(cheapestHost),
      meta: cheapestHost ? 'готовая конфигурация' : 'нет в срезе',
    },
    {
      title: `Сервер 8× ${family}`,
      price: priceFrom(cheapestNode),
      meta: cheapestNode ? 'выделенный узел' : nodes.length ? 'несколько конфигураций' : 'нет в срезе',
    },
  ];
}

export function buildGpuLandingStats(def: GpuLandingDef): GpuLandingStats {
  const facet = def.gpuFacet;
  const pool = facet
    ? gpuMetersForFacet(facet).filter((m) => matchesQuery(m, def.catalogQuery))
    : catalog.meters.filter((m) => m.categoryKey === 'gpu');

  const providers = new Set(pool.map((m) => m.provider));
  const gpuOnly = pool.filter(isGpuOnly);
  const gpuHost = pool.filter(isGpuHost);
  const nodes = pool.filter(isNodeOriented);
  const singles = pool.filter(isSingleGpuOriented);

  const cheapestNode =
    pickCheapest(nodes, 'month') ?? pickCheapest(nodes, 'unit') ?? null;
  const cheapestSingle =
    pickCheapest(gpuOnly, 'unit') ?? pickCheapest(singles, 'unit');
  const cheapestHost = pickCheapest(gpuHost, 'unit');

  return {
    asOfLabel: formatAsOf(catalog.asOf),
    updatedLabel: formatUpdatedRu(catalog.asOf),
    offerCount: pool.length,
    providerCount: providers.size,
    cheapestSingle,
    cheapestHost,
    cheapestNode,
    teaserBuckets: buildTeaserBuckets(
      def,
      gpuOnly,
      gpuHost,
      nodes,
      cheapestSingle,
      cheapestHost,
      cheapestNode,
    ),
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

/** Calculator GPU family token for a landing page. */
export function inferenceGpuFamilyForLanding(def: Pick<GpuLandingDef, 'slug'>): string | null {
  const map: Record<GpuLandingSlug, string> = {
    h200: 'H200',
    'h200-nvl': 'H200',
    'hgx-h200': 'H200',
    h100: 'H100',
    a100: 'A100',
    b300: 'B300',
    'hgx-b300': 'B300',
    l40s: 'L40S',
    l4: 'L4',
  };
  return map[def.slug] ?? null;
}

export type GpuShowcaseModel = {
  id: string;
  name: string;
  /** Compact recipe, e.g. «8× · FP8». */
  note: string;
  href: string;
  family: ModelFamily;
};

/**
 * Curated showcase order per calculator GPU family.
 * Only models with a real `recommended` recipe for that family are shown.
 */
const SHOWCASE_BY_GPU: Record<string, readonly string[]> = {
  H200: [
    'glm-5.2',
    'kimi-k2.6',
    'qwen-3.8',
    'deepseek-v3',
    'gpt-oss-120b',
    'qwen3-235b',
    'qwen3-coder-next',
  ],
  H100: [
    'glm-4.6-357b',
    'deepseek-v3',
    'qwen3-235b',
    'qwen3-coder-next',
    'gpt-oss-120b',
    'kimi-k2.6',
    'llama-3.3-70b',
  ],
  A100: [
    'qwen3-32b',
    'llama-3.3-70b',
    'gpt-oss-120b',
    'glm-4.6-357b',
    'mixtral-8x22b',
    'qwen3.6-35b-a3b',
    'gemma-3-27b',
  ],
  B300: ['qwen-3.8', 'kimi-k3', 'glm-5.2', 'deepseek-v3'],
  L40S: [
    'qwen3-32b',
    'llama-3.3-70b',
    'gemma-3-27b',
    'mistral-small-24b',
    'gpt-oss-20b',
    'deepseek-r1-distill-32b',
  ],
  L4: [
    'qwen3-8b',
    'qwen3-32b',
    'gpt-oss-20b',
    'gemma-3-27b',
    'mistral-small-24b',
    'phi-4',
    'deepseek-r1-distill-32b',
  ],
};

function quantLabel(quant: string): string {
  return quant.toUpperCase();
}

/**
 * Compact LLM examples that fit this GPU family (from inference recipes).
 * One lab per slot first; curated order per GPU shelf.
 */
export function showcaseModelsForLanding(
  def: Pick<GpuLandingDef, 'slug' | 'preferNode'>,
  limit = 5,
): GpuShowcaseModel[] {
  const family = inferenceGpuFamilyForLanding(def);
  if (!family) return [];

  const preferNode = Boolean(def.preferNode);
  const order = SHOWCASE_BY_GPU[family] ?? [];
  type Cand = {
    id: string;
    name: string;
    note: string;
    href: string;
    family: ModelFamily;
    priority: number;
  };
  const byId = new Map<string, Cand>();

  for (const model of INFERENCE_MODELS) {
    if ((model.modality ?? 'llm') !== 'llm') continue;
    if (model.deployment === 'api-only') continue;
    const recipes = model.recommended.filter((r) => r.gpuFamily === family);
    if (!recipes.length) continue;
    // Prefer 8× on HGX/dedicated landings; else primary recipe for the family.
    const recipe =
      (preferNode ? recipes.find((r) => r.gpuCount >= 8) : null) ?? recipes[0]!;
    const prio = order.indexOf(model.id);
    byId.set(model.id, {
      id: model.id,
      name: model.displayName,
      note: `${recipe.gpuCount}× · ${quantLabel(recipe.quant)}`,
      href: selfHostCalculatorUrl({model: model.displayName, quant: recipe.quant}),
      family: detectModelFamily(model.displayName),
      priority: prio === -1 ? 900 + byId.size : prio,
    });
  }

  const cands = [...byId.values()].sort((a, b) => a.priority - b.priority);
  const out: GpuShowcaseModel[] = [];
  const seenFamilies = new Set<ModelFamily>();

  for (const c of cands) {
    if (out.length >= limit) break;
    if (seenFamilies.has(c.family)) continue;
    seenFamilies.add(c.family);
    out.push({id: c.id, name: c.name, note: c.note, href: c.href, family: c.family});
  }
  // Fill if a shelf has few labs (e.g. B300).
  if (out.length < limit) {
    for (const c of cands) {
      if (out.length >= limit) break;
      if (out.some((x) => x.id === c.id)) continue;
      out.push({id: c.id, name: c.name, note: c.note, href: c.href, family: c.family});
    }
  }
  return out;
}
