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
import {cheapestInCatalogLine} from '@/lib/catalog/compare-disclaimer';
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

/** Compact final prompt — planning uses intent-gated SYSTEM_PROMPT_CORE + domain cards. */
export const FAST_PATH_FINAL_SYSTEM = `Ты — AI-ассистент Cloud FinOps (cloudfinops.ru). Ответь на русском по данным инструментов в истории.

Правила:
- Цены и провайдеров бери ТОЛЬКО из tool results (providersMatched / quotes / volumeEstimates / stats). Не выдумывай.
- Markdown-таблица, сортировка по возрастанию цены / итога. Колонка «к минимуму»: у победителя «min», у остальных «+N%».
- НДС включён, месяц = 720 ч, валюта ₽. Минимальную цену называй как «минимальная цена в каталоге Cloud FinOps на {catalogAsOf}» (поле catalogAsOf / asOf в tool result), среди публичных тарифов в выборке, без промо.
- Если у победителя synthetic=true или derived — явно пометь «оценка Cloud FinOps, не строка прайса».
- Для S3 volumeEstimates — итог за месяц; операции/egress не включай, если не просили.
- Для compare_unit_price(ssd) при запросе объёма умножь ₽/GiB·мес на объём (55 ТБ → 56320 GiB) и покажи итог. Учитывай diskMedia: NVMe ≠ SSD; в таблице указывай name/sku диска.
- Для S3 volumeEstimates класс бери из applied.storageClass / volumeEstimates[].storageClass — не называй Ice «Standard».
- Для AI — input и output отдельно (₽/1M токенов), если оба есть.
- МУЛЬТИКОМПОНЕНТНЫЙ СТЕК (несколько tool results): одна таблица по провайдерам с колонкой на каждый запрошенный компонент (ВМ, IP, S3, CDN, K8s…) плюс «Итого» и «к минимуму» по итогу. S3/CDN итоги — из volumeEstimates. Не выкидывай компоненты.
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

/**
 * VM + IP + S3 + CDN (etc.) must not collapse into a single-SKU volume plan.
 * Used before dynamic S3/SSD/budget/alias matchers.
 */
export function looksMultiComponentStack(userText: string): boolean {
  const t = userText;
  // «это не S3 / не объектка» в SSD-запросах не считаем за компонент стека.
  const tSku = t.replace(/(?:это\s+)?не\s+(?:s3|объект\w*|object\s*storage)/gi, ' ');
  const hasVm =
    /виртуал|\bвм\b|\bvm\b|flavor|инстанс/i.test(t) ||
    /\d+\s*(?:ядер|vcpu)/i.test(t) ||
    /(?:ядер|vcpu).{0,20}\d+/i.test(t) ||
    /\d+\s*(?:GiB|ГиБ|гиби|гб)\b.{0,24}(?:RAM|ОЗУ|памят)/i.test(t) ||
    /(?:памят|озу).{0,30}(?:GiB|ГиБ|гиби|гб|\d+)/i.test(t);
  const hasIp =
    /public\s*address|публичн(?:ый|ого)?\s*(?:ip|адрес)|бел(?:ый|ого)\s*ip|внешн(?:ий|его)\s*ip|\bip\s*адрес/i.test(
      t,
    );
  const hasS3 = /(?:\bs3\b|объектн|object\s*storage)/i.test(tSku);
  const hasCdn = /\bcdn\b/i.test(t);
  const hasK8s =
    /kubernetes|\bk8s\b|managed\s+кубер|мастер.{0,20}(?:k8s|kubernetes|кубер)/i.test(t);
  const hasBlockDisk =
    /(?:ssd|nvme|блочн).{0,40}\d+\s*тб|\d+\s*тб.{0,40}(?:ssd|nvme|блочн)/i.test(t);
  const hasEgress = /(?:egress|исходящ(?:ий)?\s*трафик)/i.test(t) && !hasCdn;

  const flags = [hasVm, hasIp, hasS3, hasCdn, hasK8s, hasBlockDisk, hasEgress].filter(
    Boolean,
  ).length;
  if (flags >= 2) return true;

  // Two named SKU families without a third signal still need the agent.
  if (hasS3 && hasCdn) return true;
  if (hasS3 && hasIp) return true;
  if (hasVm && (hasS3 || hasCdn || hasIp || hasK8s)) return true;

  if (
    /собери\s+решени|собери\s+конфиг|стек\s+из|в\s+одной\s+таблиц/i.test(t) &&
    flags >= 2
  ) {
    return true;
  }

  return false;
}

/** Block SSD/NVMe «N ТБ» → compare_unit_price; volume + media encoded in plan id. */
function matchSsdVolumePlan(userText: string): FastPathPlan | null {
  const t = userText.trim();
  if (looksMultiComponentStack(t)) return null;
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
  if (looksMultiComponentStack(t)) return null;
  if (!/(?:s3|объектн|object\s*storage)/i.test(t)) return null;
  if (/блочн/i.test(t)) return null;
  // CDN phrasing must not fall into S3 («докинь CDN +1TB»).
  if (/\bcdn\b/i.test(t)) return null;
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

/** «докинь CDN +1TB» / «CDN 10 ТБ» → search_prices category=cdn (egress volume). */
function matchCdnVolumePlan(userText: string): FastPathPlan | null {
  const t = userText.trim();
  if (looksMultiComponentStack(t)) return null;
  if (!/\bcdn\b/i.test(t)) return null;
  if (/(?:s3|объектн|object\s*storage)/i.test(t)) return null;

  // Avoid \\b after Cyrillic units — JS word boundaries treat «ТБ» as non-word.
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:тиб|tib|тб|tb)(?![а-яёa-z])/i);
  const tb = m ? Math.round(parseFloat(m[1]!.replace(',', '.'))) : null;
  // Cover conjugated RU verbs: докинь/докинем/докиньте, добавь/добавим/добавьте…
  const actionable =
    /докин\w*|добав\w*|прибав\w*|плюс|\+|трафик|сравни|сколько|стоим|цен|корзин/i.test(t) ||
    tb != null;
  if (!actionable) return null;

  const volumeTb = tb != null && tb > 0 ? tb : 1;
  if (volumeTb > 500) return null;

  return {
    id: `cdn-${volumeTb}tb`,
    tools: [
      {
        name: 'search_prices',
        args: {
          query: 'исходящий трафик CDN',
          category: 'cdn',
          volumeGiB: volumeTb * 1024,
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

  // Multi-SKU stacks (VM+IP+S3+CDN+K8s…) → agent tool-loop + LLM, never a chip plan.
  if (looksMultiComponentStack(userText)) return null;

  // Dynamic volume / budget before static aliases (captures 10ТБ SSD, 55ТБ NVMe, 50 тыс, …).
  const ssdVol = matchSsdVolumePlan(userText);
  if (ssdVol) return ssdVol;
  const cdnVol = matchCdnVolumePlan(userText);
  if (cdnVol) return cdnVol;
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

function gpuCountFromText(text: string, fallback = 1): number {
  const m = text.match(/(\d+)\s*[×xх]/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 16) return fallback;
  return Math.round(n);
}

/**
 * Calculator AI tab drives the shared quote sidebar via get_quote / lakehouse.
 * GPU catalog chips that only run search_prices would leave the sidebar empty and
 * show card-only rows — rewrite them to the calculator engine.
 */
export function adaptFastPathForSurface(
  plan: FastPathPlan,
  surface: 'chat' | 'calculator',
  userText = '',
): FastPathPlan {
  if (surface !== 'calculator') return plan;
  if (!plan.tools.length || !plan.tools.every((t) => t.name === 'search_prices')) {
    return plan;
  }
  const gpuTool = plan.tools.find(
    (t) => typeof t.args.gpuModel === 'string' && String(t.args.gpuModel).trim(),
  );
  if (!gpuTool) return plan;
  const gpuModel = String(gpuTool.args.gpuModel).trim();
  const fromArgs =
    typeof gpuTool.args.gpuCount === 'number' && gpuTool.args.gpuCount > 0
      ? Math.round(gpuTool.args.gpuCount)
      : null;
  const gpuCount = fromArgs ?? gpuCountFromText(userText, 1);
  return {
    id: plan.id,
    tools: [{name: 'get_quote', args: {gpuModel, gpuCount, period: 'month'}}],
  };
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
    // Prefer compact money fields the final LLM needs for stack tables.
    if (Array.isArray(parsed.volumeEstimates)) {
      parsed.volumeEstimates = (parsed.volumeEstimates as unknown[]).slice(0, 8);
      delete parsed.rows;
      delete parsed.providersMatched;
    } else if (Array.isArray(parsed.quotes)) {
      parsed.quotes = (parsed.quotes as unknown[]).slice(0, 8);
      delete parsed.note;
    } else if (Array.isArray(parsed.rows)) {
      parsed.rows = (parsed.rows as unknown[]).slice(0, 8);
    }
    if (Array.isArray(parsed.providersMatched)) {
      parsed.providersMatched = (parsed.providersMatched as unknown[]).slice(0, 8);
    }
    if (typeof parsed.note === 'string' && parsed.note.length > 160) {
      parsed.note = `${parsed.note.slice(0, 160)}…`;
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

/**
 * Tool results after the latest user turn (serialized multi-round stacks).
 * Ignores earlier turns so follow-ups do not merge stale SKUs into a new stack.
 */
export function extractAllToolPayloads(
  messages: ChatMessage[],
): {name: string; content: string; arguments?: string}[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  const slice = lastUserIdx >= 0 ? messages.slice(lastUserIdx + 1) : messages;

  const payloads: {name: string; content: string; arguments?: string}[] = [];
  const byCallId = new Map<string, {name: string; arguments?: string}>();
  for (const m of slice) {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      for (const call of m.tool_calls) {
        byCallId.set(call.id, {
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    }
    if (m.role === 'tool' && typeof m.content === 'string' && m.tool_call_id) {
      const meta = byCallId.get(m.tool_call_id);
      if (meta) {
        payloads.push({
          name: meta.name,
          content: m.content,
          arguments: meta.arguments,
        });
      } else if (m.name) {
        payloads.push({name: m.name, content: m.content});
      }
    }
  }
  return payloads;
}

export function lastUserQuestion(messages: ChatMessage[]): string {
  return lastUserText(messages);
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽`;
}

