/**
 * Compatibility façade over `inference-sizing` (tasks A–D).
 *
 * Prefer `sizeInferenceDeployment` for new code. These helpers keep older
 * call sites (chat, tests, UI) working while using the physical weight/KV model.
 */

import {defaultGpuMemoryGiB} from './gpu-memory';
import {
  estimateActivationsGiB,
  estimateRuntimeOverheadGiB,
  sizeInferenceDeployment,
  type AttentionProfile,
  type InferenceSizingResult,
} from './inference-sizing';
import type {KvCacheDtype, WeightVariantLike} from './weight-formats';

export {defaultGpuMemoryGiB};

export type VramPartId = 'weights' | 'kv' | 'activations' | 'overhead';

export type VramPart = {
  id: VramPartId;
  label: string;
  gib: number;
};

/**
 * Utilization bands (need / capacity):
 *   excess <55% — Большой запас
 *   optimal 55–75% — Оптимально
 *   tight 75–90% — Малый запас
 *   limit 90–100% — Впритык
 *   overload >100% — Не влезает
 */
export type VramLoadBand = 'excess' | 'optimal' | 'tight' | 'limit' | 'overload';

export type VramBreakdown = {
  parts: VramPart[];
  totalGiB: number;
  capacityGiB: number | null;
  utilizationPct: number | null;
  loadBand: VramLoadBand | null;
  contextTokens: number;
  avgContextTokens: number;
  maxContextTokens: number;
  batchSize: number;
  concurrentUsers: number;
  quant: string;
  /** Extended sizing fields (optional for older consumers). */
  sizing?: InferenceSizingResult;
};

function roundGiB(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const HOST_SKU_GIB = new Set([
  16, 24, 40, 48, 80, 96, 141, 160, 180, 192, 288, 282, 320, 384, 564, 576, 640,
  1128, 1152, 2304,
]);

/** @deprecated Prefer estimateRuntimeOverheadGiB from inference-sizing. */
export function estimateOverheadGiB(weightsGiB: number): number {
  return estimateRuntimeOverheadGiB(weightsGiB);
}

/**
 * Light-load floor when catalog only has host-capacity markers.
 * Uses runtime overhead + activations + a modest KV stub (not residual recipe).
 */
export function estimateLightLoadRecipeGiB(
  weightsGiB: number,
  contextDefault = 32_768,
): number {
  const weights = Math.max(0, weightsGiB);
  const overhead = estimateRuntimeOverheadGiB(weights);
  const act = estimateActivationsGiB(weights, 1);
  const ctxScale = Math.max(1_024, contextDefault) / 32_768;
  const kv = clamp(weights * 0.02 * ctxScale, 0.75, Math.max(8, weights * 0.12));
  return roundGiB(weights + overhead + act + kv);
}

export function looksLikeHostSkuCapacity(estimate: number, weightsGiB: number): boolean {
  if (!Number.isFinite(estimate) || estimate <= 0) return false;
  const n = Math.round(estimate);
  if (!HOST_SKU_GIB.has(n)) return false;
  const weights = Math.max(0, weightsGiB);
  const margin = estimate - weights;
  if (margin < 0) return false;
  if (margin <= Math.max(12, weights * 0.22)) return true;
  if (margin >= Math.max(200, weights * 0.45)) return true;
  return false;
}

export function canonicalRecipeTotalGiB(
  weightsGiB: number,
  estimatedVramGiBList: number[],
  contextDefault = 32_768,
): number {
  const weights = Math.max(0, weightsGiB);
  const floor = estimateLightLoadRecipeGiB(weights, contextDefault);
  const adequate: number[] = [];
  for (const n of estimatedVramGiBList) {
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n >= weights && !looksLikeHostSkuCapacity(n, weights)) {
      adequate.push(n);
    }
  }
  if (adequate.length) return Math.min(...adequate);
  return Math.max(floor, weights);
}

