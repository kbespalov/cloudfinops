/**
 * Optional LLM assist for ambiguous block-disk vs object-storage intent.
 *
 * Challenge / design constraints:
 * - Regex already fixes the hard bug (volumeEstimates + classifyStorageVolumeIntent).
 * - An extra LLM hop adds latency, flakiness, and a second source of truth.
 * - So we ONLY call the model when regex is ambiguous (both / none+storage-ish).
 *
 * CHAT_STORAGE_INTENT_LLM=
 *   on      — call on ambiguous turns; override planning cards/addendum if confidence≥threshold (default)
 *   shadow  — call on ambiguous turns, log disagreement, do not override
 *   off     — never call
 */

import {chatCompletion, hasApiKey, type ChatMessage} from '@/lib/chat/gigachat';
import {chatLog} from '@/lib/chat/log';
import {
  classifyStorageVolumeIntent,
  type StorageVolumeIntent,
} from '@/lib/chat/search';

export type StorageIntentLlmMode = 'off' | 'shadow' | 'on';

export type StorageIntentResolution = {
  storage: StorageVolumeIntent;
  volumeGiB: number | null;
  confidence: number;
  source: 'regex' | 'llm' | 'llm-fallback-regex';
  regexStorage: StorageVolumeIntent;
  llmStorage: StorageVolumeIntent | null;
  reason: string | null;
  /** True when an LLM round-trip was attempted. */
  llmCalled: boolean;
};

const STORAGE_ISH =
  /(?:\bssd\b|\bnvme\b|\bhdd\b|блочн|диск|хранени|object\s*storage|\bs3\b|объектн|бакет|hotbox|nbs-|тиб|\bтб\b|\btb\b|\btib\b)/i;

const CLASSIFIER_SYSTEM = `Ты классификатор storage-intent для Cloud FinOps (короткий JSON, без markdown).
Различай:
- block = блочный/сетевой диск ВМ (SSD/NVMe/HDD, NBS, network disk)
- object = Object Storage / S3 / бакет / Hotbox / Cold / Ice
- both = пользователь хочет сравнить или посчитать ОБА продукта
- none = вопрос не про объём хранения

Правила:
- «не S3 / не объектное, а блочный» → block
- «только S3, блочный не считай» → object
- «сравни блочный и S3» → both
- Follow-up после S3/блока: смотри ТЕКУЩИЙ вопрос. «а теперь блочный SSD» → block; «то же для S3» → object. История — контекст объёма, не смешивай продукты в both без явного сравнения.
- Ice Lake (CPU) ≠ S3 Ice
- volumeGiB: двоичные GiB (1 ТБ/ТиБ = 1024). Если объёма нет → null.

Ответ СТРОГО один JSON-объект:
{"storage":"block|object|both|none","volumeGiB":number|null,"confidence":0..1,"reason":"≤12 слов"}`;

export function storageIntentLlmModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StorageIntentLlmMode {
  const raw = (env.CHAT_STORAGE_INTENT_LLM || 'on').trim().toLowerCase();
  if (raw === 'shadow' || raw === 'on' || raw === 'off') return raw;
  return 'on';
}

/** When regex is already decisive, skip the LLM hop. */
export function needsLlmStorageIntent(
  regexStorage: StorageVolumeIntent,
  text: string,
): boolean {
  if (regexStorage === 'both') return true;
  if (regexStorage === 'none' && STORAGE_ISH.test(text)) return true;
  return false;
}

export function parseStorageIntentLlmJson(raw: string | null | undefined): {
  storage: StorageVolumeIntent;
  volumeGiB: number | null;
  confidence: number;
  reason: string | null;
} | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const storage = obj.storage;
    if (storage !== 'block' && storage !== 'object' && storage !== 'both' && storage !== 'none') {
      return null;
    }
    const confidenceRaw = Number(obj.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0;
    let volumeGiB: number | null = null;
    if (typeof obj.volumeGiB === 'number' && Number.isFinite(obj.volumeGiB) && obj.volumeGiB > 0) {
      volumeGiB = obj.volumeGiB;
    }
    const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 80) : null;
    return {storage, volumeGiB, confidence, reason};
  } catch {
    return null;
  }
}