function pctVsBest(price: number, best: number): string {
  if (!(best > 0) || !(price >= 0)) return '—';
  // Keep token aligned with column «к минимуму» / system prompt («min», not «best»).
  if (price <= best * 1.0001) return 'min';
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

type StackComponentKind = 'vm' | 'ip' | 's3' | 'cdn' | 'k8s' | 'other';

function classifyStackPayload(
  name: string,
  data: Record<string, unknown>,
  argsJson?: string,
): StackComponentKind {
  if (name === 'get_quote' && Array.isArray(data.quotes)) return 'vm';
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
  const category = typeof args.category === 'string' ? args.category : '';
  if (category === 'network') return 'ip';
  if (category === 'storage') return 's3';
  if (category === 'cdn') return 'cdn';
  if (category === 'kubernetes') return 'k8s';

  if (Array.isArray(data.volumeEstimates) && data.volumeEstimates.length) {
    const first = data.volumeEstimates[0] as {name?: string};
    if (/cdn/i.test(first?.name ?? '')) return 'cdn';
    return 's3';
  }

  const rows = Array.isArray(data.rows) ? (data.rows as {name?: string; category?: string}[]) : [];
  const blob = rows
    .slice(0, 4)
    .map((r) => `${r.category ?? ''} ${r.name ?? ''}`)
    .join(' ');
  if (/cdn/i.test(blob)) return 'cdn';
  if (/kubernetes|мастер|k8s/i.test(blob)) return 'k8s';
  if (/ip|адрес/i.test(blob)) return 'ip';
  if (/объект|object\s*storage|s3/i.test(blob)) return 's3';
  return 'other';
}

function providerMapFromVolumes(
  volumes: {providerName: string; totalMonth: number}[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of volumes) {
    if (!(v.totalMonth >= 0) || !v.providerName) continue;
    const prev = map.get(v.providerName);
    if (prev == null || v.totalMonth < prev) map.set(v.providerName, v.totalMonth);
  }
  return map;
}

function providerMapFromRows(
  rows: {provider: string; name: string; config?: string; month: number | null}[],
  kind: StackComponentKind,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.month !== 'number' || !(r.month > 0) || !r.provider) continue;
    const blob = `${r.name} ${r.config ?? ''}`;
    if (kind === 'ip') {
      if (
        !/ip|ipv4|адрес|elastic|floating/i.test(blob) ||
        /входящ|ingress|трафик|traffic|гигабайт|gi\b|cdn/i.test(blob)
      ) {
        continue;
      }
    } else if (kind === 'k8s') {
      if (/региональн|отказоустойчив|\bha\b/i.test(blob)) continue;
      if (!/мастер|master|кластер|kubernetes|k8s|базов/i.test(blob)) continue;
    } else if (kind === 'cdn') {
      if (/ресурс|запрос|shielding|лог|dedicated|ресурс/i.test(blob)) continue;
      if (!/cdn|трафик/i.test(blob)) continue;
    }
    const prev = map.get(r.provider);
    if (prev == null || r.month < prev) map.set(r.provider, r.month);
  }
  return map;
}

