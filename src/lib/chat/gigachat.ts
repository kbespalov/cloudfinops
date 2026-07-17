/**
 * Thin fetch client for the Cloud.ru Foundation Models API (OpenAI-compatible).
 * Server-only: the API key is read from process.env and must never reach the client.
 */

const BASE_URL = process.env.CLOUDRU_FM_BASE_URL || 'https://foundation-models.api.cloud.ru/v1';
const MODEL = process.env.CLOUDRU_FM_MODEL || 'openai/gpt-oss-120b';

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

const COMMON_PARAMS = {
  model: MODEL,
  max_tokens: 2500,
  temperature: 0.5,
  presence_penalty: 0,
  top_p: 0.95,
};

/** Non-streaming completion — used inside the tool-calling loop. */
export async function chatCompletion(
  messages: ChatMessage[],
  tools?: readonly unknown[],
  signal?: AbortSignal,
): Promise<CompletionChoiceMessage> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      ...COMMON_PARAMS,
      messages,
      ...(tools && tools.length ? {tools, tool_choice: 'auto'} : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloud.ru API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as CompletionResponse;
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Cloud.ru API returned no choices.');
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({...COMMON_PARAMS, messages, stream: true}),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloud.ru API ${res.status}: ${text.slice(0, 500)}`);
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
