/** Re-grade a stored eval report (out/<label>.json) with the current grader — no API calls. */
import fs from 'node:fs';
import path from 'node:path';
import {grade, type ProviderId, type Truth} from './ground-truth';
import {buildQuestions} from './questions';

const label = process.argv[2] ?? 'baseline';
const file = path.resolve(__dirname, 'out', `${label}.json`);
const j = JSON.parse(fs.readFileSync(file, 'utf8')) as {rows: any[]};
const rows = j.rows;

// Recompute ground truth from questions (local, no API) so grader fixes apply.
const qById = new Map(buildQuestions().map((q) => [q.id, q]));

const graded = rows.map((r) => {
  const q = qById.get(r.id);
  const truth: Truth = q
    ? q.truth()
    : {allowed: new Set(r.allowed as ProviderId[]), cheapestProvider: r.cheapestProvider, cheapestPrice: r.cheapestPrice, raw: {}};
  return {...r, allowed: [...truth.allowed], cheapestProvider: truth.cheapestProvider, cheapestPrice: truth.cheapestPrice, grade: grade(r.answer ?? '', truth)};
});

const n = graded.length;
const sum = (f: (r: any) => number) => graded.reduce((s, r) => s + f(r), 0);
const noHalluc = sum((r) => (r.grade.noHalluc ? 1 : 0));
const hallucTotal = sum((r) => r.grade.hallucinated.length);
const cheapProvOk = sum((r) => (r.grade.cheapestProviderOk ? 1 : 0));
const cheapPriceOk = sum((r) => (r.grade.cheapestPriceOk ? 1 : 0));
const recallAvg = sum((r) => r.grade.recall) / n;
const pass = sum((r) => (r.grade.pass ? 1 : 0));

const byTag = new Map<string, {n: number; noHalluc: number; pass: number; halluc: number}>();
for (const r of graded) {
  const t = byTag.get(r.tag) ?? {n: 0, noHalluc: 0, pass: 0, halluc: 0};
  t.n++;
  t.noHalluc += r.grade.noHalluc ? 1 : 0;
  t.pass += r.grade.pass ? 1 : 0;
  t.halluc += r.grade.hallucinated.length;
  byTag.set(r.tag, t);
}

const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
console.log(`===== [${label}] RE-GRADED =====`);
console.log(`Questions:            ${n}`);
console.log(`No hallucination:     ${noHalluc}/${n}  (${pct(noHalluc)})`);
console.log(`Hallucinated (total): ${hallucTotal}`);
console.log(`Cheapest provider ok: ${cheapProvOk}/${n}  (${pct(cheapProvOk)})`);
console.log(`Cheapest price shown: ${cheapPriceOk}/${n}  (${pct(cheapPriceOk)})`);
console.log(`Provider recall avg:  ${(recallAvg * 100).toFixed(1)}%`);
console.log(`PASS:                 ${pass}/${n}  (${pct(pass)})`);
console.log(`\n--- by tag (noHalluc / pass / n / hallucMentions) ---`);
for (const [tag, t] of [...byTag.entries()].sort()) {
  console.log(`  ${tag.padEnd(18)} noHalluc ${t.noHalluc}/${t.n}  pass ${t.pass}/${t.n}  halluc ${t.halluc}`);
}
console.log(`\n--- remaining hallucinations ---`);
for (const r of graded.filter((r) => r.grade.hallucinated.length)) {
  console.log(`  [${r.id}] allowed={${r.allowed.join(',')}} invented={${r.grade.hallucinated.join(',')}}`);
}
