/**
 * Eval harness: replicates the /api/chat pipeline (system prompt + tool-calling
 * loop + final answer) but with a configurable system prompt, so we can A/B test
 * prompt variants against a deterministic ground truth derived from the tools.
 */
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local (tsx scripts don't get Next.js env loading for free).
for (const file of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '../../', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import {
  chatCompletion,
  getChatModel,
  withChatModel,
  type ChatMessage,
} from '../../src/lib/chat/gigachat';
import {
  extractAllToolPayloads,
  looksMultiComponentStack,
  messagesForStackFinal,
  tryFormatAgentToolAnswer,
  tryRunFastPath,
} from '../../src/lib/chat/fast-path';
import {
  INFERENCE_SYSTEM_ADDENDUM,
  matchInferenceIntent,
} from '../../src/lib/chat/inference-intent';
import {
  LAKEHOUSE_SYSTEM_ADDENDUM,
  matchLakehouseIntent,
} from '../../src/lib/chat/lakehouse-intent';
import {
  SYSTEM_PROMPT,
  buildSystemPrompt,
} from '../../src/lib/chat/system-prompt';
import {CHAT_LIMITS} from '../../src/lib/chat/limits';
import {sanitizeUserFacingAnswer} from '../../src/lib/chat/tool-call-recovery';
import {runToolLoop} from '../../src/lib/chat/tool-loop';
import {
  CHAT_TOOLS,
  CHAT_TOOLS_WITH_INFERENCE,
  CHAT_TOOLS_WITH_LAKEHOUSE,
} from '../../src/lib/chat/tools';

const MAX_TOOL_ROUNDS = CHAT_LIMITS.maxToolRounds;

export type ChatRun = {
  answer: string;
  toolCalls: {name: string; arguments: string}[];
  toolResults: {name: string; result: string}[];
  toolRounds: number;
  leaksRecovered: number;
  leaksRetried: number;
  leaksDropped: number;
  durationMs: number;
  model: string;
  fastPath: boolean;
  error?: string;
};

export type RunChatOptions = {
  /** Override Cloud.ru model id for this run. */
  model?: string;
  /** Disable homepage deterministic fast-path (required for fair model A/B). */
  disableFastPath?: boolean;
};

/** Run the full assistant pipeline for one user question. */
export async function runChat(
  systemPrompt: string,
  question: string,
  opts: RunChatOptions = {},
): Promise<ChatRun> {
  if (opts.model) {
    return withChatModel(opts.model, () => runChat(systemPrompt, question, {...opts, model: undefined}));
  }

  const t0 = Date.now();
  const model = getChatModel();
  // Keep in sync with src/app/api/chat/route.ts: live SYSTEM_PROMPT → intent-gated builder.
  const baseSystem =
    systemPrompt === SYSTEM_PROMPT ? buildSystemPrompt(question) : systemPrompt;
  const inferenceIntent = matchInferenceIntent(question);
  const lakehouseIntent = matchLakehouseIntent(question);
  const effectiveSystem = inferenceIntent.matched
    ? `${baseSystem}\n\n${INFERENCE_SYSTEM_ADDENDUM}`
    : lakehouseIntent.matched
      ? `${baseSystem}\n\n${LAKEHOUSE_SYSTEM_ADDENDUM}`
      : baseSystem;
  const planningTools = inferenceIntent.matched
    ? CHAT_TOOLS_WITH_INFERENCE
    : lakehouseIntent.matched
      ? CHAT_TOOLS_WITH_LAKEHOUSE
      : CHAT_TOOLS;
  const messages: ChatMessage[] = [
    {role: 'system', content: effectiveSystem},
    {role: 'user', content: question},
  ];
  const toolCalls: {name: string; arguments: string}[] = [];
  const toolResults: {name: string; result: string}[] = [];
  const emptyMeta = {
    toolRounds: 0,
    leaksRecovered: 0,
    leaksRetried: 0,
    leaksDropped: 0,
    model,
    fastPath: false,
  };

  try {
    const onToolCall = (name: string, args: string) => {
      toolCalls.push({name, arguments: args});
    };

    let usedFastPath = false;
    const fast = opts.disableFastPath
      ? null
      : await tryRunFastPath({
          messages,
          onEvent: (event) => {
            if (event.type === 'tool_call') onToolCall(event.name, event.arguments);
          },
        });
    if (fast) usedFastPath = true;
    const loop =
      fast ??
      (await runToolLoop({
        messages,
        tools: planningTools,
        // Eval needs the same headroom as production multi-stack (not a 2-round cap).
        maxRounds: MAX_TOOL_ROUNDS,
        onEvent: (event) => {
          if (event.type === 'tool_call') onToolCall(event.name, event.arguments);
        },
      }));

    // Collect tool result payloads from the loop message history.
    for (const m of loop.messages) {
      if (m.role === 'tool' && typeof m.content === 'string' && m.name) {
        toolResults.push({name: m.name, result: m.content});
      }
    }

    const meta = {
      toolRounds: loop.toolRounds,
      leaksRecovered: loop.leaksRecovered,
      leaksRetried: loop.leaksRetried,
      leaksDropped: loop.leaksDropped,
      durationMs: Date.now() - t0,
      model,
      fastPath: usedFastPath,
    };

    if (loop.finalText) {
      return {answer: loop.finalText, toolCalls, toolResults, ...meta};
    }

    // Force a final answer after exhausting tool rounds / post-tools path.
    const multiStack = looksMultiComponentStack(question);
    let answer = '';
    if (multiStack && toolCalls.length > 0) {
      const stackMessages = messagesForStackFinal({
        userText: question,
        toolPayloads: extractAllToolPayloads(loop.messages),
      });
      if (stackMessages) {
        const final = await chatCompletion(stackMessages, undefined);
        answer = sanitizeUserFacingAnswer(final.content ?? '');
      }
      if (!answer.trim()) {
        answer =
          tryFormatAgentToolAnswer({
            userText: question,
            toolPayloads: extractAllToolPayloads(loop.messages),
            allowStackCompose: true,
          }) ?? '';
      }
    } else {
      const finalMessages = messages.filter((m) => m.role !== 'system');
      const alreadyNudged = finalMessages.some(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('Данные инструментов уже в истории'),
      );
      if (!alreadyNudged && toolCalls.length > 0) {
        finalMessages.push({
          role: 'user',
          content:
            'Данные инструментов уже в истории. Дай пользователю полный ответ на русском: markdown-таблица и вывод. Без вызова инструментов и без пустого ответа.',
        });
      }
      const final = await chatCompletion(
        [{role: 'system', content: baseSystem}, ...finalMessages],
        undefined,
      );
      answer = sanitizeUserFacingAnswer(final.content ?? '');
    }
    return {
      answer,
      toolCalls,
      toolResults,
      ...meta,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      answer: '',
      toolCalls,
      toolResults,
      ...emptyMeta,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
