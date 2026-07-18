/**
 * Lexical + optional dense hybrid search over the price catalog.
 *
 * Hard structural filters (category / provider / gpu / ai / storage class) always
 * apply. Ranking is token overlap, optionally fused with Cloud.ru embeddings
 * (RRF) when `catalog-embeddings.generated.json` and an API key are available.
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
  isRequestMeter,
  CATEGORY_TITLE,
  type CatalogMeter,
  type CategoryKey,
} from '@/lib/catalog';
import {
  cosineSimilarity,
  embedQueryCached,
  hybridSearchReady,
  loadEmbeddingIndex,
  reciprocalRankFusion,
} from './embeddings';

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
  /** Object-storage meter kind when applicable. */
  meterKind?: 'capacity' | 'requests' | 'other';
  storageClass?: string | null;
};

export type SearchParams = {
  query?: string;
  category?: CategoryKey;
  provider?: string;
  gpuModel?: string;
  aiModel?: string;
  /** Hard filter by object-storage class: standard | warm | cold | ice | … */
  storageClass?: string;
  /**
   * Prefer capacity vs request meters for object storage.
   * Auto-detected from the query when omitted.
   */
  meterKind?: 'capacity' | 'requests';
  /** Optional volume for capacity estimates (binary GiB). */
  volumeGiB?: number;
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

export type VolumeEstimate = {
  provider: string;
  providerName: string;
  storageClass: string | null;
  rateGiBMonth: number;
  volumeGiB: number;
  totalMonth: number;
  sku: string;
  name: string;
};

export type PriceSearchResult = {
  /** Top-N rows, diversified so every matching provider is represented. */
  rows: PriceRow[];
  /** One entry per provider that actually offers a matching SKU, cheapest first. */
  providers: ProviderSummary[];
  totalMatches: number;
  /** Present when volumeGiB was requested and capacity rows matched. */
  volumeEstimates?: VolumeEstimate[];
  /** Effective structural filters after query inference. */
  applied?: {
    storageClass: string | null;
    meterKind: 'capacity' | 'requests' | null;
    volumeGiB: number | null;
    retrieval?: 'lexical' | 'hybrid';
  };
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

/**
 * Query → intended class (fallback when the tool call omits storageClass).
 * SKU filtering itself always uses dimensions.storageClass, never display name.
 * ASCII `\b` does not work around Cyrillic — use letter lookarounds.
 */
const STORAGE_CLASS_PATTERNS: {cls: string; re: RegExp}[] = [
  // icebox/hotbox before bare ice
  {cls: 'cold', re: /icebox|(?<![а-яёa-z])холодн\p{L}*|(?<![а-яёa-z])cold(?![а-яёa-z])/gu},
  {cls: 'standard', re: /hotbox|(?<![а-яёa-z])стандарт\p{L}*|(?<![а-яёa-z])standard(?![а-яёa-z])/gu},
  {cls: 'warm', re: /(?<![а-яёa-z])warm(?![а-яёa-z])|(?<![а-яёa-z])тепл\p{L}*/gu},
  {cls: 'ice', re: /(?<![а-яёa-z])ice(?![а-яёa-z])|(?<![а-яёa-z])ледян\p{L}*/gu},
];

/**
 * Class tokens in disclaimers («не смешивай с Cold/Ice») must not drive the filter.
 * Match a negation cue anywhere in a short window before the class token.
 */
const CLASS_NEGATION_WINDOW =
  /(?:не\s+(?:смешивай|смешивайте|путай|путайте|сравнивай|сравнивайте|включай|подставляй|бери|берите)|кроме|помимо|а\s+не|вместо)(?:(?![.!;?]).){0,48}$/iu;

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

/**
 * Infer intended storage class from the user question (NOT from SKU titles).
 * Prefer the explicit `storageClass` tool arg — that filters by SKU dimension.
 * Returns null when several classes appear positively (ambiguous) so we don't
 * hard-filter to the wrong one.
 */
export function detectStorageClass(query: string | undefined): string | null {
  if (!query) return null;
  const q = normalize(query);
  const positive = new Set<string>();
  for (const {cls, re} of STORAGE_CLASS_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(q)) !== null) {
      const before = q.slice(Math.max(0, match.index - 64), match.index);
      if (CLASS_NEGATION_WINDOW.test(before)) continue;
      positive.add(cls);
    }
  }
  if (positive.size !== 1) return null;
  return [...positive][0] ?? null;
}

