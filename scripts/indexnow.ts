/**
 * IndexNow submitter — pushes the site's URLs to search engines that support the
 * IndexNow protocol (Yandex, Bing, Seznam, and others share one index).
 *
 * Yandex officially supports IndexNow: it lets you notify the crawler about new,
 * updated, or deleted pages without waiting for a scheduled recrawl.
 * Docs: https://yandex.com/support/webmaster/en/indexing-options/index-now
 *
 * Prerequisites:
 *  - The key file must be reachable at https://<host>/<key>.txt and contain the
 *    key (already committed under public/). Yandex validates it on every request.
 *
 * Run AFTER deploy (the URLs must be live and return 200):
 *   INDEXNOW_KEY=... SITE_URL=https://cloudfinops.ru npx tsx scripts/indexnow.ts
 *
 * Env (all optional, sensible defaults):
 *   SITE_URL       default https://cloudfinops.ru
 *   INDEXNOW_KEY   default the committed public key
 *   INDEXNOW_ONLY  comma-separated URLs to submit instead of the full set
 *                  (use for "only changed pages" pings, e.g. a new news item)
 */

import {newsItems} from '../src/data/news';

const SITE_URL = (process.env.SITE_URL ?? 'https://cloudfinops.ru').replace(/\/$/, '');
const KEY = process.env.INDEXNOW_KEY ?? 'd340d6f02d0606daf4eaff3243aa7dd0';
const HOST = new URL(SITE_URL).host;

// IndexNow is a shared protocol; pinging one endpoint propagates to all
// participants, but we hit Yandex and Bing directly to be explicit.
const ENDPOINTS = ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'];

function allUrls(): string[] {
  const staticRoutes = ['/', '/catalog', '/calculator', '/chat', '/api', '/news', '/about'];
  const newsRoutes = newsItems.map((n) => `/news/${n.id}`);
  return [...staticRoutes, ...newsRoutes].map((p) => `${SITE_URL}${p}`);
}

function targetUrls(): string[] {
  const only = process.env.INDEXNOW_ONLY?.trim();
  if (only) {
    return only
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => (u.startsWith('http') ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`));
  }
  return allUrls();
}

async function submit(endpoint: string, urlList: string[]): Promise<void> {
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `${SITE_URL}/${KEY}.txt`,
    urlList,
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  console.log(`[indexnow] ${endpoint} → ${res.status} ${res.statusText}${text ? ` · ${text}` : ''}`);
}

async function main() {
  const urlList = targetUrls();
  console.log(`[indexnow] host=${HOST} key=${KEY.slice(0, 6)}… urls=${urlList.length}`);
  for (const endpoint of ENDPOINTS) {
    try {
      await submit(endpoint, urlList);
    } catch (err) {
      console.error(`[indexnow] ${endpoint} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

void main();
