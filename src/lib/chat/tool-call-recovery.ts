/**
 * gpt-oss / Cloud.ru sometimes narrates tool use in English `content`
 * ("We will call search_prices…") and dumps JSON args as prose, while
 * leaving `tool_calls` empty. Detect that leak, recover calls when possible,
 * and never treat the monologue as the final user-facing answer.
 */

import type {CompletionChoiceMessage} from './gigachat';

export const CHAT_TOOL_NAMES = [
  'search_catalog',
  'get_product_details',
  'compose_solution',
  'validate_solution',
  'price_solution',
  'compare_solutions',
  'search_prices',
  'get_quote',
  'compare_unit_price',
  'compare_similar_peers',
  'fit_budget',
  'compare_inference_tco',
  'suggest_savings',
  'market_radar',
  'get_compute_shape_limits',
  'recommend_inference_infra',
  'get_lakehouse_quote',
] as const;
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

const TOOL_NAME_SET = new Set<string>(CHAT_TOOL_NAMES);

const TOOL_NAME_USER_LABEL: Record<ChatToolName, string> = {
  search_catalog: 'каталога услуг',
  get_product_details: 'карточки продукта',
  compose_solution: 'сборщика решений',
  validate_solution: 'проверки решения',
  price_solution: 'расчёта стоимости решения',
  compare_solutions: 'сравнения решений',
  get_quote: 'калькулятора конфигурации',
  search_prices: 'прайс-листа',
  compare_unit_price: 'кросс-провайдерной аналитики',
  compare_similar_peers: 'поиска похожих и аномалий',
  fit_budget: 'подбора под бюджет',
  compare_inference_tco: 'сравнения TCO инференса',
  suggest_savings: 'подбора рычагов экономии',
  market_radar: 'радара рынка',
  get_compute_shape_limits: 'лимитов конфигураций ВМ',
  recommend_inference_infra: 'подбора GPU под инференс',
  get_lakehouse_quote: 'калькулятора lakehouse',
};

/** Reverse map: model sometimes leaks `name: "прайс-листа"` instead of English ids. */
const TOOL_LABEL_TO_NAME = new Map<string, ChatToolName>(
  (Object.entries(TOOL_NAME_USER_LABEL) as [ChatToolName, string][]).map(([name, label]) => [
    label.toLowerCase(),
    name,
  ]),
);

function resolveToolNameToken(raw: unknown): ChatToolName | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (TOOL_NAME_SET.has(trimmed)) return trimmed as ChatToolName;
  return TOOL_LABEL_TO_NAME.get(trimmed.toLowerCase()) ?? null;
}

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

/** Longest tool name + slack for `из \`name\`` so the cut never lands mid-match. */
const STREAM_SANITIZE_HOLDBACK =
  Math.max(...CHAT_TOOL_NAMES.map((name) => name.length)) + 8;

function pullIzBacktickPrefix(emitPart: string): number {
  const izPrefix = /из\s*`?$/i.exec(emitPart);
  if (izPrefix) return izPrefix[0].length;
  if (emitPart.endsWith('`')) return 1;
  return 0;
}

/**
 * Split so the emit side never contains a partial tool-name match that still
 * continues in `rest` (and keep «из [`]name[`]» together for sanitize).
 */
function takeSafeEmitPrefix(text: string): [string, string] {
  if (text.length <= STREAM_SANITIZE_HOLDBACK) return ['', text];

  let cut = text.length - STREAM_SANITIZE_HOLDBACK;
  const lower = text.toLowerCase();

  // Don't cut inside a bare tool name.
  for (const name of CHAT_TOOL_NAMES) {
    const startMin = Math.max(0, cut - name.length + 1);
    const startMax = Math.min(cut, text.length - name.length);
    for (let i = startMin; i <= startMax; i++) {
      if (lower.startsWith(name, i) && i < cut && i + name.length > cut) {
        cut = i;
      }
    }
  }

  // Don't cut inside a complete `name` / из [`]name[`] span.
  for (const name of CHAT_TOOL_NAMES) {
    const wrapped = `\`${name}\``;
    const startMin = Math.max(0, cut - wrapped.length + 1);
    const startMax = Math.min(cut, text.length - wrapped.length);
    for (let i = startMin; i <= startMax; i++) {
      if (lower.startsWith(wrapped, i) && i < cut && i + wrapped.length > cut) {
        cut = i;
      }
    }
  }

  if (cut <= 0) return ['', text];

  let emitPart = text.slice(0, cut);
  const restPart = text.slice(cut);
  const restLower = restPart.toLowerCase();
  const restStartsWithTool = CHAT_TOOL_NAMES.some((name) => restLower.startsWith(name));

  // Opening backtick (or «из [`]») held back when the tool name starts rest.
  if (restStartsWithTool) {
    cut -= pullIzBacktickPrefix(emitPart);
    if (cut <= 0) return ['', text];
    emitPart = text.slice(0, cut);
  }

  // Closing backtick still in rest, tool name (with optional opening tick) at emit end.
  if (restPart.startsWith('`')) {
    const emitLower = emitPart.toLowerCase();
    for (const name of CHAT_TOOL_NAMES) {
      if (emitLower.endsWith(`\`${name}`)) {
        cut -= name.length + 1;
        break;
      }
      if (emitLower.endsWith(name)) {
        cut -= name.length;
        break;
      }
    }
    if (cut <= 0) return ['', text];
    emitPart = text.slice(0, cut);
    cut -= pullIzBacktickPrefix(emitPart);
  }

  if (cut <= 0) return ['', text];
  return [text.slice(0, cut), text.slice(cut)];
}

