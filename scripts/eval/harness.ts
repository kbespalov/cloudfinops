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

import {chatCompletion, type ChatMessage} from '../../src/lib/chat/gigachat';
import {CHAT_TOOLS, runTool} from '../../src/lib/chat/tools';

const MAX_TOOL_ROUNDS = 4;

export type ChatRun = {
  answer: string;
  toolCalls: {name: string; arguments: string}[];
  toolResults: {name: string; result: string}[];
  error?: string;
};

/** Run the full assistant pipeline for one user question. */
export async function runChat(systemPrompt: string, question: string): Promise<ChatRun> {
  const messages: ChatMessage[] = [
    {role: 'system', content: systemPrompt},
    {role: 'user', content: question},
  ];
  const toolCalls: {name: string; arguments: string}[] = [];
  const toolResults: {name: string; result: string}[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const reply = await chatCompletion(messages, CHAT_TOOLS);
      const calls = reply.tool_calls ?? [];
      if (!calls.length) {
        return {answer: reply.content ?? '', toolCalls, toolResults};
      }
      messages.push({role: 'assistant', content: reply.content ?? '', tool_calls: calls});
      for (const call of calls) {
        const result = await runTool(call.function.name, call.function.arguments);
        toolCalls.push({name: call.function.name, arguments: call.function.arguments});
        toolResults.push({name: call.function.name, result});
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: result,
        });
      }
    }
    // Force a final answer after exhausting tool rounds.
    const finalMessages = messages.filter((m) => m.role !== 'system');
    const final = await chatCompletion(
      [{role: 'system', content: systemPrompt}, ...finalMessages],
      undefined,
    );
    return {answer: final.content ?? '', toolCalls, toolResults};
  } catch (err) {
    return {
      answer: '',
      toolCalls,
      toolResults,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
