/**
 * Shared assistant tool-calling loop for /api/chat and eval harness.
 * Handles gpt-oss leaks: recover tool calls from prose or retry with
 * tool_choice=required — never return leaked English planning as the answer.
 */

import {chatCompletion, type ChatMessage} from './gigachat';
import {resolveToolCalls, sanitizeUserFacingAnswer} from './tool-call-recovery';
import {CHAT_TOOLS, runTool} from './tools';

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

export async function runToolLoop(options: {
  messages: ChatMessage[];
  maxRounds: number;
  signal?: AbortSignal;
  onEvent?: (event: ToolLoopEvent) => void;
}): Promise<ToolLoopResult> {
  const messages = options.messages;
  let toolRounds = 0;
  let toolCallsTotal = 0;
  let leaksRecovered = 0;
  let leaksRetried = 0;
  let leaksDropped = 0;
  let finalText: string | null = null;
  let requiredRetryUsed = false;

  for (let round = 0; round < options.maxRounds; round++) {
    const reply = await chatCompletion(messages, CHAT_TOOLS, {
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
      const retry = await chatCompletion(messages, CHAT_TOOLS, {
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
      finalText = resolved.text ? sanitizeUserFacingAnswer(resolved.text) : null;
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
