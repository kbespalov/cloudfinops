/**
 * Chat/analytics helper: exact vs functional peers + anomaly groups by spread.
 */
import {
  amountNumber,
  catalog,
  type CatalogMeter,
} from '@/lib/catalog';
import {canFindSimilar, comparableFilterFromMeter} from '@/lib/catalog/find-similar';
import {
  buildExactPriceComparison,
  medianAmount,
  priceDeltaBadgeLabel,
} from '@/lib/catalog/compare-delta';
import {
  primaryPeerRows,
  selectPeersForCompare,
  type PeerSelection,
} from '@/lib/catalog/peer-match';
import {similarBannerCopy} from '@/lib/catalog/peer-summary';
import {searchPricesDetailed} from './search';

export type SimilarPeersMode = 'peers' | 'anomalies';

export type CompareSimilarPeersArgs = {
  query?: string;
  sku?: string;
  mode?: SimilarPeersMode;
  /** Default 50 for anomalies mode. */
  minSpreadPct?: number;
  limit?: number;
};

function spreadPct(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (!(min > 0)) return null;
  return ((max - min) / min) * 100;
}

function resolveSeed(args: CompareSimilarPeersArgs): CatalogMeter | null {
  const sku = args.sku?.trim();
  if (sku) {
    const bySku = catalog.meters.find(
      (m) => m.status === 'available' && (m.sku === sku || m.id === sku),
    );
    if (bySku) return bySku;
  }
  const q = args.query?.trim();
  if (!q) return null;
  // Prefer exact sku/id substring, then search_prices cheapest hit.
  const direct = catalog.meters.find(
    (m) =>
      m.status === 'available' &&
      canFindSimilar(m) &&
      (m.sku.includes(q) || m.name.toLowerCase().includes(q.toLowerCase())),
  );
  if (direct) return direct;
  const search = searchPricesDetailed({query: q});
  const cheapest = search.providers[0]?.cheapest;
  if (!cheapest) return null;
  return catalog.meters.find((m) => m.id === cheapest.id || m.sku === cheapest.sku) ?? null;
}

function peerRowPayload(selection: PeerSelection) {
  const period = 'month' as const;
  const rows = primaryPeerRows(selection);
  const compareRows = rows
    .filter((r) => r.bucket === 'seed' || r.bucket === 'exact-price-eligible')
    .map((r) => ({id: r.meter.id, amount: amountNumber(r.meter, period)}));
  const comparison =
    selection.seed.priceEligibility.eligible && compareRows.length >= 2
      ? buildExactPriceComparison(compareRows)
      : null;
  const exactPEAmounts = compareRows
    .map((r) => r.amount)
    .filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0);
  const banner = similarBannerCopy(selection);

  return {
    seed: {
      sku: selection.seed.meter.sku,
      name: selection.seed.meter.name,
      provider: selection.seed.meter.provider,
      providerName: selection.seed.meter.providerName,
      amountMonth: amountNumber(selection.seed.meter, period),
      priceEligible: selection.seed.priceEligibility.eligible,
      priceIneligibleReasons: selection.seed.priceEligibility.reasons,
      synthetic: selection.seed.meter.synthetic || selection.seed.meter.sku.includes('.synthetic'),
    },
    banner,
    priceCompareActive: Boolean(comparison) && !comparison?.zeroBaseline,
    zeroBaseline: comparison?.zeroBaseline ?? false,
    stats: {
      exactPriceEligibleProviders: new Set(
        rows
          .filter((r) => r.bucket === 'seed' || r.bucket === 'exact-price-eligible')
          .map((r) => r.meter.provider),
      ).size,
      functionalProviders: rows.filter((r) => r.bucket === 'functional').length,
      medianMonth: exactPEAmounts.length ? medianAmount(exactPEAmounts) : null,
      spreadMaxVsMinPct: spreadPct(exactPEAmounts),
      bestMonth: comparison?.bestPrice ?? null,
    },
    peers: rows.map((r) => {
      const amount = amountNumber(r.meter, period);
      const delta = comparison?.deltasByMeterId.get(r.meter.id);
      return {
        bucket: r.bucket,
        sku: r.meter.sku,
        name: r.meter.name,
        provider: r.meter.provider,
        providerName: r.meter.providerName,
        amountMonth: amount,
        synthetic: r.meter.synthetic || r.meter.sku.includes('.synthetic'),
        badge: delta ? priceDeltaBadgeLabel(delta.vsBest) : null,
        vsMedianPct: delta?.vsMedianPct ?? null,
        exactExtraCount: r.exactExtraCount,
      };
    }),
  };
}

