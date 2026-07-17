import {NextResponse} from 'next/server';
import {
  chatCompletion,
  chatCompletionStream,
  hasApiKey,
  type ChatMessage,
} from '@/lib/chat/gigachat';
import {SYSTEM_PROMPT} from '@/lib/chat/system-prompt';
import {CHAT_TOOLS, runTool} from '@/lib/chat/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 20;
const MAX_CONTENT_LEN = 4000;
const MAX_TOOL_ROUNDS = 4;

type ClientMessage = {role: 'user' | 'assistant'; content: string};

function sanitize(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages)) return null;
  const trimmed = messages.slice(-MAX_MESSAGES);
  const out: ChatMessage[] = [];
  for (const m of trimmed) {
    if (!m || typeof m !== 'object') continue;
    const {role, content} = m as ClientMessage;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string' || !content.trim()) continue;
    out.push({role, content: content.slice(0, MAX_CONTENT_LEN)});
  }
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}

export async function POST(req: Request) {
  if (!hasApiKey()) {
    return NextResponse.json(
      {error: 'AI-ассистент временно недоступен: не настроен ключ API на сервере.'},
      {status: 503},
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: 'Некорректный запрос.'}, {status: 400});
  }

  const history = sanitize((body as {messages?: unknown})?.messages);
  if (!history) {
    return NextResponse.json({error: 'Пустой или некорректный список сообщений.'}, {status: 400});
  }

  const messages: ChatMessage[] = [{role: 'system', content: SYSTEM_PROMPT}, ...history];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = new AbortController();
      req.signal.addEventListener('abort', () => abort.abort());

      try {
        // Tool-calling loop: let the model request data, execute, feed back.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const reply = await chatCompletion(messages, CHAT_TOOLS, abort.signal);
          const toolCalls = reply.tool_calls ?? [];

          if (!toolCalls.length) {
            // No tools requested — done with the loop, stream the final answer.
            break;
          }

          messages.push({
            role: 'assistant',
            content: reply.content ?? '',
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            const result = runTool(call.function.name, call.function.arguments);
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: result,
            });
          }
        }

        // Final answer, streamed to the client as plain text chunks.
        let streamedAny = false;
        for await (const delta of chatCompletionStream(messages, abort.signal)) {
          streamedAny = true;
          controller.enqueue(encoder.encode(delta));
        }

        if (!streamedAny) {
          controller.enqueue(
            encoder.encode('Не удалось получить ответ. Попробуйте переформулировать вопрос.'),
          );
        }
      } catch (err) {
        if (abort.signal.aborted) {
          controller.close();
          return;
        }
        const detail = err instanceof Error ? err.message : 'Неизвестная ошибка.';
        controller.enqueue(encoder.encode(`\n\n⚠️ Ошибка обращения к модели: ${detail}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