export function loadBandForUtilization(pct: number | null): VramLoadBand | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct > 100) return 'overload';
  if (pct >= 90) return 'limit';
  if (pct >= 75) return 'tight';
  if (pct >= 55) return 'optimal';
  return 'excess';
}

export function loadBandLabel(band: VramLoadBand): {
  text: string;
  hint: string;
  theme: 'normal' | 'info' | 'success' | 'danger';
} {
  switch (band) {
    case 'overload':
      return {
        text: 'Не влезает',
        hint: 'Нужна другая конфигурация или меньший формат весов',
        theme: 'normal',
      };
    case 'limit':
      return {
        text: 'Впритык',
        hint: 'Ограниченный контекст',
        theme: 'normal',
      };
    case 'tight':
      return {
        text: 'Малый запас',
        hint: 'Подходит для одиночных запросов',
        theme: 'normal',
      };
    case 'optimal':
      return {
        text: 'Оптимально',
        hint: 'Подходит для продакшена',
        theme: 'normal',
      };
    case 'excess':
      return {
        text: 'Большой запас',
        hint: 'Высокий параллелизм',
        theme: 'normal',
      };
  }
}

function formatGiBAmount(n: number): string {
  const rounded = n >= 100 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: rounded >= 100 ? 1 : 2,
  }).format(rounded);
}

export function formatVramUsage(totalGiB: number, capacityGiB: number | null | undefined): string {
  const used = formatGiBAmount(totalGiB);
  if (capacityGiB == null || !Number.isFinite(capacityGiB) || capacityGiB <= 0) {
    return `${used} GiB`;
  }
  return `${used} из ${formatGiBAmount(capacityGiB)} GiB`;
}

export type BuildVramArgs = {
  weightsGiB: number;
  /** Ignored by the physical model (kept for call-site compatibility). */
  recipeTotalGiB?: number;
  contextDefault: number;
  batchSize?: number;
  concurrentUsers?: number;
  contextTokens?: number;
  avgContextTokens?: number;
  maxContextTokens?: number;
  quant: string;
  gpuCount: number;
  gpuFamily: string;
  gpuMemoryGb?: number | null;
  /** Optional architecture / format overrides. */
  weightVariant?: WeightVariantLike;
  totalParametersB?: number | null;
  activeParameterCountB?: number | null;
  attention?: AttentionProfile | null;
  kvCacheDtype?: KvCacheDtype;
};

function sizingToBreakdown(
  sizing: InferenceSizingResult,
  args: BuildVramArgs,
  avgContextTokens: number,
  maxContextTokens: number,
  concurrentUsers: number,
  batchSize: number,
): VramBreakdown {
  return {
    parts: sizing.vramParts,
    totalGiB: sizing.totalGiB,
    capacityGiB: sizing.capacityGiB,
    utilizationPct: sizing.utilizationPct,
    loadBand: sizing.loadBand,
    contextTokens: avgContextTokens,
    avgContextTokens,
    maxContextTokens,
    batchSize,
    concurrentUsers,
    quant: args.quant,
    sizing,
  };
}

/**
 * Build a single-node VRAM view for the requested concurrency.
 * Internally uses physical weights + KV bytes/token (not recipe residual).
 */
