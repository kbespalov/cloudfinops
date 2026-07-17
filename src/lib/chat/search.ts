/**
 * Lexical / structural search over the price catalog for the AI assistant.
 *
 * The corpus (`catalog.meters`) is small and highly structured, so we index a
 * normalized searchable string per meter and score by token overlap, with
 * hard structural filters (category / provider / gpu / ai model). No embeddings.
 */

import {
  catalog,
  displayMeterName,
  paramsLabel,
  billingUnitLabel,
  amountNumber,
  extractGpuModel,
  extractAiModelFamily,
  extractStorageClass,
  formatPlatform,
  CATEGORY_TITLE,
  type CatalogMeter,
  type CategoryKey,
} from '@/lib/catalog';

export type PriceRow = {
  sku: string;
  provider: string;
  providerName: string;
  category: CategoryKey;
  categoryTitle: string;
  name: string;
  config: string;
  unit: string;
  /** Prices in RUB, VAT included, normalized period. `null` when not applicable. */
  hour: number | null;
  month: number | null;
  year: number | null;
  note: string | null;
};

export type SearchParams = {
  query?: string;
  category?: CategoryKey;
  provider?: string;
  gpuModel?: string;
  aiModel?: string;
  limit?: number;
};

export type ProviderSummary = {
  provider: string;
  providerName: string;
  /** Cheapest matching row for this provider (across ALL matches, not just top-N). */
  cheapest: PriceRow;
  /** How many matching SKUs this provider has for the query. */
  count: number;
};

export type PriceSearchResult = {
  /** Top-N rows, diversified so every matching provider is represented. */
  rows: PriceRow[];
  /** One entry per provider that actually offers a matching SKU, cheapest first. */
  providers: ProviderSummary[];
  totalMatches: number;
};

/** Map free-text provider mentions (RU/EN) to catalog provider ids. */
const PROVIDER_SYNONYMS: Record<string, string> = {
  сбер: 'cloud-ru',
  сбербанк: 'cloud-ru',
  сбертех: 'cloud-ru',
  'cloud.ru': 'cloud-ru',
  cloudru: 'cloud-ru',
  клауд: 'cloud-ru',
  эволюшн: 'cloud-ru',
  evolution: 'cloud-ru',
  яндекс: 'yandex-cloud',
  yandex: 'yandex-cloud',
  ycloud: 'yandex-cloud',
  вк: 'vk-cloud',
  vk: 'vk-cloud',
  mail: 'vk-cloud',
  селектел: 'selectel',
  selectel: 'selectel',
  мтс: 'mws-cloud',
  мвс: 'mws-cloud',
  mws: 'mws-cloud',
  mts: 'mws-cloud',
  т1: 't1-cloud',
  t1: 't1-cloud',
  ростелеком: 't1-cloud',
};

/** Expand a token into extra searchable tokens (RU concept → catalog term). */
const TERM_SYNONYMS: Record<string, string[]> = {
  видеокарта: ['gpu'],
  видеокарты: ['gpu'],
  гпу: ['gpu'],
  графический: ['gpu'],
  ускоритель: ['gpu'],
  гигачат: ['gigachat'],
  диск: ['storage.block', 'disk'],
  диски: ['storage.block', 'disk'],
  хранилище: ['storage'],
  обжект: ['storage.object'],
  s3: ['storage.object'],
  bucket: ['storage.object'],
  бакет: ['storage.object'],
  трафик: ['network', 'egress'],
  egress: ['network'],
  сеть: ['network'],
  ядро: ['vcpu'],
  ядра: ['vcpu'],
  ядер: ['vcpu'],
  процессор: ['vcpu'],
  цпу: ['vcpu'],
  cpu: ['vcpu'],
  память: ['ram'],
  озу: ['ram'],
  рам: ['ram'],
  кубер: ['kubernetes'],
  кубернетес: ['kubernetes'],
  k8s: ['kubernetes'],
  инференс: ['ai'],
  инференса: ['ai'],
  токен: ['ai'],
  токены: ['ai'],
  токенов: ['ai'],
  нейросеть: ['ai'],
  ллм: ['ai'],
  llm: ['ai'],
};

type IndexEntry = {meter: CatalogMeter; hay: string};

let index: IndexEntry[] | null = null;

function buildHay(m: CatalogMeter): string {
  const dimVals = Object.values(m.dimensions)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ');
  return [
    displayMeterName(m),
    m.name,
    m.sku,
    m.meter,
    m.provider,
    m.providerName,
    m.category,
    m.categoryKey,
    m.cpuPlatformFamily ?? '',
    formatPlatform(m.cpuPlatformFamily) ?? '',
    extractGpuModel(m) ?? '',
    extractAiModelFamily(m) ?? '',
    extractStorageClass(m) ?? '',
    m.notes ?? '',
    dimVals,
  ]
    .join(' ')
    .toLowerCase();
}

function getIndex(): IndexEntry[] {
  if (!index) {
    index = catalog.meters.map((meter) => ({meter, hay: buildHay(meter)}));
  }
  return index;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}.\-]+/gu, ' ')
    .trim();
}