/** Cyrillic-safe “word” check (JS `\b` is ASCII-only). */
function hasWord(q: string, stem: string): boolean {
  return new RegExp(`(?<![а-яёa-z])${stem}(?![а-яёa-z])`, 'u').test(q);
}

function detectMeterKind(
  query: string | undefined,
  explicit?: 'capacity' | 'requests',
): 'capacity' | 'requests' | null {
  if (explicit) return explicit;
  if (!query) return null;
  const q = normalize(query);
  if (
    hasWord(q, 'request') ||
    hasWord(q, 'requests') ||
    /(?<![а-яёa-z])операц\p{L}*/u.test(q) ||
    /(?<![а-яёa-z])запрос\p{L}*/u.test(q) ||
    hasWord(q, 'put') ||
    hasWord(q, 'get') ||
    hasWord(q, 'list') ||
    hasWord(q, 'head') ||
    hasWord(q, 'post')
  ) {
    return 'requests';
  }
  if (
    hasWord(q, 'gib') ||
    hasWord(q, 'tib') ||
    hasWord(q, 'tb') ||
    hasWord(q, 'gb') ||
    hasWord(q, 'гб') ||
    hasWord(q, 'тб') ||
    /(?<![а-яёa-z])терабайт\p{L}*/u.test(q) ||
    /(?<![а-яёa-z])гигабайт\p{L}*/u.test(q) ||
    /(?<![а-яёa-z])хранен\p{L}*/u.test(q) ||
    /(?<![а-яёa-z])емкост\p{L}*/u.test(q) ||
    /(?<![а-яёa-z])класс\p{L}*/u.test(q) ||
    hasWord(q, 'dwh') ||
    /(?<![а-яёa-z])данные/u.test(q) ||
    /(?<![а-яёa-z])объем\p{L}*/u.test(q) ||
    hasWord(q, 'бакет') ||
    hasWord(q, 'bucket') ||
    hasWord(q, 's3') ||
    hasWord(q, 'object') ||
    /(?<![а-яёa-z])объектн\p{L}*/u.test(q)
  ) {
    return 'capacity';
  }
  return null;
}

function objectMeterKind(meter: CatalogMeter): 'capacity' | 'requests' | 'other' {
  if (meter.meter === 'storage.object.capacity') return 'capacity';
  if (meter.meter === 'storage.object.requests' || isRequestMeter(meter)) return 'requests';
  return 'other';
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
    meterKind: objectMeterKind(m),
    storageClass: extractStorageClass(m),
  };
}

type Candidate = {
  meter: CatalogMeter;
  hay: string;
  row: PriceRow;
  lexical: number;
  id: string;
};

type ScoredRow = {row: PriceRow; score: number; rank: number; id: string};

const DENSE_TOP_K = 48;
const RRF_K = 60;

/** Comparable price for ranking (prefer month for capacity; ignore free zeros as "cheapest"). */
function rankPrice(row: PriceRow, preferCapacity: boolean): number {
  const primary =
    preferCapacity && row.month != null && Number.isFinite(row.month)
      ? row.month
      : row.hour != null && Number.isFinite(row.hour)
        ? row.hour
        : row.month != null && Number.isFinite(row.month)
          ? row.month
          : Number.POSITIVE_INFINITY;
  // Free request SKUs must not win "cheapest storage" comparisons.
  if (preferCapacity && primary === 0 && row.meterKind === 'requests') {
    return Number.POSITIVE_INFINITY;
  }
  return primary;
}

function isPreferredCheaper(a: PriceRow, b: PriceRow, preferCapacity: boolean): boolean {
  if (preferCapacity) {
    const aCap = a.meterKind === 'capacity';
    const bCap = b.meterKind === 'capacity';
    if (aCap !== bCap) return aCap;
  }
  return rankPrice(a, preferCapacity) < rankPrice(b, preferCapacity);
}