type StackComp = {
  kind: StackComponentKind;
  label: string;
  byProvider: Map<string, number>;
  note?: string;
};

function collectStackComponents(
  toolPayloads: {name: string; content: string; arguments?: string}[],
): {comps: StackComp[]; vmTitle: string; catalogAsOf: string | null} {
  const comps: StackComp[] = [];
  let vmTitle = 'ВМ';
  let catalogAsOf: string | null = null;

  for (const payload of toolPayloads) {
    const data = parseJson(payload.content);
    if (!data || data.error) continue;
    if (typeof data.catalogAsOf === 'string' && data.catalogAsOf) {
      catalogAsOf = data.catalogAsOf;
    }
    const kind = classifyStackPayload(payload.name, data, payload.arguments);
    if (kind === 'vm') {
      type Q = {provider: string; total: number | null};
      const quotes = (data.quotes as Q[] | undefined) ?? [];
      const byProvider = new Map<string, number>();
      for (const q of quotes) {
        if (q.provider && typeof q.total === 'number') byProvider.set(q.provider, q.total);
      }
      if (!byProvider.size) continue;
      const req = (data.request ?? {}) as {vcpu?: number; ramGiB?: number; diskGiB?: number};
      vmTitle = `ВМ ${req.vcpu ?? '—'} / ${req.ramGiB ?? '—'} / ${req.diskGiB ?? '—'} GiB`;
      comps.push({kind, label: 'ВМ', byProvider});
      continue;
    }

    if (kind === 's3' || kind === 'cdn') {
      const volumes = data.volumeEstimates as
        | {providerName: string; totalMonth: number; volumeGiB?: number; name?: string}[]
        | undefined;
      if (Array.isArray(volumes) && volumes.length) {
        const vol = volumes[0].volumeGiB;
        const label =
          kind === 'cdn'
            ? `CDN${vol ? ` ${Math.round(vol / 1024)} ТБ` : ''}`
            : `S3${vol ? ` ${Math.round(vol / 1024)} ТБ` : ''}`;
        const note =
          kind === 'cdn' && volumes.some((v) => /вход и выход|bidirectional/i.test(v.name ?? ''))
            ? 'VK CDN — вход+выход в одной ставке'
            : undefined;
        comps.push({kind, label, byProvider: providerMapFromVolumes(volumes), note});
        continue;
      }
      const applied = data.applied as {volumeGiB?: number} | undefined;
      const volumeGiB = applied?.volumeGiB;
      const rows = Array.isArray(data.rows)
        ? (data.rows as {provider: string; name: string; config?: string; month: number | null}[])
        : [];
      const rates = providerMapFromRows(rows, kind);
      if (volumeGiB && rates.size) {
        const totals = new Map<string, number>();
        for (const [p, rate] of rates) {
          totals.set(p, Math.round(rate * volumeGiB * 100) / 100);
        }
        comps.push({
          kind,
          label: `${kind === 'cdn' ? 'CDN' : 'S3'} ${Math.round(volumeGiB / 1024)} ТБ`,
          byProvider: totals,
        });
      }
      continue;
    }

    if (kind === 'ip' || kind === 'k8s') {
      const rows = Array.isArray(data.rows)
        ? (data.rows as {provider: string; name: string; config?: string; month: number | null}[])
        : [];
      const byProvider = providerMapFromRows(rows, kind);
      if (!byProvider.size) continue;
      comps.push({
        kind,
        label: kind === 'ip' ? 'IP' : 'K8s master',
        byProvider,
      });
    }
  }

  return {comps, vmTitle, catalogAsOf};
}

