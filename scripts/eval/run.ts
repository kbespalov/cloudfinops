/**
 * Eval runner (single model / prompt A/B). Usage:
 *   npx tsx scripts/eval/run.ts [--prompt <file>] [--label <name>] [--limit N] [--concurrency C] [--tag T]
 *   npx tsx scripts/eval/run.ts --model GigaChat/GigaChat3-10B-A1.8B --no-fast-path --limit 30
 *
 * For multi-model quality+latency leaderboard use: npm run eval:bench
 */
import fs from 'node:fs';
import path from 'node:path';
import {runChat} from './harness';
import {buildQuestions, type Question} from './questions';
import {grade, type Grade, type Truth} from './ground-truth';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';
import {getChatModel} from '../../src/lib/chat/gigachat';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
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
  durationMs: number;
  toolRounds: number;
  fastPath: boolean;
  model: string;
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
  const model = arg('model') ?? getChatModel();
  const disableFastPath = hasFlag('no-fast-path');

  let questions: Question[] = buildQuestions();
  if (tagFilter) questions = questions.filter((q) => q.tag === tagFilter);
  const limit = arg('limit');
  if (limit) questions = questions.slice(0, Number(limit));

  console.log(
    `[${label}] model=${model} prompt=${promptFile ?? 'live SYSTEM_PROMPT'} questions=${questions.length} concurrency=${concurrency} fastPath=${disableFastPath ? 'OFF' : 'ON'}`,
  );
  const t0 = Date.now();

  const truths: Truth[] = questions.map((q) => q.truth());

  let done = 0;
  const rows: Row[] = await mapLimit(questions, concurrency, async (q, i) => {
    const truth = truths[i];
    const run = await runChat(systemPrompt, q.q, {model, disableFastPath});
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
      durationMs: run.durationMs,
      toolRounds: run.toolRounds,
      fastPath: run.fastPath,
      model: run.model,
      error: run.error,
    };
  });

  const n = rows.length;
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const noHalluc = sum((r) => (r.grade.noHalluc ? 1 : 0));
  const hallucTotal = sum((r) => r.grade.hallucinated.length);
  const cheapProvOk = sum((r) => (r.grade.cheapestProviderOk ? 1 : 0));
  const cheapPriceOk = sum((r) => (r.grade.cheapestPriceOk ? 1 : 0));
  const recallAvg = sum((r) => r.grade.recall) / n;
  const pass = sum((r) => (r.grade.pass ? 1 : 0));
  const errors = rows.filter((r) => r.error);
  const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const latency = {
    p50Ms: Math.round(percentile(durations, 50)),
    p95Ms: Math.round(percentile(durations, 95)),
    meanMs: Math.round(sum((r) => r.durationMs) / n),
    maxMs: durations[durations.length - 1] ?? 0,
  };

  const byTag = new Map<string, {n: number; noHalluc: number; pass: number; halluc: number; durations: number[]}>();
  for (const r of rows) {
    const t = byTag.get(r.tag) ?? {n: 0, noHalluc: 0, pass: 0, halluc: 0, durations: []};
    t.n++;
    t.noHalluc += r.grade.noHalluc ? 1 : 0;
    t.pass += r.grade.pass ? 1 : 0;
    t.halluc += r.grade.hallucinated.length;
    t.durations.push(r.durationMs);
    byTag.set(r.tag, t);
  }

  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
  console.log(`\n===== [${label}] SUMMARY (${((Date.now() - t0) / 1000).toFixed(0)}s) =====`);
  console.log(`Model:                ${model}`);
  console.log(`Questions:            ${n}`);
  console.log(`No hallucination:     ${noHalluc}/${n}  (${pct(noHalluc)})`);
  console.log(`Hallucinated (total): ${hallucTotal} invented provider mentions`);
  console.log(`Cheapest provider ok: ${cheapProvOk}/${n}  (${pct(cheapProvOk)})`);
  console.log(`Cheapest price shown: ${cheapPriceOk}/${n}  (${pct(cheapPriceOk)})`);
  console.log(`Provider recall avg:  ${(recallAvg * 100).toFixed(1)}%`);
  console.log(`PASS (no halluc + right cheapest): ${pass}/${n}  (${pct(pass)})`);
  console.log(`Latency p50/p95/mean: ${latency.p50Ms}/${latency.p95Ms}/${latency.meanMs} ms (max ${latency.maxMs})`);
  if (errors.length) console.log(`Pipeline errors:      ${errors.length}`);

  console.log(`\n--- by tag (noHalluc / pass / n / p50) ---`);
  for (const [tag, t] of [...byTag.entries()].sort()) {
    const d = [...t.durations].sort((a, b) => a - b);
    console.log(
      `  ${tag.padEnd(18)} noHalluc ${t.noHalluc}/${t.n}  pass ${t.pass}/${t.n}  hallucMentions ${t.halluc}  p50=${Math.round(percentile(d, 50))}ms`,
    );
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
    JSON.stringify(
      {
        label,
        model,
        promptFile: promptFile ?? null,
        disableFastPath,
        n,
        summary: {noHalluc, hallucTotal, cheapProvOk, cheapPriceOk, recallAvg, pass, latency},
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nDetailed report → ${path.relative(path.resolve(__dirname, '../..'), outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
