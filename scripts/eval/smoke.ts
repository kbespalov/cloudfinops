/**
 * Live smoke for the FinOps chat pipeline (needs CLOUDRU_FM_API_KEY).
 *
 * Usage:
 *   npm run eval:smoke
 *   npx tsx scripts/eval/smoke.ts "свой вопрос"
 *   npx tsx scripts/eval/smoke.ts --suite
 *
 * Checks: no English tool-planning leak in the answer, tools fired when
 * expected, non-empty Russian response, basic price signals for price Qs.
 */
import {runChat} from './harness';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';
import {looksLikeToolCallLeak} from '../../src/lib/chat/tool-call-recovery';

type SmokeCase = {
  id: string;
  q: string;
  /** Expect at least one tool call. */
  expectTools?: boolean;
  /** Substrings that should appear in some tool call (name or args). */
  expectToolMatch?: RegExp;
  /** Answer should mention a ruble / price-ish signal. */
  expectPriceSignal?: boolean;
};

const SUITE: SmokeCase[] = [
  {
    id: 'k8s-vague',
    q: 'ассистировай про кубернатис',
    expectTools: true,
    expectToolMatch: /kubernetes|k8s|кубер/i,
  },
  {
    id: 'h100-price',
    q: 'Сколько стоит NVIDIA H100 в час и кто из провайдеров его предлагает?',
    expectTools: true,
    expectToolMatch: /H100|search_prices|get_quote/i,
    expectPriceSignal: true,
  },
  {
    id: 'vm-quote',
    q: 'Сравни цену ВМ 4 vCPU / 8 GiB / 50 GiB SSD по провайдерам на месяц',
    expectTools: true,
    expectToolMatch: /get_quote|vcpu|4/i,
    expectPriceSignal: true,
  },
  {
    id: 's3-standard',
    q: 'Кто дешевле по объектному хранилищу Standard за гигабайт в месяц?',
    expectTools: true,
    expectToolMatch: /search_prices|standard|хран|object|s3/i,
    expectPriceSignal: true,
  },
  {
    id: 'unit-vcpu',
    q: 'Какая средняя цена 1 vCPU по провайдерам?',
    expectTools: true,
    expectToolMatch: /compare_unit_price|vcpu|search_prices/i,
    expectPriceSignal: true,
  },
];

const CYRILLIC = /[А-Яа-яЁё]/;
const PRICE_SIGNAL = /₽|руб|\bмес\b|\bчас\b|\d[\d\s.,]*\s*(₽|руб)/i;

type Check = {ok: boolean; detail: string};

function gradeCase(c: SmokeCase, run: Awaited<ReturnType<typeof runChat>>): Check[] {
  const checks: Check[] = [];

  if (run.error) {
    checks.push({ok: false, detail: `error: ${run.error.slice(0, 160)}`});
    return checks;
  }

  const answer = (run.answer ?? '').trim();
  checks.push({
    ok: answer.length >= 40,
    detail: `answer length ${answer.length} (need ≥40)`,
  });
  checks.push({
    ok: !looksLikeToolCallLeak(answer),
    detail: looksLikeToolCallLeak(answer)
      ? 'FAIL: tool-planning leak in answer'
      : 'no tool-planning leak',
  });
  checks.push({
    ok: !/\bwe will call\b/i.test(answer) && !/\bsearch_prices\b/.test(answer),
    detail:
      /\bsearch_prices\b/.test(answer) || /\bwe will call\b/i.test(answer)
        ? 'FAIL: raw tool name / English planning in answer'
        : 'no raw tool names in answer',
  });
  checks.push({
    ok: CYRILLIC.test(answer),
    detail: CYRILLIC.test(answer) ? 'has Cyrillic' : 'FAIL: no Cyrillic in answer',
  });

  if (c.expectTools) {
    checks.push({
      ok: run.toolCalls.length > 0,
      detail:
        run.toolCalls.length > 0
          ? `tools×${run.toolCalls.length}`
          : 'FAIL: expected tool calls, got 0',
    });
  }

  if (c.expectToolMatch) {
    const blob = run.toolCalls.map((t) => `${t.name} ${t.arguments}`).join(' | ');
    checks.push({
      ok: c.expectToolMatch.test(blob),
      detail: c.expectToolMatch.test(blob)
        ? `tool match ${c.expectToolMatch}`
        : `FAIL: tools did not match ${c.expectToolMatch}: ${blob.slice(0, 180)}`,
    });
  }

  if (c.expectPriceSignal) {
    checks.push({
      ok: PRICE_SIGNAL.test(answer),
      detail: PRICE_SIGNAL.test(answer)
        ? 'price signal present'
        : 'FAIL: no ₽/руб/час/мес in answer',
    });
  }

  return checks;
}

function printRun(c: SmokeCase, run: Awaited<ReturnType<typeof runChat>>, checks: Check[]) {
  const failed = checks.filter((x) => !x.ok);
  const mark = failed.length ? 'FAIL' : 'OK';
  console.log(`\n[${mark}] ${c.id}: ${c.q}`);
  console.log(
    `  ${(run.durationMs / 1000).toFixed(1)}s · tools=${run.toolCalls.length} · rounds=${run.toolRounds}` +
      ` · leak recover/retry/drop=${run.leaksRecovered}/${run.leaksRetried}/${run.leaksDropped}`,
  );
  if (run.toolCalls.length) {
    console.log(
      '  tools:',
      run.toolCalls.map((t) => `${t.name}(${t.arguments.slice(0, 80)})`).join(' | '),
    );
  }
  for (const ch of checks) {
    console.log(`  ${ch.ok ? '✓' : '✗'} ${ch.detail}`);
  }
  const preview = (run.answer ?? '').replace(/\s+/g, ' ').slice(0, 280);
  console.log(`  answer: ${preview}${preview.length >= 280 ? '…' : ''}`);
}

async function runOne(q: string) {
  const c: SmokeCase = {id: 'adhoc', q, expectTools: true};
  const run = await runChat(SYSTEM_PROMPT, q);
  const checks = gradeCase(c, run);
  printRun(c, run, checks);
  process.exit(checks.some((x) => !x.ok) ? 1 : 0);
}

async function runSuite() {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    console.error('CLOUDRU_FM_API_KEY missing (.env.local). Cannot smoke the live chat.');
    process.exit(2);
  }

  console.log(`Smoke suite: ${SUITE.length} questions · model=${process.env.CLOUDRU_FM_MODEL || 'default'}`);
  let failedCases = 0;
  const t0 = Date.now();

  // Sequential: avoid bursting the FM rate limit during local smoke.
  for (const c of SUITE) {
    const run = await runChat(SYSTEM_PROMPT, c.q);
    const checks = gradeCase(c, run);
    printRun(c, run, checks);
    if (checks.some((x) => !x.ok)) failedCases += 1;
  }

  console.log(
    `\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${SUITE.length - failedCases}/${SUITE.length} passed`,
  );
  process.exit(failedCases ? 1 : 0);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--suite');
  const forceSuite = process.argv.includes('--suite') || args.length === 0;
  if (forceSuite && args.length === 0) {
    await runSuite();
    return;
  }
  if (args.length) {
    await runOne(args.join(' '));
    return;
  }
  await runSuite();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