type FilterContext = {
  candidates: Candidate[];
  searchTokens: string[];
  storageClass: string | null;
  meterKind: 'capacity' | 'requests' | null;
  preferCapacity: boolean;
};

/** Hard-filter catalog meters and compute lexical overlap (may be 0). */
function collectCandidates(params: SearchParams): FilterContext {
  const entries = getIndex();

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
  const storageClass =
    params.storageClass?.trim().toLowerCase() || detectStorageClass(params.query);
  let meterKind = detectMeterKind(params.query, params.meterKind);
  const looksLikeObject =
    category === 'storage' ||
    searchTokens.some((t) =>
      ['storage.object', 's3', 'object', 'объектное', 'объектного', 'бакет', 'bucket'].includes(t),
    ) ||
    Boolean(storageClass);
  if (!meterKind && looksLikeObject) meterKind = 'capacity';

  const preferCapacity = meterKind === 'capacity';
  const candidates: Candidate[] = [];

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
    if (storageClass) {
      const cls = (extractStorageClass(meter) ?? '').toLowerCase();
      if (cls !== storageClass) continue;
    }
    if (meterKind === 'capacity' && objectMeterKind(meter) === 'requests') continue;
    if (meterKind === 'requests' && objectMeterKind(meter) === 'capacity') continue;

    let lexical = 0;
    for (const tok of searchTokens) {
      if (hay.includes(tok)) lexical += 1;
    }
    if (meter.synthetic) lexical -= 0.5;
    if (storageClass && hay.includes(storageClass)) lexical += 0.5;

    candidates.push({
      meter,
      hay,
      row: toRow(meter),
      lexical,
      id: meter.id,
    });
  }

  return {candidates, searchTokens, storageClass, meterKind, preferCapacity};
}

/** Lexical-only ranking (requires a token hit when the query has tokens). */
function rankLexical(ctx: FilterContext): ScoredRow[] {
  const scored: ScoredRow[] = [];
  for (const c of ctx.candidates) {
    if (ctx.searchTokens.length > 0 && c.lexical <= 0) continue;
    scored.push({
      row: c.row,
      score: c.lexical,
      rank: rankPrice(c.row, ctx.preferCapacity),
      id: c.id,
    });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rank - b.rank;
  });
  return scored;
}

/**
 * Hybrid: RRF(lexical ranks, dense ranks) over lexical hits ∪ top-K dense.
 * Falls back to lexical when embeddings/API unavailable.
 */
