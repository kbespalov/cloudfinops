/**
 * Validate homepage chips against Gemini 3.1 Flash Lite with fast-path OFF.
 *
 *   npx tsx scripts/eval/validate-home-gemini.ts
 */
import {HOME_EXAMPLES} from '../../src/components/home/homePrompts';
import {looksLikeToolCallLeak} from '../../src/lib/chat/tool-call-recovery';
import {runChat} from './harness';
import {SYSTEM_PROMPT} from '../../src/lib/chat/system-prompt';

const MODEL = 'google/gemini-3.1-flash-lite';

type Expect = {
  tool?: RegExp;
  answer?: RegExp;
  /** Soft content checks (all must match). */
  must?: RegExp[];
};

const EXPECT: Record<string, Expect> = {
  vm: {
    tool: /get_quote/,
    answer: /₽|руб/i,
    must: [/vCPU|8/i, /Cloud\.ru|Selectel|Yandex|VK|MWS|T1/i, /min|\+\d+%/i],
  },
  h100: {
    tool: /search_prices|get_quote|H100/i,
    answer: /₽|руб/i,
    must: [/H100/i, /Cloud\.ru|Selectel|Yandex|VK|MWS|T1/i],
  },
  s3: {
    tool: /search_prices|standard|51200/i,
    answer: /₽|руб/i,
    must: [/Standard|стандарт/i, /Cloud\.ru|Selectel|Yandex|VK|MWS|T1/i],
  },
  'disk-100tb': {
    tool: /compare_unit_price|ssd/i,
    answer: /₽|руб/i,
    must: [/SSD|диск/i, /Cloud\.ru|Selectel|Yandex|VK|MWS|T1/i],
  },
  k8s: {
    tool: /search_prices|kubernetes/i,
    answer: /₽|руб/i,
    must: [/Kubernetes|мастер|k8s/i, /Cloud\.ru|Selectel|Yandex|VK|MWS|T1/i],
  },
  'glm-infra': {
    tool: /recommend_inference_infra|GLM/i,
    answer: /GPU|₽|руб/i,
    must: [/GLM|GPU/i],
  },
  'kimi-k3-infra': {
    tool: /recommend_inference_infra|Kimi|K3/i,
    answer: /GPU|₽|руб/i,
    must: [/Kimi|K3|GPU/i],
  },
  'qwen38-infra': {
    tool: /recommend_inference_infra|Qwen/i,
    answer: /GPU|₽|руб/i,
    must: [/Qwen|GPU/i],
  },
  'coder-next-infra': {
    tool: /recommend_inference_infra|Coder|Qwen/i,
    answer: /GPU|₽|руб/i,
    must: [/Coder|Qwen|GPU/i],
  },
  glm: {
    tool: /search_prices|GLM|mws/i,
    answer: /₽|руб|токен|1M|1\s*M/i,
    must: [/GLM|MWS/i],
  },
  ai: {
    tool: /search_prices|ai/i,
    answer: /₽|руб|токен/i,
    must: [/AI|токен|input|output|вход|выход/i],
  },
  'budget-100k': {
    tool: /fit_budget|100000|budget/i,
    answer: /₽|руб|vCPU|ВМ/i,
    must: [/бюджет|vCPU|ВМ|утил/i],
  },
};

type Row = {
  id: string;
  ok: boolean;
  ms: number;
  tools: number;
  rounds: number;
  cats: string[];
  checks: string[];
  preview: string;
};

async function main() {
  if (!process.env.CLOUDRU_FM_API_KEY) {
    console.error('CLOUDRU_FM_API_KEY missing');
    process.exit(2);
  }

  console.log(
    `Home chips × ${MODEL} · fastPath=OFF · n=${HOME_EXAMPLES.length}\n`,
  );

  const rows: Row[] = [];
  for (const ex of HOME_EXAMPLES) {
    process.stdout.write(`${ex.id}… `);
    const exp = EXPECT[ex.id] ?? {};
    const run = await runChat(SYSTEM_PROMPT, ex.prompt, {
      model: MODEL,
      disableFastPath: true,
    });
    const answer = run.answer ?? '';
    const blob = run.toolCalls.map((t) => `${t.name} ${t.arguments}`).join(' | ');
    const cats = run.toolCalls.map((t) => {
      try {
        return (JSON.parse(t.arguments) as {category?: string}).category || t.name;
      } catch {
        return t.name;
      }
    });

    const checks: string[] = [];
    const push = (ok: boolean, detail: string) => {
      checks.push(`${ok ? '✓' : '✗'} ${detail}`);
    };

    push(answer.trim().length >= 40, `answer len ${answer.trim().length}`);
    push(/[а-яё]/i.test(answer), 'cyrillic');
    push(!looksLikeToolCallLeak(answer), 'no tool-leak');
    push(!/\b(get_quote|search_prices|fit_budget|compare_unit_price)\b/.test(answer), 'no raw tool ids');
    push(run.toolCalls.length > 0, `tools×${run.toolCalls.length}`);
    if (exp.tool) push(exp.tool.test(blob), `tool ${exp.tool}`);
    if (exp.answer) push(exp.answer.test(answer), `answer ${exp.answer}`);
    for (const re of exp.must ?? []) {
      push(re.test(answer), `must ${re}`);
    }
    push(!run.error, run.error ? `error ${run.error.slice(0, 80)}` : 'no error');

    const ok = checks.every((c) => c.startsWith('✓'));
    rows.push({
      id: ex.id,
      ok,
      ms: run.durationMs,
      tools: run.toolCalls.length,
      rounds: run.toolRounds,
      cats,
      checks,
      preview: answer.replace(/\s+/g, ' ').slice(0, 220),
    });
    console.log(
      `${ok ? 'OK' : 'FAIL'} ${(run.durationMs / 1000).toFixed(1)}s tools=${run.toolCalls.length} rounds=${run.toolRounds}`,
    );
    if (!ok) {
      for (const c of checks.filter((x) => x.startsWith('✗'))) console.log(`  ${c}`);
      console.log(`  cats: ${cats.join(', ') || '—'}`);
      console.log(`  preview: ${rows[rows.length - 1]!.preview}`);
    }
  }

  const pass = rows.filter((r) => r.ok).length;
  const avg = Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length);
  console.log(`\n======== SUMMARY ========`);
  console.log(`${pass}/${rows.length} passed · avg ${avg}ms · model=${MODEL} · fastPath=OFF`);
  for (const r of rows) {
    console.log(
      `  ${r.ok ? 'OK' : 'FAIL'} ${r.id.padEnd(18)} ${(r.ms / 1000).toFixed(1)}s  tools=${r.tools} [${r.cats.join(',')}]`,
    );
  }
  process.exit(pass === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