function anomalyGroups(minSpreadPct: number, limit: number) {
  const bestSeedByKey = new Map<string, CatalogMeter>();
  for (const seed of catalog.meters) {
    if (seed.status !== 'available' || !canFindSimilar(seed)) continue;
    const filter = comparableFilterFromMeter(seed);
    if (!filter) continue;
    const key = `${filter.category}|${filter.summary}`;
    const prev = bestSeedByKey.get(key);
    if (!prev) {
      bestSeedByKey.set(key, seed);
      continue;
    }
    const score = (m: CatalogMeter) => {
      let s = 0;
      if (m.synthetic || m.sku.includes('.synthetic') || m.priceProvenance === 'derived') s -= 10;
      if (/preempt|spot/i.test(m.sku) || m.purchaseModel === 'preemptible') s -= 5;
      return s;
    };
    if (score(seed) > score(prev)) bestSeedByKey.set(key, seed);
  }

  const groups: Array<Record<string, unknown>> = [];
  for (const seed of bestSeedByKey.values()) {
    const filter = comparableFilterFromMeter(seed);
    if (!filter) continue;
    const sel = selectPeersForCompare(seed, catalog.meters);
    const payload = peerRowPayload(sel);
    const retrievedAmts: number[] = [];
    const exactPEAmts: number[] = [];
    const byRetrieved = new Map<string, number>();
    const byExactPE = new Map<string, number>();

    const seedAmt = amountNumber(seed, 'month');
    if (seedAmt != null && seedAmt > 0) {
      byRetrieved.set(seed.provider, seedAmt);
      if (sel.seed.priceEligibility.eligible) byExactPE.set(seed.provider, seedAmt);
    }
    for (const r of sel.retrieved) {
      const a = amountNumber(r.meter, 'month');
      if (a == null || a <= 0) continue;
      const prevR = byRetrieved.get(r.meter.provider);
      if (prevR == null || a < prevR) byRetrieved.set(r.meter.provider, a);
      if (r.classification.mode === 'exact' && r.classification.priceEligible) {
        const prevE = byExactPE.get(r.meter.provider);
        if (prevE == null || a < prevE) byExactPE.set(r.meter.provider, a);
      }
    }
    retrievedAmts.push(...byRetrieved.values());
    exactPEAmts.push(...byExactPE.values());
    const functionalSpread = spreadPct(retrievedAmts);
    const exactPESpread = spreadPct(exactPEAmts);
    const hit =
      (functionalSpread != null && functionalSpread >= minSpreadPct) ||
      (exactPESpread != null && exactPESpread >= minSpreadPct);
    if (!hit) continue;

    const excl = new Map<string, number>();
    for (const r of sel.retrieved) {
      if (r.classification.mode === 'exact') continue;
      for (const d of r.classification.hardDiffs) {
        excl.set(d.dimension, (excl.get(d.dimension) || 0) + 1);
      }
    }
    groups.push({
      summary: filter.summary,
      seedSku: seed.sku,
      retrievedProviders: byRetrieved.size,
      exactPriceEligibleProviders: byExactPE.size,
      functionalSpreadPct: functionalSpread != null ? Math.round(functionalSpread) : null,
      exactPESpreadPct: exactPESpread != null ? Math.round(exactPESpread) : null,
      priceCompareActive: payload.priceCompareActive,
      topExclusionReasons: [...excl.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([dimension, count]) => ({dimension, count})),
    });
  }

  groups.sort(
    (a, b) =>
      ((b.functionalSpreadPct as number | null) ?? 0) -
      ((a.functionalSpreadPct as number | null) ?? 0),
  );
  return groups.slice(0, limit);
}

/**
 * Tool payload for compare_similar_peers.
 * mode=peers → seed + exact/functional rows + median/spread.
 * mode=anomalies → groups where retrieved or exactPE spread ≥ threshold.
 */
export function compareSimilarPeers(args: CompareSimilarPeersArgs = {}) {
  const mode: SimilarPeersMode = args.mode === 'anomalies' ? 'anomalies' : 'peers';
  const minSpreadPct =
    typeof args.minSpreadPct === 'number' && Number.isFinite(args.minSpreadPct)
      ? args.minSpreadPct
      : 50;
  const limit =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? Math.min(Math.max(Math.trunc(args.limit), 1), 40)
      : mode === 'anomalies'
        ? 15
        : 20;

  if (mode === 'anomalies') {
    return {
      ok: true as const,
      mode,
      minSpreadPct,
      asOf: catalog.asOf,
      note:
        'Аномалии = группы find-similar с max/min ≥ порога. functionalSpread — широкий retrieval; exactPESpread — только exact+priceEligible (после peer-match).',
      groups: anomalyGroups(minSpreadPct, limit),
    };
  }

  const seed = resolveSeed(args);
  if (!seed) {
    return {
      ok: false as const,
      mode,
      error: 'Не нашёл SKU/seed по sku или query. Уточни sku или название тарифа.',
    };
  }
  if (!canFindSimilar(seed)) {
    return {
      ok: false as const,
      mode,
      error: `Для ${seed.sku} нет comparable find-similar класса.`,
      seed: {sku: seed.sku, name: seed.name, provider: seed.provider},
    };
  }

  const selection = selectPeersForCompare(seed, catalog.meters);
  const payload = peerRowPayload(selection);
  return {
    ok: true as const,
    mode,
    asOf: catalog.asOf,
    note:
      'exact-price-eligible — ценовые бейджи/медиана; exact-price-ineligible — точный аналог без price claims (synthetic/0-unit); functional — похожие без «дешевле на N%». Seed sticky. Synthetic seed отключает сравнение цен.',
    ...payload,
  };
}
