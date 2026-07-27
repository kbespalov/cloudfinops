/** Price deltas for exact peer comparison — zero-baseline safe. */

export type PriceDelta =
  | {kind: 'best'; pct: 0}
  | {kind: 'above'; pct: number}
  /** Prefer ×N when baseline is near-zero and % would look absurd. */
  | {kind: 'times'; times: number}
  | {kind: 'equal-free'}
  | {kind: 'free-vs-paid'}
  | {kind: 'unavailable'; reason: 'zero-baseline' | 'invalid-price'};

/** Minimum among finite non-negative amounts; null if none. */
export function bestAmount(amounts: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const a of amounts) {
    if (typeof a !== 'number' || !Number.isFinite(a) || a < 0) continue;
    if (best == null || a < best) best = a;
  }
  return best;
}

export function medianAmount(amounts: number[]): number | null {
  const vals = amounts.filter((a) => Number.isFinite(a) && a >= 0).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid]! : (vals[mid - 1]! + vals[mid]!) / 2;
}

/** Above this % vs best, show ×N instead of +N% (near-zero anchors). */
const PERCENT_TO_TIMES_THRESHOLD = 500;

/**
 * Delta of `amount` vs `best`.
 * Zero baseline never yields Infinity percent; tiny baselines switch to ×N.
 */
export function priceDeltaVsBest(amount: number, best: number): PriceDelta | null {
  if (!Number.isFinite(amount) || !Number.isFinite(best) || amount < 0 || best < 0) return null;
  if (best === 0 && amount === 0) return {kind: 'equal-free'};
  if (best === 0 && amount > 0) return {kind: 'free-vs-paid'};
  if (best <= 0) return {kind: 'unavailable', reason: 'zero-baseline'};
  if (amount <= best) return {kind: 'best', pct: 0};
  const ratio = amount / best;
  const pct = Math.round((ratio - 1) * 100);
  if (pct <= 0) return {kind: 'best', pct: 0};
  if (pct >= PERCENT_TO_TIMES_THRESHOLD) {
    const times = Math.round(ratio * 10) / 10;
    return {kind: 'times', times: Math.max(times, 1.1)};
  }
  return {kind: 'above', pct};
}

/**
 * Legacy helper for simple lists. Prefer buildExactPriceComparison for find-similar.
 * Empty map when fewer than two priced rows.
 */
export function buildPriceDeltaById(
  rows: Array<{id: string; amount: number | null}>,
): Map<string, PriceDelta> {
  const priced = rows.filter(
    (r): r is {id: string; amount: number} =>
      typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount >= 0,
  );
  if (priced.length < 2) return new Map();

  const best = bestAmount(priced.map((r) => r.amount));
  if (best == null) return new Map();

  const map = new Map<string, PriceDelta>();
  for (const r of priced) {
    const delta = priceDeltaVsBest(r.amount, best);
    if (delta) map.set(r.id, delta);
  }
  return map;
}

export type ExactPriceComparison = {
  providerCount: number;
  bestPrice: number | null;
  medianPrice: number | null;
  /** True when best is 0 ₽ — percent/median claims are not meaningful. */
  zeroBaseline: boolean;
  deltasByMeterId: Map<
    string,
    {
      vsBest: PriceDelta;
      vsMedianPct?: number;
    }
  >;
};

/**
 * Build comparison only from already-selected exact price-eligible peers
 * (one representative per provider, seed sticky). Caller must ensure seed is eligible.
 */
export function buildExactPriceComparison(
  rows: Array<{id: string; amount: number | null}>,
): ExactPriceComparison {
  const priced = rows.filter(
    (r): r is {id: string; amount: number} =>
      typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount >= 0,
  );
  const empty: ExactPriceComparison = {
    providerCount: priced.length,
    bestPrice: null,
    medianPrice: null,
    zeroBaseline: false,
    deltasByMeterId: new Map(),
  };
  if (priced.length < 2) return empty;

  const amounts = priced.map((r) => r.amount);
  const best = bestAmount(amounts);
  if (best == null) return empty;
  const zeroBaseline = best === 0;
  // When someone is free, median of paid peers is optional diagnostics only (not shown as %).
  const medianPool = zeroBaseline ? amounts.filter((a) => a > 0) : amounts;
  const median = medianPool.length >= 3 ? medianAmount(medianPool) : null;

  const deltasByMeterId = new Map<string, {vsBest: PriceDelta; vsMedianPct?: number}>();

  for (const r of priced) {
    const vsBest = priceDeltaVsBest(r.amount, best);
    if (!vsBest) continue;
    let vsMedianPct: number | undefined;
    // No vs-median percent when baseline is free or median is 0.
    if (!zeroBaseline && median != null && median > 0 && r.amount > 0) {
      vsMedianPct = Math.round(((r.amount - median) / median) * 100);
    }
    deltasByMeterId.set(r.id, {vsBest, vsMedianPct});
  }

  return {
    providerCount: priced.length,
    bestPrice: best,
    medianPrice: median,
    zeroBaseline,
    deltasByMeterId,
  };
}

export function priceDeltaTitle(delta: PriceDelta, bestLabel: string): string {
  if (delta.kind === 'best') return 'Лучшая цена среди точных аналогов';
  if (delta.kind === 'above') {
    return `На ${delta.pct}% дороже лучшего точного аналога (${bestLabel})`;
  }
  if (delta.kind === 'times') {
    return `В ${formatTimes(delta.times)} дороже лучшего точного аналога (${bestLabel})`;
  }
  if (delta.kind === 'equal-free') return 'Бесплатно у нескольких провайдеров';
  if (delta.kind === 'free-vs-paid') {
    return `Платный тариф при бесплатном точном аналоге (${bestLabel})`;
  }
  return 'Сравнение цены недоступно';
}

function formatTimes(times: number): string {
  const t = Number.isInteger(times) ? String(times) : times.toFixed(1).replace('.', ',');
  return `${t}×`;
}

export function priceDeltaBadgeLabel(delta: PriceDelta): string | null {
  if (delta.kind === 'above') return `+${delta.pct}%`;
  if (delta.kind === 'times') return formatTimes(delta.times);
  if (delta.kind === 'equal-free') return '0 ₽';
  if (delta.kind === 'free-vs-paid') return 'есть 0 ₽';
  return null;
}