export function buildVramBreakdown(args: BuildVramArgs): VramBreakdown {
  const concurrentUsers = Math.max(1, Math.round(args.concurrentUsers ?? 1));
  const batchSize = Math.max(1, Math.round(args.batchSize ?? 1));
  const contextDefault = Math.max(1_024, args.contextDefault || 32_768);
  const maxContextTokens = Math.max(
    1_024,
    args.maxContextTokens || args.contextTokens || contextDefault,
  );
  const avgContextTokens = Math.max(
    256,
    Math.min(
      maxContextTokens,
      args.avgContextTokens ?? args.contextTokens ?? Math.min(32_768, maxContextTokens),
    ),
  );

  const variant: WeightVariantLike = args.weightVariant ?? {
    dtype: args.quant,
    weightsVramGiB: args.weightsGiB,
  };

  const sizing = sizeInferenceDeployment({
    weightVariant: {...variant, weightsVramGiB: args.weightsGiB},
    totalParametersB: args.totalParametersB,
    activeParameterCountB: args.activeParameterCountB,
    attention: args.attention,
    kvCacheDtype: args.kvCacheDtype,
    gpuCount: args.gpuCount,
    gpuFamily: args.gpuFamily,
    gpuMemoryGb: args.gpuMemoryGb,
    workload: {
      concurrentSessions: concurrentUsers,
      activeDecodingRequests: Math.max(1, Math.min(concurrentUsers, batchSize * concurrentUsers)),
      averageResidentContext: avgContextTokens,
      maxContextTokens,
      averageOutputTokens: 0,
      residentMode: 'average',
    },
  });

  // For the simple breakdown helper, show the *requested* concurrency on one
  // node (may overload) — packing lives in planInferenceNodes.
  const single = sizeInferenceDeployment({
    weightVariant: {...variant, weightsVramGiB: args.weightsGiB},
    totalParametersB: args.totalParametersB,
    activeParameterCountB: args.activeParameterCountB,
    attention: args.attention,
    kvCacheDtype: args.kvCacheDtype,
    gpuCount: args.gpuCount,
    gpuFamily: args.gpuFamily,
    gpuMemoryGb: args.gpuMemoryGb,
    workload: {
      concurrentSessions: concurrentUsers,
      activeDecodingRequests: concurrentUsers,
      averageResidentContext: avgContextTokens,
      maxContextTokens,
      averageOutputTokens: 0,
      residentMode: 'average',
      // Force viewing all load on one node for breakdown totals:
      availabilityReserve: 0,
    },
  });

  // Override per-node view: if sizing packed to N nodes, rebuild with tokens on 1 node
  // by using the full resident KV (single-node perspective).
  const view: InferenceSizingResult = {
    ...single,
    nodeCount: 1,
    kind: single.nodesForModelFit === 0 ? 'impossible' : single.kind === 'impossible' ? 'impossible' : 'fits',
  };

  // Recompute memory as if all resident tokens stay on one node (diagnostic).
  const oneNodeAll = sizeInferenceDeployment({
    weightVariant: {...variant, weightsVramGiB: args.weightsGiB},
    totalParametersB: args.totalParametersB,
    activeParameterCountB: args.activeParameterCountB,
    attention: args.attention,
    kvCacheDtype: args.kvCacheDtype,
    gpuCount: args.gpuCount,
    gpuFamily: args.gpuFamily,
    gpuMemoryGb: args.gpuMemoryGb,
    workload: {
      concurrentSessions: concurrentUsers,
      activeDecodingRequests: concurrentUsers,
      averageResidentContext: avgContextTokens,
      maxContextTokens,
      averageOutputTokens: 0,
      residentMode: 'average',
    },
  });

  // Use packed per-node from full plan when available; for buildVramBreakdown
  // consumers expect total at the given concurrency on the described host.
  const bd = sizingToBreakdown(
    {
      ...oneNodeAll,
      // Present unsplit load for the breakdown API.
      perNode: oneNodeAll.perNode,
      totalGiB: oneNodeAll.totalGiB,
      vramParts: oneNodeAll.vramParts,
      utilizationPct: oneNodeAll.utilizationPct,
      loadBand: oneNodeAll.loadBand,
      sizing: oneNodeAll,
    } as InferenceSizingResult,
    args,
    avgContextTokens,
    maxContextTokens,
    concurrentUsers,
    batchSize,
  );

  // Attach the *packed* plan sizing for callers that want node math.
  bd.sizing = sizing;
  void view;
  return bd;
}

export function nodeFitsModelWeights(args: {
  weightsGiB: number;
  gpuCount: number;
  gpuFamily: string;
  gpuMemoryGb?: number | null;
}): boolean {
  const perCard =
    args.gpuMemoryGb != null && Number.isFinite(args.gpuMemoryGb) && args.gpuMemoryGb > 0
      ? args.gpuMemoryGb
      : defaultGpuMemoryGiB(args.gpuFamily);
  if (perCard == null || args.gpuCount <= 0) return true;
  return args.weightsGiB <= perCard * args.gpuCount * 1.005;
}

