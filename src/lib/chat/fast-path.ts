/**
 * Deterministic tool plans for homepage chips / first-turn twins.
 * Skips the planning LLM round (often the slowest) and finishes with one
 * tools-free completion on a short system prompt.
 */

import {chatCompletion, type ChatMessage} from './gigachat';
import {sanitizeUserFacingAnswer} from './tool-call-recovery';
import {runTool} from './tools';

export type FastPathTool = {
  name: string;
  args: Record<string, unknown>;
};

export type FastPathPlan = {
  id: string;
  tools: FastPathTool[];
};

export type FastPathEvent = {
  type: 'tool_call';
  name: string;
  arguments: string;
  recoveredFromLeak: boolean;
};

export type FastPathResult = {
  finalText: string | null;
  messages: ChatMessage[];
  toolRounds: number;
  toolCallsTotal: number;
  leaksRecovered: number;
  leaksRetried: number;
  leaksDropped: number;
  fastPathId: string;
};

/** Compact final prompt — full SYSTEM_PROMPT is ~16k chars and slows every RTT. */
export const FAST_PATH_FINAL_SYSTEM = `Ты — AI-ассистент Cloud FinOps (cloudfinops.ru). Ответь на русском по данным инструментов в истории.

Правила:
- Цены и провайдеров бери ТОЛЬКО из tool results (providersMatched / quotes / volumeEstimates / stats). Не выдумывай.
- Markdown-таблица, сортировка по возрастанию цены / итога. Колонка «к best offer»: у победителя «best», у остальных «+N%».
- НДС включён, месяц = 720 ч, валюта ₽. Явно назови самый дешёвый вариант.
- Для S3 volumeEstimates — итог за месяц; операции/egress не включай, если не просили.
- Для compare_unit_price(ssd) при запросе объёма умножь ₽/GiB·мес на объём (100 ТБ → 102400 GiB) и покажи итог.
- Для AI — input и output отдельно (₽/1M токенов), если оба есть.
- Без вызова инструментов, без английского плана, без пустого ответа.`;

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Extra first-turn aliases beyond exact HOME_EXAMPLES prompts. */
const ALIAS_PLANS: {id: string; match: RegExp; tools: FastPathTool[]}[] = [
  {
    id: 'vm-8-32',
    match: /(?:вм|vm).{0,40}8\s*vcpu.{0,20}32\s*gi?b/i,
    tools: [{name: 'get_quote', args: {vcpu: 8, ramGiB: 32, diskGiB: 100, period: 'month'}}],
  },
  {
    id: 'h100-cheapest',
    match: /(?:самый\s+деш[её]в|сколько\s+стоит|сравни).{0,40}h100/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'H100', gpuModel: 'H100', category: 'gpu', limit: 12},
      },
    ],
  },
  {
    id: 's3-50tb',
    match: /50\s*тб.{0,40}(?:s3|объектн)|(?:s3|объектн).{0,40}50\s*тб/i,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'объектное хранилище',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          volumeGiB: 50 * 1024,
          limit: 12,
        },
      },
    ],
  },
  {
    id: 'ssd-100tb',
    match: /100\s*тб.{0,40}ssd|ssd.{0,40}100\s*тб/i,
    tools: [{name: 'compare_unit_price', args: {component: 'ssd'}}],
  },
  {
    id: 'k8s-compare',
    match: /managed\s+kubernetes|сравни.{0,30}kubernetes|kubernetes.{0,30}провайдер/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Managed Kubernetes', category: 'kubernetes', limit: 12},
      },
    ],
  },
  {
    id: 'glm-52-mws',
    match: /glm\s*5\.2/i,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'GLM 5.2',
          category: 'ai',
          aiModel: 'GLM 5.2',
          provider: 'mws-cloud',
          limit: 8,
        },
      },
    ],
  },
  {
    id: 'qwen-36',
    match: /qwen\s*3\.6/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Qwen 3.6', category: 'ai', aiModel: 'Qwen 3.6', limit: 12},
      },
    ],
  },
  {
    id: 'ai-api-tokens',
    // Keep narrow — do not steal «…за 1M токенов» for a named model (GLM/Qwen).
    match: /ai\s*api|цен[аы]\s+ai\b|ai[-\s]?модел/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'AI inference tokens', category: 'ai', limit: 20},
      },
    ],
  },
];

