/**
 * Basic chat abuse / spend guards.
 * In-memory sliding windows — per process (each Dockhost replica has its own budget).
 */

import type {ChatMessage} from './gigachat';

export const CHAT_LIMITS = {
  /** Max user/assistant turns kept from the client (system prompt is separate). */
  maxMessages: 16,
  /** Max characters per single message. */
  maxContentLen: 3000,
  /** Max total characters across the sanitized history (excl. system). */
  maxTotalChars: 24_000,
  maxToolRounds: 4,
  /** Soft cap on completion output (must stay in sync with gigachat COMMON_PARAMS). */
  maxOutputTokens: 2500,
  /** Per-IP request budget (sliding 60s). */
  maxRequestsPerIpPerMinute: 20,
  /** Global estimated-token budget across all clients (sliding 60s). */
  maxGlobalTokensPerMinute: 100_000,
  windowMs: 60_000,
} as const;

/**
 * Rough token estimate for rate limiting. Biased high for Cyrillic-heavy text
 * so we under-allow rather than overspend Cloud.ru quota.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 2));
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') total += estimateTokens(m.content);
    if (m.name) total += estimateTokens(m.name);
    if (m.tool_calls) {
      for (const call of m.tool_calls) {
        total += estimateTokens(call.function.name);
        total += estimateTokens(call.function.arguments);
      }
    }
  }
  return total;
}

/**
 * Token reservation for one /api/chat turn.
 * Counts full input + final answer budget + a small buffer for tool-loop
 * completions (not a full worst-case 5×max_tokens, which would starve the window).
 */
export function reserveTokensForRequest(inputTokens: number): number {
  const toolLoopBuffer = 2 * 800;
  return inputTokens + CHAT_LIMITS.maxOutputTokens + toolLoopBuffer;
}

export type RateLimitReject = {
  ok: false;
  reason: 'ip_requests' | 'global_tokens';
  retryAfterSec: number;
  detail: string;
};

export type RateLimitOk = {ok: true; reservedTokens: number};

type TokenEvent = {at: number; tokens: number};

class ChatRateLimiter {
  private tokenEvents: TokenEvent[] = [];
  private ipRequests = new Map<string, number[]>();

  private prune(now: number): void {
    const cutoff = now - CHAT_LIMITS.windowMs;
    this.tokenEvents = this.tokenEvents.filter((e) => e.at >= cutoff);
    for (const [ip, times] of this.ipRequests) {
      const kept = times.filter((t) => t >= cutoff);
      if (kept.length) this.ipRequests.set(ip, kept);
      else this.ipRequests.delete(ip);
    }
  }

  private globalUsed(): number {
    return this.tokenEvents.reduce((sum, e) => sum + e.tokens, 0);
  }

  private retryAfterSec(oldestAt: number, now: number): number {
    return Math.max(1, Math.ceil((oldestAt + CHAT_LIMITS.windowMs - now) / 1000));
  }

  tryAcquire(ip: string, reservedTokens: number): RateLimitOk | RateLimitReject {
    const now = Date.now();
    this.prune(now);

    const ipTimes = this.ipRequests.get(ip) ?? [];
    if (ipTimes.length >= CHAT_LIMITS.maxRequestsPerIpPerMinute) {
      const oldest = ipTimes[0] ?? now;
      return {
        ok: false,
        reason: 'ip_requests',
        retryAfterSec: this.retryAfterSec(oldest, now),
        detail: `Слишком много запросов с вашего IP (лимит ${CHAT_LIMITS.maxRequestsPerIpPerMinute}/мин).`,
      };
    }

    const used = this.globalUsed();
    if (used + reservedTokens > CHAT_LIMITS.maxGlobalTokensPerMinute) {
      const oldest = this.tokenEvents[0]?.at ?? now;
      return {
        ok: false,
        reason: 'global_tokens',
        retryAfterSec: this.retryAfterSec(oldest, now),
        detail: `Сервис временно перегружен (глобальный лимит ~${CHAT_LIMITS.maxGlobalTokensPerMinute} токенов/мин). Попробуйте чуть позже.`,
      };
    }

    ipTimes.push(now);
    this.ipRequests.set(ip, ipTimes);
    this.tokenEvents.push({at: now, tokens: reservedTokens});
    return {ok: true, reservedTokens};
  }

  /** Snapshot for logs (after prune). */
  snapshot(): {globalTokensUsed: number; trackedIps: number} {
    this.prune(Date.now());
    return {globalTokensUsed: this.globalUsed(), trackedIps: this.ipRequests.size};
  }
}

/** Process-local limiter (each replica has its own window). */
export const chatRateLimiter = new ChatRateLimiter();
