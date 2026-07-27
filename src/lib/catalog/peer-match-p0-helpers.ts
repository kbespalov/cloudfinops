/**
 * Shared helpers for Exact vs Functional P0 pair / algorithm cases.
 */
import {catalog, type CatalogMeter} from '@/lib/catalog';
import {
  classifyPeer,
  extractPeerFeatures,
  type PeerFeatures,
} from './peer-match';

export function bySku(sku: string): CatalogMeter {
  const m = catalog.meters.find((x) => x.sku === sku);
  if (!m) throw new Error(`missing sku ${sku}`);
  return m;
}

function setDotted(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (value === null) delete cur[last];
  else cur[last] = value;
}

/** Deep-clone a catalog meter and apply dotted-path patches (+ `_provider`). */
export function cloneMeter(
  seed: CatalogMeter,
  patch: Record<string, unknown> = {},
): CatalogMeter {
  const cloned = structuredClone(seed) as CatalogMeter & Record<string, unknown>;
  for (const [path, value] of Object.entries(patch)) {
    if (path === '_provider') {
      cloned.provider = String(value);
      continue;
    }
    setDotted(cloned as unknown as Record<string, unknown>, path, value);
  }
  if (typeof cloned.sku === 'string') {
    cloned.id = `${cloned.provider}:${cloned.sku}`;
  }
  return cloned;
}

export function applyFeaturePatch(
  features: PeerFeatures,
  patch: Record<string, unknown>,
): PeerFeatures {
  const out = structuredClone(features) as PeerFeatures & Record<string, unknown>;
  for (const [path, value] of Object.entries(patch)) {
    setDotted(out as unknown as Record<string, unknown>, path, value);
  }
  return out;
}

export function classifyPair(
  seedSku: string,
  candidate: CatalogMeter | string,
  opts?: {
    candidatePatch?: Record<string, unknown>;
    featurePatch?: Record<string, unknown>;
  },
) {
  const seed = bySku(seedSku);
  const candBase =
    typeof candidate === 'string' ? bySku(candidate) : candidate;
  const cand = opts?.candidatePatch
    ? cloneMeter(candBase, opts.candidatePatch)
    : candBase;
  let seedF = extractPeerFeatures(seed);
  let candF = extractPeerFeatures(cand);
  if (opts?.featurePatch) {
    // Apply to both so pair stays symmetric unless patch targets one side later.
    candF = applyFeaturePatch(candF, opts.featurePatch);
    seedF = applyFeaturePatch(seedF, opts.featurePatch);
  }
  return {
    seed,
    candidate: cand,
    seedFeatures: seedF,
    candidateFeatures: candF,
    classification: classifyPeer(seedF, candF),
  };
}