/** Exact prompts from homepage chips (keep in sync with homePrompts.ts). */
const HOME_EXACT: {id: string; prompt: string; tools: FastPathTool[]}[] = [
  {
    id: 'vm',
    prompt: 'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    tools: [{name: 'get_quote', args: {vcpu: 8, ramGiB: 32, diskGiB: 100, period: 'month'}}],
  },
  {
    id: 'h100',
    prompt: 'Самый дешёвый H100 в месяц',
    tools: [
      {
        name: 'search_prices',
        args: {query: 'H100', gpuModel: 'H100', category: 'gpu', limit: 12},
      },
    ],
  },
  {
    id: 's3',
    prompt: 'Сколько стоит 50 ТБ в объектном хранилище Standard?',
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'объектное хранилище',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          volumeGiB: 50 * 1024,
          limit: 12,
        },
      },
    ],
  },
  {
    id: 'disk-100tb',
    prompt: 'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    tools: [{name: 'compare_unit_price', args: {component: 'ssd'}}],
  },
  {
    id: 'k8s',
    prompt: 'Сравни Managed Kubernetes по провайдерам',
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Managed Kubernetes', category: 'kubernetes', limit: 12},
      },
    ],
  },
  {
    id: 'glm',
    prompt: 'Сколько стоит GLM 5.2 у MWS за 1M токенов?',
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'GLM 5.2',
          category: 'ai',
          aiModel: 'GLM 5.2',
          provider: 'mws-cloud',
          limit: 8,
        },
      },
    ],
  },
  {
    id: 'qwen',
    prompt: 'Сравни цены Qwen 3.6 по провайдерам за 1M токенов',
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Qwen 3.6', category: 'ai', aiModel: 'Qwen 3.6', limit: 12},
      },
    ],
  },
  {
    id: 'ai',
    prompt: 'Сравни цены AI API / токенов по провайдерам',
    tools: [
      {
        name: 'search_prices',
        args: {query: 'AI inference tokens', category: 'ai', limit: 20},
      },
    ],
  },
];

export function matchFastPath(userText: string): FastPathPlan | null {
  const norm = normalizeQuery(userText);
  if (!norm) return null;

  for (const example of HOME_EXACT) {
    if (normalizeQuery(example.prompt) === norm) {
      return {id: example.id, tools: example.tools};
    }
  }

  for (const alias of ALIAS_PLANS) {
    if (alias.match.test(userText.trim())) {
      return {id: alias.id, tools: alias.tools};
    }
  }

  return null;
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function userTurnCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

function shrinkToolPayload(content: string): string {
  if (content.length < 4000) return content;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(parsed.rows)) parsed.rows = parsed.rows.slice(0, 8);
    if (Array.isArray(parsed.quotes)) parsed.quotes = parsed.quotes.slice(0, 8);
    if (typeof parsed.note === 'string' && parsed.note.length > 240) {
      parsed.note = `${parsed.note.slice(0, 240)}…`;
    }
    return JSON.stringify(parsed);
  } catch {
    return `${content.slice(0, 3500)}…`;
  }
}

