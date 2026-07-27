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
import {buildSystemPrompt} from '@/lib/chat/system-prompt';
import {
  extractAllToolPayloads,
  extractLastToolPayloads,
  isChatLlmOnlyFromEnv,
  lastUserQuestion,
  looksMultiComponentStack,
  messagesForShortFinal,
  messagesForStackFinal,
  tryFormatAgentToolAnswer,
  tryRunFastPath,
} from '@/lib/chat/fast-path';
import {
  INFERENCE_SYSTEM_ADDENDUM,
  matchInferenceIntent,
} from '@/lib/chat/inference-intent';
import {
  LAKEHOUSE_SYSTEM_ADDENDUM,
  matchLakehouseIntentWithHistory,
} from '@/lib/chat/lakehouse-intent';
import {
  CHAT_STATUS_COMPOSING,
  CHAT_STATUS_THINKING,
  encodeChatStreamEvent,
  statusLabelForTool,
  type ChatStreamEvent,
} from '@/lib/chat/stream-protocol';
import {
  createAnswerStreamSanitizer,
  sanitizeUserFacingAnswer,
} from '@/lib/chat/tool-call-recovery';
import {runToolLoop} from '@/lib/chat/tool-loop';
import {
  CHAT_TOOLS,
  CHAT_TOOLS_ALL,
  CHAT_TOOLS_WITH_INFERENCE,
  CHAT_TOOLS_WITH_LAKEHOUSE,
} from '@/lib/chat/tools';

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

  const surface =
    (body as {surface?: unknown})?.surface === 'calculator' ? 'calculator' : 'chat';

  const fastPathChipIdRaw = (body as {fastPathId?: unknown})?.fastPathId;
  const fastPathChipId =
    typeof fastPathChipIdRaw === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(fastPathChipIdRaw)
      ? fastPathChipIdRaw
      : null;

  const history = sanitized.messages;
  const userText = lastUserText(history);
  const recentUserText = history
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .slice(-4)
    .map((m) => m.content as string)
    .join('\n');
  // Chat + CHAT_FAST_PATH_PROBABILITY=0 → pure LLM+tools: no FastPath, no regex
  // intent addendums / tool gates (inference / lakehouse). Calculator keeps hints.
  const llmOnly = surface === 'chat' && isChatLlmOnlyFromEnv();
  const inferenceIntent = llmOnly
    ? {matched: false, reason: 'none' as const}
    : matchInferenceIntent(userText);
  // Follow-ups («150 TiB») after a lakehouse turn must keep get_lakehouse_quote
  // so the calculator sidebar can re-quote — not only the chat markdown.
  const lakehouseIntent = llmOnly
    ? {matched: false, reason: 'none' as const}
    : matchLakehouseIntentWithHistory(userText, recentUserText);
  // Inference wins if both match (rare); otherwise lakehouse persona + tool.
  const calculatorAddendum =
    surface === 'calculator'
      ? '\n\nКонтекст: калькулятор «AI конфигурация» (корзина справа). ПОШАГОВО: «начнём с CPU/RAM/диска/IP/CDN/S3» или один компонент → только этот ресурс (compare_unit_price для vcpu|ram|ssd; search_prices для IP/CDN/S3/HDD/K8s/AI). НЕ get_quote и НЕ додумывай остальную ВМ «чтобы заполнить корзину». Корзину через get_quote обновляй только когда явно собрали конфигурацию («N vCPU / M GiB», «собери ВМ», gpuModel; RAM по умолчанию 4×vCPU; системный диск по умолчанию 100 GiB SSD; публичный IP — ТОЛЬКО если просили, иначе publicIpCount=0 / не передавай). Lakehouse → get_lakehouse_quote. Follow-up «докинь CDN [N ТБ]» → search_prices category=cdn, volumeGiB (1 ТБ→1024), патч корзины; НЕ S3/network ingress, НЕ пересчёт всей ВМ. Без опросника.'
      : '';
  const planningPrompt = buildSystemPrompt(userText, {historyText: recentUserText});
  const systemContent =
    (inferenceIntent.matched
      ? `${planningPrompt}\n\n${INFERENCE_SYSTEM_ADDENDUM}`
      : lakehouseIntent.matched
        ? `${planningPrompt}\n\n${LAKEHOUSE_SYSTEM_ADDENDUM}`
        : planningPrompt) + calculatorAddendum;
  const planningTools = llmOnly
    ? CHAT_TOOLS_ALL
    : inferenceIntent.matched
      ? CHAT_TOOLS_WITH_INFERENCE
      : lakehouseIntent.matched
        ? CHAT_TOOLS_WITH_LAKEHOUSE
        : CHAT_TOOLS;
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
      let composingAnnounced = false;

      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeChatStreamEvent(event)));
      };
      const sendDelta = (text: string) => {
        if (!text) return;
        if (!composingAnnounced) {
          composingAnnounced = true;
          send({type: 'status', text: CHAT_STATUS_COMPOSING});
        }
        outputChars += text.length;
        send({type: 'delta', text});
      };

      try {
        // First byte ASAP — UI shows progress while planning LLM / tools run.
        send({type: 'status', text: CHAT_STATUS_THINKING});

        const onToolEvent = (
          event:
            | {
                type: 'tool_call';
                name: string;
                arguments: string;
                recoveredFromLeak: boolean;
              }
            | {type: 'tool_result'; name: string; content: string}
            | {type: 'tool_leak'; action: 'recovered' | 'retry_required' | 'dropped'; preview: string},
        ) => {
          if (event.type === 'tool_call') {
            send({type: 'status', text: statusLabelForTool(event.name)});
            if (
              event.name === 'get_quote' ||
              event.name === 'get_lakehouse_quote' ||
              event.name === 'search_prices' ||
              event.name === 'compose_solution'
            ) {
              try {
                const args = JSON.parse(event.arguments) as unknown;
                if (args && typeof args === 'object' && !Array.isArray(args)) {
                  const record = args as Record<string, unknown>;
                  if (event.name === 'search_prices') {
                    // Fallback when the model still catalogs GPU via search_prices.
                    const gpuModel =
                      typeof record.gpuModel === 'string' ? record.gpuModel.trim() : '';
                    if (gpuModel) {
                      send({
                        type: 'sidebar_config',
                        tool: 'get_quote',
                        args: {
                          gpuModel,
                          gpuCount:
                            typeof record.gpuCount === 'number' ? record.gpuCount : 1,
                          period: 'month',
                        },
                      });
                    } else {
                      // CDN volume → merge into AI-calculator basket (category=cdn).
                      const category =
                        typeof record.category === 'string'
                          ? record.category.trim().toLowerCase()
                          : '';
                      const query =
                        typeof record.query === 'string' ? record.query : '';
                      if (category === 'cdn' || /\bcdn\b/i.test(query)) {
                        send({
                          type: 'sidebar_config',
                          tool: 'search_prices',
                          args: record,
                        });
                      }
                    }
                  } else {
                    send({
                      type: 'sidebar_config',
                      tool: event.name,
                      args: record,
                    });
                  }
                }
              } catch {
                // Malformed tool args — sidebar stays on the previous quote.
              }
            }
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
          if (event.type === 'tool_result') {
            // Resolved request / requirementSpec — sidebar matches chat totals.
            if (
              event.name === 'get_quote' ||
              event.name === 'get_lakehouse_quote' ||
              event.name === 'compose_solution'
            ) {
              try {
                const parsed = JSON.parse(event.content) as unknown;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  const record = parsed as Record<string, unknown>;
                  if (!record.error) {
                    if (event.name === 'get_lakehouse_quote' && record.request) {
                      send({
                        type: 'sidebar_config',
                        tool: 'get_lakehouse_quote',
                        args: record.request as Record<string, unknown>,
                      });
                    } else if (event.name === 'get_quote' && record.request) {
                      send({
                        type: 'sidebar_config',
                        tool: 'get_quote',
                        args: record.request as Record<string, unknown>,
                      });
                    } else if (
                      event.name === 'compose_solution' &&
                      record.requirementSpec &&
                      typeof record.requirementSpec === 'object'
                    ) {
                      const spec = record.requirementSpec as Record<string, unknown>;
                      const solutionType =
                        typeof spec.solutionType === 'string' ? spec.solutionType : '';
                      const quantities =
                        typeof spec.quantities === 'object' && spec.quantities
                          ? (spec.quantities as Record<string, unknown>)
                          : {};
                      const extras =
                        typeof spec.extras === 'object' && spec.extras
                          ? (spec.extras as Record<string, unknown>)
                          : {};
                      const constraints =
                        typeof spec.constraints === 'object' && spec.constraints
                          ? (spec.constraints as Record<string, unknown>)
                          : {};
                      if (solutionType === 'lakehouse') {
                        send({
                          type: 'sidebar_config',
                          tool: 'compose_solution',
                          args: {
                            solutionType: 'lakehouse',
                            requirements: {
                              workload: extras.workload,
                              storageGiB: quantities.storageGiB,
                              objectStorageGiB: quantities.storageGiB,
                              hotPercent: extras.hotPercent,
                              k8sTier: constraints.k8sTier,
                            },
                          },
                        });
                      } else if (
                        solutionType === 'virtual_machine' ||
                        solutionType === 'web_application'
                      ) {
                        send({
                          type: 'sidebar_config',
                          tool: 'compose_solution',
                          args: {
                            solutionType,
                            requirements: {
                              vcpu: quantities.workerVcpu ?? quantities.vcpu,
                              ramGiB: quantities.workerRamGiB ?? quantities.ramGiB,
                              diskGiB: quantities.diskGiB ?? quantities.workerDiskGiB,
                              publicIpCount: quantities.publicIpCount,
                              cdnEgressGiB: quantities.cdnEgressGiB,
                              objectStorageGiB:
                                quantities.storageGiB ?? quantities.objectStorageGiB,
                              egressGiB: quantities.egressGiB,
                              gpuModel: quantities.gpuModel ?? extras.gpuModel,
                              gpuCount: quantities.gpuCount,
                            },
                          },
                        });
                      }
                    }
                  }
                }
              } catch {
                // Ignore malformed tool results for sidebar.
              }
            }
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
          surface,
          fastPathId: fastPathChipId,
        });

        // Fast-path returns a copied history with tool turns — adopt it when present.
        let workingMessages = fast?.messages ?? messages;

        const userQuestion = lastUserQuestion(workingMessages);
        const multiStack = looksMultiComponentStack(userQuestion);
        const loop =
          fast ??
          (await runToolLoop({
            messages: workingMessages,
            tools: planningTools,
            surface,
            // LLM-only / stacks / multi-turn: full headroom. Otherwise 1–2 rounds.
            maxRounds:
              llmOnly || multiStack || history.length > 1
                ? CHAT_LIMITS.maxToolRounds
                : Math.min(CHAT_LIMITS.maxToolRounds, 2),
            signal: abort.signal,
            onEvent: onToolEvent,
          }));

        if (fast) fastPathId = fast.fastPathId;
        // Tool-loop mutates its messages array in place; keep a single working reference.
        if (!fast) workingMessages = messages;
        toolRounds = loop.toolRounds;
        toolCallsTotal = loop.toolCallsTotal;
        leaksRecovered = loop.leaksRecovered;
        leaksRetried = loop.leaksRetried;
        leaksDropped = loop.leaksDropped;
        let finalText = loop.finalText;

        if (!finalText && loop.toolCallsTotal > 0 && !llmOnly) {
          // Same short-circuit as tool-loop (covers stream path when loop left final null).
          // Multi-tool compose only as last resort — stacks should get an LLM answer first.
          // LLM-only mode skips this so the final completion always writes the answer.
          const formatted = tryFormatAgentToolAnswer({
            userText: userQuestion,
            toolPayloads: multiStack
              ? extractAllToolPayloads(workingMessages)
              : extractLastToolPayloads(workingMessages),
            allowStackCompose: multiStack,
          });
          if (formatted) finalText = formatted;
        }

        if (!finalText) {
          // Prefer live token flush for the post-tools answer. Hold back a short
          // tail while sanitizing so tool names cannot flash mid-chunk.
          // Multi-SKU stacks: compact digest (messagesForStackFinal), not raw history.
          // Fall back to non-stream if the SSE body has no content deltas.
          const stackPayloads =
            multiStack && loop.toolCallsTotal > 0
              ? extractAllToolPayloads(workingMessages)
              : [];
          const stackFinal =
            stackPayloads.length >= 2
              ? messagesForStackFinal({userText: userQuestion, toolPayloads: stackPayloads})
              : null;

          if (!stackFinal) {
            const alreadyNudged = workingMessages.some(
              (m) =>
                m.role === 'user' &&
                typeof m.content === 'string' &&
                m.content.includes('Данные инструментов уже в истории'),
            );
            if (!alreadyNudged && loop.toolCallsTotal > 0) {
              workingMessages.push({
                role: 'user',
                content:
                  'Данные инструментов уже в истории. Дай пользователю полный ответ на русском: markdown-таблица и вывод. Без вызова инструментов и без пустого ответа.',
              });
            }
          }

          send({type: 'status', text: CHAT_STATUS_COMPOSING});
          composingAnnounced = true;

          const finalMessages = stackFinal ?? messagesForShortFinal(workingMessages);
          let rawStreamed = '';
          const sanitizer = createAnswerStreamSanitizer();
          try {
            for await (const delta of chatCompletionStream(finalMessages, abort.signal)) {
              rawStreamed += delta;
              const safe = sanitizer.push(delta);
              if (safe) sendDelta(safe);
            }
            const tail = sanitizer.flush();
            if (tail) sendDelta(tail);
          } catch (streamErr) {
            chatLog('chat.stream_fallback', {
              requestId,
              ip,
              error: streamErr instanceof Error ? streamErr.message.slice(0, 200) : String(streamErr),
            });
            // Keep whatever was already typed; flush sanitized holdback only.
            const tail = sanitizer.flush();
            if (tail) sendDelta(tail);
          }

          if (!rawStreamed) {
            const fallback = await chatCompletion(finalMessages, undefined, abort.signal);
            finalText = (fallback.content ?? '').trim() || null;
          }
        }

        if (finalText) {
          // One-shot paths: tool-loop/fast-path final text or non-stream fallback.
          finalText = sanitizeUserFacingAnswer(finalText);
          sendDelta(finalText);
        } else if (outputChars === 0) {
          status = 'empty';
          sendDelta('Не удалось получить ответ. Попробуйте переформулировать вопрос.');
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
          send({type: 'delta', text: `\n\n⚠️ Ошибка обращения к модели: ${detail}`});
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
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': requestId,
    },
  });
}
