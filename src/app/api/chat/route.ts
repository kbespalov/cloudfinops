import {NextResponse} from 'next/server';
import {
  chatCompletion,
  chatCompletionStream,
  hasApiKey,
  type ChatMessage,
} from '@/lib/chat/gigachat';
import {
  CHAT_LIMITS,
  chatRateLimiter,
  estimateMessagesTokens,
  reserveTokensForRequest,
} from '@/lib/chat/limits';
import {chatLog, clientIp} from '@/lib/chat/log';
import {SYSTEM_PROMPT} from '@/lib/chat/system-prompt';
import {tryRunFastPath} from '@/lib/chat/fast-path';
import {
  INFERENCE_SYSTEM_ADDENDUM,
  matchInferenceIntent,
} from '@/lib/chat/inference-intent';
import {sanitizeUserFacingAnswer} from '@/lib/chat/tool-call-recovery';
import {runToolLoop} from '@/lib/chat/tool-loop';
import {CHAT_TOOLS, CHAT_TOOLS_WITH_INFERENCE} from '@/lib/chat/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClientMessage = {role: 'user' | 'assistant'; content: string};

type SanitizeResult =
  | {ok: true; messages: ChatMessage[]; totalChars: number; truncated: boolean}
  | {ok: false; error: string};

function sanitize(messages: unknown): SanitizeResult {
  if (!Array.isArray(messages)) return {ok: false, error: 'Пустой или некорректный список сообщений.'};

  const trimmed = messages.slice(-CHAT_LIMITS.maxMessages);
  const truncated = trimmed.length < messages.length;
  const out: ChatMessage[] = [];
  let totalChars = 0;

  for (const m of trimmed) {
    if (!m || typeof m !== 'object') continue;
    const {role, content} = m as ClientMessage;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string' || !content.trim()) continue;
    const sliced = content.slice(0, CHAT_LIMITS.maxContentLen);
    totalChars += sliced.length;
    out.push({role, content: sliced});
  }

  if (!out.length || out[out.length - 1].role !== 'user') {
    return {ok: false, error: 'Пустой или некорректный список сообщений.'};
  }
  if (totalChars > CHAT_LIMITS.maxTotalChars) {
    return {
      ok: false,
      error: `Слишком длинный диалог (лимит ${CHAT_LIMITS.maxTotalChars} символов). Начните новый чат или сократите историю.`,
    };
  }
  return {ok: true, messages: out, totalChars, truncated};
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent')?.slice(0, 160) ?? '';
  const started = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (!hasApiKey()) {
    chatLog('chat.unavailable', {requestId, ip, reason: 'missing_api_key'});
    return NextResponse.json(
      {error: 'AI-ассистент временно недоступен: не настроен ключ API на сервере.'},
      {status: 503},
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    chatLog('chat.bad_request', {requestId, ip, reason: 'invalid_json'});
    return NextResponse.json({error: 'Некорректный запрос.'}, {status: 400});
  }

  const sanitized = sanitize((body as {messages?: unknown})?.messages);
  if (!sanitized.ok) {
    chatLog('chat.bad_request', {requestId, ip, reason: 'sanitize', error: sanitized.error});
    return NextResponse.json({error: sanitized.error}, {status: 400});
  }

  const history = sanitized.messages;
  const userText = lastUserText(history);
  const inferenceIntent = matchInferenceIntent(userText);
  const systemContent = inferenceIntent.matched
    ? `${SYSTEM_PROMPT}\n\n${INFERENCE_SYSTEM_ADDENDUM}`
    : SYSTEM_PROMPT;
  const planningTools = inferenceIntent.matched ? CHAT_TOOLS_WITH_INFERENCE : CHAT_TOOLS;
  const messages: ChatMessage[] = [{role: 'system', content: systemContent}, ...history];
  const inputTokens = estimateMessagesTokens(messages);
  const reservedTokens = reserveTokensForRequest(inputTokens);
  const budget = chatRateLimiter.tryAcquire(ip, reservedTokens);

  if (!budget.ok) {
    chatLog('chat.rate_limited', {
      requestId,
      ip,
      reason: budget.reason,
      retryAfterSec: budget.retryAfterSec,
      reservedTokens,
      ...chatRateLimiter.snapshot(),
    });
    return NextResponse.json(
      {error: budget.detail},
      {
        status: 429,
        headers: {
          'Retry-After': String(budget.retryAfterSec),
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  chatLog('chat.request', {
    requestId,
    ip,
    ua,
    action: 'ask',
    messageCount: history.length,
    totalChars: sanitized.totalChars,
    userChars: userText.length,
    userPreview: userText.slice(0, 240),
    inputTokensEst: inputTokens,
    reservedTokens,
    historyTruncated: sanitized.truncated,
    inferenceIntent: inferenceIntent.matched,
    inferenceReason: inferenceIntent.reason,
    ...chatRateLimiter.snapshot(),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = new AbortController();
      req.signal.addEventListener('abort', () => abort.abort());

      let toolRounds = 0;
      let toolCallsTotal = 0;
      let leaksRecovered = 0;
      let leaksRetried = 0;
      let leaksDropped = 0;
      let outputChars = 0;
      let fastPathId: string | null = null;
      let status: 'ok' | 'empty' | 'error' | 'aborted' = 'ok';

      try {
        const onToolEvent = (
          event:
            | {
                type: 'tool_call';
                name: string;
                arguments: string;
                recoveredFromLeak: boolean;
              }
            | {type: 'tool_leak'; action: 'recovered' | 'retry_required' | 'dropped'; preview: string},
        ) => {
          if (event.type === 'tool_call') {
            chatLog('chat.tool', {
              requestId,
              ip,
              action: 'tool_call',
              tool: event.name,
              argsPreview: event.arguments.slice(0, 200),
              recoveredFromLeak: event.recoveredFromLeak,
            });
            return;
          }
          chatLog('chat.tool_leak', {
            requestId,
            ip,
            action: event.action,
            preview: event.preview,
          });
        };

        // Homepage chips / first-turn twins: skip planning LLM, run tools, one short final.
        const fast = await tryRunFastPath({
          messages,
          signal: abort.signal,
          onEvent: onToolEvent,
        });

        const loop =
          fast ??
          (await runToolLoop({
            messages,
            tools: planningTools,
            // First user turn: prefer 1–2 tool rounds, not long retry chains.
            maxRounds:
              history.length <= 1
                ? Math.min(CHAT_LIMITS.maxToolRounds, 3)
                : CHAT_LIMITS.maxToolRounds,
            signal: abort.signal,
            onEvent: onToolEvent,
          }));

        if (fast) fastPathId = fast.fastPathId;
        toolRounds = loop.toolRounds;
        toolCallsTotal = loop.toolCallsTotal;
        leaksRecovered = loop.leaksRecovered;
        leaksRetried = loop.leaksRetried;
        leaksDropped = loop.leaksDropped;
        let finalText = loop.finalText;

        if (!finalText) {
          // Prefer streaming for the post-tools answer; buffer then sanitize so
          // tool names cannot leak mid-chunk (search_prices / get_quote).
          // Fall back to non-stream if the SSE body has no content deltas.
          const alreadyNudged = messages.some(
            (m) =>
              m.role === 'user' &&
              typeof m.content === 'string' &&
              m.content.includes('Данные инструментов уже в истории'),
          );
          if (!alreadyNudged && loop.toolCallsTotal > 0) {
            messages.push({
              role: 'user',
              content:
                'Данные инструментов уже в истории. Дай пользователю полный ответ на русском: markdown-таблица и вывод. Без вызова инструментов и без пустого ответа.',
            });
          }
          let streamed = '';
          try {
            for await (const delta of chatCompletionStream(messages, abort.signal)) {
              streamed += delta;
            }
          } catch (streamErr) {
            chatLog('chat.stream_fallback', {
              requestId,
              ip,
              error: streamErr instanceof Error ? streamErr.message.slice(0, 200) : String(streamErr),
            });
          }

          if (streamed) {
            finalText = streamed;
          } else {
            const fallback = await chatCompletion(messages, undefined, abort.signal);
            finalText = (fallback.content ?? '').trim() || null;
          }
        }

        if (finalText) {
          finalText = sanitizeUserFacingAnswer(finalText);
          outputChars += finalText.length;
          controller.enqueue(encoder.encode(finalText));
        } else if (outputChars === 0) {
          status = 'empty';
          controller.enqueue(
            encoder.encode('Не удалось получить ответ. Попробуйте переформулировать вопрос.'),
          );
        }
      } catch (err) {
        if (abort.signal.aborted) {
          status = 'aborted';
        } else {
          status = 'error';
          const detail = err instanceof Error ? err.message : 'Неизвестная ошибка.';
          chatLog('chat.error', {
            requestId,
            ip,
            error: detail.slice(0, 300),
            durationMs: Date.now() - started,
            toolRounds,
            toolCallsTotal,
          });
          controller.enqueue(encoder.encode(`\n\n⚠️ Ошибка обращения к модели: ${detail}`));
        }
      } finally {
        chatLog('chat.done', {
          requestId,
          ip,
          status,
          durationMs: Date.now() - started,
          toolRounds,
          toolCallsTotal,
          leaksRecovered,
          leaksRetried,
          leaksDropped,
          fastPathId,
          outputChars,
          outputTokensEst: outputChars ? Math.ceil(outputChars / 2) : 0,
          ...chatRateLimiter.snapshot(),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': requestId,
    },
  });
}