function messagesForFastFinal(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === 'system') {
      return {role: 'system', content: FAST_PATH_FINAL_SYSTEM};
    }
    if (m.role === 'tool' && typeof m.content === 'string') {
      return {...m, content: shrinkToolPayload(m.content)};
    }
    return m;
  });
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽`;
}

function pctVsBest(price: number, best: number): string {
  if (!(best > 0) || !(price >= 0)) return '—';
  if (price <= best * 1.0001) return 'best';
  const pct = Math.round(((price - best) / best) * 100);
  return `+${pct}%`;
}

function parseJson(content: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(content) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic markdown for chip tools — avoids the 5–15s final LLM RTT.
 * Returns null when the payload shape is unexpected (then we fall back to LLM).
 */
export function formatFastPathAnswer(
  planId: string,
  toolPayloads: {name: string; content: string}[],
): string | null {
  const primary = toolPayloads[0];
  if (!primary) return null;
  const data = parseJson(primary.content);
  if (!data || data.error) return null;

  if (primary.name === 'get_quote' && Array.isArray(data.quotes)) {
    type Q = {provider: string; total: number | null; scopeNote?: string};
    const quotes = (data.quotes as Q[])
      .filter((q) => q.provider && typeof q.total === 'number')
      .slice()
      .sort((a, b) => (a.total as number) - (b.total as number));
    if (!quotes.length) return null;
    const best = quotes[0].total as number;
    const req = (data.request ?? {}) as {vcpu?: number; ramGiB?: number; diskGiB?: number};
    const title = `Сравнение ВМ ${req.vcpu ?? '—'} vCPU / ${req.ramGiB ?? '—'} GiB / ${req.diskGiB ?? '—'} GiB SSD на месяц (НДС вкл., 720 ч)`;
    const rows = quotes
      .map(
        (q) =>
          `| ${q.provider} | ${formatRub(q.total as number)} | ${pctVsBest(q.total as number, best)} |`,
      )
      .join('\n');
    return `**${title}**\n\n| Провайдер | Итого / мес | к best offer |\n|---|---:|---|\n${rows}\n\nСамый дешёвый: **${quotes[0].provider}** — ${formatRub(best)}/мес.`;
  }

  if (primary.name === 'compare_unit_price' && data.component === 'ssd') {
    type P = {providerName: string; priceMonth: number | null};
    const providers = ((data.providers as P[]) ?? [])
      .filter((p) => p.providerName && typeof p.priceMonth === 'number')
      .slice()
      .sort((a, b) => (a.priceMonth as number) - (b.priceMonth as number));
    if (!providers.length) return null;
    const volumeGiB = planId.includes('100') || planId.includes('ssd') ? 100 * 1024 : null;
    const bestRate = providers[0].priceMonth as number;
    if (volumeGiB) {
      const rows = providers
        .map((p) => {
          const rate = p.priceMonth as number;
          const total = Math.round(rate * volumeGiB * 100) / 100;
          const bestTotal = bestRate * volumeGiB;
          return `| ${p.providerName} | ${formatRub(rate)} | ${formatRub(total)} | ${pctVsBest(total, bestTotal)} |`;
        })
        .join('\n');
      const bestTotal = Math.round(bestRate * volumeGiB * 100) / 100;
      return `**100 ТБ SSD (блочный диск) в месяц** (НДС вкл.; 1 ТБ = 1024 GiB → ${volumeGiB.toLocaleString('ru-RU')} GiB)\n\n| Провайдер | ₽/GiB·мес | Итого / мес | к best offer |\n|---|---:|---:|---|\n${rows}\n\nСамый дешёвый: **${providers[0].providerName}** — ${formatRub(bestTotal)}/мес.`;
    }
  }

  if (primary.name === 'search_prices') {
    type Vol = {
      providerName: string;
      totalMonth: number;
      rateGiBMonth: number;
      volumeGiB?: number;
      name?: string;
    };
    const volumes = data.volumeEstimates as Vol[] | undefined;
    if (Array.isArray(volumes) && volumes.length) {
      const sorted = volumes.slice().sort((a, b) => a.totalMonth - b.totalMonth);
      const best = sorted[0].totalMonth;
      const vol = sorted[0].volumeGiB ?? (data.applied as {volumeGiB?: number} | undefined)?.volumeGiB;
      const rows = sorted
        .map(
          (v) =>
            `| ${v.providerName} | ${formatRub(v.rateGiBMonth)} | ${formatRub(v.totalMonth)} | ${pctVsBest(v.totalMonth, best)} |`,
        )
        .join('\n');
      return `**Объектное хранилище Standard${vol ? ` · ${Number(vol).toLocaleString('ru-RU')} GiB` : ''}** (НДС вкл., месяц)\n\n| Провайдер | ₽/GiB·мес | Итого / мес | к best offer |\n|---|---:|---:|---|\n${rows}\n\nСамый дешёвый: **${sorted[0].providerName}** — ${formatRub(best)}/мес. Операции и egress тарифицируются отдельно.`;
    }

    type Matched = {
      provider: string;
      cheapest: {
        name: string;
        config: string;
        month: number | null;
        hour: number | null;
        unit?: string;
      };
    };
    const matched = data.providersMatched as Matched[] | undefined;
    if (Array.isArray(matched) && matched.length) {
      const withPrice = matched
        .map((m) => ({
          provider: m.provider,
          name: m.cheapest?.name ?? '—',
          config: m.cheapest?.config ?? '—',
          month: m.cheapest?.month,
          hour: m.cheapest?.hour,
          unit: m.cheapest?.unit ?? '',
        }))
        .filter((m) => typeof m.month === 'number' || typeof m.hour === 'number');

      if (!withPrice.length) return null;

      const looksAi =
        planId.includes('glm') ||
        planId.includes('qwen') ||
        planId === 'ai' ||
        planId.includes('ai-api');
      if (looksAi) {
        type AiRow = {provider: string; name: string; month: number | null};
        const fromRows = Array.isArray(data.rows)
          ? (data.rows as AiRow[]).filter(
              (r) => r.provider && r.name && typeof r.month === 'number',
            )
          : [];
        const rowsData = (fromRows.length
          ? fromRows.map((r) => ({
              provider: r.provider,
              name: r.name,
              month: r.month as number,
            }))
          : withPrice
              .filter((m) => typeof m.month === 'number')
              .map((m) => ({provider: m.provider, name: m.name, month: m.month as number}))
        ).sort((a, b) => a.month - b.month);
        if (!rowsData.length) return null;
        const best = rowsData[0].month;
        const rows = rowsData
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.month)} | ${pctVsBest(r.month, best)} |`,
          )
          .join('\n');
        return `**Цены AI / токены (₽ за 1M токенов, НДС вкл.)**\n\n| Провайдер | Позиция | ₽ / 1M | к best offer |\n|---|---|---:|---|\n${rows}\n\nСамый дешёвый в выборке: **${rowsData[0].provider}** — ${formatRub(best)}.`;
      }

      const rowsData = withPrice
        .map((m) => ({
          provider: m.provider,
          name: m.name,
          config: m.config,
          month: typeof m.month === 'number' ? m.month : (m.hour as number) * 720,
        }))
        .sort((a, b) => a.month - b.month);
      const best = rowsData[0].month;
      const rows = rowsData
        .map(
          (r) =>
            `| ${r.provider} | ${r.name} | ${r.config} | ${formatRub(r.month)} | ${pctVsBest(r.month, best)} |`,
        )
        .join('\n');
      const heading =
        planId.includes('h100') || planId.includes('H100')
          ? 'Аренда GPU H100 в месяц'
          : planId.includes('k8s')
            ? 'Managed Kubernetes (мастер) в месяц'
            : 'Сравнение цен по провайдерам';
      return `**${heading}** (НДС вкл., месяц = 720 ч)\n\n| Провайдер | Позиция | Конфигурация | ₽/мес | к best offer |\n|---|---|---|---:|---|\n${rows}\n\nСамый дешёвый: **${rowsData[0].provider}** — ${formatRub(best)}/мес.`;
    }
  }

  return null;
}

