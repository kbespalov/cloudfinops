/**
 * Eval runner. Usage:
 *   npx tsx scripts/eval/run.ts [--prompt <file>] [--label <name>] [--limit N] [--concurrency C] [--tag T]
 *
 * Runs every question through the assistant pipeline with the given system prompt
 * (default: the live SYSTEM_PROMPT), grades against deterministic ground truth,
 * and writes a detailed report to scripts/eval/out/<label>.json plus a console summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import {runChat} from './harness';
import {buildQuestions, type Question} from './questions';
import {grade, type Grade, type Truth} from './ground-truth';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return out;
}

type Row = {
  id: string;
  tag: string;
  q: string;
  answer: string;
  tools: string[];
  allowed: string[];
  cheapestProvider: string | null;
  cheapestPrice: number | null;
  grade: Grade;
  error?: string;
};

async function main() {
  const promptFile = arg('prompt');
  const systemPrompt = promptFile
    ? fs.readFileSync(path.resolve(promptFile), 'utf8')
    : SYSTEM_PROMPT;
  const label = arg('label') ?? (promptFile ? path.basename(promptFile).replace(/\.\w+$/, '') : 'baseline');
  const concurrency = Number(arg('concurrency') ?? 8);
  const tagFilter = arg('tag');

  let questions: Question[] = buildQuestions();
  if (tagFilter) questions = questions.filter((q) => q.tag === tagFilter);
  const limit = arg('limit');
  if (limit) questions = questions.slice(0, Number(limit));

  console.log(`[${label}] prompt=${promptFile ?? 'live SYSTEM_PROMPT'} questions=${questions.length} concurrency=${concurrency}`);
  const t0 = Date.now();

  // Precompute ground truth (fast, local).
  const truths: Truth[] = questions.map((q) => q.truth());

  let done = 0;
  const rows: Row[] = await mapLimit(questions, concurrency, async (q, i) => {
    const truth = truths[i];
    const run = await runChat(systemPrompt, q.q);
    const g = grade(run.answer, truth);
    done++;
    if (done % 10 === 0) console.log(`  ...${done}/${questions.length}`);
    return {
      id: q.id,
      tag: q.tag,
      q: q.q,
      answer: run.answer,
      tools: run.toolCalls.map((c) => `${c.name}(${c.arguments})`),
      allowed: [...truth.allowed],
      cheapestProvider: truth.cheapestProvider,
      cheapestPrice: truth.cheapestPrice,
      grade: g,
      error: run.error,
    };
  });

  // Aggregate.
  const n = rows.length;
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const noHalluc = sum((r) => (r.grade.noHalluc ? 1 : 0));
  const hallucTotal = sum((r) => r.grade.hallucinated.length);
  const cheapProvOk = sum((r) => (r.grade.cheapestProviderOk ? 1 : 0));
  const cheapPriceOk = sum((r) => (r.grade.cheapestPriceOk ? 1 : 0));
  const recallAvg = sum((r) => r.grade.recall) / n;
  const pass = sum((r) => (r.grade.pass ? 1 : 0));
  const errors = rows.filter((r) => r.error);

  const byTag = new Map<string, {n: number; noHalluc: number; pass: number; halluc: number}>();
  for (const r of rows) {
    const t = byTag.get(r.tag) ?? {n: 0, noHalluc: 0, pass: 0, halluc: 0};
    t.n++;
    t.noHalluc += r.grade.noHalluc ? 1 : 0;
    t.pass += r.grade.pass ? 1 : 0;
    t.halluc += r.grade.hallucinated.length;
    byTag.set(r.tag, t);
  }

  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
  console.log(`\n===== [${label}] SUMMARY (${((Date.now() - t0) / 1000).toFixed(0)}s) =====`);
  console.log(`Questions:            ${n}`);
  console.log(`No hallucination:     ${noHalluc}/${n}  (${pct(noHalluc)})`);
  console.log(`Hallucinated (total): ${hallucTotal} invented provider mentions`);
  console.log(`Cheapest provider ok: ${cheapProvOk}/${n}  (${pct(cheapProvOk)})`);
  console.log(`Cheapest price shown: ${cheapPriceOk}/${n}  (${pct(cheapPriceOk)})`);
  console.log(`Provider recall avg:  ${(recallAvg * 100).toFixed(1)}%`);
  console.log(`PASS (no halluc + right cheapest): ${pass}/${n}  (${pct(pass)})`);
  if (errors.length) console.log(`Pipeline errors:      ${errors.length}`);

  console.log(`\n--- by tag (noHalluc / pass / n) ---`);
  for (const [tag, t] of [...byTag.entries()].sort()) {
    console.log(`  ${tag.padEnd(18)} noHalluc ${t.noHalluc}/${t.n}  pass ${t.pass}/${t.n}  hallucMentions ${t.halluc}`);
  }

  console.log(`\n--- worst offenders (hallucinations) ---`);
  for (const r of rows.filter((r) => r.grade.hallucinated.length).slice(0, 25)) {
    console.log(`  [${r.id}] allowed={${r.allowed.join(',')}} invented={${r.grade.hallucinated.join(',')}}`);
  }

  const outDir = path.resolve(__dirname, 'out');
  fs.mkdirSync(outDir, {recursive: true});
  const outPath = path.join(outDir, `${label}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({label, promptFile: promptFile ?? null, n, summary: {noHalluc, hallucTotal, cheapProvOk, cheapPriceOk, recallAvg, pass}, rows}, null, 2),
  );
  console.log(`\nDetailed report → ${path.relative(path.resolve(__dirname, '../..'), outPath)}`);
}

main();
