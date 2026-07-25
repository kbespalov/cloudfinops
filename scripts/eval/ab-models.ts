/**
 * A/B smoke: default gpt-oss-120b vs google/gemini-3-flash-preview (Cloud.ru FM).
 *
 *   npx tsx scripts/eval/ab-models.ts
 *   npx tsx scripts/eval/ab-models.ts --models openai/gpt-oss-120b,google/gemini-3-flash-preview
 */
import {runChat} from './harness';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';
import {looksLikeToolCallLeak} from '../../src/lib/chat/tool-call-recovery';
import {getChatModel} from '../../src/lib/chat/gigachat';

type Case = {
  id: string;
  q: string;
  /** Agent path — skip deterministic chips. */
  noFastPath?: boolean;
  expectTools?: RegExp;
  expectAnswer?: RegExp;
  /** Soft signals for multi-stack quality. */
  expectComponents?: RegExp[];
};

const CASES: Case[] = [
  // Regular — force agent path so models are compared (not homepage fast-path).
  {
    id: 'vm-8-32',
    q: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    noFastPath: true,
    expectTools: /get_quote/,
    expectAnswer: /₽|руб|мес/i,
  },
  {
    id: 's3-50tb',
    q: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    noFastPath: true,
    expectTools: /search_prices|standard|51200/i,
    expectAnswer: /₽|руб/i,
  },
  {
    id: 'public-ip',
    q: 'Сравни цену внешнего белого IP в месяц. Где дешевле арендовать адрес?',
    noFastPath: true,
    expectTools: /search_prices|IP|адрес/i,
    expectAnswer: /₽|IP|адрес/i,
  },
  {
    id: 'k8s',
    q: 'Сравни Managed Kubernetes по провайдерам',
    noFastPath: true,
    expectTools: /search_prices|kubernetes/i,
    expectAnswer: /₽|kubernetes|мастер|k8s/i,
  },
  {
    id: 'budget-100k',
    q: 'Бюджет примерно 100 тысяч рублей в месяц — какую инфраструктуру я могу себе позволить? Подбери, не устраивай длинный опрос.',
    noFastPath: true,
    expectTools: /fit_budget|100000|budget/i,
    expectAnswer: /vCPU|ВМ|бюджет|утил/i,
  },
  // Multi-component (agent must own tool chain)
  {
    id: 'stack-vm-ip-s3-k8s',
    q: 'Собери стоимость: 2 ВМ по 4 vCPU / 8 GiB, 2 внешних IP, Object Storage Standard 1 TiB и 1 зональный мастер Managed Kubernetes. Сравни по провайдерам за месяц, с колонкой к best offer.',
    noFastPath: true,
    expectTools: /get_quote|search_prices/i,
    expectAnswer: /kubernetes|k8s|мастер|IP|хранилищ|₽/i,
    expectComponents: [/IP|ip|адрес/i, /хранилищ|S3|object|TiB|GiB/i, /kubernetes|k8s|мастер/i],
  },
  {
    id: 'stack-vm-ip-s3-cdn-k8s',
    q: 'Собери решение на месяц по провайдерам: ВМ 16 vCPU / 32 GiB / 100 GiB SSD, 1 публичный IP, Object Storage Standard 100 ТБ, исходящий трафик CDN 100 ТБ, 1 зональный мастер Managed Kubernetes. Итоговая таблица с колонками по каждому компоненту, Итого и к минимуму.',
    noFastPath: true,
    expectTools: /get_quote|search_prices|cdn|kubernetes|storage|network/i,
    expectAnswer: /CDN|cdn|kubernetes|k8s|IP|хранилищ|S3|₽/i,
    expectComponents: [
      /ВМ|vCPU|16/i,
      /IP|ip|адрес/i,
      /S3|хранилищ|100\s*Т[БB]/i,
      /CDN|cdn/i,
      /K8s|kubernetes|мастер/i,
      /Итого|к минимуму|\+\d+%/i,
    ],
  },
];

type Grade = {
  id: string;
  ok: boolean;
  tools: number;
  rounds: number;
  ms: number;
  fastPath: boolean;
  leak: boolean;
  toolOk: boolean;
  answerOk: boolean;
  componentsOk: number;
  componentsTotal: number;
  cats: string[];
  preview: string;
  error?: string;
};

