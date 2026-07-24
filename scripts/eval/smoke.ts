/**
 * Live smoke for the FinOps chat pipeline (needs CLOUDRU_FM_API_KEY).
 *
 * Usage:
 *   npm run eval:smoke
 *   npx tsx scripts/eval/smoke.ts "свой вопрос"
 *   npx tsx scripts/eval/smoke.ts --suite
 *   npx tsx scripts/eval/smoke.ts --new   # only freshly added natural questions
 *   npx tsx scripts/eval/smoke.ts --agent # near-miss agent-lite (no alias)
 *   npx tsx scripts/eval/smoke.ts --home
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
    id: 'home-glm-infra',
    q: 'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    expectTools: true,
    expectToolMatch: /recommend_inference_infra|GLM/,
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

/**
 * Fresh natural-language questions (2026-07): paraphrases, network, niche GPU,
 * inference infra, typos — not covered by the original suite chips.
 */
/** Latency budget: fast-path + deterministic tables should stay near ~10s. */
const FAST_BUDGET_MS = 12_000;

const NEW_SUITE: SmokeCase[] = [
  {
    id: 'new-egress-1tb',
    q: 'Сколько примерно выйдет 1 ТБ исходящего трафика (egress) в месяц у разных провайдеров?',
    expectTools: true,
    expectToolMatch: /search_prices|egress|трафик|network/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-public-ip',
    q: 'Сравни цену внешнего белого IP в месяц. Где дешевле арендовать адрес?',
    expectTools: true,
    expectToolMatch: /search_prices|IP|ipv4|адрес/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-l40s-hour',
    q: 'Кто отдаёт L40S и сколько стоит GPU-час? Нужна таблица по провайдерам.',
    expectTools: true,
    expectToolMatch: /search_prices|get_quote|L40S/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-h200-month',
    q: 'Самый дешёвый H200 на месяц в российских облаках — кто и сколько?',
    expectTools: true,
    expectToolMatch: /search_prices|get_quote|H200/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-cold-5tb',
    q: 'Оцени 5 ТБ холодного (Cold) объектного хранилища на месяц. Не мешай со Standard.',
    expectTools: true,
    expectToolMatch: /search_prices|cold|5120|хран/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-k8s-ha',
    q: 'Сравни отказоустойчивый / региональный мастер Managed Kubernetes по цене за месяц.',
    expectTools: true,
    expectToolMatch: /search_prices|kubernetes|k8s|регион|ha|отказоустойчив/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-k8s-typo',
    q: 'асистируй про кубернатис плиз, сколько мастер стоит',
    expectTools: true,
    expectToolMatch: /search_prices|kubernetes|k8s|кубер/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-qwen32b-infra',
    q: 'Хочу поднять Qwen3 32B у себя на GPU в РФ — какую карту и сколько штук брать, с ценами?',
    expectTools: true,
    expectToolMatch: /recommend_inference_infra|Qwen|32B/i,
    expectPriceSignal: true,
    expectAnswerMatch: /GPU|H100|L40|VRAM|карт/i,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-kimi-tokens',
    q: 'Сколько стоит Kimi K2.6 за миллион токенов и где в РФ её хостят?',
    expectTools: true,
    expectToolMatch: /search_prices|Kimi|K2\.6|ai/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-budget-50k',
    q: 'Есть 50 тыс ₽/мес на облако — что реально взять из обычных ВМ без GPU? Без допроса.',
    expectTools: true,
    expectToolMatch: /fit_budget|50000|budget/i,
    expectPriceSignal: true,
    expectAnswerMatch: /ВМ|vCPU|бюджет|конфиг/i,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-ram-unit',
    q: 'Какая минимальная цена 1 GiB RAM в месяц по провайдерам?',
    expectTools: true,
    expectToolMatch: /compare_unit_price|ram|search_prices/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-a100-8x',
    q: 'Сравни конфигурацию 8×A100 по провайдерам за месяц — кому выгоднее паритет.',
    expectTools: true,
    expectToolMatch: /get_quote|search_prices|A100|8/i,
    expectPriceSignal: true,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-selectel-gpus',
    q: 'Какие GPU вообще есть у Selectel в каталоге? Только Selectel, без других.',
    expectTools: true,
    expectToolMatch: /search_prices|selectel|gpu/i,
    expectAnswerMatch: /Selectel|GPU|H100|A100|L40|нет|не найден/i,
    maxDurationMs: FAST_BUDGET_MS,
  },
  {
    id: 'new-ssd-not-s3',
    q: 'Сколько стоит 10 ТБ именно блочного SSD в месяц? Это не S3 и не объектка.',
    expectTools: true,
    expectToolMatch: /compare_unit_price|ssd|get_quote|disk/i,
    expectPriceSignal: true,
    expectAnswerMatch: /SSD|диск|GiB|ТБ|блоч/i,
    maxDurationMs: FAST_BUDGET_MS,
  },
];