async function rankHybrid(ctx: FilterContext, query: string): Promise<{
  scored: ScoredRow[];
  retrieval: 'lexical' | 'hybrid';
}> {
  if (!query.trim() || !hybridSearchReady()) {
    return {scored: rankLexical(ctx), retrieval: 'lexical'};
  }
  const index = loadEmbeddingIndex();
  if (!index) return {scored: rankLexical(ctx), retrieval: 'lexical'};

  let queryVec: Float32Array;
  try {
    queryVec = await embedQueryCached(query);
  } catch {
    return {scored: rankLexical(ctx), retrieval: 'lexical'};
  }

  const denseScored = ctx.candidates
    .map((c) => {
      const vec = index.byId.get(c.id);
      const dense = vec ? cosineSimilarity(queryVec, vec) : -1;
      return {c, dense};
    })
    .filter((x) => x.dense >= 0)
    .sort((a, b) => b.dense - a.dense);

  const lexOrdered = [...ctx.candidates]
    .filter((c) => c.lexical > 0)
    .sort((a, b) => b.lexical - a.lexical);

  const denseTop = denseScored.slice(0, DENSE_TOP_K);
  const keep = new Map<string, Candidate>();
  for (const c of lexOrdered) keep.set(c.id, c);
  for (const {c} of denseTop) keep.set(c.id, c);
  if (!keep.size) return {scored: rankLexical(ctx), retrieval: 'lexical'};

  const lexRanks = lexOrdered.filter((c) => keep.has(c.id)).map((c) => c.id);
  const denseRanks = denseTop.filter((x) => keep.has(x.c.id)).map((x) => x.c.id);
  const fused = reciprocalRankFusion([lexRanks, denseRanks], RRF_K);
  const denseById = new Map(denseScored.map((x) => [x.c.id, x.dense]));

  const scored: ScoredRow[] = [...keep.values()].map((c) => ({
    row: c.row,
    score: fused.get(c.id) ?? 0,
    rank: rankPrice(c.row, ctx.preferCapacity),
    id: c.id,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = denseById.get(a.id) ?? 0;
    const db = denseById.get(b.id) ?? 0;
    if (db !== da) return db - da;
    return a.rank - b.rank;
  });
  return {scored, retrieval: 'hybrid'};
}

function buildResult(
  scored: ScoredRow[],
  storageClass: string | null,
  meterKind: 'capacity' | 'requests' | null,
  preferCapacity: boolean,
  volumeGiB: number | null,
  limit: number,
  retrieval: 'lexical' | 'hybrid',
): PriceSearchResult {
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
      if (isPreferredCheaper(row, existing.cheapest, preferCapacity)) {
        existing.cheapest = row;
      }
    }
  }
  const providers = [...byProvider.values()].sort(
    (a, b) => rankPrice(a.cheapest, preferCapacity) - rankPrice(b.cheapest, preferCapacity),
  );

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

  let volumeEstimates: VolumeEstimate[] | undefined;
  if (volumeGiB != null) {
    volumeEstimates = providers
      .filter((p) => p.cheapest.meterKind === 'capacity' && p.cheapest.month != null)
      .map((p) => {
        const rate = p.cheapest.month as number;
        return {
          provider: p.provider,
          providerName: p.providerName,
          storageClass: p.cheapest.storageClass ?? null,
          rateGiBMonth: Math.round(rate * 1e6) / 1e6,
          volumeGiB,
          totalMonth: Math.round(rate * volumeGiB * 100) / 100,
          sku: p.cheapest.sku,
          name: p.cheapest.name,
        };
      })
      .sort((a, b) => a.totalMonth - b.totalMonth);
  }

  return {
    rows,
    providers,
    totalMatches: scored.length,
    ...(volumeEstimates ? {volumeEstimates} : {}),
    applied: {storageClass, meterKind, volumeGiB, retrieval},
  };
}

/**
 * Synchronous lexical search (tests / ground truth without embedding API).
 */
export function searchPricesDetailed(params: SearchParams): PriceSearchResult {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 40);
  const ctx = collectCandidates(params);
  const volumeGiB =
    typeof params.volumeGiB === 'number' && Number.isFinite(params.volumeGiB) && params.volumeGiB > 0
      ? params.volumeGiB
      : null;
  return buildResult(
    rankLexical(ctx),
    ctx.storageClass,
    ctx.meterKind,
    ctx.preferCapacity,
    volumeGiB,
    limit,
    'lexical',
  );
}

/**
 * Hybrid search when embeddings + API key are available; otherwise lexical.
 * Used by the chat tool path.
 */
export async function searchPricesDetailedAsync(
  params: SearchParams,
): Promise<PriceSearchResult> {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 40);
  const ctx = collectCandidates(params);
  const volumeGiB =
    typeof params.volumeGiB === 'number' && Number.isFinite(params.volumeGiB) && params.volumeGiB > 0
      ? params.volumeGiB
      : null;
  const query = typeof params.query === 'string' ? params.query : '';
  const {scored, retrieval} = await rankHybrid(ctx, query);
  return buildResult(
    scored,
    ctx.storageClass,
    ctx.meterKind,
    ctx.preferCapacity,
    volumeGiB,
    limit,
    retrieval,
  );
}

/** Sync lexical rows (tests). */
export function searchPrices(params: SearchParams): PriceRow[] {
  return searchPricesDetailed(params).rows;
}

/** Async hybrid rows for the assistant tool. */
export async function searchPricesAsync(params: SearchParams): Promise<PriceRow[]> {
  return (await searchPricesDetailedAsync(params)).rows;
}