/**
 * If this is a first-turn chip/alias query, run tools locally and one short final LLM call.
 * Returns null when the query should use the normal tool loop.
 */
export async function tryRunFastPath(options: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onEvent?: (event: FastPathEvent) => void;
}): Promise<FastPathResult | null> {
  if (userTurnCount(options.messages) !== 1) return null;

  const userText = lastUserText(options.messages);
  const plan = matchFastPath(userText);
  if (!plan) return null;

  const messages = options.messages;
  const toolCalls = plan.tools.map((t, i) => ({
    id: `fast_${plan.id}_${i}`,
    type: 'function' as const,
    function: {
      name: t.name,
      arguments: JSON.stringify(t.args),
    },
  }));

  messages.push({
    role: 'assistant',
    content: '',
    tool_calls: toolCalls,
  });

  const results = await Promise.all(
    toolCalls.map(async (call) => {
      options.onEvent?.({
        type: 'tool_call',
        name: call.function.name,
        arguments: call.function.arguments,
        recoveredFromLeak: false,
      });
      const result = await runTool(call.function.name, call.function.arguments);
      return {call, result};
    }),
  );

  for (const {call, result} of results) {
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: result,
    });
  }

  // Prefer deterministic tables for chips — final LLM alone is often 5–15s.
  const rendered = formatFastPathAnswer(
    plan.id,
    results.map(({call, result}) => ({name: call.function.name, content: result})),
  );
  if (rendered) {
    return {
      finalText: rendered,
      messages,
      toolRounds: 1,
      toolCallsTotal: toolCalls.length,
      leaksRecovered: 0,
      leaksRetried: 0,
      leaksDropped: 0,
      fastPathId: plan.id,
    };
  }

  messages.push({
    role: 'user',
    content:
      'Данные инструментов уже в истории. Дай пользователю полный ответ на русском: markdown-таблица и вывод. Без вызова инструментов и без пустого ответа.',
  });

  const forced = await chatCompletion(messagesForFastFinal(messages), undefined, {
    signal: options.signal,
  });
  const forcedText = (forced.content ?? '').trim();
  const finalText = forcedText ? sanitizeUserFacingAnswer(forcedText) : null;

  return {
    finalText,
    messages,
    toolRounds: 1,
    toolCallsTotal: toolCalls.length,
    leaksRecovered: 0,
    leaksRetried: 0,
    leaksDropped: 0,
    fastPathId: plan.id,
  };
}
