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
  /** Comparison table should show % vs cheapest (best offer column). */
  expectBestOfferPct?: boolean;
  /** Answer body must match (e.g. multi-component stack columns). */
  expectAnswerMatch?: RegExp;
  /** Soft/hard latency budget for homepage chips (ms). */
  maxDurationMs?: number;
};

/** Homepage chip prompts — target &lt;5s via fast-path. */
const HOME_SUITE: SmokeCase[] = [
  {
    id: 'home-vm',
    q: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    expectTools: true,
    expectToolMatch: /get_quote/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-h100',
    q: 'Самый дешёвый H100 в месяц',
    expectTools: true,
    expectToolMatch: /search_prices|H100/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-s3',
    q: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    expectTools: true,
    expectToolMatch: /search_prices|standard|51200/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-ssd',
    q: 'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    expectTools: true,
    expectToolMatch: /compare_unit_price|ssd/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-k8s',
    q: 'Сравни Managed Kubernetes по провайдерам',
    expectTools: true,
    expectToolMatch: /search_prices|kubernetes/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-glm',
    q: 'Сколько стоит GLM 5.2 у MWS за 1M токенов?',
    expectTools: true,
    expectToolMatch: /search_prices|GLM|mws/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-qwen',
    q: 'Сравни цены Qwen 3.6 по провайдерам за 1M токенов',
    expectTools: true,
    expectToolMatch: /search_prices|Qwen/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
  {
    id: 'home-ai',
    q: 'Сравни цены AI API / токенов по провайдерам',
    expectTools: true,
    expectToolMatch: /search_prices|ai/,
    expectPriceSignal: true,
    maxDurationMs: 5000,
  },
];

const SUITE: SmokeCase[] = [
  {
    id: 'k8s-vague',
    q: 'Сравни цены на зональный мастер Managed Kubernetes по провайдерам',
    expectTools: true,
    expectToolMatch: /kubernetes|k8s|кубер|search_prices/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
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
    expectBestOfferPct: true,
  },
  {
    id: 's3-standard',
    q: 'Кто дешевле по объектному хранилищу Standard за гигабайт в месяц?',
    expectTools: true,
    expectToolMatch: /search_prices|standard|хран|object|s3/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
  },
  {
    id: 'unit-vcpu',
    q: 'Какая средняя цена 1 vCPU по провайдерам?',
    expectTools: true,
    expectToolMatch: /compare_unit_price|vcpu|search_prices/i,
    expectPriceSignal: true,
  },
  {
    id: 'vm-best-offer-pct',
    q: 'Сравни ВМ 4 vCPU / 16 GiB по провайдерам на месяц. В таблице покажи процент к самому дешёвому.',
    expectTools: true,
    expectToolMatch: /get_quote|vcpu|4/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
  },
  {
    id: 'stack-vm-ip-s3-k8s',
    q: 'Собери стоимость: 2 ВМ по 4 vCPU / 8 GiB, 2 внешних IP, Object Storage Standard 1 TiB и 1 зональный мастер Managed Kubernetes. Сравни по провайдерам за месяц, с колонкой к best offer.',
    expectTools: true,
    expectToolMatch: /get_quote|search_prices/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
    expectAnswerMatch: /kubernetes|k8s|мастер|IP|object|хранилищ/i,
  },
  {
    id: 'fit-budget-100k',
    q: 'Бюджет примерно 100 тысяч рублей в месяц — какую инфраструктуру я могу себе позволить? Подбери, не устраивай длинный опрос.',
    expectTools: true,
    expectToolMatch: /fit_budget|100000|budget/i,
    expectPriceSignal: true,
    expectAnswerMatch: /vCPU|ВМ|бюджет|утил/i,
  },
];

const CYRILLIC = /[А-Яа-яЁё]/;
const PRICE_SIGNAL = /₽|руб|\bмес\b|\bчас\b|\d[\d\s.,]*\s*(₽|руб)/i;
/** best / 0% / +12% / к best offer — signals from the new comparison column. */
const BEST_OFFER_PCT =
  /\bbest\b|к\s*best\s*offer|best\s*offer|\+?\d+\s*%|0\s*%|дешев/i;

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
  const toolNameLeak =
    /\bwe will call\b/i.test(answer) ||
    /\bsearch_prices\b/.test(answer) ||
    /\bget_quote\b/.test(answer) ||
    /\bcompare_unit_price\b/.test(answer) ||
    /\bfit_budget\b/.test(answer);
  checks.push({
    ok: !toolNameLeak,
    detail: toolNameLeak
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

  if (c.expectBestOfferPct) {
    const hasPct = BEST_OFFER_PCT.test(answer) && /\d+\s*%/.test(answer);
    checks.push({
      ok: hasPct,
      detail: hasPct
        ? 'best-offer % signal present'
        : 'FAIL: no % vs best offer in answer (need e.g. +12% / best / к best offer)',
    });
  }

  if (c.expectAnswerMatch) {
    checks.push({
      ok: c.expectAnswerMatch.test(answer),
      detail: c.expectAnswerMatch.test(answer)
        ? `answer match ${c.expectAnswerMatch}`
        : `FAIL: answer did not match ${c.expectAnswerMatch}`,
    });
  }

  if (c.maxDurationMs != null) {
    const ok = run.durationMs <= c.maxDurationMs;
    checks.push({
      ok,
      detail: ok
        ? `latency ${(run.durationMs / 1000).toFixed(1)}s ≤ ${(c.maxDurationMs / 1000).toFixed(0)}s`
        : `FAIL: latency ${(run.durationMs / 1000).toFixed(1)}s > ${(c.maxDurationMs / 1000).toFixed(0)}s budget`,
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

async function runSuite(cases: SmokeCase[], label: string) {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    console.error('CLOUDRU_FM_API_KEY missing (.env.local). Cannot smoke the live chat.');
    process.exit(2);
  }

  console.log(
    `Smoke ${label}: ${cases.length} questions · model=${process.env.CLOUDRU_FM_MODEL || 'default'}`,
  );
  let failedCases = 0;
  const t0 = Date.now();

  // Sequential: avoid bursting the FM rate limit during local smoke.
  for (const c of cases) {
    const run = await runChat(SYSTEM_PROMPT, c.q);
    const checks = gradeCase(c, run);
    printRun(c, run, checks);
    if (checks.some((x) => !x.ok)) failedCases += 1;
  }

  console.log(
    `\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${cases.length - failedCases}/${cases.length} passed`,
  );
  process.exit(failedCases ? 1 : 0);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--home')) {
    await runSuite(HOME_SUITE, 'home chips');
    return;
  }
  const args = argv.filter((a) => a !== '--suite');
  const forceSuite = argv.includes('--suite') || args.length === 0;
  if (forceSuite && args.length === 0) {
    await runSuite(SUITE, 'suite');
    return;
  }
  if (args.length) {
    await runOne(args.join(' '));
    return;
  }
  await runSuite(SUITE, 'suite');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
