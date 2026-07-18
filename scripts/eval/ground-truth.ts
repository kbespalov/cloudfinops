/**
 * Deterministic ground truth + grading utilities for the chat eval.
 *
 * The "correct answer" is derived by calling the SAME tools the assistant has
 * (search_prices / get_quote) with canonical parameters, then extracting the
 * authoritative facts: which providers actually offer the thing, and which is
 * cheapest at what price. The assistant is graded on whether its free-text
 * answer is faithful to those facts (no invented providers, right cheapest).
 */
import {runToolSync} from '../../src/lib/chat/tools';

export type ProviderId =
  | 'yandex-cloud'
  | 'vk-cloud'
  | 'cloud-ru'
  | 't1-cloud'
  | 'selectel'
  | 'mws-cloud';

export const ALL_PROVIDERS: ProviderId[] = [
  'yandex-cloud',
  'vk-cloud',
  'cloud-ru',
  't1-cloud',
  'selectel',
  'mws-cloud',
];

/** Regexes to detect a provider mention in free text (RU/EN + common variants). */
const PROVIDER_PATTERNS: Record<ProviderId, RegExp> = {
  'yandex-cloud': /yandex|яндекс/i,
  'vk-cloud': /\bvk\b|vk[\s.\-‑]*cloud|вк[\s-]*cloud|\bвк\b/i,
  'cloud-ru': /cloud[\s.\-‑]*ru|клауд|эволюц|evolution|сбер/i,
  't1-cloud': /\bt1\b|\bт1\b|t1[\s.\-‑]*cloud/i,
  selectel: /selectel|селектел/i,
  'mws-cloud': /\bmws\b|мтс|\bмвс\b|mws[\s.\-‑]*cloud/i,
};

export function detectProviders(text: string): Set<ProviderId> {
  const out = new Set<ProviderId>();
  for (const id of ALL_PROVIDERS) {
    if (PROVIDER_PATTERNS[id].test(text)) out.add(id);
  }
  return out;
}

/**
 * A clause is a "negative" mention if it disclaims availability. NOTE: JS `\b`
 * is ASCII-only and does NOT work around Cyrillic words, so we use explicit
 * non-letter lookarounds for standalone Cyrillic tokens like «нет».
 */
const NEGATION_RE =
  /не\s+(предлаг|имеет|имеют|представлен|прода[её]т|продают|поддержив|располаг|публику|предоставл|поставля|да[её]т|дают|входит|входят|нашл|найден|раскрыв|указан)|отсутств|(?<![а-яёa-z])нет(?![а-яёa-z])|такой\s+модел|такого\s+gpu|такую\s+модел|за\s+исключением|(?<![а-яё])кроме(?![а-яё])|помимо|остальны|прочи|другие\s+провайдер|не\s+в\s+каталоге|в\s+каталоге\s+нет|ни\s+у\s+кого/iu;

/** Clause boundaries that separate a positive claim from a trailing disclaimer. */
const CLAUSE_SPLIT_RE =
  /(?<=[.;•])\s+|(?=(?:други[ех]|остальны[ех]|прочи[ех]|кроме|помимо|у\s+остальных|у\s+других))/iu;

/**
 * Providers the answer POSITIVELY claims offer the thing. Line-based polarity:
 * a provider counts only if it appears in a non-negation line (table row / prose
 * that asserts availability), not in a disclaimer like "остальные не предлагают".
 * This avoids punishing the desired behavior of naming who does NOT have it.
 */
/** Restrictive markers: only providers AFTER these are being asserted to offer it. */
const ONLY_RE = /(?<!не\s)(?:только|лишь|исключительно)/i;