function toRow(m: CatalogMeter): PriceRow {
  return {
    sku: m.sku,
    provider: m.provider,
    providerName: m.providerName,
    category: m.categoryKey,
    categoryTitle: CATEGORY_TITLE[m.categoryKey],
    name: displayMeterName(m),
    config: paramsLabel(m),
    unit: billingUnitLabel(m),
    hour: amountNumber(m, 'unit'),
    month: amountNumber(m, 'month'),
    year: amountNumber(m, 'year'),
    note: m.notes,
  };
}

type ScoredRow = {row: PriceRow; score: number; hour: number};

/** Cheapest-comparable price for ranking (hour, else month, else +inf). */
function rankPrice(row: PriceRow): number {
  if (row.hour != null && Number.isFinite(row.hour)) return row.hour;
  if (row.month != null && Number.isFinite(row.month)) return row.month;
  return Number.POSITIVE_INFINITY;
}

/** Score + filter all matching rows, sorted by score desc then price asc. */
function matchRows(params: SearchParams): ScoredRow[] {
  const entries = getIndex();

  // Provider filter: explicit param wins, else inferred from query synonyms.
  let providerFilter = params.provider?.trim().toLowerCase() || null;

  const rawTokens = params.query ? normalize(params.query).split(/\s+/).filter(Boolean) : [];
  const tokens = new Set<string>();
  for (const tok of rawTokens) {
    if (PROVIDER_SYNONYMS[tok]) {
      if (!providerFilter) providerFilter = PROVIDER_SYNONYMS[tok];
      continue;
    }
    tokens.add(tok);
    for (const extra of TERM_SYNONYMS[tok] ?? []) tokens.add(extra.toLowerCase());
  }
  const searchTokens = [...tokens].filter((t) => t.length >= 2);

  const category = params.category ?? null;
  const gpuModel = params.gpuModel?.trim().toLowerCase() || null;
  const aiModel = params.aiModel?.trim().toLowerCase() || null;

  const scored: {row: PriceRow; score: number; hour: number}[] = [];

  for (const {meter, hay} of entries) {
    if (category && meter.categoryKey !== category) continue;
    if (providerFilter && meter.provider !== providerFilter) continue;
    if (gpuModel) {
      const gm = (extractGpuModel(meter) ?? '').toLowerCase();
      if (!gm.includes(gpuModel) && !hay.includes(gpuModel)) continue;
    }
    if (aiModel) {
      const am = (extractAiModelFamily(meter) ?? '').toLowerCase();
      if (!am.includes(aiModel) && !hay.includes(aiModel)) continue;
    }

    let score = 0;
    for (const tok of searchTokens) {
      if (hay.includes(tok)) score += 1;
    }

    // Require at least one lexical hit when a free-text query was given.
    if (searchTokens.length > 0 && score === 0) continue;

    // De-emphasize synthetic composite rows so real SKUs surface first.
    if (meter.synthetic) score -= 0.5;

    const row = toRow(meter);
    scored.push({row, score, hour: rankPrice(row)});
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.hour - b.hour;
  });

  return scored;
}

/**
 * Full search result: diversified top-N rows plus a per-provider summary so the
 * consumer always knows exactly which providers offer a match (and never has to
 * guess or invent them). Structural params act as hard filters.
 */
export function searchPricesDetailed(params: SearchParams): PriceSearchResult {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 40);
  const scored = matchRows(params);

  // Per-provider summary across ALL matches (cheapest row wins), price asc.
  const byProvider = new Map<string, ProviderSummary>();
  for (const {row} of scored) {
    const existing = byProvider.get(row.provider);
    if (!existing) {
      byProvider.set(row.provider, {
        provider: row.provider,
        providerName: row.providerName,
        cheapest: row,
        count: 1,
      });
    } else {
      existing.count += 1;
      if (rankPrice(row) < rankPrice(existing.cheapest)) existing.cheapest = row;
    }
  }
  const providers = [...byProvider.values()].sort(
    (a, b) => rankPrice(a.cheapest) - rankPrice(b.cheapest),
  );

  // Diversify top-N: guarantee each matching provider appears at least once
  // (first occurrence in global order), then fill remaining slots by rank.
  const seen = new Set<string>();
  const primary: ScoredRow[] = [];
  const rest: ScoredRow[] = [];
  for (const s of scored) {
    if (!seen.has(s.row.provider)) {
      seen.add(s.row.provider);
      primary.push(s);
    } else {
      rest.push(s);
    }
  }
  const rows = [...primary, ...rest].slice(0, limit).map((s) => s.row);

  return {rows, providers, totalMatches: scored.length};
}

/**
 * Search the catalog. Returns compact rows ranked by lexical overlap, then
 * by price ascending, diversified across providers. Structural params filter.
 */
export function searchPrices(params: SearchParams): PriceRow[] {
  return searchPricesDetailed(params).rows;
}