/**
 * Compact per-provider totals for the final LLM (avoids stuffing 5× full tool JSON).
 */
export function buildStackDigestForFinal(
  toolPayloads: {name: string; content: string; arguments?: string}[],
): string | null {
  const {comps, vmTitle, catalogAsOf} = collectStackComponents(toolPayloads);
  if (comps.length < 2) return null;

  const providers = new Set<string>();
  for (const c of comps) for (const p of c.byProvider.keys()) providers.add(p);

  const lines: string[] = [
    `Компоненты: ${comps.map((c) => (c.kind === 'vm' ? vmTitle : c.label)).join(' + ')}`,
    catalogAsOf ? `catalogAsOf: ${catalogAsOf}` : '',
    'Цифры ₽/мес (НДС вкл.) по провайдерам:',
  ].filter(Boolean);

  for (const provider of [...providers].sort()) {
    const parts = comps.map((c) => {
      const v = c.byProvider.get(provider);
      return `${c.label}=${v != null ? Math.round(v * 100) / 100 : 'н/д'}`;
    });
    const known = comps.every((c) => c.byProvider.has(provider));
    if (!known) continue;
    const total = comps.reduce((s, c) => s + (c.byProvider.get(provider) as number), 0);
    lines.push(`- ${provider}: ${parts.join('; ')}; Итого=${Math.round(total * 100) / 100}`);
  }

  const notes = comps.map((c) => c.note).filter(Boolean);
  if (notes.length) lines.push(`Заметки: ${notes.join('; ')}`);
  return lines.join('\n');
}