export type InferenceNodePlan = {
  kind: 'fits' | 'replicas' | 'impossible';
  nodeCount: number;
  maxUsersPerNode: number;
  usersPerNode: number;
  requestedUsers: number;
  perNode: VramBreakdown;
  sizing: InferenceSizingResult;
};

export function formatNodeCount(n: number): string {
  const abs = Math.max(0, Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${abs} нод`;
  if (mod10 === 1) return `${abs} нода`;
  if (mod10 >= 2 && mod10 <= 4) return `${abs} ноды`;
  return `${abs} нод`;
}

/**
 * Pack concurrent sessions onto replica nodes using tasks A–D.
 */
export function planInferenceNodes(args: BuildVramArgs): InferenceNodePlan {
  const requestedUsers = Math.max(1, Math.round(args.concurrentUsers ?? 1));
  const contextDefault = Math.max(1_024, args.contextDefault || 32_768);
  const maxContextTokens = Math.max(
    1_024,
    args.maxContextTokens || args.contextTokens || contextDefault,
  );
  const avgContextTokens = Math.max(
    256,
    Math.min(
      maxContextTokens,
      args.avgContextTokens ?? args.contextTokens ?? Math.min(32_768, maxContextTokens),
    ),
  );

  const variant: WeightVariantLike = args.weightVariant ?? {
    dtype: args.quant,
    weightsVramGiB: args.weightsGiB,
  };

  const sizing = sizeInferenceDeployment({
    weightVariant: {...variant, weightsVramGiB: args.weightsGiB},
    totalParametersB: args.totalParametersB,
    activeParameterCountB: args.activeParameterCountB,
    attention: args.attention,
    kvCacheDtype: args.kvCacheDtype,
    gpuCount: args.gpuCount,
    gpuFamily: args.gpuFamily,
    gpuMemoryGb: args.gpuMemoryGb,
    workload: {
      concurrentSessions: requestedUsers,
      activeDecodingRequests: requestedUsers,
      averageResidentContext: avgContextTokens,
      maxContextTokens,
      averageOutputTokens: 0,
      residentMode: 'average',
    },
  });

  const perNode = sizingToBreakdown(
    sizing,
    args,
    avgContextTokens,
    maxContextTokens,
    Math.max(1, Math.ceil(requestedUsers / Math.max(1, sizing.nodeCount))),
    Math.max(1, Math.round(args.batchSize ?? 1)),
  );

  const maxUsersPerNode =
    sizing.kvCapacityTokensPerNode > 0 && avgContextTokens > 0
      ? Math.max(1, Math.floor(sizing.kvCapacityTokensPerNode / avgContextTokens))
      : sizing.kind === 'impossible'
        ? 0
        : requestedUsers;

  const usersPerNode = Math.max(
    1,
    Math.ceil(requestedUsers / Math.max(1, sizing.nodeCount)),
  );

  return {
    kind: sizing.kind,
    nodeCount: sizing.nodeCount,
    maxUsersPerNode: sizing.kind === 'impossible' ? 0 : maxUsersPerNode,
    usersPerNode,
    requestedUsers,
    perNode,
    sizing,
  };
}

export function vramPartTone(id: VramPartId): 'heavy' | 'medium' | 'light' | 'muted' {
  switch (id) {
    case 'weights':
      return 'heavy';
    case 'kv':
      return 'medium';
    case 'activations':
      return 'light';
    case 'overhead':
      return 'muted';
  }
}

export const CONTEXT_LENGTH_OPTIONS = [
  4_096, 8_192, 16_384, 32_768, 65_536, 131_072, 262_144, 524_288, 1_000_000,
] as const;

export function formatContextTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${Math.round(m * 10) / 10}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