export function detectClaimedProviders(text: string): Set<ProviderId> {
  const claimed = new Set<ProviderId>();
  const negativeOnly = new Set<ProviderId>();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    // Split a line further at strong clause boundaries so "только X; другие Y не..."
    // separates the positive clause from the negative one.
    const clauses = rawLine.split(CLAUSE_SPLIT_RE);
    for (const clause of clauses) {
      if (!clause.trim()) continue;
      const negative = NEGATION_RE.test(clause);
      // Handle "(<universe list>) только <X> предлагает": providers before the
      // restrictive marker are the enumerated universe, NOT a positive claim.
      let scanText = clause;
      let preText = '';
      const onlyMatch = ONLY_RE.exec(clause);
      if (onlyMatch) {
        const after = clause.slice(onlyMatch.index);
        // Only a provider-restrictor if a PROVIDER name follows "только"
        // (avoids "только GPU"/"только хост" which are price-kind descriptors).
        const restrictsProvider = ALL_PROVIDERS.some((id) => PROVIDER_PATTERNS[id].test(after));
        if (restrictsProvider) {
          scanText = after;
          preText = clause.slice(0, onlyMatch.index);
        }
      }
      for (const id of ALL_PROVIDERS) {
        const inScan = PROVIDER_PATTERNS[id].test(scanText);
        const inPre = preText ? PROVIDER_PATTERNS[id].test(preText) : false;
        if (!inScan && !inPre) continue;
        if (negative) {
          if (!claimed.has(id)) negativeOnly.add(id);
          continue;
        }
        if (inScan) {
          claimed.add(id);
          negativeOnly.delete(id);
        } else if (inPre && !claimed.has(id)) {
          // Listed only in the pre-"только" universe enumeration → not a claim.
          negativeOnly.add(id);
        }
      }
    }
  }
  return claimed;
}

/** Does `text` contain the numeric `value` in any reasonable RU formatting? */
export function containsNumber(text: string, value: number | null): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  const stripped = text.replace(/[\s\u00a0\u202f\u2009]/g, '');
  const fixed2 = value.toFixed(2);
  const candidates = new Set<string>([
    fixed2,
    fixed2.replace('.', ','),
    fixed2.replace(/\.00$/, ''),
    String(Math.round(value)),
  ]);
  // For fractional small prices also try 4 decimals and 1 decimal.
  if (value < 100) {
    candidates.add(value.toFixed(4));
    candidates.add(value.toFixed(4).replace('.', ','));
    candidates.add(value.toFixed(1));
    candidates.add(value.toFixed(1).replace('.', ','));
    candidates.add(value.toFixed(3));
  }
  for (const c of candidates) {
    if (!c) continue;
    // Integer match only trusted for larger magnitudes (avoid coincidental digits).
    if (!c.includes('.') && !c.includes(',') && value < 100) continue;
    if (stripped.includes(c.replace(/[\s]/g, ''))) return true;
  }
  return false;
}

export type ToolResultShape = {
  providersMatched?: {provider: string; cheapest?: {provider?: string; hour?: number | null; month?: number | null; year?: number | null}}[];
  quotes?: {provider: string; total: number | null}[];
  best?: {provider: string; total: number | null} | null;
  volumeEstimates?: {provider: string; providerName?: string; totalMonth: number; rateGiBMonth?: number}[];
};

export type Truth = {
  allowed: Set<ProviderId>;
  /** cheapest provider id + price for the relevant period. */
  cheapestProvider: ProviderId | null;
  cheapestPrice: number | null;
  raw: ToolResultShape;
};

function mapProviderName(name: string): ProviderId | null {
  const n = name.toLowerCase();
  if (n.includes('yandex')) return 'yandex-cloud';
  if (n.includes('vk')) return 'vk-cloud';
  if (n.includes('cloud.ru') || n === 'cloud.ru') return 'cloud-ru';
  if (n.includes('t1')) return 't1-cloud';
  if (n.includes('selectel')) return 'selectel';
  if (n.includes('mws')) return 'mws-cloud';
  return null;
}

/** Compute ground truth for a search-style question. `period`: hour|month. */
export function truthFromSearch(
  params: Record<string, unknown>,
  period: 'hour' | 'month' = 'hour',
): Truth {
  // Lexical-only sync path — hybrid must not change goldens.
  const raw = JSON.parse(runToolSync('search_prices', JSON.stringify(params))) as ToolResultShape;
  const allowed = new Set<ProviderId>();
  let cheapestProvider: ProviderId | null = null;
  let cheapestPrice: number | null = null;
  let bestVal = Number.POSITIVE_INFINITY;
  for (const p of raw.providersMatched ?? []) {
    const id = mapProviderName(p.provider);
    if (!id) continue;
    allowed.add(id);
    const price = period === 'month' ? p.cheapest?.month ?? p.cheapest?.hour : p.cheapest?.hour ?? p.cheapest?.month;
    // Ignore non-positive (free / metadata) rows when picking the cheapest paid option.
    if (price != null && Number.isFinite(price) && price > 0 && price < bestVal) {
      bestVal = price;
      cheapestProvider = id;
      cheapestPrice = price;
    }
  }
  return {allowed, cheapestProvider, cheapestPrice, raw};
}

