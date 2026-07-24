/**
 * Deterministic tool plans for homepage chips / first-turn twins.
 * Skips the planning LLM round (often the slowest) and finishes with one
 * tools-free completion on a short system prompt.
 */

import {
  formatInferenceLoadBandCell,
  formatInferenceVramCell,
  selfHostCalculatorCtaMarkdown,
} from '@/lib/calculator/self-host-links';
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
- Для compare_unit_price(ssd) при запросе объёма умножь ₽/GiB·мес на объём (55 ТБ → 56320 GiB) и покажи итог. Учитывай diskMedia: NVMe ≠ SSD; в таблице указывай name/sku диска.
- Для S3 volumeEstimates класс бери из applied.storageClass / volumeEstimates[].storageClass — не называй Ice «Standard».
- Для AI — input и output отдельно (₽/1M токенов), если оба есть.
- Без вызова инструментов, без английского плана, без пустого ответа.`;

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Extra first-turn aliases beyond exact HOME_EXAMPLES prompts. */
const ALIAS_PLANS: {id: string; match: RegExp; tools: FastPathTool[]}[] = [
  // Self-host inference — before token-price aliases for the same model names.
  {
    id: 'inference-glm-52',
    match:
      /(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|self[-\s]?host|сколько\s+gpu|vram).{0,80}glm\s*5\.2|glm\s*5\.2.{0,80}(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|gpu|vram)/i,
    tools: [{name: 'recommend_inference_infra', args: {model: 'GLM 5.2', maxConfigs: 3}}],
  },
  {
    id: 'inference-qwen3-235b',
    match:
      /(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|self[-\s]?host|сколько\s+gpu).{0,80}qwen3?\s*[-.]?\s*235|qwen3?\s*[-.]?\s*235.{0,80}(?:запуск|инфраструктур|gpu)/i,
    tools: [{name: 'recommend_inference_infra', args: {model: 'Qwen3 235B', maxConfigs: 3}}],
  },
  // K3 before generic kimi — otherwise «развернуть kimi k3» steals into K2.6.
  {
    id: 'inference-kimi-k3',
    match:
      /(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|self[-\s]?host|сколько\s+gpu|vram).{0,80}(?:kimi|кими|химик[аи]?)\s*k?\s*3|химика\s*три|(?:kimi|кими|химик[аи]?)\s*k?\s*3.{0,80}(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|gpu|vram|self[-\s]?host)/i,
    tools: [{name: 'recommend_inference_infra', args: {model: 'Kimi K3', maxConfigs: 3}}],
  },
  {
    id: 'inference-kimi',
    match:
      /(?:запуск|запустить|развернуть|инфраструктур|свои[хм]|self[-\s]?host|сколько\s+gpu).{0,80}(?:kimi|кими)(?!\s*k?\s*3)|(?:kimi|кими)(?!\s*k?\s*3).{0,80}(?:запуск|инфраструктур|свои[хм]|gpu)/i,
    tools: [{name: 'recommend_inference_infra', args: {model: 'Kimi K2.6', maxConfigs: 3}}],
  },
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
    id: 'inference-qwen3-32b',
    match:
      /(?:запуск|запустить|поднять|развернуть|инфраструктур|свои[хм]|self[-\s]?host|сколько\s+gpu|карт).{0,80}qwen3?\s*[-.]?\s*32|qwen3?\s*[-.]?\s*32.{0,80}(?:запуск|поднять|развернуть|инфраструктур|свои[хм]|gpu|карт)/i,
    tools: [{name: 'recommend_inference_infra', args: {model: 'Qwen3 32B', maxConfigs: 3}}],
  },
  // HA before generic k8s — otherwise «Managed Kubernetes» steals regional asks.
  {
    id: 'k8s-ha',
    match:
      /(?:отказоустойчив|региональн|ha\b).{0,40}(?:kubernetes|k8s|кубер)|(?:kubernetes|k8s|кубер).{0,40}(?:отказоустойчив|региональн)/i,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'kubernetes региональный отказоустойчивый',
          category: 'kubernetes',
          limit: 12,
        },
      },
    ],
  },
  {
    id: 'k8s-compare',
    match:
      /managed\s+kubernetes|сравни.{0,30}kubernetes|kubernetes.{0,30}провайдер|кубер|асистируй.{0,40}кубер|мастер.{0,20}(?:kubernetes|k8s|кубер)|(?:kubernetes|k8s).{0,30}мастер/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Managed Kubernetes', category: 'kubernetes', limit: 12},
      },
    ],
  },
  {
    id: 'egress-1tb',
    match: /(?:1\s*тб|1024\s*gi?b).{0,50}(?:egress|исходящ)|(?:egress|исходящ).{0,50}(?:1\s*тб|1024)/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'egress traffic', category: 'network', volumeGiB: 1024, limit: 12},
      },
    ],
  },
  {
    id: 'public-ip',
    match:
      /(?:бел(?:ый|ого)|публичн|внешн).{0,30}ip|ip.{0,30}(?:бел|публичн|внешн|адрес)|арендова.{0,20}адрес/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'публичный IP', category: 'network', limit: 12},
      },
    ],
  },
  {
    id: 'l40s-hour',
    match: /l40s/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'L40S', gpuModel: 'L40S', category: 'gpu', limit: 12},
      },
    ],
  },
  {
    id: 'h200-cheapest',
    match: /(?:самый\s+деш[её]в|сколько\s+стоит|сравни).{0,40}h200|h200.{0,40}(?:мес|деш)/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'H200', gpuModel: 'H200', category: 'gpu', limit: 12},
      },
    ],
  },
  {
    id: 'cold-5tb',
    match: /5\s*тб.{0,40}(?:cold|холод)|(?:cold|холод).{0,40}5\s*тб/i,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'объектное хранилище cold',
          category: 'storage',
          storageClass: 'cold',
          meterKind: 'capacity',
          volumeGiB: 5 * 1024,
          limit: 12,
        },
      },
    ],
  },
  {
    id: 'kimi-k26-tokens',
    match: /kimi\s*k?2\.6|кими\s*k?2\.6/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'Kimi K2.6', category: 'ai', aiModel: 'Kimi K2.6', limit: 12},
      },
    ],
  },
  {
    id: 'a100-8x',
    match: /8\s*[×xх]\s*a100|a100.{0,20}8\s*[×xх]|8\s*шт.{0,20}a100/i,
    tools: [{name: 'get_quote', args: {gpuModel: 'A100', gpuCount: 8, period: 'month'}}],
  },
  {
    id: 'selectel-gpus',
    match: /(?:какие\s+gpu|gpu.{0,30}каталог).{0,40}selectel|selectel.{0,40}(?:какие\s+)?gpu/i,
    tools: [
      {
        name: 'search_prices',
        args: {query: 'GPU', category: 'gpu', provider: 'selectel', limit: 40},
      },
    ],
  },
  {
    id: 'ram-unit',
    match: /(?:цена|стоимость|сколько).{0,40}1\s*gi?b\s*ram|1\s*gi?b\s*ram.{0,40}(?:цена|мес)|ram.{0,20}(?:минимальн|средн)/i,
    tools: [{name: 'compare_unit_price', args: {component: 'ram'}}],
  },
  {
    id: 'glm-52-mws',
    // Token/API price only — self-host infra matches earlier aliases.
    match: /glm\s*5\.2.{0,60}(?:токен|1m|mws|стоит|цен)/i,
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
    match: /qwen\s*3\.6.{0,60}(?:токен|1m|цен|сравни)|(?:токен|цен|сравни).{0,40}qwen\s*3\.6/i,
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
    tools: [{name: 'compare_unit_price', args: {component: 'ssd', diskMedia: 'ssd'}}],
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
    id: 'glm-infra',
    prompt: 'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    tools: [{name: 'recommend_inference_infra', args: {model: 'GLM 5.2', maxConfigs: 3}}],
  },
  {
    id: 'kimi-k3-infra',
    prompt: 'Какая инфраструктура нужна, чтобы развернуть Kimi K3 self-host в РФ?',
    tools: [{name: 'recommend_inference_infra', args: {model: 'Kimi K3', maxConfigs: 3}}],
  },
  {
    id: 'qwen38-infra',
    prompt: 'Какая инфраструктура нужна, чтобы развернуть Qwen 3.8 self-host в РФ?',
    tools: [{name: 'recommend_inference_infra', args: {model: 'Qwen 3.8', maxConfigs: 3}}],
  },
  {
    id: 'coder-next-infra',
    prompt: 'Какая инфраструктура нужна, чтобы развернуть Qwen3-Coder-Next self-host в РФ?',
    tools: [
      {name: 'recommend_inference_infra', args: {model: 'Qwen3-Coder-Next', maxConfigs: 5}},
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
    id: 'ai',
    prompt: 'Сравни цены AI API / токенов по провайдерам',
    tools: [
      {
        name: 'search_prices',
        args: {query: 'AI inference tokens', category: 'ai', limit: 20},
      },
    ],
  },
  {
    id: 'budget-100k',
    prompt: 'Бюджет 100 000 ₽/мес — что можно позволить?',
    tools: [{name: 'fit_budget', args: {budgetMonthRub: 100_000, profile: 'general'}}],
  },
];

/** Block SSD/NVMe «N ТБ» → compare_unit_price; volume + media encoded in plan id. */
function matchSsdVolumePlan(userText: string): FastPathPlan | null {
  const t = userText.trim();
  if (!/(?:ssd|nvme|блочн)/i.test(t)) return null;
  // Object storage phrasing without «блочн» must not steal into SSD unit path.
  if (/(?:s3|объектн|object\s*storage)/i.test(t) && !/блочн/i.test(t)) return null;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*тб/i);
  if (!m) return null;
  const tb = Math.round(parseFloat(m[1]!.replace(',', '.')));
  if (!(tb > 0) || tb > 500) return null;
  const wantsNvme = /nvme/i.test(t);
  const wantsSsd = /ssd/i.test(t);
  const diskMedia = wantsNvme ? 'nvme' : wantsSsd ? 'ssd' : 'any';
  const prefix = diskMedia === 'nvme' ? 'nvme' : 'ssd';
  return {
    id: `${prefix}-${tb}tb`,
    tools: [{name: 'compare_unit_price', args: {component: 'ssd', diskMedia}}],
  };
}

/** Object storage «N ТБ» → search_prices capacity; default class Standard (not Ice). */
function matchObjectVolumePlan(userText: string): FastPathPlan | null {
  const t = userText.trim();
  if (!/(?:s3|объектн|object\s*storage)/i.test(t)) return null;
  if (/блочн/i.test(t)) return null;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*тб/i);
  if (!m) return null;
  const tb = Math.round(parseFloat(m[1]!.replace(',', '.')));
  if (!(tb > 0) || tb > 500) return null;

  let storageClass: 'standard' | 'warm' | 'cold' | 'ice' = 'standard';
  if (/(?<![а-яёa-z])ice(?![а-яёa-z])|ледян|icebox/i.test(t)) storageClass = 'ice';
  else if (/(?<![а-яёa-z])cold(?![а-яёa-z])|холодн/i.test(t)) storageClass = 'cold';
  else if (/(?<![а-яёa-z])warm(?![а-яёa-z])|тепл/i.test(t)) storageClass = 'warm';

  return {
    id: `s3-${storageClass}-${tb}tb`,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'объектное хранилище',
          category: 'storage',
          storageClass,
          meterKind: 'capacity',
          volumeGiB: tb * 1024,
          limit: 12,
        },
      },
    ],
  };
}

/** «бюджет 50 тыс» / «100 000 ₽/мес» → fit_budget (skip planning LLM). */
function matchBudgetPlan(userText: string): FastPathPlan | null {
  const t = userText.trim();
  const looksBudget =
    /бюджет|позволить|на\s+облако|что\s+(?:реально\s+)?(?:взять|можно)|улож/i.test(t) ||
    /\d+\s*тыс.{0,40}(?:₽|руб|мес|облако)/i.test(t);
  if (!looksBudget) return null;

  let rub: number | null = null;
  const tys = t.match(/(\d+)\s*тыс/i);
  if (tys) rub = Number(tys[1]) * 1000;
  if (rub == null) {
    const plain = t.match(/(\d{1,3}(?:[\s\u00a0]\d{3})+|\d{4,7})\s*(?:₽|руб)/);
    if (plain) rub = Number(plain[1]!.replace(/[\s\u00a0]/g, ''));
  }
  if (rub == null || rub < 5_000 || rub > 5_000_000) return null;
  return {
    id: `budget-${rub}`,
    tools: [{name: 'fit_budget', args: {budgetMonthRub: rub, profile: 'general'}}],
  };
}

function ssdVolumeGiBFromPlanId(planId: string): number | null {
  const m =
    planId.match(/(?:^|-)(?:ssd|nvme)-(\d+)tb$/i) || planId.match(/^disk-(\d+)tb$/i);
  if (!m) return null;
  const tb = Number(m[1]);
  return tb > 0 ? tb * 1024 : null;
}

export function matchFastPath(userText: string): FastPathPlan | null {
  const norm = normalizeQuery(userText);
  if (!norm) return null;

  for (const example of HOME_EXACT) {
    if (normalizeQuery(example.prompt) === norm) {
      return {id: example.id, tools: example.tools};
    }
  }

  // Dynamic volume / budget before static aliases (captures 10ТБ SSD, 55ТБ NVMe, 50 тыс, …).
  const ssdVol = matchSsdVolumePlan(userText);
  if (ssdVol) return ssdVol;
  const objectVol = matchObjectVolumePlan(userText);
  if (objectVol) return objectVol;
  const budget = matchBudgetPlan(userText);
  if (budget) return budget;

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

/** Short system + trimmed tool JSON for the post-tools answer LLM (agent or fast-path). */
export function messagesForShortFinal(messages: ChatMessage[]): ChatMessage[] {
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

/** Last assistant tool_calls + matching tool results (for deterministic format short-circuit). */
export function extractLastToolPayloads(
  messages: ChatMessage[],
): {name: string; content: string; arguments?: string}[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    const payloads: {name: string; content: string; arguments?: string}[] = [];
    for (const call of m.tool_calls) {
      const toolMsg = messages
        .slice(i + 1)
        .find((x) => x.role === 'tool' && x.tool_call_id === call.id);
      if (toolMsg && typeof toolMsg.content === 'string') {
        payloads.push({
          name: call.function.name,
          content: toolMsg.content,
          arguments: call.function.arguments,
        });
      }
    }
    return payloads;
  }
  return [];
}

export function lastUserQuestion(messages: ChatMessage[]): string {
  return lastUserText(messages);
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

  if (primary.name === 'recommend_inference_infra' && data.ok && data.model) {
    type Cfg = {
      gpuFamily: string;
      gpuCount: number;
      quant: string;
      estimatedVramGiB: number;
      assumedHost: string | null;
      best: {provider: string; totalMonth: number | null} | null;
      quotes: {provider: string; totalMonth: number | null}[];
      notes?: string;
      why?: string;
      vramBreakdown?: {
        totalGiB: number;
        capacityGiB: number | null;
        loadBand: 'excess' | 'optimal' | 'tight' | 'limit' | 'overload' | null;
      } | null;
    };
    const model = data.model as {
      displayName: string;
      parameterCountB?: number;
      activeParameterCountB?: number;
      parameterCountNote?: string;
      deployment?: string;
      confidence: string;
      contextDefault?: number;
    };
    const configs = (data.configs as Cfg[] | undefined) ?? [];
    const params =
      model.parameterCountB == null
        ? model.parameterCountNote || 'параметры не раскрыты'
        : model.activeParameterCountB != null
          ? `${model.parameterCountB}B (${model.activeParameterCountB}B active)`
          : `${model.parameterCountB}B`;
    const ctxBit =
      typeof model.contextDefault === 'number' && model.contextDefault > 0
        ? `, ctx ${model.contextDefault.toLocaleString('ru-RU')}`
        : '';
    const hosted = data.hostedAlternative as
      | {
          providersMatched?: {
            provider: string;
            cheapestMonth: number | null;
            inputMonth?: number | null;
            outputMonth?: number | null;
          }[];
        }
      | undefined;
    const hostedBlock = hosted?.providersMatched?.length
      ? [
          '',
          '### Hosted API',
          '',
          '₽ за **1M токенов** (не за GPU-узел). Считайте **input + output**.',
          '',
          '| Провайдер | Input | Output |',
          '|---|---:|---:|',
          ...hosted.providersMatched.slice(0, 4).map((p) => {
            const inn =
              p.inputMonth != null
                ? formatRub(p.inputMonth)
                : p.cheapestMonth != null
                  ? formatRub(p.cheapestMonth)
                  : '—';
            const out = p.outputMonth != null ? formatRub(p.outputMonth) : '—';
            return `| ${p.provider} | ${inn} | ${out} |`;
          }),
        ].join('\n')
      : '';
    const caveats = Array.isArray(data.caveats)
      ? (data.caveats as string[]).filter(Boolean)
      : [];
    const caveatBlock = caveats.length
      ? ['', '### Оговорки', '', ...caveats.slice(0, 4).map((c) => `- ${c}`)].join('\n')
      : '';

    if (model.deployment === 'api-only' || !configs.length) {
      return [
        `### ${model.displayName}`,
        '',
        `${params} · confidence: **${model.confidence}**`,
        '',
        '### Self-host',
        '',
        'Публичного checkpoint нет (**API-only**) — число GPU честно не подобрать.',
        '',
        'Смотрите open-weight соседние модели или hosted/API.',
        hostedBlock,
        caveatBlock,
      ]
        .filter((line) => line != null)
        .join('\n');
    }

    const primaryWhy =
      (data.primaryRecommendation as {why?: string} | undefined)?.why ||
      configs[0]?.why ||
      '';
    const primaryNotes = configs[0]?.notes?.trim() || '';
    const whyShort =
      primaryNotes ||
      (primaryWhy.length > 220 ? `${primaryWhy.slice(0, 200).trim()}…` : primaryWhy);
    const whyBlock = whyShort
      ? ['### Почему так', '', whyShort].join('\n')
      : '';
    const rows = configs
      .map((c) => {
        const best = c.best?.totalMonth;
        const label = `${c.gpuCount}×${c.gpuFamily} · ${c.quant}`;
        const price = typeof best === 'number' ? formatRub(best) : '—';
        const who = c.best?.provider ?? '—';
        const vram = formatInferenceVramCell(c.vramBreakdown ?? null, c.estimatedVramGiB);
        const load = formatInferenceLoadBandCell(c.vramBreakdown ?? null);
        return `| ${label} | ${vram} | ${load} | ${who} | ${price} |`;
      })
      .join('\n');
    const primaryQuant = configs[0]?.quant ?? null;
    const calcCta = selfHostCalculatorCtaMarkdown({
      model: model.displayName,
      quant: primaryQuant,
    });
    const altBlock = configs.slice(1, 4).length
      ? [
          '',
          '### Альтернативы',
          '',
          ...configs.slice(1, 4).map((c) => {
            const title = `**${c.gpuCount}×${c.gpuFamily} · ${c.quant}**`;
            const blurb = (c.notes || c.why || '').trim();
            const short =
              blurb.length > 160 ? `${blurb.slice(0, 140).trim()}…` : blurb;
            return short ? `- ${title} — ${short}` : `- ${title}`;
          }),
        ].join('\n')
      : '';
    const pendingNote =
      model.deployment === 'weights-pending'
        ? '\n\n> Веса open-weight ещё не вышли или только анонсированы — конфиги предварительные.'
        : '';
    const metaBits = [
      params,
      ctxBit.replace(/^,\s*/, '') || null,
      `confidence: **${model.confidence}**`,
    ].filter(Boolean);

    return [
      `### Self-host: ${model.displayName}`,
      '',
      metaBits.join(' · '),
      '',
      whyBlock,
      '',
      '### Цены узлов',
      '',
      'НДС вкл., месяц = 720 ч. Цена — лучший паритетный узел в каталоге.',
      '',
      `| Конфиг | Использование VRAM | Запас памяти | Провайдер | ₽/мес |`,
      `|---|---|---|---|---:|`,
      rows,
      altBlock,
      hostedBlock,
      caveatBlock,
      pendingNote,
      '',
      calcCta,
      '',
      '> Цены и VRAM — ориентиры Cloud FinOps; tok/s не оцениваем.',
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (primary.name === 'get_quote' && Array.isArray(data.quotes)) {
    type Q = {provider: string; total: number | null; scopeNote?: string};
    const quotes = (data.quotes as Q[])
      .filter((q) => q.provider && typeof q.total === 'number')
      .slice()
      .sort((a, b) => (a.total as number) - (b.total as number));
    if (!quotes.length) return null;
    const best = quotes[0].total as number;
    const req = (data.request ?? {}) as {
      vcpu?: number;
      ramGiB?: number;
      diskGiB?: number;
      gpuModel?: string;
      gpuCount?: number;
    };
    const title =
      req.gpuModel != null
        ? `Сравнение ${req.gpuCount ?? 1}×${req.gpuModel} по провайдерам за месяц (НДС вкл., 720 ч)`
        : `Сравнение ВМ ${req.vcpu ?? '—'} vCPU / ${req.ramGiB ?? '—'} GiB / ${req.diskGiB ?? '—'} GiB SSD на месяц (НДС вкл., 720 ч)`;
    const rows = quotes
      .map(
        (q) =>
          `| ${q.provider} | ${formatRub(q.total as number)} | ${pctVsBest(q.total as number, best)} |`,
      )
      .join('\n');
    return `**${title}**\n\n| Провайдер | Итого / мес | к best offer |\n|---|---:|---|\n${rows}\n\nСамый дешёвый: **${quotes[0].provider}** — ${formatRub(best)}/мес.`;
  }

  if (primary.name === 'compare_unit_price') {
    type P = {
      providerName: string;
      priceMonth: number | null;
      priceHour?: number | null;
      name?: string | null;
      diskMedia?: string | null;
      storageTopology?: string | null;
      includedIops?: number | null;
    };
    const component = data.component as string | undefined;
    const diskMedia =
      (data.diskMedia as string | undefined) ||
      (planId.startsWith('nvme-') ? 'nvme' : planId.startsWith('ssd-') || planId === 'disk-100tb' ? 'ssd' : 'any');
    const providers = ((data.providers as P[]) ?? [])
      .filter((p) => p.providerName && (typeof p.priceMonth === 'number' || typeof p.priceHour === 'number'))
      .slice();
    if (!providers.length || !component) return null;

    if (component === 'ssd') {
      const withMonth = providers
        .filter((p) => typeof p.priceMonth === 'number')
        .sort((a, b) => (a.priceMonth as number) - (b.priceMonth as number));
      if (!withMonth.length) return null;
      const volumeGiB =
        ssdVolumeGiBFromPlanId(planId) ?? (planId === 'disk-100tb' ? 100 * 1024 : null);
      const bestRate = withMonth[0].priceMonth as number;
      const mediaLabel =
        diskMedia === 'nvme' ? 'NVMe' : diskMedia === 'ssd' ? 'SSD' : 'SSD/NVMe';
      const diskCell = (p: P) => {
        const bits = [p.name || mediaLabel];
        if (p.storageTopology === 'local') bits.push('local');
        if (typeof p.includedIops === 'number') bits.push(`${p.includedIops.toLocaleString('ru-RU')} IOPS`);
        return bits.join(', ');
      };
      if (volumeGiB) {
        const tb = volumeGiB / 1024;
        const rows = withMonth
          .map((p) => {
            const rate = p.priceMonth as number;
            const total = Math.round(rate * volumeGiB * 100) / 100;
            const bestTotal = bestRate * volumeGiB;
            return `| ${p.providerName} | ${diskCell(p)} | ${formatRub(rate)} | ${formatRub(total)} | ${pctVsBest(total, bestTotal)} |`;
          })
          .join('\n');
        const bestTotal = Math.round(bestRate * volumeGiB * 100) / 100;
        const bestName = withMonth[0].name ? ` (${withMonth[0].name})` : '';
        return `**${tb.toLocaleString('ru-RU')} ТБ ${mediaLabel} (блочный диск) в месяц** (НДС вкл.; 1 ТБ = 1024 GiB → ${volumeGiB.toLocaleString('ru-RU')} GiB)\n\n| Провайдер | Диск | ₽/GiB·мес | Итого / мес | к best offer |\n|---|---|---:|---:|---|\n${rows}\n\nСамый дешёвый: **${withMonth[0].providerName}**${bestName} — ${formatRub(bestTotal)}/мес.`;
      }
      const rows = withMonth
        .map(
          (p) =>
            `| ${p.providerName} | ${diskCell(p)} | ${formatRub(p.priceMonth as number)} | ${pctVsBest(p.priceMonth as number, bestRate)} |`,
        )
        .join('\n');
      return `**Цена 1 GiB блочного ${mediaLabel} в месяц** (НДС вкл.)\n\n| Провайдер | Диск | ₽/GiB·мес | к best offer |\n|---|---|---:|---|\n${rows}\n\nСамый дешёвый: **${withMonth[0].providerName}** — ${formatRub(bestRate)}/GiB·мес.`;
    }

    if (component === 'ram' || component === 'vcpu') {
      const monthOf = (p: P) =>
        typeof p.priceMonth === 'number'
          ? (p.priceMonth as number)
          : typeof p.priceHour === 'number'
            ? (p.priceHour as number) * 720
            : null;
      const ranked = providers
        .map((p) => ({name: p.providerName, month: monthOf(p)}))
        .filter((p): p is {name: string; month: number} => p.month != null)
        .sort((a, b) => a.month - b.month);
      if (!ranked.length) return null;
      const best = ranked[0].month;
      const label = component === 'ram' ? '1 GiB RAM' : '1 vCPU (on-demand 100%)';
      const rows = ranked
        .map((p) => `| ${p.name} | ${formatRub(p.month)} | ${pctVsBest(p.month, best)} |`)
        .join('\n');
      return `**Минимальная цена ${label} в месяц** (НДС вкл., 720 ч)\n\n| Провайдер | ₽/мес | к best offer |\n|---|---:|---|\n${rows}\n\nСамый дешёвый: **${ranked[0].name}** — ${formatRub(best)}/мес.`;
    }
  }

  if (primary.name === 'fit_budget' && Array.isArray(data.highlights)) {
    type H = {
      provider: string;
      shape: string;
      count: number;
      spendMonth: number;
      utilPct: number;
    };
    const highlights = (data.highlights as H[])
      .filter((h) => h.provider && h.count >= 1 && typeof h.spendMonth === 'number')
      .slice(0, 8);
    if (!highlights.length) return null;
    const budget = typeof data.budgetMonthRub === 'number' ? data.budgetMonthRub : null;
    const bestSpend = Math.min(...highlights.map((h) => h.spendMonth));
    const rows = highlights
      .map((h) => {
        const cfg = `${h.shape} × ${h.count}`;
        return `| ${h.provider} | ${cfg} | ${formatRub(h.spendMonth)} | ${h.utilPct.toLocaleString('ru-RU')}% | ${pctVsBest(h.spendMonth, bestSpend)} |`;
      })
      .join('\n');
    const title =
      budget != null
        ? `Варианты ВМ при бюджете ≈ ${budget.toLocaleString('ru-RU')} ₽/мес`
        : 'Варианты размещения в рамках бюджета';
    return `**${title}** (НДС вкл., месяц = 720 ч; без IP/S3/K8s/GPU)\n\n| Провайдер | Конфиг × N | Итого ₽/мес | Утилизация | к best offer |\n|---|---|---:|---:|---|\n${rows}\n\nЛучшая утилизация бюджета в выборке: **${highlights[0].provider}** — ${highlights[0].shape} × ${highlights[0].count}.`;
  }

  if (primary.name === 'search_prices') {
    type Vol = {
      providerName: string;
      totalMonth: number;
      rateGiBMonth: number;
      volumeGiB?: number;
      name?: string;
      storageClass?: string | null;
    };
    const volumes = data.volumeEstimates as Vol[] | undefined;
    if (Array.isArray(volumes) && volumes.length) {
      const sorted = volumes.slice().sort((a, b) => a.totalMonth - b.totalMonth);
      const best = sorted[0].totalMonth;
      const vol = sorted[0].volumeGiB ?? (data.applied as {volumeGiB?: number} | undefined)?.volumeGiB;
      const classes = new Set(
        sorted.map((v) => (v.storageClass || '').toLowerCase()).filter(Boolean),
      );
      const planClass = planId.match(/^s3-(standard|warm|cold|ice)-/i)?.[1]?.toLowerCase();
      const storageClass =
        ((data.applied as {storageClass?: string} | undefined)?.storageClass ||
          planClass ||
          (classes.size === 1 ? [...classes][0] : null) ||
          (planId.includes('cold') ? 'cold' : planId.includes('ice') ? 'ice' : null)) ??
        'standard';
      // Never label Ice/Cold rows as Standard just because the plan id defaulted.
      const estimateClass = sorted[0].storageClass?.toLowerCase();
      const effectiveClass =
        estimateClass && storageClass === 'standard' && estimateClass !== 'standard'
          ? estimateClass
          : storageClass;
      const classLabel =
        effectiveClass === 'cold'
          ? 'Cold'
          : effectiveClass === 'ice'
            ? 'Ice'
            : effectiveClass === 'warm'
              ? 'Warm'
              : 'Standard';
      const rows = sorted
        .map(
          (v) =>
            `| ${v.providerName} | ${formatRub(v.rateGiBMonth)} | ${formatRub(v.totalMonth)} | ${pctVsBest(v.totalMonth, best)} |`,
        )
        .join('\n');
      return `**Объектное хранилище ${classLabel}${vol ? ` · ${Number(vol).toLocaleString('ru-RU')} GiB` : ''}** (НДС вкл., месяц)\n\n| Провайдер | ₽/GiB·мес | Итого / мес | к best offer |\n|---|---:|---:|---|\n${rows}\n\nСамый дешёвый: **${sorted[0].providerName}** — ${formatRub(best)}/мес. Операции и egress тарифицируются отдельно.`;
    }

    type SearchRow = {
      provider: string;
      name: string;
      config?: string;
      month: number | null;
      hour: number | null;
      unit?: string;
    };
    const catalogRows = Array.isArray(data.rows) ? (data.rows as SearchRow[]) : [];

    // Network: providersMatched.cheapest often picks free ingress — filter rows explicitly.
    if (planId === 'public-ip' || planId.includes('public-ip')) {
      const ipRows = catalogRows.filter((r) => {
        const blob = `${r.name} ${r.config ?? ''}`;
        return (
          /ip|ipv4|адрес|elastic|floating/i.test(blob) &&
          !/входящ|ingress|трафик|traffic|гигабайт|gi\b/i.test(blob) &&
          typeof r.month === 'number' &&
          r.month > 0
        );
      });
      const byProvider = new Map<string, SearchRow>();
      for (const r of ipRows) {
        const prev = byProvider.get(r.provider);
        if (!prev || (r.month as number) < (prev.month as number)) byProvider.set(r.provider, r);
      }
      const ranked = [...byProvider.values()].sort(
        (a, b) => (a.month as number) - (b.month as number),
      );
      if (ranked.length) {
        const best = ranked[0].month as number;
        const rows = ranked
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.month as number)} | ${pctVsBest(r.month as number, best)} |`,
          )
          .join('\n');
        return `**Публичный IP в месяц** (НДС вкл.)\n\n| Провайдер | Позиция | ₽/мес | к best offer |\n|---|---|---:|---|\n${rows}\n\nСамый дешёвый: **${ranked[0].provider}** — ${formatRub(best)}/мес.`;
      }
    }

    if (planId.includes('egress')) {
      const egressRows = catalogRows.filter((r) => {
        const blob = `${r.name} ${r.config ?? ''}`;
        return /egress|исходящ|outgoing/i.test(blob) && !/входящ|ingress/i.test(blob);
      });
      const volumeGiB =
        (data.applied as {volumeGiB?: number} | undefined)?.volumeGiB ??
        (typeof data.volumeGiB === 'number' ? data.volumeGiB : null);
      const byProvider = new Map<string, {provider: string; name: string; rate: number; total: number}>();
      for (const r of egressRows) {
        const rate =
          typeof r.month === 'number' && r.month > 0
            ? r.month
            : typeof r.hour === 'number' && r.hour > 0
              ? r.hour
              : null;
        if (rate == null) continue;
        // Catalog network rates are typically ₽/GiB·мес (stored in month).
        const total = volumeGiB != null ? Math.round(rate * volumeGiB * 100) / 100 : rate;
        const prev = byProvider.get(r.provider);
        if (!prev || total < prev.total) {
          byProvider.set(r.provider, {provider: r.provider, name: r.name, rate, total});
        }
      }
      const ranked = [...byProvider.values()].sort((a, b) => a.total - b.total);
      if (ranked.length) {
        const best = ranked[0].total;
        if (volumeGiB != null) {
          const rows = ranked
            .map(
              (r) =>
                `| ${r.provider} | ${formatRub(r.rate)} | ${formatRub(r.total)} | ${pctVsBest(r.total, best)} |`,
            )
            .join('\n');
          return `**Исходящий трафик (egress) · ${volumeGiB.toLocaleString('ru-RU')} GiB** (НДС вкл.)\n\n| Провайдер | ₽/GiB | Итого / мес | к best offer |\n|---|---:|---:|---|\n${rows}\n\nСамый дешёвый: **${ranked[0].provider}** — ${formatRub(best)}/мес.`;
        }
        const rows = ranked
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.total)} | ${pctVsBest(r.total, best)} |`,
          )
          .join('\n');
        return `**Исходящий трафик (egress)** (НДС вкл.)\n\n| Провайдер | Позиция | ₽/GiB·мес | к best offer |\n|---|---|---:|---|\n${rows}\n\nСамый дешёвый: **${ranked[0].provider}** — ${formatRub(best)}.`;
      }
    }

    if (planId === 'selectel-gpus') {
      const gpuRows = catalogRows.filter(
        (r) => r.provider === 'Selectel' && typeof r.month === 'number' && r.month > 0,
      );
      // One cheapest row per GPU model name (keep catalog scannable).
      const byModel = new Map<string, SearchRow>();
      for (const r of gpuRows) {
        const key = r.name.replace(/\s*,\s*прерываем.*$/i, '').trim();
        const prev = byModel.get(key);
        if (!prev || (r.month as number) < (prev.month as number)) byModel.set(key, r);
      }
      const ranked = [...byModel.values()]
        .sort((a, b) => (a.month as number) - (b.month as number))
        .slice(0, 12);
      if (ranked.length) {
        const best = ranked[0].month as number;
        const rows = ranked
          .map(
            (r) =>
              `| ${r.name} | ${r.config ?? '—'} | ${formatRub(r.month as number)} | ${pctVsBest(r.month as number, best)} |`,
          )
          .join('\n');
        return `**GPU в каталоге Selectel** (НДС вкл., месяц = 720 ч)\n\n| GPU | Конфигурация | ₽/мес | к best offer |\n|---|---|---:|---|\n${rows}\n\nСамый дешёвый в выборке: **${ranked[0].name}** — ${formatRub(best)}/мес.`;
      }
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
        planId.includes('kimi') ||
        planId.includes('token') ||
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
      const heading = planId.includes('h100')
        ? 'Аренда GPU H100 в месяц'
        : planId.includes('h200')
          ? 'Аренда GPU H200 в месяц'
          : planId.includes('l40s')
            ? 'Аренда GPU L40S'
            : planId.includes('selectel')
              ? 'GPU в каталоге Selectel'
              : planId.includes('k8s')
                ? 'Managed Kubernetes (мастер) в месяц'
                : planId.includes('public-ip') || planId.includes('ip')
                  ? 'Публичный IP в месяц'
                  : planId.includes('egress')
                    ? 'Исходящий трафик (egress)'
                    : 'Сравнение цен по провайдерам';
      // Hourly GPU rows when month is missing / less meaningful.
      const useHour =
        (planId.includes('l40s') || planId.includes('hour')) &&
        withPrice.some((m) => typeof m.hour === 'number');
      if (useHour) {
        const hourRows = withPrice
          .filter((m) => typeof m.hour === 'number')
          .map((m) => ({
            provider: m.provider,
            name: m.name,
            hour: m.hour as number,
            month: typeof m.month === 'number' ? m.month : (m.hour as number) * 720,
          }))
          .sort((a, b) => a.hour - b.hour);
        if (!hourRows.length) return null;
        const bestH = hourRows[0].hour;
        const rowsH = hourRows
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.hour)} | ${formatRub(r.month)} | ${pctVsBest(r.hour, bestH)} |`,
          )
          .join('\n');
        return `**${heading}** (НДС вкл., месяц = 720 ч)\n\n| Провайдер | Позиция | ₽/час | ₽/мес | к best offer |\n|---|---|---:|---:|---|\n${rowsH}\n\nСамый дешёвый: **${hourRows[0].provider}** — ${formatRub(bestH)}/час.`;
      }
      return `**${heading}** (НДС вкл., месяц = 720 ч)\n\n| Провайдер | Позиция | Конфигурация | ₽/мес | к best offer |\n|---|---|---|---:|---|\n${rows}\n\nСамый дешёвый: **${rowsData[0].provider}** — ${formatRub(best)}/мес.`;
    }
  }

  return null;
}

/**
 * After the agent picked tools (tool-loop), skip the expensive final LLM when a
 * single structured tool already has everything for a table. Keeps "reasoning"
 * on tool choice; drops the 15–40s prose rewrite.
 */
export function tryFormatAgentToolAnswer(options: {
  userText: string;
  toolPayloads: {name: string; content: string; arguments?: string}[];
}): string | null {
  const payloads = options.toolPayloads;
  if (payloads.length !== 1) return null;
  const primary = payloads[0]!;
  const planId = inferPlanIdFromAgentTool(
    primary.name,
    primary.arguments,
    options.userText,
  );
  if (!planId) return null;
  return formatFastPathAnswer(planId, payloads);
}

function inferPlanIdFromAgentTool(
  name: string,
  argsJson: string | undefined,
  userText: string,
): string | null {
  let args: Record<string, unknown> = {};
  if (argsJson) {
    try {
      const parsed = JSON.parse(argsJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  if (name === 'fit_budget') {
    const budget = typeof args.budgetMonthRub === 'number' ? args.budgetMonthRub : null;
    return budget != null ? `budget-${budget}` : 'budget-agent';
  }

  if (name === 'compare_unit_price') {
    const component = typeof args.component === 'string' ? args.component : '';
    if (component === 'ssd' || component === 'nvme') {
      const mediaRaw = typeof args.diskMedia === 'string' ? args.diskMedia.toLowerCase() : '';
      const diskMedia =
        mediaRaw === 'nvme' || component === 'nvme' || /nvme/i.test(userText)
          ? 'nvme'
          : mediaRaw === 'ssd' || /ssd/i.test(userText)
            ? 'ssd'
            : 'any';
      const prefix = diskMedia === 'nvme' ? 'nvme' : 'ssd';
      const m = userText.match(/(\d+(?:[.,]\d+)?)\s*тб/i);
      if (m) {
        const tb = Math.round(parseFloat(m[1]!.replace(',', '.')));
        if (tb > 0) return `${prefix}-${tb}tb`;
      }
      return diskMedia === 'nvme' ? 'nvme-unit' : 'ssd-unit';
    }
    if (component === 'ram') return 'ram-unit';
    if (component === 'vcpu') return 'vcpu-unit';
    return null;
  }

  if (name === 'recommend_inference_infra') return 'inference-agent';

  if (name === 'get_quote') {
    if (typeof args.gpuModel === 'string' && args.gpuModel) {
      return `gpu-quote-${args.gpuModel}`;
    }
    return 'vm';
  }

  if (name === 'search_prices') {
    const category = typeof args.category === 'string' ? args.category : '';
    const query = typeof args.query === 'string' ? args.query : '';
    const gpuModel = typeof args.gpuModel === 'string' ? args.gpuModel : '';
    const storageClass = typeof args.storageClass === 'string' ? args.storageClass : '';
    const aiModel = typeof args.aiModel === 'string' ? args.aiModel : '';

    if (category === 'gpu' || gpuModel) {
      const g = (gpuModel || query).toLowerCase();
      if (g.includes('h100')) return 'h100-cheapest';
      if (g.includes('h200')) return 'h200-cheapest';
      if (g.includes('l40')) return 'l40s-hour';
      return `gpu-${gpuModel || 'search'}`;
    }
    if (category === 'kubernetes') return 'k8s-compare';
    if (category === 'network') {
      if (/ip|адрес/i.test(`${query} ${userText}`)) return 'public-ip';
      if (/egress|исходящ/i.test(`${query} ${userText}`)) return 'egress-1tb';
      return 'search-generic';
    }
    if (category === 'storage') {
      const volMatch = userText.match(/(\d+(?:[.,]\d+)?)\s*тб/i);
      const tb = volMatch ? Math.round(parseFloat(volMatch[1]!.replace(',', '.'))) : null;
      const cls =
        storageClass === 'cold' || storageClass === 'ice' || storageClass === 'warm'
          ? storageClass
          : storageClass === 'standard'
            ? 'standard'
            : /ice|ледян/i.test(`${query} ${userText}`)
              ? 'ice'
              : /cold|холод/i.test(`${query} ${userText}`)
                ? 'cold'
                : 'standard';
      if (tb && tb > 0) return `s3-${cls}-${tb}tb`;
      if (cls === 'cold') return 'cold-5tb';
      return 's3-50tb';
    }
    if (category === 'ai' || aiModel) {
      const a = (aiModel || query).toLowerCase();
      if (a.includes('kimi')) return 'kimi-k26-tokens';
      if (a.includes('glm')) return 'glm-52-mws';
      if (a.includes('qwen')) return 'qwen-36';
      return 'ai-api-tokens';
    }
    // Bare search without category — keep LLM (may be exploratory / multi-intent).
    return null;
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

  const forced = await chatCompletion(messagesForShortFinal(messages), undefined, {
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
