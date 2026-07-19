/**
 * FinOps chat quality + latency benchmark (model matrix).
 *
 * Dataset: scripts/eval/questions.ts (≥100 grounded cases).
 * Gold: same catalog tools as the assistant (deterministic).
 *
 * Usage:
 *   npm run eval:bench -- --limit 20
 *   npm run eval:bench -- --models openai/gpt-oss-120b,GigaChat/GigaChat3-10B-A1.8B --no-fast-path
 *   npm run eval:bench -- --tag gpu-price --concurrency 4
 *
 * Fair model A/B: always pass --no-fast-path (otherwise homepage chips skip the LLM).
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

function slugModel(model: string): string {
  return model.replace(/[^\w.-]+/g, '_').slice(0, 80);
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

type ModelSummary = {
  model: string;
  n: number;
  pass: number;
  passRate: number;
  noHalluc: number;
  noHallucRate: number;
  cheapProvOk: number;
  cheapProvOkRate: number;
  cheapPriceOk: number;
  recallAvg: number;
  errors: number;
  fastPathHits: number;
  latency: {
    p50Ms: number;
    p95Ms: number;
    meanMs: number;
    maxMs: number;
  };
  byTag: Record<string, {n: number; pass: number; p50Ms: number}>;
};

function summarize(model: string, rows: Row[]): ModelSummary {
  const n = rows.length || 1;
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const byTag = new Map<string, {n: number; pass: number; durations: number[]}>();
  for (const r of rows) {
    const t = byTag.get(r.tag) ?? {n: 0, pass: 0, durations: []};
    t.n++;
    t.pass += r.grade.pass ? 1 : 0;
    t.durations.push(r.durationMs);
    byTag.set(r.tag, t);
  }
  const byTagOut: ModelSummary['byTag'] = {};
  for (const [tag, t] of [...byTag.entries()].sort()) {
    const d = [...t.durations].sort((a, b) => a - b);
    byTagOut[tag] = {n: t.n, pass: t.pass, p50Ms: Math.round(percentile(d, 50))};
  }
  return {
    model,
    n: rows.length,
    pass: sum((r) => (r.grade.pass ? 1 : 0)),
    passRate: sum((r) => (r.grade.pass ? 1 : 0)) / n,
    noHalluc: sum((r) => (r.grade.noHalluc ? 1 : 0)),
    noHallucRate: sum((r) => (r.grade.noHalluc ? 1 : 0)) / n,
    cheapProvOk: sum((r) => (r.grade.cheapestProviderOk ? 1 : 0)),
    cheapProvOkRate: sum((r) => (r.grade.cheapestProviderOk ? 1 : 0)) / n,
    cheapPriceOk: sum((r) => (r.grade.cheapestPriceOk ? 1 : 0)),
    recallAvg: sum((r) => r.grade.recall) / n,
    errors: rows.filter((r) => r.error).length,
    fastPathHits: rows.filter((r) => r.fastPath).length,
    latency: {
      p50Ms: Math.round(percentile(durations, 50)),
      p95Ms: Math.round(percentile(durations, 95)),
      meanMs: Math.round(sum((r) => r.durationMs) / n),
      maxMs: durations[durations.length - 1] ?? 0,
    },
    byTag: byTagOut,
  };
}

async function runOneModel(opts: {
  model: string;
  questions: Question[];
  truths: Truth[];
  systemPrompt: string;
  concurrency: number;
  disableFastPath: boolean;
}): Promise<{summary: ModelSummary; rows: Row[]}> {
  const {model, questions, truths, systemPrompt, concurrency, disableFastPath} = opts;
  let done = 0;
  const rows = await mapLimit(questions, concurrency, async (q, i) => {
    const truth = truths[i];
    const run = await runChat(systemPrompt, q.q, {model, disableFastPath});
    const g = grade(run.answer, truth);
    done++;
    if (done % 10 === 0 || done === questions.length) {
      console.log(`  [${slugModel(model)}] ${done}/${questions.length}`);
    }
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
    } satisfies Row;
  });
  return {summary: summarize(model, rows), rows};
}

function printLeaderboard(summaries: ModelSummary[]) {
  const ranked = [...summaries].sort((a, b) => {
    if (b.passRate !== a.passRate) return b.passRate - a.passRate;
    return a.latency.p50Ms - b.latency.p50Ms;
  });
  console.log('\n===== LEADERBOARD (pass% ↓, then p50 latency ↑) =====');
  console.log(
    `${'model'.padEnd(42)} ${'pass'.padStart(8)} ${'noHall'.padStart(8)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'err'.padStart(4)}`,
  );
  for (const s of ranked) {
    const pass = `${(s.passRate * 100).toFixed(1)}%`;
    const noH = `${(s.noHallucRate * 100).toFixed(1)}%`;
    console.log(
      `${s.model.slice(0, 42).padEnd(42)} ${pass.padStart(8)} ${noH.padStart(8)} ${String(s.latency.p50Ms).padStart(7)} ${String(s.latency.p95Ms).padStart(7)} ${String(s.errors).padStart(4)}`,
    );
  }
}

async function main() {
  const promptFile = arg('prompt');
  const systemPrompt = promptFile
    ? fs.readFileSync(path.resolve(promptFile), 'utf8')
    : SYSTEM_PROMPT;
  const concurrency = Number(arg('concurrency') ?? 4);
  const tagFilter = arg('tag');
  const disableFastPath = hasFlag('no-fast-path');
  const label = arg('label') ?? `bench-${new Date().toISOString().slice(0, 10)}`;

  const modelsRaw = arg('models') ?? arg('model') ?? getChatModel();
  const models = modelsRaw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  let questions: Question[] = buildQuestions();
  if (tagFilter) questions = questions.filter((q) => q.tag === tagFilter);
  const limit = arg('limit');
  if (limit) questions = questions.slice(0, Number(limit));

  console.log(
    `[bench] label=${label} models=${models.length} questions=${questions.length} concurrency=${concurrency} fastPath=${disableFastPath ? 'OFF' : 'ON'}`,
  );
  for (const m of models) console.log(`  · ${m}`);

  const truths = questions.map((q) => q.truth());
  const outDir = path.resolve(__dirname, 'out');
  fs.mkdirSync(outDir, {recursive: true});

  const summaries: ModelSummary[] = [];
  const perModel: Record<string, {summary: ModelSummary; rows: Row[]}> = {};

  for (const model of models) {
    console.log(`\n--- model: ${model} ---`);
    const t0 = Date.now();
    const result = await runOneModel({
      model,
      questions,
      truths,
      systemPrompt,
      concurrency,
      disableFastPath,
    });
    summaries.push(result.summary);
    perModel[model] = result;
    const s = result.summary;
    console.log(
      `  pass ${s.pass}/${s.n} (${(s.passRate * 100).toFixed(1)}%)  noHalluc ${(s.noHallucRate * 100).toFixed(1)}%  p50=${s.latency.p50Ms}ms p95=${s.latency.p95Ms}ms  (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );
    if (s.fastPathHits) {
      console.log(`  ⚠ fastPath hits: ${s.fastPathHits}/${s.n} — use --no-fast-path for fair model A/B`);
    }
  }

  printLeaderboard(summaries);

  const outPath = path.join(outDir, `${label}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        label,
        createdAt: new Date().toISOString(),
        promptFile: promptFile ?? null,
        disableFastPath,
        concurrency,
        questionCount: questions.length,
        models,
        leaderboard: summaries.sort((a, b) => {
          if (b.passRate !== a.passRate) return b.passRate - a.passRate;
          return a.latency.p50Ms - b.latency.p50Ms;
        }),
        perModel: Object.fromEntries(
          Object.entries(perModel).map(([m, v]) => [m, {summary: v.summary, rows: v.rows}]),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`\nReport → ${path.relative(path.resolve(__dirname, '../..'), outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
