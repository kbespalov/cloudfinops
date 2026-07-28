/**
 * Thin fetch client for OpenAI-compatible chat APIs (Yandex AI Studio / Cloud.ru FM).
 * Server-only: the API key is read from process.env and must never reach the client.
 *
 * Default production path: Yandex AI (`qwen3.6-35b-a3b`). Override via CLOUDRU_FM_*.
 */

const DEFAULT_BASE_URL = 'https://ai.api.cloud.yandex.net/v1';
const DEFAULT_MODEL = 'gpt://b1g8e6sg32uhno3n7jih/qwen3.6-35b-a3b/latest';
const DEFAULT_FOLDER = 'b1g8e6sg32uhno3n7jih';

const BASE_URL = process.env.CLOUDRU_FM_BASE_URL || DEFAULT_BASE_URL;

/** Resolved at call time so eval can switch models via CLOUDRU_FM_MODEL / withChatModel. */
export function getChatModel(): string {
  return process.env.CLOUDRU_FM_MODEL || DEFAULT_MODEL;
}

function folderId(): string | undefined {
  return (
    process.env.CLOUDRU_FM_FOLDER ||
    process.env.YANDEX_CLOUD_FOLDER ||
    (isYandexEndpoint() ? DEFAULT_FOLDER : undefined)
  );
}

function isYandexEndpoint(): boolean {
  return BASE_URL.includes('api.cloud.yandex.net');
}

/** Qwen-style thinking models burn tool-loop budget unless thinking is off. */
function wantsThinkingOff(model = getChatModel()): boolean {
  const m = model.toLowerCase();
  return m.includes('qwen') || isYandexEndpoint();
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey()}`,
  };
  const folder = folderId();
  if (folder) {
    headers['OpenAI-Project'] = folder;
    headers['x-folder-id'] = folder;
  }
  return headers;
}

function providerErrorLabel(): string {
  return isYandexEndpoint() ? 'Yandex AI API' : 'Cloud.ru API';
}

export async function withChatModel<T>(model: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CLOUDRU_FM_MODEL;
  process.env.CLOUDRU_FM_MODEL = model;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.CLOUDRU_FM_MODEL;
    else process.env.CLOUDRU_FM_MODEL = prev;
  }
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {name: string; arguments: string};
  }[];
};

export type CompletionChoiceMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {name: string; arguments: string};
  }[];
};

type CompletionResponse = {
  choices: {message: CompletionChoiceMessage; finish_reason: string}[];
};

export function hasApiKey(): boolean {
  return Boolean(process.env.CLOUDRU_FM_API_KEY);
}

function apiKey(): string {
  const key = process.env.CLOUDRU_FM_API_KEY;
  if (!key) throw new Error('CLOUDRU_FM_API_KEY is not configured on the server.');
  return key;
}

function commonParams() {
  return {
    model: getChatModel(),
  } as const;
}

/** Final answer budget (stream / fallback). Keep in sync with CHAT_LIMITS.maxOutputTokens. */
const FINAL_MAX_TOKENS = 1200;
/**
 * Tool-loop budget: native tool_calls are tiny. A high cap lets gpt-oss burn
 * seconds on English CoT in `content` before emitting tool_calls.
 */
const TOOL_LOOP_MAX_TOKENS = 384;
/**
 * Gemini (Cloud.ru) attaches a large `extra_content.google.thought_signature`
 * on the first tool call — 384 tokens often truncates a 5-call parallel batch.
 */
const TOOL_LOOP_MAX_TOKENS_GEMINI = 2500;

function toolLoopMaxTokens(): number {
  const model = getChatModel().toLowerCase();
  if (model.includes('gemini')) return TOOL_LOOP_MAX_TOKENS_GEMINI;
  // Qwen with thinking off is small; keep headroom if thinking leaks back on.
  if (model.includes('qwen')) return 1024;
  return TOOL_LOOP_MAX_TOKENS;
}

function bodyExtras(): Record<string, unknown> {
  if (!wantsThinkingOff()) return {};
  return {chat_template_kwargs: {enable_thinking: false}};
}

function isAnthropicModel(model = getChatModel()): boolean {
  const m = model.toLowerCase();
  return m.includes('anthropic/') || m.includes('claude');
}

/**
 * Sampling knobs. Anthropic via Cloud.ru FM rejects temperature+top_p together
 * (`invalid_request_error`) — send only temperature for those models.
 */
function samplingParams(withTools: boolean): Record<string, number> {
  const temperature = withTools ? 0.1 : 0.5;
  if (isAnthropicModel()) {
    return {temperature};
  }
  return {
    presence_penalty: 0,
    top_p: 0.95,
    temperature,
  };
}

export type ToolChoice = 'auto' | 'required' | 'none';

export type ChatCompletionOptions = {
  signal?: AbortSignal;
  /** OpenAI-compatible tool_choice. Default `auto` when tools are present. */
  toolChoice?: ToolChoice;
  /**
   * Override max_tokens. Use for LLM-only finals inside the tool loop — the
   * default tool-loop budget (384) truncates prose mid-sentence.
   */
  maxTokens?: number;
};

/** Non-streaming completion — used inside the tool-calling loop. */
export async function chatCompletion(
  messages: ChatMessage[],
  tools?: readonly unknown[],
  signalOrOptions?: AbortSignal | ChatCompletionOptions,
): Promise<CompletionChoiceMessage> {
  const options: ChatCompletionOptions =
    signalOrOptions instanceof AbortSignal || signalOrOptions === undefined
      ? {signal: signalOrOptions}
      : signalOrOptions;
  const withTools = Boolean(tools && tools.length);
  const toolChoice = options.toolChoice ?? (withTools ? 'auto' : undefined);
  const maxTokens =
    options.maxTokens ?? (withTools ? toolLoopMaxTokens() : FINAL_MAX_TOKENS);
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify({
      ...commonParams(),
      max_tokens: maxTokens,
      ...samplingParams(withTools),
      messages,
      ...(withTools ? {tools, tool_choice: toolChoice ?? 'auto'} : {}),
      ...bodyExtras(),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${providerErrorLabel()} ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as CompletionResponse;
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error(`${providerErrorLabel()} returned no choices.`);
  return message;
}

/**
 * Streaming completion — used for the final answer. Yields text deltas as they
 * arrive (SSE `data:` lines, OpenAI-compatible chunk format).
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify({
      ...commonParams(),
      max_tokens: FINAL_MAX_TOKENS,
      ...samplingParams(false),
      messages,
      stream: true,
      ...bodyExtras(),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`${providerErrorLabel()} ${res.status}: ${text.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: {delta?: {content?: string}}[];
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Ignore keep-alive / partial lines.
      }
    }
  }
}
