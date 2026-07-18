/**
 * Offline retrieval eval: lexical vs hybrid recall@K on paraphrase goldens.
 *
 * Usage:
 *   npm run data:build && npm run data:embeddings
 *   npm run eval:retrieval
 *
 * Writes scripts/eval/out/retrieval.json
 */
import fs from 'node:fs';
import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '../../', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import type {CategoryKey} from '../../src/lib/catalog';
import {
  embeddingsAvailable,
  hybridSearchReady,
  loadEmbeddingIndex,
} from '../../src/lib/chat/embeddings';
import {
  searchPricesDetailed,
  searchPricesDetailedAsync,
  type PriceRow,
  type SearchParams,
} from '../../src/lib/chat/search';
import {RETRIEVAL_CASES, type RetrievalCase} from './retrieval-questions';

const K = 10;
const OUT = path.resolve(__dirname, 'out/retrieval.json');

function rowMatches(row: PriceRow, expect: RetrievalCase['expect']): boolean {
  if (expect.categoryKey && row.category !== expect.categoryKey) return false;
  if (expect.storageClass && (row.storageClass ?? '').toLowerCase() !== expect.storageClass) {
    return false;
  }
  if (expect.gpuModelIncludes) {
    const hay = `${row.name} ${row.config} ${row.sku}`.toLowerCase();
    if (!hay.includes(expect.gpuModelIncludes.toLowerCase())) return false;
  }
  if (expect.nameIncludes) {
    const hay = `${row.name} ${row.config} ${row.sku}`.toLowerCase();
    if (!hay.includes(expect.nameIncludes.toLowerCase())) return false;
  }
  if (expect.skuIncludes && !row.sku.toLowerCase().includes(expect.skuIncludes.toLowerCase())) {
    return false;
  }
  if (expect.meter === 'storage.object.capacity') {
    if (row.meterKind !== 'capacity' || row.category !== 'storage') return false;
  }
  if (expect.meter === 'storage.object.requests') {
    if (row.meterKind !== 'requests' || row.category !== 'storage') return false;
  }
  return true;
}

function hitsAtK(rows: PriceRow[], expect: RetrievalCase['expect'], k: number): boolean {
  return rows.slice(0, k).some((r) => rowMatches(r, expect));
}

function toParams(c: RetrievalCase): SearchParams {
  return {
    query: c.q,
    category: c.params?.category as CategoryKey | undefined,
    storageClass: c.params?.storageClass,
    meterKind: c.params?.meterKind,
    gpuModel: c.params?.gpuModel,
    aiModel: c.params?.aiModel,
    limit: 30,
  };
}

function pct(n: number, d: number): string {
  return d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a';
}

async function main() {
  const index = loadEmbeddingIndex();
  console.log(
    `embeddings: ${embeddingsAvailable() ? `yes (${index?.byId.size} vec, ${index?.model})` : 'NO'}`,
  );
  console.log(`hybrid ready: ${hybridSearchReady()}`);
  console.log(`cases: ${RETRIEVAL_CASES.length}  K=${K}\n`);

  type Row = {
    id: string;
    difficulty: string;
    q: string;
    lex: boolean;
    hyb: boolean;
    retrieval: string;
    topLex: string[];
    topHyb: string[];
  };

  const rows: Row[] = [];
  let done = 0;

  for (const c of RETRIEVAL_CASES) {
    const params = toParams(c);
    const lex = searchPricesDetailed(params);
    const hyb = await searchPricesDetailedAsync(params);
    const lexHit = hitsAtK(lex.rows, c.expect, K);
    const hybHit = hitsAtK(hyb.rows, c.expect, K);
    rows.push({
      id: c.id,
      difficulty: c.difficulty ?? 'exact',
      q: c.q,
      lex: lexHit,
      hyb: hybHit,
      retrieval: hyb.applied?.retrieval ?? '?',
      topLex: lex.rows.slice(0, 3).map((r) => `${r.providerName}: ${r.name}`),
      topHyb: hyb.rows.slice(0, 3).map((r) => `${r.providerName}: ${r.name}`),
    });
    done++;
    if (done % 20 === 0) console.log(`  …${done}/${RETRIEVAL_CASES.length}`);
  }

  const n = rows.length;
  const lexOk = rows.filter((r) => r.lex).length;
  const hybOk = rows.filter((r) => r.hyb).length;
  const hybOnly = rows.filter((r) => !r.lex && r.hyb);
  const lexOnly = rows.filter((r) => r.lex && !r.hyb);
  const bothFail = rows.filter((r) => !r.lex && !r.hyb);

  const byDiff = (d: string) => {
    const subset = rows.filter((r) => r.difficulty === d);
    return {
      n: subset.length,
      lex: subset.filter((r) => r.lex).length,
      hyb: subset.filter((r) => r.hyb).length,
    };
  };
  const exact = byDiff('exact');
  const hard = byDiff('hard');

  console.log('\n===== RETRIEVAL SUMMARY =====');
  console.log(`Cases:              ${n}`);
  console.log(`Lexical@${K}:         ${lexOk}/${n}  (${pct(lexOk, n)})`);
  console.log(`Hybrid@${K}:          ${hybOk}/${n}  (${pct(hybOk, n)})`);
  console.log(`Delta (hyb−lex):    ${hybOk - lexOk}`);
  console.log(`Hybrid-only wins:   ${hybOnly.length}`);
  console.log(`Lexical-only wins:  ${lexOnly.length}`);
  console.log(`Both miss:          ${bothFail.length}`);
  console.log(
    `Exact subset:       lex ${exact.lex}/${exact.n} (${pct(exact.lex, exact.n)})  hyb ${exact.hyb}/${exact.n} (${pct(exact.hyb, exact.n)})`,
  );
  console.log(
    `Hard paraphrases:   lex ${hard.lex}/${hard.n} (${pct(hard.lex, hard.n)})  hyb ${hard.hyb}/${hard.n} (${pct(hard.hyb, hard.n)})`,
  );

  if (hybOnly.length) {
    console.log('\n--- Hybrid fixed (lexical missed) ---');
    for (const r of hybOnly) {
      console.log(`  ✓ ${r.id}: ${r.q}`);
      console.log(`    hyb top: ${r.topHyb.join(' | ')}`);
    }
  }
  if (lexOnly.length) {
    console.log('\n--- Lexical better / hybrid regressed ---');
    for (const r of lexOnly) {
      console.log(`  ✗ ${r.id}: ${r.q}`);
      console.log(`    lex top: ${r.topLex.join(' | ')}`);
      console.log(`    hyb top: ${r.topHyb.join(' | ')}`);
    }
  }
  if (bothFail.length) {
    console.log('\n--- Both missed ---');
    for (const r of bothFail) {
      console.log(`  ✗ ${r.id}: ${r.q}`);
      console.log(`    hyb top: ${r.topHyb.join(' | ') || '(empty)'}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        k: K,
        hybridReady: hybridSearchReady(),
        embeddingModel: index?.model ?? null,
        summary: {
          n,
          lexOk,
          hybOk,
          delta: hybOk - lexOk,
          hybOnly: hybOnly.length,
          lexOnly: lexOnly.length,
          bothFail: bothFail.length,
          exact,
          hard,
        },
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport → ${path.relative(process.cwd(), OUT)}`);

  if (hybridSearchReady() && hybOk < lexOk) {
    console.error('\nFAIL: hybrid recall worse than lexical');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
