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
  extractAiModelKey,
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
  /** Kubernetes control-plane: basic (zonal) | ha (regional) | fixed-component | null. */
  k8sTier?: string | null;
  /** Kubernetes: synthetic-bundle | native-bundle | native-fixed | null. */
  k8sClass?: string | null;
  /** True for derived VK/Yandex 2 vCPU / 4 GiB master bundles. */
  synthetic?: boolean;
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
    /** When set, kubernetes search preferred zonal (basic) or HA masters. */
    k8sTier?: 'basic' | 'ha';
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

/** "Qwen 3.6" / "qwen3.6-35b-a3b" → qwen36… for cross-provider matching. */
export function compactAiModelId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Match AI model across naming variants:
 * "Qwen 3.6" ↔ "Qwen3.6-35B-A3B" ↔ "qwen3.6-35b-a3b".
 */
export function aiModelMatchesNeedle(
  needle: string,
  meter: CatalogMeter,
  hay: string,
): boolean {
  const n = compactAiModelId(needle);
  if (n.length < 3) return false;
  const family = compactAiModelId(extractAiModelFamily(meter) ?? '');
  const id = compactAiModelId(extractAiModelKey(meter) ?? '');
  const blob = compactAiModelId(hay);
  return family.includes(n) || id.includes(n) || blob.includes(n);
}