/**
 * Incremental sanitize for token streaming: hold back a short tail, re-sanitize
 * the growing safe prefix, and emit only the new sanitized suffix. That way
 * spans like «из `name`» still match one-shot sanitize output.
 */
export function createAnswerStreamSanitizer(): {
  push: (delta: string) => string;
  flush: () => string;
} {
  let raw = '';
  let committedRawLen = 0;
  let emitted = '';

  return {
    push(delta: string): string {
      if (!delta) return '';
      raw += delta;
      const [stable] = takeSafeEmitPrefix(raw);
      // Cut can move left while a tool token straddles the window — wait.
      if (stable.length <= committedRawLen) return '';

      const sanitized = sanitizeUserFacingAnswer(stable);
      if (!sanitized.startsWith(emitted)) {
        // Footnote match completed across an already-emitted prefix — wait for flush.
        return '';
      }

      committedRawLen = stable.length;
      const piece = sanitized.slice(emitted.length);
      emitted = sanitized;
      return piece;
    },
    flush(): string {
      const sanitized = sanitizeUserFacingAnswer(raw);
      const previous = emitted;
      raw = '';
      committedRawLen = 0;
      emitted = sanitized;
      if (sanitized.startsWith(previous)) {
        return sanitized.slice(previous.length);
      }
      // Already-streamed prefix diverged (rare); append after common prefix only.
      let i = 0;
      while (i < previous.length && i < sanitized.length && previous[i] === sanitized[i]) {
        i += 1;
      }
      return sanitized.slice(i);
    },
  };
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
  const mentionsRuLabel = [...TOOL_LABEL_TO_NAME.keys()].some((label) =>
    text.toLowerCase().includes(label),
  );
  const leakHits = LEAK_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

  // OpenAI-style dump with Russian or English tool names in content (no native tool_calls).
  if (
    /"tool_calls"\s*:/.test(text) &&
    /"arguments"\s*:/.test(text) &&
    (mentionsTool || mentionsRuLabel)
  ) {
    return true;
  }

  if ((mentionsTool || mentionsRuLabel) && leakHits >= 1) return true;
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
const SIMILAR_PEERS_KEYS = new Set(['query', 'sku', 'mode', 'minSpreadPct', 'limit']);
const FIT_BUDGET_KEYS = new Set(['budgetMonthRub', 'profile']);

function pickKeys(record: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!allowed.has(k)) continue;
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function argsRecordForInfer(record: Record<string, unknown>): Record<string, unknown> {
  const nested = asRecord(record.arguments);
  if (nested) return nested;
  const fn = asRecord(record.function);
  if (fn) {
    if (typeof fn.arguments === 'string') {
      try {
        const parsed = JSON.parse(fn.arguments);
        const asObj = asRecord(parsed);
        if (asObj) return asObj;
      } catch {
        // ignore
      }
    } else {
      const asObj = asRecord(fn.arguments);
      if (asObj) return asObj;
    }
  }
  return record;
}

function inferToolName(
  record: Record<string, unknown>,
  content: string,
  mentioned: ChatToolName[],
): ChatToolName | null {
  // Arg shape wins over labels: models often put «прайс-листа» on get_quote args.
  const args = argsRecordForInfer(record);
  if ('budgetMonthRub' in args) return 'fit_budget';
  if ('component' in args) return 'compare_unit_price';
  if (
    'minSpreadPct' in args ||
    args.mode === 'anomalies' ||
    args.mode === 'peers'
  ) {
    return 'compare_similar_peers';
  }
  if ('tokensPerDay' in args || 'inputShare' in args || 'outputShare' in args) {
    return 'compare_inference_tco';
  }
  if ('basket' in args || args.mode === 'snapshot' || args.mode === 'outliers') {
    return 'market_radar';
  }
  if ('vcpu' in args || 'ramGiB' in args || 'presetId' in args) return 'get_quote';
  if ('gpuModel' in args && !('query' in args) && !('category' in args)) return 'get_quote';
  if ('query' in args || 'storageClass' in args || 'category' in args) return 'search_prices';

  const fromName = resolveToolNameToken(record.name) || resolveToolNameToken(record.tool);
  if (fromName) return fromName;

  const fn = asRecord(record.function);
  const fromFn = fn ? resolveToolNameToken(fn.name) : null;
  if (fromFn) return fromFn;

  const callMention = content.match(
    /\b(?:call|calling|invoke|use)\s+`?(search_prices|get_quote|compare_unit_price|compare_similar_peers|fit_budget|compare_inference_tco|suggest_savings|market_radar|get_compute_shape_limits)`?/i,
  );
  if (callMention) return callMention[1] as ChatToolName;

  if (mentioned.length === 1) return mentioned[0];
  return null;
}

function defaultSearchQuery(args: Record<string, unknown>): string | null {
  const category = typeof args.category === 'string' ? args.category : '';
  if (category === 'storage') return 'объектное хранилище';
  if (category === 'network') return 'публичный IP';
  if (category === 'kubernetes') return 'Managed Kubernetes';
  if (category === 'cdn') return 'исходящий трафик CDN';
  if (category === 'gpu' && typeof args.gpuModel === 'string') return String(args.gpuModel);
  if (typeof args.gpuModel === 'string' && args.gpuModel.trim()) return String(args.gpuModel).trim();
  if (typeof args.aiModel === 'string' && args.aiModel.trim()) return String(args.aiModel).trim();
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
    if (typeof args.query !== 'string' || !args.query.trim()) {
      const fallback = defaultSearchQuery(args);
      if (!fallback) return null;
      args.query = fallback;
    } else {
      args.query = String(args.query).trim();
    }
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
  if (name === 'compare_similar_peers') {
    const args = pickKeys(cleaned, SIMILAR_PEERS_KEYS);
    const mode = typeof args.mode === 'string' ? args.mode : '';
    if (mode === 'anomalies' || 'minSpreadPct' in args) return args;
    if (typeof args.sku === 'string' && args.sku.trim()) return args;
    if (typeof args.query === 'string' && args.query.trim()) return args;
    return null;
  }
  if (name === 'fit_budget') {
    const args = pickKeys(cleaned, FIT_BUDGET_KEYS);
    if (typeof args.budgetMonthRub !== 'number' && typeof args.budgetMonthRub !== 'string') {
      return null;
    }
    const n = Number(args.budgetMonthRub);
    if (!Number.isFinite(n) || n < 1000) return null;
    args.budgetMonthRub = n;
    return args;
  }
  if (name === 'get_compute_shape_limits') {
    const args = pickKeys(cleaned, new Set(['providers']));
    if (Array.isArray(args.providers)) {
      const providers = args.providers.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
      );
      if (providers.length) args.providers = providers;
      else delete args.providers;
    } else {
      delete args.providers;
    }
    // Empty args = all calculator providers (tool default).
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
function flattenRecoverableRecords(objects: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const obj of objects) {
    const record = asRecord(obj);
    if (!record) continue;
    // Unwrap `{ "tool_calls": [ { name, arguments }, … ] }` dumps.
    if (Array.isArray(record.tool_calls)) {
      for (const tc of record.tool_calls) {
        const item = asRecord(tc);
        if (item) out.push(item);
      }
      continue;
    }
    out.push(record);
  }
  return out;
}

function pushRecoveredCall(
  calls: RecoveredToolCall[],
  seen: Set<string>,
  name: ChatToolName,
  args: Record<string, unknown>,
): void {
  const key = `${name}:${JSON.stringify(args)}`;
  if (seen.has(key)) return;
  seen.add(key);
  calls.push({
    id: `recovered_${calls.length}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'function',
    function: {name, arguments: JSON.stringify(args)},
  });
}

export function recoverToolCallsFromContent(content: string): RecoveredToolCall[] {
  const text = content.trim();
  if (!text) return [];

  const mentioned = mentionedTools(text);
  const objects = extractJsonObjects(text);
  const calls: RecoveredToolCall[] = [];
  const seen = new Set<string>();

  for (const record of flattenRecoverableRecords(objects)) {
    const name = inferToolName(record, text, mentioned);
    if (!name) continue;
    const args = sanitizeArgs(name, record);
    if (!args) continue;
    pushRecoveredCall(calls, seen, name, args);
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
