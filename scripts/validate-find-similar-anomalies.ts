/**
 * Validate find-similar peer groups after exact/functional split.
 * Run: npx tsx scripts/validate-find-similar-anomalies.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {amountNumber, catalog} from '../src/lib/catalog';
import {canFindSimilar, comparableFilterFromMeter} from '../src/lib/catalog/find-similar';
import {
  selectPeersForCompare,
  type PeerSelection,
} from '../src/lib/catalog/peer-match';

function canFind(m: (typeof catalog.meters)[number]): boolean {
  return canFindSimilar(m);
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function spread(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min <= 0) return null;
  return ((max - min) / min) * 100;
}

function amountsFor(
  selection: PeerSelection,
  mode: 'retrieved' | 'exact' | 'exactPE' | 'functional',
): number[] {
  const byProv = new Map<string, number>();
  const consider = selection.retrieved.filter((r) => {
    if (mode === 'retrieved') return true;
    if (mode === 'exact') return r.classification.mode === 'exact';
    if (mode === 'exactPE') {
      return r.classification.mode === 'exact' && r.classification.priceEligible;
    }
    return r.classification.mode === 'functional';
  });
  // include seed in retrieved/exactPE when eligible
  if (mode === 'retrieved' || mode === 'exact' || mode === 'exactPE') {
    if (mode !== 'exactPE' || selection.seed.priceEligibility.eligible) {
      const a = amountNumber(selection.seed.meter, 'month');
      if (a != null && a > 0) byProv.set(selection.seed.meter.provider, a);
    }
  }
  for (const r of consider) {
    const a = amountNumber(r.meter, 'month');
    if (a == null || a <= 0) continue;
    const prev = byProv.get(r.meter.provider);
    if (prev == null || a < prev) byProv.set(r.meter.provider, a);
  }
  return [...byProv.values()];
}

function exclusionReasons(selection: PeerSelection): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of selection.retrieved) {
    if (r.classification.mode === 'exact') continue;
    for (const d of r.classification.hardDiffs) {
      counts.set(d.dimension, (counts.get(d.dimension) || 0) + 1);
    }
    for (const u of r.classification.unknownHard) {
      const key = `unknown:${u}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

type Row = {
  summary: string;
  retrievedProviders: number;
  exactProviders: number;
  exactPEProviders: number;
  functionalOnlyProviders: number;
  functionalSpread: number | null;
  exactSpread: number | null;
  exactPESpread: number | null;
  unknownHardRate: number;
  topExclusions: string[];
  syntheticExcluded: number;
  normalizationIneligible: number;
  seedEligible: boolean;
};

const bestSeedByKey = new Map<string, (typeof catalog.meters)[number]>();

for (const seed of catalog.meters) {
  if (seed.status !== 'available' || !canFind(seed)) continue;
  const filter = comparableFilterFromMeter(seed);
  if (!filter) continue;
  const key = `${filter.category}|${filter.summary}`;
  const prev = bestSeedByKey.get(key);
  if (!prev) {
    bestSeedByKey.set(key, seed);
    continue;
  }
  // Prefer atomic on-demand seeds so diagnostics match typical UI clicks.
  const score = (m: (typeof catalog.meters)[number]) => {
    let s = 0;
    if (m.synthetic || m.sku.includes('.synthetic') || m.priceProvenance === 'derived') s -= 10;
    if (/preempt|spot/i.test(m.sku) || m.purchaseModel === 'preemptible') s -= 5;
    if (m.provider === 't1-cloud' || m.provider === 'vk-cloud') s += 1;
    return s;
  };
  if (score(seed) > score(prev)) bestSeedByKey.set(key, seed);
}

const rows: Row[] = [];

for (const seed of bestSeedByKey.values()) {
  const filter = comparableFilterFromMeter(seed);
  if (!filter) continue;

  const sel = selectPeersForCompare(seed, catalog.meters);
  const retrievedAmts = amountsFor(sel, 'retrieved');
  const exactAmts = amountsFor(sel, 'exact');
  const exactPEAmts = amountsFor(sel, 'exactPE');
  const funcAmts = amountsFor(sel, 'functional');

  const funcSpread = spread(retrievedAmts); // wide retrieval cheapest/provider
  const exactSpread = spread(exactAmts);
  const exactPESpread = spread(exactPEAmts);

  // Only report groups where wide retrieval still has ≥50% OR we want diagnostics
  if ((funcSpread == null || funcSpread < 50) && (exactPESpread == null || exactPESpread < 50)) {
    continue;
  }

  const unknownHard = sel.retrieved.reduce((n, r) => n + r.classification.unknownHard.length, 0);
  const hardSlots = sel.retrieved.length || 1;
  const excl = exclusionReasons(sel);
  const topExclusions = [...excl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k}: ${n}`);

  const exactProv = new Set(
    sel.retrieved.filter((r) => r.classification.mode === 'exact').map((r) => r.meter.provider),
  );
  if (sel.retrieved.some((r) => r.classification.mode === 'exact')) {
    // seed counts if it would be exact to itself — always
    exactProv.add(sel.seed.meter.provider);
  }
  const exactPEProv = new Set(
    sel.providerSelections.filter((p) => p.exactPriceEligible).map((p) => p.provider),
  );
  if (sel.seed.priceEligibility.eligible) exactPEProv.add(sel.seed.meter.provider);

  const retrievedProv = new Set(sel.retrieved.map((r) => r.meter.provider));
  retrievedProv.add(sel.seed.meter.provider);

  const functionalOnly = [...retrievedProv].filter(
    (p) => !exactProv.has(p),
  ).length;

  rows.push({
    summary: filter.summary,
    retrievedProviders: retrievedProv.size,
    exactProviders: exactProv.size,
    exactPEProviders: exactPEProv.size,
    functionalOnlyProviders: functionalOnly,
    functionalSpread: funcSpread,
    exactSpread,
    exactPESpread,
    unknownHardRate: unknownHard / hardSlots,
    topExclusions,
    syntheticExcluded: sel.retrieved.filter((r) =>
      r.classification.priceIneligibleReasons.includes('derived-synthetic'),
    ).length,
    normalizationIneligible: sel.retrieved.filter((r) =>
      r.classification.priceIneligibleReasons.includes('normalization-unverified'),
    ).length,
    seedEligible: sel.seed.priceEligibility.eligible,
  });
}

rows.sort(
  (a, b) => (b.functionalSpread ?? 0) - (a.functionalSpread ?? 0),
);

const lines: string[] = [];
lines.push('# Find-similar anomaly report (exact vs functional)');
lines.push('');
lines.push('Generated: 2026-07-27');
lines.push('');
lines.push('## Метод');
lines.push('');
lines.push('- Retrieval = find-similar facets (wide).');
lines.push('- Exact / price-eligible = `peer-match.selectPeersForCompare`.');
lines.push('- Spreads = max/min among 1 cheapest SKU per provider.');
lines.push('- Groups listed when retrieved spread ≥50% or exactPE spread ≥50%.');
lines.push('');
lines.push(`## Сводка: ${rows.length} групп`);
lines.push('');

for (const [i, r] of rows.entries()) {
  lines.push(`### ${i + 1}. ${r.summary}`);
  lines.push('');
  lines.push(`- Retrieved providers: **${r.retrievedProviders}**`);
  lines.push(`- Exact providers: **${r.exactProviders}**`);
  lines.push(`- Price-eligible exact: **${r.exactPEProviders}** (seed eligible: ${r.seedEligible})`);
  lines.push(`- Functional-only providers: **${r.functionalOnlyProviders}**`);
  lines.push(
    `- Functional (retrieved) spread: **${r.functionalSpread != null ? r.functionalSpread.toFixed(0) + '%' : '—'}**`,
  );
  lines.push(
    `- Exact spread: **${r.exactSpread != null ? r.exactSpread.toFixed(0) + '%' : '—'}**`,
  );
  lines.push(
    `- Exact PE spread: **${r.exactPESpread != null ? r.exactPESpread.toFixed(0) + '%' : '—'}**`,
  );
  lines.push(`- Unknown-hard rate (avg/peer): ${r.unknownHardRate.toFixed(2)}`);
  lines.push(`- Synthetic exclusion hits: ${r.syntheticExcluded}`);
  lines.push(`- Normalization-ineligible hits: ${r.normalizationIneligible}`);
  if (r.topExclusions.length) {
    lines.push('- Top exclusion reasons:');
    for (const e of r.topExclusions) lines.push(`  - ${e}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('`npx tsx scripts/validate-find-similar-anomalies.ts`');

const out = path.join(process.cwd(), 'report.md');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('Wrote', out, 'groups', rows.length);
for (const r of rows.slice(0, 8)) {
  console.log(
    r.summary,
    'func',
    r.functionalSpread?.toFixed(0),
    'exactPE',
    r.exactPESpread?.toFixed(0),
    'excl',
    r.topExclusions[0] ?? '—',
  );
}
