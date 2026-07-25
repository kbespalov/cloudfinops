/**
 * Shared assistant tool-calling loop for /api/chat and eval harness.
 * Handles gpt-oss leaks: recover tool calls from prose or retry with
 * tool_choice=required — never return leaked English planning as the answer.
 *
 * Latency balance: after a single structured tool, prefer deterministic
 * markdown (tryFormatAgentToolAnswer) over a second long final LLM call.
 */

import {
  extractAllToolPayloads,
  extractLastToolPayloads,
  lastUserQuestion,
  looksMultiComponentStack,
  messagesForShortFinal,
  messagesForStackFinal,
  tryFormatAgentToolAnswer,
} from './fast-path';
import {chatCompletion, type ChatMessage} from './gigachat';
import {resolveToolCalls, sanitizeUserFacingAnswer} from './tool-call-recovery';
import {CHAT_TOOLS, runTool} from './tools';

async function finalizeStackWithLlm(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string | null> {
  const userQ = lastUserQuestion(messages);
  if (!looksMultiComponentStack(userQ)) return null;
  const payloads = extractAllToolPayloads(messages);
  if (payloads.length < 2) return null;
  const stackMessages = messagesForStackFinal({userText: userQ, toolPayloads: payloads});
  if (!stackMessages) return null;
  const forced = await chatCompletion(stackMessages, undefined, {signal});
  const text = (forced.content ?? '').trim();
  return text ? sanitizeUserFacingAnswer(text) : null;
}

export type ChatToolsParam = typeof CHAT_TOOLS | readonly unknown[];

export type ToolLoopEvent =
  | {type: 'tool_call'; name: string; arguments: string; recoveredFromLeak: boolean}
  | {type: 'tool_leak'; action: 'recovered' | 'retry_required' | 'dropped'; preview: string};

export type ToolLoopResult = {
  /** Final assistant text when the model stopped without tools (or null → stream/fallback). */
  finalText: string | null;
  messages: ChatMessage[];
  toolRounds: number;
  toolCallsTotal: number;
  leaksRecovered: number;
  leaksRetried: number;
  leaksDropped: number;
};

const REQUIRED_RETRY_NUDGE =
  'Вызови нужный инструмент через нативный function calling (tool_calls). Не пиши план вызова и JSON аргументов в тексте.';

const EMPTY_AFTER_TOOLS_NUDGE =
  'Данные инструментов уже в истории. Дай пользователю полный ответ на русском: markdown-таблица и вывод. Без вызова инструментов и без пустого ответа.';

const EMPTY_AFTER_STACK_NUDGE =
  'Данные инструментов уже в истории. Собери ОДНУ итоговую таблицу по провайдерам: отдельная колонка на каждый запрошенный компонент (ВМ, IP, S3/Object Storage, CDN, K8s…) плюс «Итого» и «к минимуму» по сумме. Цифры только из tool results (quotes / volumeEstimates / rows). НДС вкл., месяц=720ч. Без новых tool calls и без пустого ответа.';

function tryDeterministicAfterTools(
  messages: ChatMessage[],
  opts?: {allowStackCompose?: boolean},
): string | null {
  const toolCount = messages.filter((m) => m.role === 'tool').length;
  if (toolCount < 1) return null;
  if (toolCount !== 1 && !opts?.allowStackCompose) return null;
  const payloads = opts?.allowStackCompose
    ? extractAllToolPayloads(messages)
    : extractLastToolPayloads(messages);
  return tryFormatAgentToolAnswer({
    userText: lastUserQuestion(messages),
    toolPayloads: payloads,
    allowStackCompose: opts?.allowStackCompose,
  });
}

export async function runToolLoop(options: {
  messages: ChatMessage[];
  maxRounds: number;
  signal?: AbortSignal;
  onEvent?: (event: ToolLoopEvent) => void;
  /** Defaults to baseline CHAT_TOOLS — pass CHAT_TOOLS_WITH_INFERENCE only when gated. */
  tools?: ChatToolsParam;
}): Promise<ToolLoopResult> {
  const messages = options.messages;
  const tools = options.tools ?? CHAT_TOOLS;
  let toolRounds = 0;
  let toolCallsTotal = 0;
  let leaksRecovered = 0;
  let leaksRetried = 0;
  let leaksDropped = 0;
  let finalText: string | null = null;
  let requiredRetryUsed = false;
  let emptyAfterToolsNudgeUsed = false;

  for (let round = 0; round < options.maxRounds; round++) {
    const reply = await chatCompletion(messages, tools, {
      signal: options.signal,
      toolChoice: 'auto',
    });

    let resolved = resolveToolCalls(reply);

    if (resolved.kind === 'leak_unrecoverable' && !requiredRetryUsed) {
      requiredRetryUsed = true;
      leaksRetried += 1;
      options.onEvent?.({
        type: 'tool_leak',
        action: 'retry_required',
        preview: resolved.leakedContent.slice(0, 200),
      });
      const retry = await chatCompletion(messages, tools, {
        signal: options.signal,
        toolChoice: 'required',
      });
      resolved = resolveToolCalls(retry);
    }

    if (resolved.kind === 'leak_unrecoverable') {
      leaksDropped += 1;
      options.onEvent?.({
        type: 'tool_leak',
        action: 'dropped',
        preview: resolved.leakedContent.slice(0, 200),
      });
      // Do not surface the leak. Nudge once more inside the remaining rounds.
      messages.push({role: 'assistant', content: ''});
      messages.push({role: 'user', content: REQUIRED_RETRY_NUDGE});
      continue;
    }

    if (resolved.kind === 'final') {
      const text = (resolved.text ?? '').trim();
      if (text) {
        finalText = sanitizeUserFacingAnswer(text);
        break;
      }
      // Empty content after tools — single-SKU table short-circuit, else LLM (+ stack digest).
      if (toolCallsTotal > 0 && !emptyAfterToolsNudgeUsed) {
        const formatted = tryDeterministicAfterTools(messages);
        if (formatted) {
          finalText = sanitizeUserFacingAnswer(formatted);
          break;
        }
        emptyAfterToolsNudgeUsed = true;
        const userQ = lastUserQuestion(messages);
        if (looksMultiComponentStack(userQ)) {
          finalText = await finalizeStackWithLlm(messages, options.signal);
          if (!finalText) {
            const rescue = tryDeterministicAfterTools(messages, {allowStackCompose: true});
            if (rescue) finalText = sanitizeUserFacingAnswer(rescue);
          }
          break;
        }
        messages.push({role: 'assistant', content: ''});
        messages.push({role: 'user', content: EMPTY_AFTER_TOOLS_NUDGE});
        const forced = await chatCompletion(messagesForShortFinal(messages), undefined, {
          signal: options.signal,
        });
        const forcedText = (forced.content ?? '').trim();
        if (forcedText) {
          finalText = sanitizeUserFacingAnswer(forcedText);
        }
        break;
      }
      finalText = null;
      break;
    }

    const toolCalls = resolved.toolCalls;
    const recoveredFromLeak = resolved.recoveredFromLeak;

    if (recoveredFromLeak) {
      leaksRecovered += 1;
      options.onEvent?.({
        type: 'tool_leak',
        action: 'recovered',
        preview: (reply.content ?? '').slice(0, 200),
      });
    }

    toolRounds += 1;
    toolCallsTotal += toolCalls.length;

    // Never keep leaked English planning in history — it poisons later rounds.
    messages.push({
      role: 'assistant',
      content: recoveredFromLeak ? '' : (reply.content ?? ''),
      tool_calls: toolCalls,
    });

    const toolResults = await Promise.all(
      toolCalls.map(async (call) => {
        options.onEvent?.({
          type: 'tool_call',
          name: call.function.name,
          arguments: call.function.arguments,
          recoveredFromLeak,
        });
        const result = await runTool(call.function.name, call.function.arguments);
        return {call, result};
      }),
    );

    for (const {call, result} of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: result,
      });
    }

    // One complete structured tool → skip planning another round + final LLM.
    // Multi-SKU stacks never short-circuit here (looksMultiComponentStack → null).
    if (toolCalls.length === 1) {
      const formatted = tryFormatAgentToolAnswer({
        userText: lastUserQuestion(messages),
        toolPayloads: toolResults.map(({call, result}) => ({
          name: call.function.name,
          content: result,
          arguments: call.function.arguments,
        })),
      });
      if (formatted) {
        finalText = sanitizeUserFacingAnswer(formatted);
        break;
      }
    }

    // Parallel multi-tool round on a stack → ask LLM on a compact digest (not raw JSON).
    if (
      toolCalls.length >= 3 &&
      looksMultiComponentStack(lastUserQuestion(messages)) &&
      extractAllToolPayloads(messages).length >= 3
    ) {
      const stackAnswer = await finalizeStackWithLlm(messages, options.signal);
      if (stackAnswer) {
        finalText = stackAnswer;
        break;
      }
    }
  }

  // Exhausted rounds with tool data but no prose — stack digest LLM, then last-chance compose.
  if (!finalText && toolCallsTotal > 0 && !emptyAfterToolsNudgeUsed) {
    const formatted = tryDeterministicAfterTools(messages);
    if (formatted) {
      finalText = sanitizeUserFacingAnswer(formatted);
    } else if (looksMultiComponentStack(lastUserQuestion(messages))) {
      finalText = await finalizeStackWithLlm(messages, options.signal);
      if (!finalText) {
        const rescue = tryDeterministicAfterTools(messages, {allowStackCompose: true});
        if (rescue) finalText = sanitizeUserFacingAnswer(rescue);
      }
    } else {
      messages.push({role: 'user', content: EMPTY_AFTER_TOOLS_NUDGE});
      const forced = await chatCompletion(messagesForShortFinal(messages), undefined, {
        signal: options.signal,
      });
      const forcedText = (forced.content ?? '').trim();
      if (forcedText) {
        finalText = sanitizeUserFacingAnswer(forcedText);
      }
    }
  }

  return {
    finalText,
    messages,
    toolRounds,
    toolCallsTotal,
    leaksRecovered,
    leaksRetried,
    leaksDropped,
  };
}
