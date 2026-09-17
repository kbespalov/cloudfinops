/**
 * Per-IP sliding window for public API (no LLM spend).
 */

export const PUBLIC_API_LIMITS = {
  maxRequestsPerIpPerMinute: 60,
  windowMs: 60_000,
} as const;

export class IpRateLimiter {
  private lastSweep = 0;
  private ipRequests = new Map<string, number[]>();

  tryAcquire(ip: string): {ok: true} | {ok: false; retryAfterSec: number} {
    const now = Date.now();
    const cutoff = now - PUBLIC_API_LIMITS.windowMs;
    if (now - this.lastSweep >= PUBLIC_API_LIMITS.windowMs) {
      for (const [key, entries] of this.ipRequests) if ((entries.at(-1) ?? 0) < cutoff) this.ipRequests.delete(key);
      this.lastSweep = now;
    }
    if (!this.ipRequests.has(ip) && this.ipRequests.size >= 10000) return {ok: false, retryAfterSec: 60};
    const times = (this.ipRequests.get(ip) ?? []).filter((t) => t >= cutoff);
    if (times.length >= PUBLIC_API_LIMITS.maxRequestsPerIpPerMinute) {
      const oldest = times[0] ?? now;
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + PUBLIC_API_LIMITS.windowMs - now) / 1000)),
      };
    }
    times.push(now);
    this.ipRequests.set(ip, times);
    return {ok: true};
  }
}

export const publicApiRateLimiter = new IpRateLimiter();

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}