/** Compute ground truth for a get_quote-style question. */
export function truthFromQuote(params: Record<string, unknown>): Truth {
  const raw = JSON.parse(runToolSync('get_quote', JSON.stringify(params))) as ToolResultShape;
  const allowed = new Set<ProviderId>();
  for (const q of raw.quotes ?? []) {
    const id = mapProviderName(q.provider);
    if (id) allowed.add(id);
  }
  let cheapestProvider: ProviderId | null = null;
  let cheapestPrice: number | null = null;
  if (raw.best) {
    cheapestProvider = mapProviderName(raw.best.provider);
    cheapestPrice = raw.best.total ?? null;
  }
  return {allowed, cheapestProvider, cheapestPrice, raw};
}

/**
 * Ground truth for object-storage volume estimates (capacity × GiB).
 * Uses search_prices with storageClass + volumeGiB; cheapest = min totalMonth.
 */
export function truthFromObjectStorageVolume(params: {
  storageClass: string;
  volumeGiB: number;
  query?: string;
}): Truth {
  const raw = JSON.parse(
    runToolSync(
      'search_prices',
      JSON.stringify({
        query: params.query ?? `объектное хранилище ${params.storageClass}`,
        category: 'storage',
        storageClass: params.storageClass,
        meterKind: 'capacity',
        volumeGiB: params.volumeGiB,
        limit: 30,
      }),
    ),
  ) as ToolResultShape;
  const allowed = new Set<ProviderId>();
  let cheapestProvider: ProviderId | null = null;
  let cheapestPrice: number | null = null;
  let bestVal = Number.POSITIVE_INFINITY;
  for (const e of raw.volumeEstimates ?? []) {
    const id = mapProviderName(e.providerName ?? e.provider);
    if (!id) continue;
    allowed.add(id);
    if (Number.isFinite(e.totalMonth) && e.totalMonth > 0 && e.totalMonth < bestVal) {
      bestVal = e.totalMonth;
      cheapestProvider = id;
      cheapestPrice = e.totalMonth;
    }
  }
  // Fallback to unit rates if estimates missing.
  if (!allowed.size) {
    return truthFromSearch(
      {
        query: params.query ?? `объектное хранилище ${params.storageClass}`,
        category: 'storage',
        storageClass: params.storageClass,
        meterKind: 'capacity',
        limit: 30,
      },
      'month',
    );
  }
  return {allowed, cheapestProvider, cheapestPrice, raw};
}

export type Grade = {
  hallucinated: ProviderId[];
  missing: ProviderId[];
  recall: number;
  cheapestProviderOk: boolean;
  cheapestPriceOk: boolean;
  /** No invented providers. */
  noHalluc: boolean;
  /** Overall per-question pass: no hallucination AND cheapest provider right. */
  pass: boolean;
};

export function grade(answer: string, truth: Truth): Grade {
  const detected = detectClaimedProviders(answer);
  const hallucinated = [...detected].filter((p) => !truth.allowed.has(p));
  const missing = [...truth.allowed].filter((p) => !detected.has(p));
  const recall = truth.allowed.size ? (truth.allowed.size - missing.length) / truth.allowed.size : 1;
  const cheapestProviderOk = truth.cheapestProvider ? detected.has(truth.cheapestProvider) : true;
  const cheapestPriceOk = containsNumber(answer, truth.cheapestPrice);
  const noHalluc = hallucinated.length === 0;
  const pass = noHalluc && cheapestProviderOk && (truth.allowed.size === 0 || recall >= 0.5);
  return {hallucinated, missing, recall, cheapestProviderOk, cheapestPriceOk, noHalluc, pass};
}