/** Infer "Qwen 3.6" / "GLM 5.2" from free text when tool omits aiModel. */
export function detectAiModelNeedle(query: string | undefined): string | null {
  if (!query) return null;
  const q = normalize(query);
  const spaced = q.match(
    /\b(qwen|glm|gigachat|deepseek|gemma|kimi|yandexgpt|alice|gpt-oss)\s+([0-9]+(?:[.\-][0-9]+)*)\b/i,
  );
  if (spaced) return `${spaced[1]} ${spaced[2].replace(/-/g, '.')}`;
  const glued = q.match(/\b(qwen|glm|gigachat|deepseek)(\d+(?:\.\d+)+)/i);
  if (glued) return `${glued[1]} ${glued[2]}`;
  return null;
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

function k8sComparabilityClass(meter: CatalogMeter): string | null {
  const v = meter.dimensions?.comparabilityClass;
  return typeof v === 'string' && v ? v : null;
}

/** Unit rates that must not win «Managed Kubernetes» master comparisons. */
function isK8sUnitComponent(meter: CatalogMeter): boolean {
  if (meter.categoryKey !== 'kubernetes') return false;
  if (/\.(vcpu|ram)$/i.test(meter.meter)) return true;
  const q = (meter.unitQuantity ?? '').toLowerCase();
  return q === 'vcpu' || q === 'gib-ram' || q === 'gib';
}

/**
 * Control-plane SKU suitable for cross-provider master comparison.
 * Excludes Yandex 0₽ fixed-component and per-vCPU/RAM rates.
 */
export function isK8sComparableMaster(
  meter: CatalogMeter,
  tier: 'basic' | 'ha' = 'basic',
): boolean {
  if (meter.categoryKey !== 'kubernetes') return false;
  if (isK8sUnitComponent(meter)) return false;
  if (meter.comparableTier === 'fixed-component') return false;
  if (k8sComparabilityClass(meter) === 'fixed-component') return false;
  const isMaster =
    meter.unitQuantity === 'master' || meter.meter === 'containers.kubernetes.control-plane';
  if (!isMaster) return false;
  if (tier === 'ha') return meter.comparableTier === 'ha';
  return meter.comparableTier === 'basic';
}

function detectKubernetesTier(query: string | undefined): 'basic' | 'ha' {
  if (!query) return 'basic';
  const q = normalize(query);
  if (
    /\bha\b/.test(q) ||
    q.includes('regional') ||
    q.includes('региональ') ||
    q.includes('отказоустойчив') ||
    q.includes('fault') ||
    q.includes('high availability') ||
    q.includes('3 master') ||
    q.includes('три мастер')
  ) {
    return 'ha';
  }
  return 'basic';
}

function wantsK8sUnitComponents(query: string | undefined): boolean {
  if (!query) return false;
  const q = normalize(query);
  return (
    q.includes('vcpu') ||
    q.includes('гигабайт ram') ||
    /\bram\b/.test(q) ||
    q.includes('за ядро') ||
    q.includes('за vcpu') ||
    q.includes('компонент') ||
    q.includes('ставку')
  );
}

function looksLikeKubernetesQuery(
  category: CategoryKey | null,
  searchTokens: string[],
  query: string | undefined,
): boolean {
  if (category === 'kubernetes') return true;
  const q = normalize(query ?? '');
  if (q.includes('kubernetes') || q.includes('кубер') || q.includes('k8s')) return true;
  return searchTokens.some((t) =>
    ['kubernetes', 'k8s', 'кубер', 'кубернетес', 'мастер', 'master', 'кластер'].includes(t),
  );
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
    k8sTier: m.categoryKey === 'kubernetes' ? m.comparableTier : null,
    k8sClass: m.categoryKey === 'kubernetes' ? k8sComparabilityClass(m) : null,
    synthetic: m.synthetic || undefined,
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

function isK8sComparableRow(row: PriceRow, tier: 'basic' | 'ha'): boolean {
  if (row.category !== 'kubernetes') return false;
  if (row.k8sTier === 'fixed-component') return false;
  if (row.k8sClass === 'fixed-component') return false;
  if (tier === 'ha') return row.k8sTier === 'ha';
  return row.k8sTier === 'basic';
}

function isPreferredCheaper(
  a: PriceRow,
  b: PriceRow,
  preferCapacity: boolean,
  k8sTier: 'basic' | 'ha' | null,
): boolean {
  if (preferCapacity) {
    const aCap = a.meterKind === 'capacity';
    const bCap = b.meterKind === 'capacity';
    if (aCap !== bCap) return aCap;
  }
  if (k8sTier) {
    const aOk = isK8sComparableRow(a, k8sTier);
    const bOk = isK8sComparableRow(b, k8sTier);
    if (aOk !== bOk) return aOk;
  }
  return rankPrice(a, preferCapacity) < rankPrice(b, preferCapacity);
}

type FilterContext = {
  candidates: Candidate[];
  searchTokens: string[];
  storageClass: string | null;
  meterKind: 'capacity' | 'requests' | null;
  preferCapacity: boolean;
  k8sTier: 'basic' | 'ha' | null;
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
  const aiModel =
    params.aiModel?.trim().toLowerCase() || detectAiModelNeedle(params.query) || null;
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
  const k8sContext = looksLikeKubernetesQuery(category, searchTokens, params.query);
  const k8sTier = k8sContext ? detectKubernetesTier(params.query) : null;
  const k8sComparableOnly = Boolean(k8sContext && k8sTier && !wantsK8sUnitComponents(params.query));
  const candidates: Candidate[] = [];

  for (const {meter, hay} of entries) {
    if (category && meter.categoryKey !== category) continue;
    if (providerFilter && meter.provider !== providerFilter) continue;
    if (gpuModel) {
      const gm = (extractGpuModel(meter) ?? '').toLowerCase();
      if (!gm.includes(gpuModel) && !hay.includes(gpuModel)) continue;
    }
    if (aiModel && !aiModelMatchesNeedle(aiModel, meter, hay)) continue;
    if (storageClass) {
      const cls = (extractStorageClass(meter) ?? '').toLowerCase();
      if (cls !== storageClass) continue;
    }
    if (meterKind === 'capacity' && objectMeterKind(meter) === 'requests') continue;
    if (meterKind === 'requests' && objectMeterKind(meter) === 'capacity') continue;

    // Default Managed Kubernetes compare: only zonal/HA master SKUs, not unit rates or 0₽ фикс.
    if (k8sComparableOnly && meter.categoryKey === 'kubernetes') {
      if (!isK8sComparableMaster(meter, k8sTier ?? 'basic')) continue;
    }

    let lexical = 0;
    for (const tok of searchTokens) {
      if (hay.includes(tok)) lexical += 1;
    }
    // Synthetic GPU/other demotion; for k8s the 2/4 bundles ARE the comparable masters.
    if (meter.synthetic && !k8sContext) lexical -= 0.5;
    if (storageClass && hay.includes(storageClass)) lexical += 0.5;
    if (k8sTier && isK8sComparableMaster(meter, k8sTier)) lexical += 1.5;
    if (aiModel && aiModelMatchesNeedle(aiModel, meter, hay)) lexical += 1.5;

    candidates.push({
      meter,
      hay,
      row: toRow(meter),
      lexical,
      id: meter.id,
    });
  }

  return {candidates, searchTokens, storageClass, meterKind, preferCapacity, k8sTier};
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
  k8sTier: 'basic' | 'ha' | null = null,
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
      if (isPreferredCheaper(row, existing.cheapest, preferCapacity, k8sTier)) {
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
    applied: {
      storageClass,
      meterKind,
      volumeGiB,
      retrieval,
      ...(k8sTier ? {k8sTier} : {}),
    },
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
    ctx.k8sTier,
  );
}

/**
 * Hard dimension filters already narrow the set; skip the query-embedding RTT
 * and rank lexically inside that set (paraphrase rescue matters most without filters).
 */
function skipHybridForHardFilters(params: SearchParams, ctx: FilterContext): boolean {
  if (ctx.storageClass) return true;
  if (typeof params.gpuModel === 'string' && params.gpuModel.trim()) return true;
  if (typeof params.aiModel === 'string' && params.aiModel.trim()) return true;
  return false;
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
  if (skipHybridForHardFilters(params, ctx)) {
    return buildResult(
      rankLexical(ctx),
      ctx.storageClass,
      ctx.meterKind,
      ctx.preferCapacity,
      volumeGiB,
      limit,
      'lexical',
      ctx.k8sTier,
    );
  }
  const {scored, retrieval} = await rankHybrid(ctx, query);
  return buildResult(
    scored,
    ctx.storageClass,
    ctx.meterKind,
    ctx.preferCapacity,
    volumeGiB,
    limit,
    retrieval,
    ctx.k8sTier,
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