/** Short final-turn messages: digest instead of raw tool dumps. */
export function messagesForStackFinal(options: {
  userText: string;
  toolPayloads: {name: string; content: string; arguments?: string}[];
}): ChatMessage[] | null {
  const digest = buildStackDigestForFinal(options.toolPayloads);
  if (!digest) return null;
  return [
    {role: 'system', content: FAST_PATH_FINAL_SYSTEM},
    {
      role: 'user',
      content:
        `${options.userText.trim()}\n\n---\nДанные инструментов (уже собраны):\n${digest}\n---\n` +
        'Собери одну markdown-таблицу по провайдерам: колонка на каждый компонент + Итого + к минимуму. ' +
        'Сортировка по Итого. Цены только из блока выше. Краткий вывод про минимум в каталоге. Без tool calls.',
    },
  ];
}

/**
 * Compose one cross-provider table from multi-tool stack payloads.
 * Returns null when fewer than two priced components resolved.
 */
export function formatStackFastPathAnswer(
  toolPayloads: {name: string; content: string; arguments?: string}[],
): string | null {
  const {comps, vmTitle} = collectStackComponents(toolPayloads);
  if (comps.length < 2) return null;

  const providers = new Set<string>();
  for (const c of comps) for (const p of c.byProvider.keys()) providers.add(p);

  type Row = {provider: string; parts: number[]; total: number; missing: boolean};
  const rows: Row[] = [];
  for (const provider of providers) {
    const parts: number[] = [];
    let total = 0;
    let missing = false;
    for (const c of comps) {
      const v = c.byProvider.get(provider);
      if (v == null) {
        parts.push(Number.NaN);
        missing = true;
      } else {
        parts.push(v);
        total += v;
      }
    }
    if (missing) continue; // only fully-covered providers in the parity table
    rows.push({provider, parts, total});
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.total - b.total);
  const best = rows[0]!.total;

  const header = `| Провайдер | ${comps.map((c) => c.label).join(' | ')} | Итого | к минимуму |`;
  const sep = `|---|${comps.map(() => '---:').join('|')}|---:|---|`;
  const body = rows
    .map((r) => {
      const cells = r.parts.map((n) => formatRub(n)).join(' | ');
      return `| ${r.provider} | ${cells} | ${formatRub(r.total)} | ${pctVsBest(r.total, best)} |`;
    })
    .join('\n');

  const notes = comps
    .map((c) => c.note)
    .filter(Boolean)
    .join('; ');
  const titleParts = comps.map((c) =>
    c.kind === 'vm' ? vmTitle : c.label,
  );
  const title = `Стек: ${titleParts.join(' + ')}`;

  return `**${title}** (НДС вкл., месяц = 720 ч)\n\n${header}\n${sep}\n${body}\n\n${cheapestInCatalogLine({
    provider: rows[0]!.provider,
    priceText: `${formatRub(best)}/мес`,
  })}${notes ? ` ${notes}.` : ''} Операции S3 и лишний egress не включены, если не запрошены.`;
}

/**
 * Deterministic markdown for chip tools — avoids the 5–15s final LLM RTT.
 * Returns null when the payload shape is unexpected (then we fall back to LLM).
 */
