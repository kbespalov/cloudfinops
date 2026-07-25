/**
 * Soft UX scenario runner (200 natural prompts).
 *
 * Not CI unit tests — writes JSON + Markdown for agent/human review and
 * cross-validation (--compare).
 *
 * Usage:
 *   npm run eval:scenarios -- --limit 20 --no-fast-path
 *   npm run eval:scenarios -- --section kubernetes --concurrency 2
 *   npm run eval:scenarios -- --ids ux-001,ux-050,ux-171
 *   npm run eval:scenarios -- --compare scripts/eval/out/scenarios-a.json scripts/eval/out/scenarios-b.json
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runChat} from './harness';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';
import {getChatModel} from '../../src/lib/chat/gigachat';
import {compareSoftGrades, softGrade, type SoftGrade} from './soft-grade';
import {
  buildUserScenarios,
  filterScenarios,
  type SoftScenario,
} from './user-scenarios';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argPositionalAfter(flag: string): string[] {
  const i = process.argv.indexOf(`--${flag}`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < process.argv.length; j++) {
    if (process.argv[j].startsWith('--')) break;
    out.push(process.argv[j]);
  }
  return out;
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

type ScenarioRow = {
  id: string;
  section: string;
  q: string;
  intent: string[];
  difficulty: string;
  answer: string;
  tools: string[];
  toolRounds: number;
  durationMs: number;
  fastPath: boolean;
  model: string;
  seedId?: string;
  seedAnswerPreview?: string;
  grade: SoftGrade;
  error?: string;
  notes?: string;
};

type ScenarioReport = {
  label: string;
  kind: 'soft-scenarios';
  createdAt: string;
  model: string;
  disableFastPath: boolean;
  concurrency: number;
  n: number;
  meanScore: number;
  bySection: Record<string, {n: number; meanScore: number}>;
  rows: ScenarioRow[];
};

function summarize(rows: ScenarioRow[]): Pick<ScenarioReport, 'meanScore' | 'bySection'> {
  const meanScore = rows.length ? rows.reduce((s, r) => s + r.grade.score, 0) / rows.length : 0;
  const bySection: ScenarioReport['bySection'] = {};
  for (const r of rows) {
    const s = bySection[r.section] ?? {n: 0, meanScore: 0};
    s.n++;
    s.meanScore += r.grade.score;
    bySection[r.section] = s;
  }
  for (const k of Object.keys(bySection)) {
    bySection[k].meanScore /= bySection[k].n || 1;
  }
  return {meanScore, bySection};
}

function mdReport(report: ScenarioReport): string {
  const lines: string[] = [
    `# Soft scenarios — ${report.label}`,
    '',
    `- model: \`${report.model}\``,
    `- n: ${report.n}`,
    `- mean score: **${(report.meanScore * 100).toFixed(1)}%**`,
    `- fast-path: ${report.disableFastPath ? 'OFF' : 'ON'}`,
    `- created: ${report.createdAt}`,
    '',
    '## By section',
    '',
    '| section | n | mean score |',
    '|---|---:|---:|',
  ];
  for (const [sec, s] of Object.entries(report.bySection).sort()) {
    lines.push(`| ${sec} | ${s.n} | ${(s.meanScore * 100).toFixed(0)}% |`);
  }
  lines.push('', '## Cases', '', '| id | score | misses | ms | tools |', '|---|---:|---|---:|---|');
  for (const r of report.rows) {
    const miss = r.grade.misses.slice(0, 2).join('; ').replace(/\|/g, '/') || '—';
    const tools = [...new Set(r.tools.map((t) => t.split('(')[0]))].slice(0, 3).join(', ') || '—';
    lines.push(
      `| ${r.id} | ${(r.grade.score * 100).toFixed(0)}% | ${miss} | ${r.durationMs} | ${tools} |`,
    );
  }
  lines.push('', '## Review notes (score < 0.6 or misses)', '');
  for (const r of report.rows.filter((x) => x.grade.score < 0.6 || x.grade.misses.length)) {
    lines.push(`### ${r.id} — ${(r.grade.score * 100).toFixed(0)}%`);
    lines.push(`> ${r.q}`);
    lines.push('');
    lines.push(r.grade.notesForReview || r.notes || '_no notes_');
    lines.push('');
  }
  return lines.join('\n');
}

async function runScenario(
  scenario: SoftScenario,
  opts: {
    systemPrompt: string;
    model: string;
    disableFastPath: boolean;
    byId: Map<string, SoftScenario>;
  },
): Promise<ScenarioRow> {
  const seedId = scenario.expect?.seedId;
  let history: {role: 'user' | 'assistant'; content: string}[] | undefined;
  let seedAnswerPreview: string | undefined;
  let seedDurationMs = 0;

  if (seedId) {
    const seed = opts.byId.get(seedId);
    if (seed) {
      const seedRun = await runChat(opts.systemPrompt, seed.q, {
        model: opts.model,
        disableFastPath: opts.disableFastPath,
      });
      seedDurationMs = seedRun.durationMs;
      seedAnswerPreview = seedRun.answer.slice(0, 400);
      history = [
        {role: 'user', content: seed.q},
        {role: 'assistant', content: seedRun.answer || '(пусто)'},
      ];
    }
  }

  const run = await runChat(opts.systemPrompt, scenario.q, {
    model: opts.model,
    disableFastPath: opts.disableFastPath,
    history,
  });

  const toolNames = run.toolCalls.map((c) => c.name);
  const toolArgsBlob = run.toolCalls.map((c) => c.arguments).join('\n');
  const grade = softGrade({
    scenario,
    answer: run.answer,
    toolNames,
    toolArgsBlob,
    error: run.error,
  });

  return {
    id: scenario.id,
    section: scenario.section,
    q: scenario.q,
    intent: scenario.intent,
    difficulty: scenario.difficulty,
    answer: run.answer,
    tools: run.toolCalls.map((c) => `${c.name}(${c.arguments.slice(0, 200)})`),
    toolRounds: run.toolRounds,
    durationMs: seedDurationMs + run.durationMs,
    fastPath: run.fastPath,
    model: run.model,
    seedId,
    seedAnswerPreview,
    grade,
    error: run.error,
    notes: scenario.notes,
  };
}

function compareReports(pathA: string, pathB: string) {
  const a = JSON.parse(fs.readFileSync(pathA, 'utf8')) as ScenarioReport;
  const b = JSON.parse(fs.readFileSync(pathB, 'utf8')) as ScenarioReport;
  const mapB = new Map(b.rows.map((r) => [r.id, r]));
  const lines: string[] = [
    `# Soft scenario cross-validate`,
    '',
    `- A: ${pathA} (mean ${(a.meanScore * 100).toFixed(1)}%)`,
    `- B: ${pathB} (mean ${(b.meanScore * 100).toFixed(1)}%)`,
    '',
    '| id | scoreA | scoreB | Δ | signalAgree | disagreements |',
    '|---|---:|---:|---:|---:|---|',
  ];
  let agreeSum = 0;
  let n = 0;
  for (const ra of a.rows) {
    const rb = mapB.get(ra.id);
    if (!rb) continue;
    const c = compareSoftGrades(ra.grade, rb.grade);
    agreeSum += c.signalAgreement;
    n++;
    lines.push(
      `| ${ra.id} | ${(ra.grade.score * 100).toFixed(0)}% | ${(rb.grade.score * 100).toFixed(0)}% | ${(c.scoreDelta * 100).toFixed(0)} | ${(c.signalAgreement * 100).toFixed(0)}% | ${c.disagreements.slice(0, 2).join('; ') || '—'} |`,
    );
  }
  lines.push('', `Mean signal agreement: **${n ? ((agreeSum / n) * 100).toFixed(1) : 0}%**`);
  const outMd = lines.join('\n');
  console.log(outMd);
  const outPath = path.resolve(__dirname, 'out', `compare-${Date.now()}.md`);
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, outMd);
  console.log(`\nWrote ${outPath}`);
}

async function main() {
  const compareArgs = argPositionalAfter('compare');
  if (hasFlag('compare') && compareArgs.length >= 2) {
    compareReports(path.resolve(compareArgs[0]), path.resolve(compareArgs[1]));
    return;
  }

  const all = buildUserScenarios();
  const byId = new Map(all.map((s) => [s.id, s]));

  const idsRaw = arg('ids');
  const scenarios = filterScenarios({
    section: arg('section'),
    intent: arg('intent'),
    difficulty: arg('difficulty') as SoftScenario['difficulty'] | undefined,
    ids: idsRaw ? idsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    limit: arg('limit') ? Number(arg('limit')) : undefined,
    offset: arg('offset') ? Number(arg('offset')) : undefined,
  });

  const disableFastPath = hasFlag('no-fast-path');
  const concurrency = Number(arg('concurrency') ?? 2);
  const model = arg('model') ?? getChatModel();
  const label = arg('label') ?? `scenarios-${new Date().toISOString().slice(0, 10)}`;
  const systemPrompt = SYSTEM_PROMPT;

  console.log(
    `[scenarios] label=${label} n=${scenarios.length}/200 model=${model} concurrency=${concurrency} fastPath=${disableFastPath ? 'OFF' : 'ON'}`,
  );

  let done = 0;
  const rows = await mapLimit(scenarios, concurrency, async (sc) => {
    const row = await runScenario(sc, {systemPrompt, model, disableFastPath, byId});
    done++;
    console.log(
      `  ${done}/${scenarios.length} ${sc.id} score=${(row.grade.score * 100).toFixed(0)}% ${row.durationMs}ms misses=${row.grade.misses.length}`,
    );
    return row;
  });

  const {meanScore, bySection} = summarize(rows);
  const report: ScenarioReport = {
    label,
    kind: 'soft-scenarios',
    createdAt: new Date().toISOString(),
    model,
    disableFastPath,
    concurrency,
    n: rows.length,
    meanScore,
    bySection,
    rows,
  };

  const outDir = path.resolve(__dirname, 'out');
  fs.mkdirSync(outDir, {recursive: true});
  const jsonPath = path.join(outDir, `${label}.json`);
  const mdPath = path.join(outDir, `${label}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, mdReport(report));

  console.log(`\nmean score ${(meanScore * 100).toFixed(1)}%`);
  console.log(`Report → ${jsonPath}`);
  console.log(`Review → ${mdPath}`);
}

const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
