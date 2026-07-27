/** Price deltas vs the cheapest offer in a like-for-like compare set. */

export type PriceDelta = {
  kind: 'best' | 'above';
  /** 0 for best; positive percent above best for others. */
  pct: number;
};

/** Minimum among finite non-negative amounts; null if none. */
export function bestAmount(amounts: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const a of amounts) {
    if (typeof a !== 'number' || !Number.isFinite(a) || a < 0) continue;
    if (best == null || a < best) best = a;
  }
  return best;
}

/**
 * Delta of `amount` vs `best`.
 * Returns null when inputs are unusable (non-finite or best ≤ 0).
 */
export function priceDeltaVsBest(amount: number, best: number): PriceDelta | null {
  if (!Number.isFinite(amount) || !Number.isFinite(best) || best <= 0) return null;
  if (amount < 0) return null;
  const pct = Math.round(((amount - best) / best) * 100);
  if (amount <= best || pct <= 0) return {kind: 'best', pct: 0};
  return {kind: 'above', pct};
}

/**
 * Build per-id deltas for a filtered compare set.
 * Empty map when fewer than two priced rows (nothing to compare).
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

export function priceDeltaTitle(delta: PriceDelta, bestLabel: string): string {
  if (delta.kind === 'best') return 'Лучший оффер в текущем сравнении';
  return `На ${delta.pct}% дороже лучшего оффера (${bestLabel})`;
}
