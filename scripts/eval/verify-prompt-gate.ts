/**
 * Live verify intent-gated system prompt (25 grounded questions).
 * Forces agent path (--no-fast-path equivalent) so planning prompt is exercised.
 *
 *   npx tsx scripts/eval/verify-prompt-gate.ts
 *   npx tsx scripts/eval/verify-prompt-gate.ts --from 0 --limit 8
 */
import {runChat} from './harness';
import {SYSTEM_PROMPT, buildSystemPrompt, matchPlanningDomains} from '../../src/lib/chat/system-prompt';
import {looksLikeToolCallLeak} from '../../src/lib/chat/tool-call-recovery';

type Case = {
  id: string;
  q: string;
  expectTools?: RegExp;
  expectAnswer?: RegExp;
  /** Domains that should be attached for this ask. */
  expectDomains?: string[];
};

const CASES: Case[] = [
  // Compute / VM
  {
    id: 'vm-8-32',
    q: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    expectTools: /get_quote/,
    expectAnswer: /₽|руб|мес/i,
    expectDomains: ['compute'],
  },
  {
    id: 'vm-4-16',
    q: 'Сколько стоит ВМ 4 vCPU / 16 GiB в месяц? Сравни провайдеров.',
    expectTools: /get_quote/,
    expectAnswer: /₽|руб/i,
    expectDomains: ['compute'],
  },
  {
    id: 'vcpu-avg',
    q: 'Какая средняя цена 1 vCPU on-demand по провайдерам?',
    expectTools: /compare_unit_price|vcpu/i,
    expectAnswer: /₽|vCPU|ядра|средн/i,
    expectDomains: ['aggregates', 'compute'],
  },
  {
    id: 'ssd-100tb',
    q: 'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    expectTools: /compare_unit_price|ssd/i,
    expectAnswer: /₽|SSD|диск/i,
    expectDomains: ['compute'],
  },
  // GPU
  {
    id: 'h100-price',
    q: 'Самый дешёвый H100 в месяц — кто и сколько?',
    expectTools: /search_prices|get_quote|H100/i,
    expectAnswer: /₽|H100/i,
    expectDomains: ['gpu'],
  },
  {
    id: 'h100-parity',
    q: 'Сравни H100 по провайдерам с паритетом по конфигурации хоста',
    expectTools: /get_quote|H100/i,
    expectAnswer: /₽|H100|vCPU|GiB/i,
    expectDomains: ['gpu'],
  },
  {
    id: 'a100',
    q: 'Сколько стоит A100 в час у разных провайдеров?',
    expectTools: /search_prices|get_quote|A100/i,
    expectAnswer: /₽|A100/i,
    expectDomains: ['gpu'],
  },
  {
    id: 'l40s',
    q: 'Сравни цены на L40S по провайдерам за месяц',
    expectTools: /search_prices|get_quote|L40/i,
    expectAnswer: /₽|L40/i,
    expectDomains: ['gpu'],
  },
  // Inference / AI tokens
  {
    id: 'glm-tokens',
    q: 'Сколько стоит GLM 5.2 у MWS за 1M токенов?',
    expectTools: /search_prices|GLM|ai/i,
    expectAnswer: /₽|токен|input|output|GLM/i,
    expectDomains: ['ai'],
  },
  {
    id: 'qwen-tokens',
    q: 'Сравни цены Qwen 3.6 за 1M токенов по провайдерам',
    expectTools: /search_prices|Qwen|ai/i,
    expectAnswer: /₽|токен|Qwen/i,
    expectDomains: ['ai'],
  },
  {
    id: 'ai-api',
    q: 'Сравни цены AI API / токенов по провайдерам',
    expectTools: /search_prices|ai/i,
    expectAnswer: /₽|токен|AI/i,
    expectDomains: ['ai'],
  },
  {
    id: 'inference-glm',
    q: 'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    expectTools: /recommend_inference_infra|GLM/i,
    expectAnswer: /GPU|VRAM|H100|A100|₽/i,
  },
  {
    id: 'inference-qwen',
    q: 'Сколько GPU нужно, чтобы развернуть Qwen3 235B self-host?',
    expectTools: /recommend_inference_infra|Qwen/i,
    expectAnswer: /GPU|VRAM|карт|₽/i,
  },
  // Storage / network / k8s / cdn
  {
    id: 's3-50tb',
    q: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    expectTools: /search_prices|standard|51200/i,
    expectAnswer: /₽|Standard|хранилищ|S3/i,
    expectDomains: ['s3'],
  },
  {
    id: 's3-ice',
    q: 'Сравни цены Ice / холодного объектного хранилища по провайдерам',
    expectTools: /search_prices|ice|cold|storage/i,
    expectAnswer: /₽|Ice|Cold|хранилищ/i,
    expectDomains: ['s3'],
  },
  {
    id: 'public-ip',
    q: 'Сравни цену публичного IP в месяц по провайдерам',
    expectTools: /search_prices|IP|network/i,
    expectAnswer: /₽|IP|адрес/i,
  },
  {
    id: 'k8s',
    q: 'Сравни зональный мастер Managed Kubernetes по провайдерам',
    expectTools: /search_prices|kubernetes/i,
    expectAnswer: /₽|Kubernetes|мастер|k8s/i,
    expectDomains: ['k8s'],
  },
  {
    id: 'cdn-10tb',
    q: 'Сколько стоит 10 ТБ исходящего трафика CDN в месяц?',
    expectTools: /search_prices|cdn|10240/i,
    expectAnswer: /₽|CDN|трафик/i,
    expectDomains: ['cdn'],
  },
  // Budget / stack
  {
    id: 'budget-100k',
    q: 'Бюджет 100 тысяч ₽ в месяц — что можно позволить на compute? Без длинного опросника.',
    expectTools: /fit_budget|100000|budget/i,
    expectAnswer: /vCPU|ВМ|бюджет|утил|₽/i,
  },
  {
    id: 'stack-small',
    q: 'Собери стоимость: ВМ 4 vCPU / 8 GiB, 1 публичный IP, Object Storage Standard 1 ТиБ. Таблица по провайдерам за месяц.',
    expectTools: /compose_solution|get_quote|search_prices|search_catalog/i,
    expectAnswer: /₽|IP|хранилищ|S3|vCPU/i,
    expectDomains: ['stack', 's3', 'compute'],
  },
  {
    id: 'stack-full',
    q: 'Собери решение на месяц: ВМ 16 vCPU / 32 GiB / 100 GiB SSD, 1 публичный IP, Object Storage Standard 100 ТБ, CDN 100 ТБ, зональный мастер Managed Kubernetes. Итоговая таблица с колонками по компонентам, Итого и к минимуму.',
    expectTools: /compose_solution|get_quote|search_prices|search_catalog|validate_solution/i,
    expectAnswer: /₽|CDN|Kubernetes|IP|хранилищ|Итого|к минимуму/i,
    expectDomains: ['stack', 's3', 'cdn', 'k8s', 'compute'],
  },
  {
    id: 'compose-k8s-budget',
    q: 'Собери самый дешёвый managed Kubernetes: 3 worker-ноды, control plane, 1 ТБ S3 Standard, до 100 тысяч ₽/мес. Сравни провайдеров.',
    expectTools: /compose_solution|validate_solution|search_prices|get_quote/i,
    expectAnswer: /₽|Kubernetes|worker|мастер|допущен|₽\/мес|мес/i,
    expectDomains: ['k8s', 'stack'],
  },
  {
    id: 'compose-web',
    q: 'Собери web-приложение: ВМ 8 vCPU / 32 GiB, публичный IP, CDN egress 1 ТБ — сравни по провайдерам за месяц.',
    expectTools: /compose_solution|get_quote|search_prices|search_catalog/i,
    expectAnswer: /₽|vCPU|CDN|IP|мес/i,
    expectDomains: ['stack', 'compute', 'cdn'],
  },
  {
    id: 'nvme-unit',
    q: 'Сравни цену 1 GiB NVMe по провайдерам',
    expectTools: /compare_unit_price|nvme|ssd/i,
    expectAnswer: /₽|NVMe|GiB/i,
    expectDomains: ['aggregates', 'compute'],
  },
  // Edge / follow-up style (history simulated via phrasing)
  {
    id: 'ram-unit',
    q: 'Сравни среднюю цену 1 GiB RAM по провайдерам',
    expectTools: /compare_unit_price|ram/i,
    expectAnswer: /₽|RAM|GiB|средн/i,
    expectDomains: ['aggregates', 'compute'],
  },
  {
    id: 'vm-words',
    q: 'Сайт на шестнадцати ядрах и тридцати двух гигах памяти — сравни провайдеров за месяц',
    expectTools: /get_quote/,
    expectAnswer: /₽|16|32|vCPU/i,
    expectDomains: ['compute'],
  },
  {
    id: 'gpu-card-only',
    q: 'Сколько стоит только GPU H100 без учёта хоста — card-only цены по провайдерам',
    expectTools: /search_prices|H100/i,
    expectAnswer: /₽|H100|GPU/i,
    expectDomains: ['gpu'],
  },
  {
    id: 'k8s-ha',
    q: 'Сравни HA / региональный Managed Kubernetes control plane по провайдерам',
    expectTools: /search_prices|kubernetes|ha/i,
    expectAnswer: /₽|Kubernetes|HA|регион|мастер/i,
    expectDomains: ['k8s'],
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    // harness loads .env.local — re-check after import side effects
  }
  const from = Number(arg('from') ?? 0);
  const limit = Number(arg('limit') ?? CASES.length);
  const slice = CASES.slice(from, from + limit);

  console.log(
    `verify-prompt-gate: ${slice.length} cases (from=${from}) · agent path (no fast-path)`,
  );
  console.log(
    `core→gated example H100: ${buildSystemPrompt('H100').length} chars (full ${SYSTEM_PROMPT.length})`,
  );

  let passed = 0;
  let failed = 0;
  const t0 = Date.now();
  type Row = {
    id: string;
    ok: boolean;
    durationMs: number;
    toolCalls: number;
    toolRounds: number;
    tools: string[];
    scoreParts: {tools: boolean; answer: boolean; domains: boolean; leak: boolean; empty: boolean; error: boolean};
  };
  const rows: Row[] = [];

  for (const c of slice) {
    const domains = matchPlanningDomains(c.q);
    const domainOk =
      !c.expectDomains || c.expectDomains.every((d) => domains.includes(d as never));
    const gatedLen = buildSystemPrompt(c.q).length;

    const run = await runChat(SYSTEM_PROMPT, c.q, {disableFastPath: true});
    const leak = looksLikeToolCallLeak(run.answer);
    const toolsBlob = run.toolCalls.map((t) => `${t.name} ${t.arguments}`).join(' ');
    const toolOk = !c.expectTools || c.expectTools.test(toolsBlob);
    const answerOk = !c.expectAnswer || c.expectAnswer.test(run.answer ?? '');
    const noEmpty = Boolean((run.answer ?? '').trim());
    const ok =
      !run.error && noEmpty && !leak && toolOk && answerOk && domainOk;

    if (ok) passed += 1;
    else failed += 1;

    const toolNames = run.toolCalls.map((t) => t.name);
    rows.push({
      id: c.id,
      ok,
      durationMs: run.durationMs,
      toolCalls: run.toolCalls.length,
      toolRounds: run.toolRounds,
      tools: toolNames,
      scoreParts: {
        tools: toolOk,
        answer: answerOk,
        domains: domainOk,
        leak: !leak,
        empty: noEmpty,
        error: !run.error,
      },
    });

    console.log(`\n[${ok ? 'OK' : 'FAIL'}] ${c.id}`);
    console.log(
      `  ${(run.durationMs / 1000).toFixed(1)}s · tools=${run.toolCalls.length} · rounds=${run.toolRounds}` +
        ` · fastPath=${run.fastPath} · promptChars=${gatedLen} · domains=${domains.join(',') || '—'}`,
    );
    if (run.toolCalls.length) {
      console.log(
        '  tools:',
        run.toolCalls.map((t) => `${t.name}(${t.arguments.slice(0, 70)})`).join(' | '),
      );
    }
    if (!domainOk) console.log(`  ✗ domains: got [${domains}] want ${c.expectDomains}`);
    if (!toolOk) console.log(`  ✗ tools: expected ${c.expectTools}`);
    if (!answerOk) console.log(`  ✗ answer: expected ${c.expectAnswer}`);
    if (leak) console.log('  ✗ tool-call leak in answer');
    if (run.error) console.log(`  ✗ error: ${run.error}`);
    if (!noEmpty) console.log('  ✗ empty answer');
    const preview = (run.answer ?? '').replace(/\s+/g, ' ').slice(0, 220);
    console.log(`  answer: ${preview}${preview.length >= 220 ? '…' : ''}`);
  }

  const durations = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => {
    if (!durations.length) return 0;
    const idx = Math.min(
      durations.length - 1,
      Math.max(0, Math.ceil((p / 100) * durations.length) - 1),
    );
    return durations[idx]!;
  };
  const meanMs = Math.round(rows.reduce((s, r) => s + r.durationMs, 0) / Math.max(1, rows.length));
  const totalTools = rows.reduce((s, r) => s + r.toolCalls, 0);
  const meanTools = (totalTools / Math.max(1, rows.length)).toFixed(2);
  const toolHist = new Map<string, number>();
  for (const r of rows) for (const t of r.tools) toolHist.set(t, (toolHist.get(t) ?? 0) + 1);

  console.log(`\n===== SCOREBOARD (${slice.length} Q, agent path) =====`);
  console.log(
    `Pass: ${passed}/${slice.length} (${((passed / slice.length) * 100).toFixed(1)}%) · Fail: ${failed}`,
  );
  console.log(
    `Latency p50/p95/mean/max: ${Math.round(pct(50))}/${Math.round(pct(95))}/${meanMs}/${durations[durations.length - 1] ?? 0} ms`,
  );
  console.log(`Tool calls: total=${totalTools} · mean=${meanTools} · mean rounds=${(
    rows.reduce((s, r) => s + r.toolRounds, 0) / Math.max(1, rows.length)
  ).toFixed(2)}`);
  console.log(
    'Tools used:',
    [...toolHist.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n, c]) => `${n}×${c}`)
      .join(', ') || '—',
  );
  console.log('\n| id | ok | sec | tools | rounds | tool names |');
  console.log('|---|---|---:|---:|---:|---|');
  for (const r of rows) {
    console.log(
      `| ${r.id} | ${r.ok ? '✓' : '✗'} | ${(r.durationMs / 1000).toFixed(1)} | ${r.toolCalls} | ${r.toolRounds} | ${r.tools.join('+') || '—'} |`,
    );
  }

  console.log(
    `\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${passed}/${slice.length} passed · ${failed} failed`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