export function formatFastPathAnswer(
  planId: string,
  toolPayloads: {name: string; content: string; arguments?: string}[],
): string | null {
  // Multi-SKU stacks: composed table (never render only the first tool).
  if (planId.startsWith('stack-') || toolPayloads.length > 1) {
    return formatStackFastPathAnswer(toolPayloads);
  }

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
      'НДС вкл., месяц = 720 ч. Цена — минимальная среди паритетных узлов в каталоге Cloud FinOps.',
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

  if (primary.name === 'compose_solution' && Array.isArray(data.solutions)) {
    type Sol = {
      providerName?: string;
      provider?: string;
      monthlyCostRub?: number | null;
      requirementsCoverage?: number;
      status?: string;
      assumptions?: string[];
      unresolved?: string[];
      components?: {role: string; monthlyCostRub?: number | null}[];
    };
    const solutions = (data.solutions as Sol[])
      .filter((s) => (s.providerName || s.provider) && typeof s.monthlyCostRub === 'number')
      .slice()
      .sort((a, b) => (a.monthlyCostRub as number) - (b.monthlyCostRub as number));
    if (!solutions.length) return null;
    const best = solutions[0].monthlyCostRub as number;
    const solutionType =
      typeof data.solutionType === 'string' ? data.solutionType : 'solution';
    const rows = solutions
      .map((s) => {
        const name = s.providerName || s.provider || '—';
        const roles = (s.components ?? []).map((c) => c.role).filter(Boolean).join(', ');
        const cov =
          typeof s.requirementsCoverage === 'number'
            ? `${Math.round(s.requirementsCoverage * 100)}%`
            : '—';
        return `| ${name} | ${roles || '—'} | ${formatRub(s.monthlyCostRub as number)} | ${cov} | ${pctVsBest(s.monthlyCostRub as number, best)} |`;
      })
      .join('\n');
    const rawAssumptions = data.assumptions as unknown;
    const assumptions = Array.isArray(rawAssumptions)
      ? rawAssumptions
          .map((a) => (typeof a === 'string' ? a : (a as {message?: string})?.message))
          .filter((m): m is string => typeof m === 'string' && Boolean(m))
          .slice(0, 4)
      : [];
    const assumptionBlock = assumptions.length
      ? `\n\nДопущения: ${assumptions.join('; ')}.`
      : '';
    const note =
      typeof data.note === 'string' && /price_solution|estimated/i.test(data.note)
        ? '\n\n_Оценка compose; итоговые totals — через price_solution._'
        : '';
    return `**Сравнение решений (${solutionType}) за месяц** (НДС вкл., 720 ч; оценка compose)\n\n| Провайдер | Компоненты | Итого / мес | Покрытие | к минимуму |\n|---|---|---:|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
      provider: solutions[0].providerName || solutions[0].provider || '—',
      priceText: `${formatRub(best)}/мес`,
    })}${assumptionBlock}${note}`;
  }

  if (primary.name === 'validate_solution' && Array.isArray(data.checks)) {
    type Check = {code: string; status: string; message?: string};
    const checks = data.checks as Check[];
    const rows = checks
      .slice(0, 12)
      .map((c) => `| ${c.code} | ${c.status} | ${c.message ?? '—'} |`)
      .join('\n');
    const valid = data.valid === true ? 'да' : 'нет';
    return `**Проверка решения:** valid=${valid}, coverage=${data.coverage ?? '—'}\n\n| Код | Статус | Комментарий |\n|---|---|---|\n${rows}`;
  }

  if (primary.name === 'compare_solutions' && Array.isArray(data.comparison)) {
    type Row = {
      providerName?: string;
      provider?: string;
      monthlyCostRub?: number | null;
      requirementCoverage?: number;
      solutionId?: string;
    };
    const comparison = (data.comparison as Row[])
      .filter((r) => typeof r.monthlyCostRub === 'number')
      .slice();
    if (!comparison.length) return null;
    const best = comparison[0].monthlyCostRub as number;
    const pareto = Array.isArray(data.paretoOptimalSolutionIds)
      ? (data.paretoOptimalSolutionIds as string[])
      : [];
    const rows = comparison
      .map((r) => {
        const name = r.providerName || r.provider || r.solutionId || '—';
        const cov =
          typeof r.requirementCoverage === 'number'
            ? `${Math.round(r.requirementCoverage * 100)}%`
            : '—';
        return `| ${name} | ${formatRub(r.monthlyCostRub as number)} | ${cov} | ${pctVsBest(r.monthlyCostRub as number, best)} |`;
      })
      .join('\n');
    const paretoNote = pareto.length ? `\n\nPareto-оптимальные: ${pareto.join(', ')}.` : '';
    return `**Сравнение вариантов** (НДС вкл.)\n\n| Провайдер | Итого / мес | Покрытие | к минимуму |\n|---|---:|---:|---|\n${rows}${paretoNote}`;
  }

  if (primary.name === 'get_quote' && Array.isArray(data.quotes)) {
    type Q = {
      provider: string;
      total: number | null;
      scope?: string;
      scopeNote?: string;
    };
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
    // gpu-synthetic = sum of published unit rates (GPU + host), not a single vendor SKU row.
    const composedWinner =
      quotes[0].scope === 'gpu-synthetic' ||
      Boolean(quotes[0].scopeNote?.includes('собранный хост'));
    return `**${title}**\n\n| Провайдер | Итого / мес | к минимуму |\n|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
      provider: quotes[0].provider,
      priceText: `${formatRub(best)}/мес`,
      composed: composedWinner,
    })}`;
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
        return `**${tb.toLocaleString('ru-RU')} ТБ ${mediaLabel} (блочный диск) в месяц** (НДС вкл.; 1 ТБ = 1024 GiB → ${volumeGiB.toLocaleString('ru-RU')} GiB)\n\n| Провайдер | Диск | ₽/GiB·мес | Итого / мес | к минимуму |\n|---|---|---:|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
          provider: withMonth[0].providerName,
          priceText: `${formatRub(bestTotal)}/мес`,
          detail: bestName,
        })}`;
      }
      const rows = withMonth
        .map(
          (p) =>
            `| ${p.providerName} | ${diskCell(p)} | ${formatRub(p.priceMonth as number)} | ${pctVsBest(p.priceMonth as number, bestRate)} |`,
        )
        .join('\n');
      return `**Цена 1 GiB блочного ${mediaLabel} в месяц** (НДС вкл.)\n\n| Провайдер | Диск | ₽/GiB·мес | к минимуму |\n|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
        provider: withMonth[0].providerName,
        priceText: `${formatRub(bestRate)}/GiB·мес`,
      })}`;
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
      return `**Минимальная цена ${label} в месяц** (НДС вкл., 720 ч)\n\n| Провайдер | ₽/мес | к минимуму |\n|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
        provider: ranked[0].name,
        priceText: `${formatRub(best)}/мес`,
      })}`;
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
    return `**${title}** (НДС вкл., месяц = 720 ч; без IP/S3/K8s/GPU)\n\n| Провайдер | Конфиг × N | Итого ₽/мес | Утилизация | к минимуму |\n|---|---|---:|---:|---|\n${rows}\n\nЛучшая утилизация бюджета в каталоге Cloud FinOps: **${highlights[0].provider}** — ${highlights[0].shape} × ${highlights[0].count}.`;
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
      return `**Объектное хранилище ${classLabel}${vol ? ` · ${Number(vol).toLocaleString('ru-RU')} GiB` : ''}** (НДС вкл., месяц)\n\n| Провайдер | ₽/GiB·мес | Итого / мес | к минимуму |\n|---|---:|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
        provider: sorted[0].providerName,
        priceText: `${formatRub(best)}/мес`,
      })} Операции и egress тарифицируются отдельно.`;
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
        return `**Публичный IP в месяц** (НДС вкл.)\n\n| Провайдер | Позиция | ₽/мес | к минимуму |\n|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
          provider: ranked[0].provider,
          priceText: `${formatRub(best)}/мес`,
        })}`;
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
          return `**Исходящий трафик (egress) · ${volumeGiB.toLocaleString('ru-RU')} GiB** (НДС вкл.)\n\n| Провайдер | ₽/GiB | Итого / мес | к минимуму |\n|---|---:|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
            provider: ranked[0].provider,
            priceText: `${formatRub(best)}/мес`,
          })}`;
        }
        const rows = ranked
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.total)} | ${pctVsBest(r.total, best)} |`,
          )
          .join('\n');
        return `**Исходящий трафик (egress)** (НДС вкл.)\n\n| Провайдер | Позиция | ₽/GiB·мес | к минимуму |\n|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
          provider: ranked[0].provider,
          priceText: formatRub(best),
        })}`;
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
        return `**GPU в каталоге Selectel** (НДС вкл., месяц = 720 ч)\n\n| GPU | Конфигурация | ₽/мес | к минимуму |\n|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
          provider: 'Selectel',
          priceText: `${formatRub(best)}/мес`,
          detail: ` (${ranked[0].name})`,
        })}`;
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
        synthetic?: boolean;
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
          synthetic: Boolean(m.cheapest?.synthetic),
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
        type AiRow = {
          provider: string;
          name: string;
          month: number | null;
          synthetic?: boolean;
        };
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
              synthetic: Boolean(r.synthetic),
            }))
          : withPrice
              .filter((m) => typeof m.month === 'number')
              .map((m) => ({
                provider: m.provider,
                name: m.name,
                month: m.month as number,
                synthetic: m.synthetic,
              }))
        ).sort((a, b) => a.month - b.month);
        if (!rowsData.length) return null;
        const best = rowsData[0].month;
        const rows = rowsData
          .map(
            (r) =>
              `| ${r.provider} | ${r.name} | ${formatRub(r.month)} | ${pctVsBest(r.month, best)} |`,
          )
          .join('\n');
        return `**Цены AI / токены (₽ за 1M токенов, НДС вкл.)**\n\n| Провайдер | Позиция | ₽ / 1M | к минимуму |\n|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
          provider: rowsData[0].provider,
          priceText: formatRub(best),
          derived: rowsData[0].synthetic,
        })}`;
      }

      const rowsData = withPrice
        .map((m) => ({
          provider: m.provider,
          name: m.name,
          config: m.config,
          month: typeof m.month === 'number' ? m.month : (m.hour as number) * 720,
          synthetic: m.synthetic,
        }))
        .sort((a, b) => a.month - b.month);
      const best = rowsData[0].month;
      const rows = rowsData
        .map(
          (r) =>
            `| ${r.provider} | ${r.name}${r.synthetic ? ' *' : ''} | ${r.config} | ${formatRub(r.month)} | ${pctVsBest(r.month, best)} |`,
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
            synthetic: m.synthetic,
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
        return `**${heading}** (НДС вкл., месяц = 720 ч)\n\n| Провайдер | Позиция | ₽/час | ₽/мес | к минимуму |\n|---|---|---:|---:|---|\n${rowsH}\n\n${cheapestInCatalogLine({
          provider: hourRows[0].provider,
          priceText: `${formatRub(bestH)}/час`,
          derived: Boolean(hourRows[0].synthetic),
        })}`;
      }
      return `**${heading}** (НДС вкл., месяц = 720 ч)\n\n| Провайдер | Позиция | Конфигурация | ₽/мес | к минимуму |\n|---|---|---|---:|---|\n${rows}\n\n${cheapestInCatalogLine({
        provider: rowsData[0].provider,
        priceText: `${formatRub(best)}/мес`,
        derived: Boolean(rowsData[0].synthetic),
      })}`;
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
  /**
   * Multi-tool stacks normally need the final LLM. Pass true only as a last
   * resort when the model returned empty after tools.
   */
  allowStackCompose?: boolean;
}): string | null {
  const payloads = options.toolPayloads;
  if (payloads.length > 1) {
    if (!options.allowStackCompose) return null;
    return formatStackFastPathAnswer(payloads);
  }
  if (payloads.length !== 1) return null;
  const primary = payloads[0]!;
  // compose/validate/compare already return a full multi-component BOM — format them.
  const composedTool =
    primary.name === 'compose_solution' ||
    primary.name === 'validate_solution' ||
    primary.name === 'compare_solutions';
  // One search/quote tool cannot answer a multi-SKU stack — keep the final LLM.
  if (!composedTool && looksMultiComponentStack(options.userText)) return null;
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

  if (name === 'compose_solution') {
    const t = typeof args.solutionType === 'string' ? args.solutionType : 'custom';
    return `compose-${t}`;
  }
  if (name === 'validate_solution') return 'validate-solution';
  if (name === 'compare_solutions') return 'compare-solutions';
  if (name === 'search_catalog') return 'search-catalog';
  if (name === 'price_solution') return 'price-solution';

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
 * Chat fast-path sampling rate. Default 0 — prefer the agent (stronger model).
 * Override with CHAT_FAST_PATH_PROBABILITY=0|1|0.25 for eval/A-B.
 * Calculator surface still always keeps fast-path (sidebar needs get_quote ASAP).
 */
export function fastPathProbabilityFromEnv(): number {
  const raw = process.env.CHAT_FAST_PATH_PROBABILITY;
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Whether to take the deterministic chip path this turn. */
export function shouldUseFastPath(options?: {
  surface?: 'chat' | 'calculator';
  probability?: number;
  /** Injected RNG for tests; defaults to Math.random. */
  random?: () => number;
}): boolean {
  if (options?.surface === 'calculator') return true;
  const p = options?.probability ?? fastPathProbabilityFromEnv();
  if (p <= 0) return false;
  if (p >= 1) return true;
  return (options?.random ?? Math.random)() < p;
}

/**
 * If this is a first-turn chip/alias query, run tools locally and one short final LLM call.
 * Returns null when the query should use the normal tool loop.
 * Chat surface: off by default (CHAT_FAST_PATH_PROBABILITY, default 0).
 */
export async function tryRunFastPath(options: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onEvent?: (event: FastPathEvent) => void;
  /** calculator → rewrite GPU search chips to get_quote for the price sidebar */
  surface?: 'chat' | 'calculator';
}): Promise<FastPathResult | null> {
  if (userTurnCount(options.messages) !== 1) return null;

  const userText = lastUserText(options.messages);
  const matched = matchFastPath(userText);
  if (!matched) return null;

  const surface = options.surface === 'calculator' ? 'calculator' : 'chat';
  if (!shouldUseFastPath({surface})) return null;

  const plan = adaptFastPathForSurface(matched, surface, userText);

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
    results.map(({call, result}) => ({
      name: call.function.name,
      content: result,
      arguments: call.function.arguments,
    })),
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
