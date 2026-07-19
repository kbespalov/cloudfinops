/**
 * gpt-oss / Cloud.ru sometimes narrates tool use in English `content`
 * ("We will call search_prices…") and dumps JSON args as prose, while
 * leaving `tool_calls` empty. Detect that leak, recover calls when possible,
 * and never treat the monologue as the final user-facing answer.
 */

import type {CompletionChoiceMessage} from './gigachat';

export const CHAT_TOOL_NAMES = ['search_prices', 'get_quote', 'compare_unit_price'] as const;
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

const TOOL_NAME_SET = new Set<string>(CHAT_TOOL_NAMES);

const TOOL_NAME_USER_LABEL: Record<ChatToolName, string> = {
  get_quote: 'калькулятора конфигурации',
  search_prices: 'прайс-листа',
  compare_unit_price: 'кросс-провайдерной аналитики',
};

/**
 * Strip / rewrite leaked tool names in user-facing answers (footnotes like
 * «из `get_quote`»). Keeps the answer readable without exposing internals.
 */
export function sanitizeUserFacingAnswer(text: string): string {
  if (!text) return text;
  let out = text;
  for (const name of CHAT_TOOL_NAMES) {
    const label = TOOL_NAME_USER_LABEL[name];
    out = out.replace(new RegExp(`из\\s*\`?${name}\`?`, 'gi'), `из ${label}`);
    out = out.replace(new RegExp(`\`${name}\``, 'g'), label);
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), label);
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ \n/g, '\n');
}

