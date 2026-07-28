/**
 * Cloud.ru Foundation Models embeddings + in-memory catalog index.
 * Document vectors are precomputed (`catalog-embeddings.generated.json`);
 * query vectors are requested at search time when an API key is present.
 */

import fs from 'node:fs';
import path from 'node:path';
import {hasApiKey} from './gigachat';

const BASE_URL = process.env.CLOUDRU_FM_BASE_URL || 'https://foundation-models.api.cloud.ru/v1';
export const EMBEDDING_MODEL =
  process.env.CLOUDRU_FM_EMBEDDING_MODEL || 'BAAI/bge-m3';

export type CatalogEmbeddingItem = {
  id: string;
  sku: string;
  /** Float32 vector, base64-encoded little-endian. */
  vector: string;
};

export type CatalogEmbeddingsFile = {
  model: string;
  dims: number;
  generatedAt: string;
  catalogAsOf: string;
  items: CatalogEmbeddingItem[];
};

export type EmbeddingIndex = {
  model: string;
  dims: number;
  /** meter.id → Float32Array */
  byId: Map<string, Float32Array>;
};

function apiKey(): string {
  const key = process.env.CLOUDRU_FM_API_KEY;
  if (!key) throw new Error('CLOUDRU_FM_API_KEY is not configured.');
  return key;
}

export function encodeVector(vec: number[] | Float32Array): string {
  // Copy into a standalone buffer — Node Buffer pools must not back live vectors.
  const arr = Float32Array.from(vec);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

export function decodeVector(b64: string, dims: number): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  const n = buf.byteLength / 4;
  if (n !== dims) {
    throw new Error(`Embedding dims mismatch: got ${n}, expected ${dims}`);
  }
  // Copy out of Buffer's pooled ArrayBuffer so later pool reuse cannot corrupt the index.
  const view = new Float32Array(buf.buffer, buf.byteOffset, dims);
  return Float32Array.from(view);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Reciprocal Rank Fusion over multiple ranked id lists. */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}

/** Batch-embed texts via Cloud.ru OpenAI-compatible /embeddings. */
export async function embedTexts(
  texts: string[],
  opts?: {model?: string; signal?: AbortSignal},
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const model = opts?.model ?? EMBEDDING_MODEL;
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({model, input: texts}),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embeddings API ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    data: {index: number; embedding: number[]}[];
  };
  const ordered = [...data.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== texts.length) {
    throw new Error(`Embeddings count mismatch: ${ordered.length} vs ${texts.length}`);
  }
  return ordered.map((row) => Float32Array.from(row.embedding));
}

export async function embedQuery(
  text: string,
  opts?: {signal?: AbortSignal},
): Promise<Float32Array> {
  const [vec] = await embedTexts([text], opts);
  return vec;
}

const queryCache = new Map<string, {at: number; vec: Float32Array}>();
const QUERY_CACHE_TTL_MS = 60_000;
const QUERY_CACHE_MAX = 64;

export async function embedQueryCached(
  text: string,
  opts?: {signal?: AbortSignal},
): Promise<Float32Array> {
  const key = `${EMBEDDING_MODEL}::${text}`;
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL_MS) return hit.vec;
  const vec = await embedQuery(text, opts);
  queryCache.set(key, {at: Date.now(), vec});
  if (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = [...queryCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) queryCache.delete(oldest[0]);
  }
  return vec;
}

let cachedIndex: EmbeddingIndex | null | undefined;

function embeddingsArtifactPath(): string {
  return path.join(process.cwd(), 'src/data/catalog-embeddings.generated.json');
}

/** Load precomputed catalog embeddings (null if artifact missing). */
export function loadEmbeddingIndex(): EmbeddingIndex | null {
  if (cachedIndex !== undefined) return cachedIndex;
  try {
    const filePath = embeddingsArtifactPath();
    if (!fs.existsSync(filePath)) {
      cachedIndex = null;
      return null;
    }
    const file = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogEmbeddingsFile;
    if (!file?.items?.length || !file.dims) {
      cachedIndex = null;
      return null;
    }
    const byId = new Map<string, Float32Array>();
    for (const item of file.items) {
      byId.set(item.id, decodeVector(item.vector, file.dims));
    }
    cachedIndex = {model: file.model, dims: file.dims, byId};
    return cachedIndex;
  } catch {
    cachedIndex = null;
    return null;
  }
}

export function embeddingsAvailable(): boolean {
  return loadEmbeddingIndex() != null;
}

/** Hybrid search needs a query embed call (API key) + a precomputed index. */
export function hybridSearchReady(): boolean {
  return embeddingsAvailable() && hasApiKey();
}

/** Test helper: inject / clear the in-memory index. */
export function _setEmbeddingIndexForTests(index: EmbeddingIndex | null): void {
  cachedIndex = index;
}
