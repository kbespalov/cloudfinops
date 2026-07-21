/**
 * Cheap pre-routing for the inference infra recommender.
 * Must stay false for ordinary price/VM/GPU-card questions so CHAT_TOOLS is unchanged.
 */

import {findInferenceModel, listInferenceModelAliases} from '@/data/inference-models';

const INFRA_VERBS =
  /(?:запуск|запустить|развернуть|развёртыван|self[-\s]?host|сво(и[хм]|ём|ем)|своей|на\s+свои[хм]|инфраструктур|сколько\s+gpu|скольк[оа]\s+карт|vram|видеопамят|tensor\s*parallel|\btp\b|квантизац|quant|на\s+сво(ём|ем)\s+железе|нужн[аоы]\s+(?:gpu|видеокарт|сервер|кластер)|конфиг(?:ураци[яи])?\s+под\s+инференс|для\s+инференс)/i;

const TOKEN_PRICE =
  /(?:токен|1m\s*токен|₽\s*\/\s*1m|за\s*1m|api\s*цен|сколько\s+стоит.{0,40}(?:у\s+)?mws|hosted)/i;

/** Soft infra-only gate: must look like an LLM / inference ask, not k8s/1C/site infra. */
const LLM_SIGNAL =
  /(?:\bllm\b|модел[ьи]|инференс|inference|self[-\s]?host|open[-\s]?weight|квант|quant|vram|видеопамят|gpt[-\s]?oss|qwen|квен|glm|злм|llama|kimi|кими|deepseek|gemma|mistral|mixtral|phi[-\s]?\d|oss[-\s]?\d)/i;

/** Build a loose model-name matcher from curated aliases (longest first). */
let aliasPattern: RegExp | null = null;

function modelAliasPattern(): RegExp {
  if (aliasPattern) return aliasPattern;
  const aliases = listInferenceModelAliases()
    .map((a) =>
      a
        .trim()
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s*'),
    )
    .filter((a) => a.length >= 3)
    .sort((a, b) => b.length - a.length);
  // Dedupe
  const uniq = [...new Set(aliases)];
  aliasPattern = new RegExp(`(?:${uniq.join('|')})`, 'i');
  return aliasPattern;
}

export type InferenceIntent = {
  matched: boolean;
  /** Best-effort model query string for the recommender tool. */
  modelQuery: string | null;
  reason: 'infra+model' | 'infra-only' | 'none';
};

/**
 * True when the user asks how to self-host / size GPUs for a model.
 * False for «сколько стоит GLM 5.2 за 1M токенов» (token pricing).
 */
export function matchInferenceIntent(userText: string): InferenceIntent {
  const text = userText.trim();
  if (!text) return {matched: false, modelQuery: null, reason: 'none'};

  // Explicit token/API price questions stay on the normal AI search path.
  if (TOKEN_PRICE.test(text) && !INFRA_VERBS.test(text)) {
    return {matched: false, modelQuery: null, reason: 'none'};
  }

  const hasInfra = INFRA_VERBS.test(text);
  const hasModelAlias = modelAliasPattern().test(text);
  const profile = findInferenceModel(text);

  if (hasInfra && (hasModelAlias || profile)) {
    return {
      matched: true,
      modelQuery: profile?.displayName ?? extractModelHint(text),
      reason: 'infra+model',
    };
  }

  // «Какая инфраструктура для GLM 5.2» without strong verb — still intent if model + infra nouns.
  if (
    profile &&
    /(?:инфраструктур|gpu|видеокарт|кластер|сервер|vram|памят)/i.test(text)
  ) {
    return {
      matched: true,
      modelQuery: profile.displayName,
      reason: 'infra+model',
    };
  }

  if (hasInfra && !hasModelAlias && !profile && LLM_SIGNAL.test(text)) {
    // Soft match only when the ask still looks like LLM/inference sizing.
    // Avoid «развернуть Kubernetes» / «инфраструктура для сайта на 1С».
    return {matched: true, modelQuery: extractModelHint(text), reason: 'infra-only'};
  }

  return {matched: false, modelQuery: null, reason: 'none'};
}

function extractModelHint(text: string): string | null {
  const m = text.match(
    /(?:модель|model|для|под)\s+([A-Za-zА-Яа-я0-9][\w.\- ]{1,40}?)(?:\s|$|[?,.!])/i,
  );
  if (m?.[1]) return m[1].trim();
  const profile = findInferenceModel(text);
  return profile?.displayName ?? null;
}

/** System addendum appended only on gated inference turns. */
export const INFERENCE_SYSTEM_ADDENDUM = `
## Self-host inference (активен этот ход)
Пользователь спрашивает про инфраструктуру для запуска модели. Сначала вызови recommend_inference_infra.
Правила:
- VRAM, число GPU, квантизацию бери ТОЛЬКО из configs[] / primaryRecommendation / model.parameterCountB. Не выдумывай и не «округляй» до 8×GPU.
- Не подменяй модель соседней (Coder-Next ≠ Coder-480B, Kimi K3 ≠ K2.6). Если tool вернул другой id — скажи об этом явно или переспроси.
- Структура markdown: заголовки ### (Self-host / Почему так / Цены узлов / Альтернативы / Hosted API / Оговорки). Короткие абзацы, не один «простынёй».
- ### Почему так — 2–4 коротких предложения (VRAM/квант/GPU + провайдер). Таблица configs[] под ### Цены узлов с колонками Использование VRAM и Запас памяти (из vramBreakdown). Альтернативы — буллеты, не повтор длинного why целиком.
- В конце ответа добавь markdown-ссылку «Открыть в калькуляторе» из answerHint (deep link на /calculator/self-host с model/quant) — тот же recommender, можно крутить batch/context.
- НЕ вызывай get_quote с другим gpuCount/gpuModel. Цены уже в recommend_inference_infra.
- HostedAlternative — только та же modelId; всегда разделяй input/output (поля inputMonth/outputMonth). Не подмешивай 480B вместо Coder-Next. TCO: input×Pin + output×Pout, не «аренда ÷ только input».
- Контекст модели бери из model.contextDefault (у Coder-Next 262144), не путай с единицей тарифа «1M токенов».
- Если notFound=true или configs пустой — НЕ выдумывай VRAM/GPU. Предложи hosted API / уточнить название. Selectel FMC = те же GPU-ресурсы, не отдельный token SaaS.
`.trim();