const LEAK_PATTERNS: RegExp[] = [
  /\bwe (?:will|need to|should|must|are going to) (?:call|use|invoke|produce)\b/i,
  /\blet'?s (?:call|use|invoke|do it)\b/i,
  /\b(?:now|actual(?:ly)?|final) call\b/i,
  /\bproduce (?:a )?tool call\b/i,
  /\boutput tool call\b/i,
  /\bI(?:'| a)?m going to call\b/i,
  /\bneed to (?:actually )?(?:call|produce|output|use) (?:the )?tool\b/i,
  /\bcall (?:the )?(?:tool|function)\b/i,
  /\btool_calls?\b/i,
  /\bfunction\.arguments\b/i,
];

export type RecoveredToolCall = NonNullable<CompletionChoiceMessage['tool_calls']>[number];

/** True when assistant `content` looks like leaked tool-planning, not a real answer. */
export function looksLikeToolCallLeak(content: string | null | undefined): boolean {
  if (!content) return false;
  const text = content.trim();
  if (text.length < 24) return false;

  const mentionsTool = CHAT_TOOL_NAMES.some((name) => text.includes(name));
  const leakHits = LEAK_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

  if (mentionsTool && leakHits >= 1) return true;
  if (leakHits >= 2) return true;

  // JSON-ish args dump + tool name, even without classic English phrases.
  if (mentionsTool && /\{[\s\S]*"query"\s*:/.test(text) && /call/i.test(text)) return true;

  return false;
}

/** Pull balanced `{…}` objects from free text (best-effort). */
export function extractJsonObjects(text: string): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(i, j + 1);
          try {
            out.push(JSON.parse(slice));
          } catch {
            // ignore non-JSON braces
          }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stripNulls(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

const SEARCH_KEYS = new Set([
  'query',
  'category',
  'provider',
  'gpuModel',
  'aiModel',
  'storageClass',
  'meterKind',
  'volumeGiB',
  'limit',
]);
const QUOTE_KEYS = new Set([
  'vcpu',
  'ramGiB',
  'diskGiB',
  'gpuModel',
  'gpuCount',
  'period',
  'presetId',
]);
const COMPARE_KEYS = new Set(['component', 'period']);

function pickKeys(record: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!allowed.has(k)) continue;
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function inferToolName(
  record: Record<string, unknown>,
  content: string,
  mentioned: ChatToolName[],
): ChatToolName | null {
  const direct =
    (typeof record.name === 'string' && TOOL_NAME_SET.has(record.name) && record.name) ||
    (typeof record.tool === 'string' && TOOL_NAME_SET.has(record.tool) && record.tool) ||
    null;
  if (direct) return direct as ChatToolName;

  const fn = asRecord(record.function);
  if (fn && typeof fn.name === 'string' && TOOL_NAME_SET.has(fn.name)) {
    return fn.name as ChatToolName;
  }

  if ('query' in record) return 'search_prices';
  if ('component' in record) return 'compare_unit_price';
  if ('vcpu' in record || 'ramGiB' in record || 'presetId' in record) return 'get_quote';
  if ('gpuModel' in record && !('query' in record)) return 'get_quote';

  const callMention = content.match(
    /\b(?:call|calling|invoke|use)\s+`?(search_prices|get_quote|compare_unit_price)`?/i,
  );
  if (callMention) return callMention[1] as ChatToolName;

  if (mentioned.length === 1) return mentioned[0];
  return null;
}

function sanitizeArgs(
  name: ChatToolName,
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  const nested = asRecord(record.function);
  let source = record;
  if (nested && nested.arguments !== undefined) {
    if (typeof nested.arguments === 'string') {
      try {
        const parsed = JSON.parse(nested.arguments);
        const asObj = asRecord(parsed);
        if (asObj) source = asObj;
      } catch {
        return null;
      }
    } else {
      const asObj = asRecord(nested.arguments);
      if (asObj) source = asObj;
    }
  } else if (record.arguments !== undefined) {
    if (typeof record.arguments === 'string') {
      try {
        const parsed = JSON.parse(record.arguments);
        const asObj = asRecord(parsed);
        if (asObj) source = asObj;
      } catch {
        return null;
      }
    } else {
      const asObj = asRecord(record.arguments);
      if (asObj) source = asObj;
    }
  }

  const cleaned = stripNulls(source);
  if (name === 'search_prices') {
    const args = pickKeys(cleaned, SEARCH_KEYS);
    if (typeof args.query !== 'string' || !args.query.trim()) return null;
    args.query = String(args.query).trim();
    return args;
  }
  if (name === 'get_quote') {
    const args = pickKeys(cleaned, QUOTE_KEYS);
    if (!Object.keys(args).length) return null;
    return args;
  }
  if (name === 'compare_unit_price') {
    const args = pickKeys(cleaned, COMPARE_KEYS);
    if (typeof args.component !== 'string') return null;
    return args;
  }
  return null;
}

function mentionedTools(content: string): ChatToolName[] {
  return CHAT_TOOL_NAMES.filter((name) => content.includes(name));
}

/**
 * Best-effort: turn leaked planning prose + JSON dumps into OpenAI-style tool_calls.
 */
export function recoverToolCallsFromContent(content: string): RecoveredToolCall[] {
  const text = content.trim();
  if (!text) return [];

  const mentioned = mentionedTools(text);
  const objects = extractJsonObjects(text);
  const calls: RecoveredToolCall[] = [];
  const seen = new Set<string>();

  for (const obj of objects) {
    const record = asRecord(obj);
    if (!record) continue;

    const name = inferToolName(record, text, mentioned);
    if (!name) continue;
    const args = sanitizeArgs(name, record);
    if (!args) continue;

    const key = `${name}:${JSON.stringify(args)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    calls.push({
      id: `recovered_${calls.length}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'function',
      function: {name, arguments: JSON.stringify(args)},
    });
  }

  if (!calls.length) {
    const queryMatch =
      text.match(
        /search_prices[\s\S]{0,120}?\bquery\s*(?:[:=]\s*|\s+)["“«]([^"”»\n]+)["”»]/i,
      ) || text.match(/\bquery\s*[:=]\s*["“«]([^"”»\n]+)["”»]/i);
    if (queryMatch && (mentioned.includes('search_prices') || /search_prices/i.test(text))) {
      const query = queryMatch[1].trim();
      if (query) {
        calls.push({
          id: `recovered_0_${Math.random().toString(36).slice(2, 8)}`,
          type: 'function',
          function: {name: 'search_prices', arguments: JSON.stringify({query})},
        });
      }
    }
  }

  return calls;
}

export type ResolveToolCallsResult =
  | {kind: 'tools'; toolCalls: RecoveredToolCall[]; recoveredFromLeak: boolean}
  | {kind: 'final'; text: string}
  | {kind: 'leak_unrecoverable'; leakedContent: string};

/**
 * Decide how to treat a planning-round reply: native tools, recovered tools,
 * final answer, or unrecoverable leak (caller should retry / not show to user).
 */
export function resolveToolCalls(reply: CompletionChoiceMessage): ResolveToolCallsResult {
  const native = reply.tool_calls?.filter(
    (c) => c?.type === 'function' && typeof c.function?.name === 'string',
  );
  if (native?.length) {
    return {kind: 'tools', toolCalls: native, recoveredFromLeak: false};
  }

  const content = (reply.content ?? '').trim();
  if (!content) {
    return {kind: 'final', text: ''};
  }

  if (looksLikeToolCallLeak(content)) {
    const recovered = recoverToolCallsFromContent(content);
    if (recovered.length) {
      return {kind: 'tools', toolCalls: recovered, recoveredFromLeak: true};
    }
    return {kind: 'leak_unrecoverable', leakedContent: content};
  }

  return {kind: 'final', text: content};
}
