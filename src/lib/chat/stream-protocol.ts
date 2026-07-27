/**
 * NDJSON chat stream: progress lines while tools run, then answer deltas.
 * Kept separate from tool-call-recovery so the wire format stays tiny and testable.
 */

import {CHAT_TOOL_NAMES, type ChatToolName} from './tool-call-recovery';

export type ChatStreamStatusEvent = {type: 'status'; text: string};
export type ChatStreamDeltaEvent = {type: 'delta'; text: string};
/** Drives the calculator AI-tab sidebar; full-page /chat ignores it. */
export type ChatStreamSidebarConfigEvent = {
  type: 'sidebar_config';
  /** get_quote / lakehouse / compose VM replace the basket; search_prices (CDN) patches it. */
  tool: 'get_quote' | 'get_lakehouse_quote' | 'search_prices' | 'compose_solution';
  args: Record<string, unknown>;
};
export type ChatStreamEvent =
  | ChatStreamStatusEvent
  | ChatStreamDeltaEvent
  | ChatStreamSidebarConfigEvent;

export const CHAT_STATUS_THINKING = 'Думаю…';
export const CHAT_STATUS_COMPOSING = 'Формирую ответ…';

const TOOL_STATUS_LABEL: Record<ChatToolName, string> = {
  search_catalog: 'Ищу в каталоге…',
  get_product_details: 'Открываю карточку продукта…',
  compose_solution: 'Собираю решение…',
  validate_solution: 'Проверяю решение…',
  price_solution: 'Считаю стоимость решения…',
  compare_solutions: 'Сравниваю варианты…',
  search_prices: 'Ищу цены в каталоге…',
  get_quote: 'Считаю конфигурацию…',
  compare_unit_price: 'Сравниваю цены…',
  compare_similar_peers: 'Ищу похожие и аномалии…',
  fit_budget: 'Подбираю под бюджет…',
  compare_inference_tco: 'Считаю TCO инференса…',
  suggest_savings: 'Ищу рычаги экономии…',
  market_radar: 'Смотрю срез рынка…',
  recommend_inference_infra: 'Подбираю GPU под инференс…',
  get_lakehouse_quote: 'Считаю lakehouse…',
};

const TOOL_STATUS_FALLBACK = 'Собираю данные…';

export function statusLabelForTool(name: string): string {
  if ((CHAT_TOOL_NAMES as readonly string[]).includes(name)) {
    return TOOL_STATUS_LABEL[name as ChatToolName];
  }
  return TOOL_STATUS_FALLBACK;
}

export function encodeChatStreamEvent(event: ChatStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      type?: unknown;
      text?: unknown;
      tool?: unknown;
      args?: unknown;
    };
    if (parsed.type === 'sidebar_config') {
      if (
        parsed.tool !== 'get_quote' &&
        parsed.tool !== 'get_lakehouse_quote' &&
        parsed.tool !== 'search_prices' &&
        parsed.tool !== 'compose_solution'
      ) {
        return null;
      }
      if (!parsed.args || typeof parsed.args !== 'object' || Array.isArray(parsed.args)) {
        return null;
      }
      return {
        type: 'sidebar_config',
        tool: parsed.tool,
        args: parsed.args as Record<string, unknown>,
      };
    }
    if (parsed.type !== 'status' && parsed.type !== 'delta') return null;
    if (typeof parsed.text !== 'string' || !parsed.text) return null;
    return {type: parsed.type, text: parsed.text};
  } catch {
    return null;
  }
}

/** Incremental NDJSON line splitter for fetch ReadableStream chunks. */
export function createChatStreamParser(): {
  push: (chunk: string) => ChatStreamEvent[];
  flush: () => ChatStreamEvent[];
} {
  let buffer = '';
  const consume = (text: string, emitPartialLast: boolean): ChatStreamEvent[] => {
    buffer += text;
    const lines = buffer.split('\n');
    if (!emitPartialLast) {
      buffer = lines.pop() ?? '';
    } else {
      buffer = '';
    }
    const events: ChatStreamEvent[] = [];
    for (const line of lines) {
      const event = parseChatStreamLine(line);
      if (event) events.push(event);
    }
    return events;
  };

  return {
    push(chunk: string): ChatStreamEvent[] {
      if (!chunk) return [];
      return consume(chunk, false);
    },
    flush(): ChatStreamEvent[] {
      if (!buffer.trim()) {
        buffer = '';
        return [];
      }
      return consume('', true);
    },
  };
}