export function formatStorageIntentAddendum(resolution: StorageIntentResolution): string {
  if (resolution.storage === 'none') return '';
  const vol =
    resolution.volumeGiB != null && resolution.volumeGiB > 0
      ? `; volumeGiB=${Math.round(resolution.volumeGiB)}`
      : '';
  const lines = [
    '## STORAGE INTENT (machine)',
    `storage=${resolution.storage}${vol}; source=${resolution.source}; confidence=${resolution.confidence.toFixed(2)}`,
  ];
  if (resolution.storage === 'block') {
    lines.push(
      'Блочный диск ВМ. search_prices query вроде «блочный SSD диск» + volumeGiB. ЗАПРЕЩЕНО category=storage и storageClass (это S3).',
    );
  } else if (resolution.storage === 'object') {
    lines.push(
      'Object Storage / S3. search_prices category=storage + storageClass (+ volumeGiB). Не подменяй блочным SSD/NVMe.',
    );
  } else if (resolution.storage === 'both') {
    lines.push(
      'Нужны ОБА продукта. Два search_prices (block и object) или compose; не одна колонка и не один storageClass.',
    );
  }
  return lines.join('\n');
}

type ClassifyDeps = {
  complete?: typeof chatCompletion;
  hasKey?: () => boolean;
  mode?: StorageIntentLlmMode;
  confidenceThreshold?: number;
  signal?: AbortSignal;
};

/**
 * Resolve storage intent: regex on the *current* turn only; history is LLM context.
 * Merging history into regex made S3→«теперь блочный SSD» sticky `both`.
 */
export async function resolveStorageIntent(
  userText: string,
  opts?: {historyText?: string} & ClassifyDeps,
): Promise<StorageIntentResolution> {
  const regexStorage = classifyStorageVolumeIntent(userText);
  const mode = opts?.mode ?? storageIntentLlmModeFromEnv();
  const threshold = opts?.confidenceThreshold ?? 0.7;
  const hasKey = opts?.hasKey ?? hasApiKey;
  const complete = opts?.complete ?? chatCompletion;

  const base: StorageIntentResolution = {
    storage: regexStorage,
    volumeGiB: null,
    confidence: regexStorage === 'none' ? 0.4 : 0.9,
    source: 'regex',
    regexStorage,
    llmStorage: null,
    reason: null,
    llmCalled: false,
  };

  if (mode === 'off' || !needsLlmStorageIntent(regexStorage, userText) || !hasKey()) {
    return base;
  }

  let llmParsed: ReturnType<typeof parseStorageIntentLlmJson> = null;
  try {
    const messages: ChatMessage[] = [
      {role: 'system', content: CLASSIFIER_SYSTEM},
      {
        role: 'user',
        content: [
          opts?.historyText ? `История (user):\n${opts.historyText.slice(-800)}` : '',
          `Текущий вопрос:\n${userText.slice(0, 1200)}`,
          `Regex hint: ${regexStorage}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ];
    const msg = await complete(messages, undefined, {
      signal: opts?.signal,
      maxTokens: 80,
    });
    base.llmCalled = true;
    llmParsed = parseStorageIntentLlmJson(msg.content);
  } catch (err) {
    base.llmCalled = true;
    chatLog('chat.storage_intent_llm_error', {
      regexStorage,
      error: err instanceof Error ? err.message.slice(0, 180) : 'unknown',
    });
    return {...base, source: 'llm-fallback-regex'};
  }

  if (!llmParsed) {
    return {...base, source: 'llm-fallback-regex', reason: 'parse_failed'};
  }

  base.llmStorage = llmParsed.storage;
  base.volumeGiB = llmParsed.volumeGiB;
  base.reason = llmParsed.reason;
  base.confidence = llmParsed.confidence;

  const disagree = llmParsed.storage !== regexStorage;
  chatLog('chat.storage_intent_llm', {
    mode,
    regexStorage,
    llmStorage: llmParsed.storage,
    confidence: llmParsed.confidence,
    disagree,
    volumeGiB: llmParsed.volumeGiB,
    reason: llmParsed.reason,
  });

  if (mode === 'shadow') {
    return base; // keep regex storage for planning
  }

  // mode === 'on'
  if (llmParsed.confidence >= threshold) {
    return {
      ...base,
      storage: llmParsed.storage,
      source: 'llm',
    };
  }
  return {...base, source: 'llm-fallback-regex', reason: 'low_confidence'};
}
