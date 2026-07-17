/**
 * Structured request logging for /api/chat.
 * Goes to stdout so Dockhost / docker logs can scrape it.
 */

export type ChatLogFields = Record<string, string | number | boolean | null | undefined>;

function nowIso(): string {
  return new Date().toISOString();
}

/** Best-effort client IP behind reverse proxies (Dockhost / nginx). */
export function clientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  for (const name of ['x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-client-ip']) {
    const v = headers.get(name)?.trim();
    if (v) return v;
  }
  return 'unknown';
}

export function chatLog(event: string, fields: ChatLogFields = {}): void {
  const line = JSON.stringify({
    ts: nowIso(),
    service: 'chat',
    event,
    ...fields,
  });
  // eslint-disable-next-line no-console
  console.log(line);
}