function grade(c: Case, run: Awaited<ReturnType<typeof runChat>>): Grade {
  const answer = run.answer ?? '';
  const blob = run.toolCalls.map((t) => `${t.name} ${t.arguments}`).join(' | ');
  const cats = run.toolCalls.map((t) => {
    try {
      const args = JSON.parse(t.arguments) as {category?: string};
      return args.category || t.name;
    } catch {
      return t.name;
    }
  });
  const toolOk = c.expectTools ? c.expectTools.test(blob) : run.toolCalls.length > 0;
  const answerOk = c.expectAnswer
    ? c.expectAnswer.test(answer) && answer.trim().length >= 40
    : answer.trim().length >= 40;
  const comps = c.expectComponents ?? [];
  const componentsOk = comps.filter((re) => re.test(answer)).length;
  const leak = looksLikeToolCallLeak(answer);
  const ok =
    !run.error &&
    !leak &&
    toolOk &&
    answerOk &&
    (comps.length === 0 || componentsOk === comps.length);

  return {
    id: c.id,
    ok,
    tools: run.toolCalls.length,
    rounds: run.toolRounds,
    ms: run.durationMs,
    fastPath: run.fastPath,
    leak,
    toolOk,
    answerOk,
    componentsOk,
    componentsTotal: comps.length,
    cats,
    preview: answer.replace(/\s+/g, ' ').slice(0, 220),
    error: run.error,
  };
}

async function runModel(model: string): Promise<Grade[]> {
  console.log(`\n======== ${model} ========`);
  const out: Grade[] = [];
  for (const c of CASES) {
    process.stdout.write(`  ${c.id}… `);
    const run = await runChat(SYSTEM_PROMPT, c.q, {
      model,
      disableFastPath: Boolean(c.noFastPath),
    });
    const g = grade(c, run);
    out.push(g);
    console.log(
      `${g.ok ? 'OK' : 'FAIL'} ${(g.ms / 1000).toFixed(1)}s tools=${g.tools} rounds=${g.rounds}` +
        `${g.fastPath ? ' fast' : ''}` +
        (g.componentsTotal
          ? ` comps=${g.componentsOk}/${g.componentsTotal}`
          : '') +
        (g.error ? ` err=${g.error.slice(0, 80)}` : ''),
    );
    if (!g.ok) {
      console.log(`    cats: ${g.cats.join(', ') || '—'}`);
      console.log(`    preview: ${g.preview}`);
    }
  }
  return out;
}

function summarize(model: string, grades: Grade[]) {
  const pass = grades.filter((g) => g.ok).length;
  const stack = grades.filter((g) => g.id.startsWith('stack-'));
  const stackPass = stack.filter((g) => g.ok).length;
  const avgMs = Math.round(grades.reduce((s, g) => s + g.ms, 0) / grades.length);
  const stackComps = stack.reduce((s, g) => s + g.componentsOk, 0);
  const stackCompsMax = stack.reduce((s, g) => s + g.componentsTotal, 0);
  return {
    model,
    pass: `${pass}/${grades.length}`,
    stackPass: `${stackPass}/${stack.length}`,
    stackComps: `${stackComps}/${stackCompsMax}`,
    avgMs,
    leaks: grades.filter((g) => g.leak).length,
    errors: grades.filter((g) => g.error).length,
  };
}

async function main() {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    console.error('CLOUDRU_FM_API_KEY missing');
    process.exit(2);
  }
  const arg = process.argv.find((a) => a.startsWith('--models='));
  const models = (arg?.slice('--models='.length) ||
    `openai/gpt-oss-120b,google/gemini-3-flash-preview`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`A/B models · default env model=${getChatModel()}`);
  console.log(`cases=${CASES.length} · models=${models.join(' | ')}`);

  const summaries = [];
  const byModel = new Map<string, Grade[]>();
  for (const model of models) {
    const grades = await runModel(model);
    byModel.set(model, grades);
    summaries.push(summarize(model, grades));
  }

  console.log('\n======== SUMMARY ========');
  console.log(
    `${'model'.padEnd(40)} ${'pass'.padStart(8)} ${'stack'.padStart(8)} ${'comps'.padStart(10)} ${'avgMs'.padStart(8)} ${'leak'.padStart(5)} ${'err'.padStart(4)}`,
  );
  for (const s of summaries) {
    console.log(
      `${s.model.slice(0, 40).padEnd(40)} ${s.pass.padStart(8)} ${s.stackPass.padStart(8)} ${s.stackComps.padStart(10)} ${String(s.avgMs).padStart(8)} ${String(s.leaks).padStart(5)} ${String(s.errors).padStart(4)}`,
    );
  }

  // Side-by-side stack verdict
  if (models.length >= 2) {
    console.log('\n======== STACK DETAIL ========');
    for (const c of CASES.filter((x) => x.id.startsWith('stack-'))) {
      console.log(`\n${c.id}`);
      for (const model of models) {
        const g = byModel.get(model)?.find((x) => x.id === c.id);
        if (!g) continue;
        console.log(
          `  ${model}: ${g.ok ? 'OK' : 'FAIL'} tools=${g.tools} [${g.cats.join(',')}] ` +
            `comps=${g.componentsOk}/${g.componentsTotal} ${(g.ms / 1000).toFixed(1)}s`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