/**
 * Near-miss / agent-lite: intentionally miss homepage aliases so the LLM picks
 * the tool, then deterministic formatting short-circuits the final RTT.
 * Target: well under a minute (budget 20s).
 */
const AGENT_BUDGET_MS = 20_000;

const AGENT_SUITE: SmokeCase[] = [
  {
    id: 'agent-vm-16-64-200',
    q: 'Сравни 16 vCPU / 64 GiB / 200 GiB SSD на месяц по облакам РФ',
    expectTools: true,
    expectToolMatch: /get_quote|vcpu|16|64/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
    maxDurationMs: AGENT_BUDGET_MS,
  },
  {
    id: 'agent-a30-hour',
    q: 'Сколько примерно выйдет A30 GPU-час у провайдеров РФ?',
    expectTools: true,
    expectToolMatch: /search_prices|get_quote|A30/i,
    expectPriceSignal: true,
    maxDurationMs: AGENT_BUDGET_MS,
  },
  {
    id: 'agent-budget-70k',
    q: 'Что взять на семьдесят тысяч рублей в месяц из обычных ВМ без GPU? Без опроса.',
    expectTools: true,
    expectToolMatch: /fit_budget|70000|budget/i,
    expectPriceSignal: true,
    expectAnswerMatch: /ВМ|vCPU|бюджет|конфиг/i,
    maxDurationMs: AGENT_BUDGET_MS,
  },
  {
    id: 'agent-ssd-12tb',
    q: 'Оцени именно блочный SSD на 12 терабайт в месяц — не объектное хранилище.',
    expectTools: true,
    expectToolMatch: /compare_unit_price|ssd|disk/i,
    expectPriceSignal: true,
    expectAnswerMatch: /SSD|диск|ТБ|GiB|блоч/i,
    maxDurationMs: AGENT_BUDGET_MS,
  },
  {
    id: 'agent-t4-month',
    q: 'Кто в РФ отдаёт T4 и сколько примерно за месяц выходит?',
    expectTools: true,
    expectToolMatch: /search_prices|get_quote|T4/i,
    expectPriceSignal: true,
    maxDurationMs: AGENT_BUDGET_MS,
  },
  {
    id: 'agent-vm-2-4-40',
    q: 'Нужна маленькая ВМ: 2 vCPU, 4 GiB RAM, 40 GiB SSD — сравни провайдеров за месяц',
    expectTools: true,
    expectToolMatch: /get_quote|vcpu|2/i,
    expectPriceSignal: true,
    expectBestOfferPct: true,
    maxDurationMs: AGENT_BUDGET_MS,
  },
];

const SUITE_ALL: SmokeCase[] = [...SUITE, ...NEW_SUITE, ...AGENT_SUITE];

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
    /\bfit_budget\b/.test(answer) ||
    /\brecommend_inference_infra\b/.test(answer);
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
  if (argv.includes('--new')) {
    await runSuite(NEW_SUITE, 'new natural questions');
    return;
  }
  if (argv.includes('--agent')) {
    await runSuite(AGENT_SUITE, 'agent near-miss');
    return;
  }
  const args = argv.filter(
    (a) => a !== '--suite' && a !== '--new' && a !== '--home' && a !== '--agent',
  );
  const forceSuite = argv.includes('--suite') || args.length === 0;
  if (forceSuite && args.length === 0) {
    await runSuite(SUITE_ALL, 'suite+new+agent');
    return;
  }
  if (args.length) {
    await runOne(args.join(' '));
    return;
  }
  await runSuite(SUITE_ALL, 'suite+new+agent');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
