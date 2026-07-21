/**
 * Self-host inference sizing — four independent tasks:
 *   A. Model fit          — do weights + runtime fit the GPU topology?
 *   B. KV-cache capacity  — how many resident tokens after weights?
 *   C. Compute throughput — tok/s (only with benchmark; else "insufficient data")
 *   D. SLA sizing         — replicas for concurrency / arrival / TTFT / TPOT
 *
 * Nodes = max(fit, kv, throughput?) + availability_reserve.
 * Never derive node count from concurrent requests alone.
 */

import {defaultGpuMemoryGiB} from './gpu-memory';
import {
  bytesPerKvElement,
  formatLabel,
  resolveWeightsMemory,
  type KvCacheDtype,
  type ResolvedWeights,
  type WeightFormatId,
  type WeightVariantLike,
} from './weight-formats';

export type AttentionType = 'mha' | 'gqa' | 'mqa' | 'mla' | 'sparse';

export type AttentionProfile = {
  type: AttentionType;
  numLayers?: number;
  numKvHeads?: number;
  headDim?: number;
  latentDim?: number;
  /** Preferred: measured KV bytes per token for the whole model. */
  kvBytesPerTokenMeasured?: number;
  /** Fallback estimate when measured is unavailable. */
  kvBytesPerTokenEstimated?: number;
};

export type ResidentTokenMode = 'average' | 'p95' | 'worst';

export type WorkloadInput = {
  /** Concurrent sessions (may be idle). */
  concurrentSessions: number;
  /** Sessions actively decoding (defaults to concurrentSessions). */
  activeDecodingRequests?: number;
  averageInputTokens?: number;
  averageOutputTokens?: number;
  /** Mean live context across active sequences. */
  averageResidentContext: number;
  /** Deployment max context (worst-case ceiling). */
  maxContextTokens: number;
  residentMode?: ResidentTokenMode;
  /** Optional SLA — without throughput benchmark these do not invent nodes. */
  requestsPerSecond?: number;
  targetOutputTokPerSPerUser?: number;
  ttftTargetMs?: number;
  tpotTargetMs?: number;
  prefixCacheHitRate?: number;
  /** Availability replicas on top of capacity sizing (default 0). */
  availabilityReserve?: number;
  gpuMemoryUtilization?: number;
};

export type SizingBottleneck =
  | 'model_fit'
  | 'kv_cache'
  | 'throughput'
  | 'none'
  | 'impossible';

export type SizingConfidence = 'measured' | 'estimated' | 'theoretical';

export type MemoryBudget = {
  rawVramGiB: number;
  usableVramGiB: number;
  gpuMemoryUtilization: number;
  weightsGiB: number;
  runtimeOverheadGiB: number;
  activationsGiB: number;
  fragmentationGiB: number;
  modelRuntimeMemoryGiB: number;
  kvCacheGiB: number;
  freeReserveGiB: number;
  availableKvMemoryGiB: number;
};

export type InferenceSizingResult = {
  kind: 'fits' | 'replicas' | 'impossible';
  nodeCount: number;
  nodesForModelFit: number;
  nodesForKvCapacity: number;
  nodesForThroughput: number | null;
  nodesForAvailability: number;
  throughputStatus: 'ok' | 'insufficient_data';
  bottleneck: SizingBottleneck;
  confidence: SizingConfidence;
  weightFormat: WeightFormatId;
  weightFormatLabel: string;
  kvCacheDtype: KvCacheDtype;
  weights: ResolvedWeights;
  kvBytesPerToken: number;
  kvBytesPerTokenSource: 'measured' | 'estimated' | 'architectural' | 'fallback';
  residentTokens: number;
  residentMode: ResidentTokenMode;
  kvCapacityTokensPerNode: number;
  estimatedActiveConcurrency: number;
  perNode: MemoryBudget;
  /** Compatible VRAM parts for existing UI card. */
  vramParts: Array<{id: 'weights' | 'kv' | 'activations' | 'overhead'; label: string; gib: number}>;
  totalGiB: number;
  capacityGiB: number | null;
  utilizationPct: number | null;
  loadBand: 'excess' | 'optimal' | 'tight' | 'limit' | 'overload' | null;
  debug: Record<string, unknown>;
};

const PART_LABEL = {
  weights: 'Веса модели',
  kv: 'KV-кэш',
  activations: 'Активации',
  overhead: 'Оверхед',
} as const;

const DEFAULT_GPU_UTIL = 0.9;
const FRAGMENTATION_FACTOR = 1.08;

function roundGiB(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function loadBandForUtilization(
  pct: number | null,
): InferenceSizingResult['loadBand'] {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct > 100) return 'overload';
  if (pct >= 90) return 'limit';
  if (pct >= 75) return 'tight';
  if (pct >= 55) return 'optimal';
  return 'excess';
}

/** Runtime buffers that scale gently with weight footprint (CUDA graphs, NCCL, etc.). */
export function estimateRuntimeOverheadGiB(weightsGiB: number): number {
  return roundGiB(clamp(4 + weightsGiB * 0.018, 4, 28));
}

export function estimateActivationsGiB(weightsGiB: number, activeDecoding: number): number {
  const base = clamp(weightsGiB * 0.0035, 0.4, 36);
  // Mild scale with active batch; not × concurrency of idle sessions.
  const scale = 1 + Math.max(0, activeDecoding - 1) * 0.02;
  return roundGiB(base * Math.min(scale, 2.5));
}

/**
 * KV bytes/token are stored as FP8-equivalent when estimated/measured without
 * an explicit dtype tag. BF16/FP16 doubles the footprint vs FP8.
 */
export function resolveKvBytesPerToken(args: {
  attention?: AttentionProfile | null;
  kvCacheDtype: KvCacheDtype;
  totalParametersB?: number | null;
}): {bytes: number; source: InferenceSizingResult['kvBytesPerTokenSource']} {
  const att = args.attention;
  const dtypeScale = bytesPerKvElement(args.kvCacheDtype); // 1 for fp8, 2 for bf16/fp16

  if (att?.kvBytesPerTokenMeasured != null && att.kvBytesPerTokenMeasured > 0) {
    return {bytes: att.kvBytesPerTokenMeasured * dtypeScale, source: 'measured'};
  }
  if (att?.kvBytesPerTokenEstimated != null && att.kvBytesPerTokenEstimated > 0) {
    return {bytes: att.kvBytesPerTokenEstimated * dtypeScale, source: 'estimated'};
  }

  const elem = dtypeScale;
  if (
    att?.numLayers &&
    att.numLayers > 0 &&
    ((att.type === 'mla' && att.latentDim) ||
      (att.numKvHeads && att.headDim))
  ) {
    let perToken: number;
    if (att.type === 'mla' && att.latentDim) {
      perToken = att.numLayers * att.latentDim * elem * 2;
    } else {
      perToken = 2 * att.numLayers * (att.numKvHeads ?? 1) * (att.headDim ?? 128) * elem;
    }
    return {bytes: perToken, source: 'architectural'};
  }

  // Rough GQA-scale floor when architecture is unknown. Previous min (~24 B/tok)
  // rounded to 0 GiB at typical calculator defaults (few sessions × 32k).
  const params = args.totalParametersB ?? 7;
  const fallback = clamp(params * 2.4, 160, 1_200) * dtypeScale;
  return {bytes: fallback, source: 'fallback'};
}

export function computeResidentTokens(args: {
  mode: ResidentTokenMode;
  concurrentSessions: number;
  activeDecodingRequests: number;
  averageResidentContext: number;
  maxContextTokens: number;
  averageOutputTokens: number;
  prefixCacheHitRate: number;
}): number {
  const sessions = Math.max(1, Math.round(args.concurrentSessions));
  const active = Math.max(1, Math.min(sessions, Math.round(args.activeDecodingRequests)));
  const avgCtx = Math.max(256, args.averageResidentContext);
  const maxCtx = Math.max(avgCtx, args.maxContextTokens);
  const outTok = Math.max(0, args.averageOutputTokens);
  const hit = clamp(args.prefixCacheHitRate, 0, 0.95);

  let contextPerActive: number;
  if (args.mode === 'worst') {
    contextPerActive = maxCtx;
  } else if (args.mode === 'p95') {
    contextPerActive = avgCtx + 0.6 * (maxCtx - avgCtx);
  } else {
    contextPerActive = avgCtx;
  }

  // Prefix cache reduces unique resident prompt tokens.
  const effectiveContext = contextPerActive * (1 - hit * 0.7);
  const inFlightOutput = active * outTok * (args.mode === 'worst' ? 1 : 0.5);
  const schedulerReserve = Math.max(1024, active * 512);

  return Math.max(
    1,
    Math.round(active * effectiveContext + inFlightOutput + schedulerReserve),
  );
}

function buildMemoryBudget(args: {
  rawVramGiB: number;
  util: number;
  weightsGiB: number;
  kvGiB: number;
  activationsGiB: number;
  overheadGiB: number;
}): MemoryBudget {
  const usable = roundGiB(args.rawVramGiB * args.util);
  const frag = roundGiB(args.weightsGiB * 0.02);
  const modelRuntime = roundGiB(
    args.weightsGiB + args.overheadGiB + args.activationsGiB + frag,
  );
  const availableKv = roundGiB(usable - modelRuntime);
  const free = roundGiB(Math.max(0, usable - modelRuntime - args.kvGiB));
  return {
    rawVramGiB: roundGiB(args.rawVramGiB),
    usableVramGiB: usable,
    gpuMemoryUtilization: args.util,
    weightsGiB: roundGiB(args.weightsGiB),
    runtimeOverheadGiB: roundGiB(args.overheadGiB),
    activationsGiB: roundGiB(args.activationsGiB),
    fragmentationGiB: frag,
    modelRuntimeMemoryGiB: modelRuntime,
    kvCacheGiB: roundGiB(args.kvGiB),
    freeReserveGiB: free,
    availableKvMemoryGiB: availableKv,
  };
}

export function sizeInferenceDeployment(args: {
  weightVariant: WeightVariantLike;
  totalParametersB?: number | null;
  /** Must not affect weight size — logged in debug only. */
  activeParameterCountB?: number | null;
  attention?: AttentionProfile | null;
  kvCacheDtype?: KvCacheDtype;
  gpuCount: number;
  gpuFamily: string;
  gpuMemoryGb?: number | null;
  workload: WorkloadInput;
  /** Optional measured decode tok/s for the whole node — enables throughput sizing. */
  nodeDecodeTokPerS?: number | null;
}): InferenceSizingResult {
  const util = clamp(args.workload.gpuMemoryUtilization ?? DEFAULT_GPU_UTIL, 0.7, 0.95);
  const kvDtype = args.kvCacheDtype ?? 'fp8';
  const mode = args.workload.residentMode ?? 'average';
  const sessions = Math.max(1, Math.round(args.workload.concurrentSessions));
  const active = Math.max(
    1,
    Math.round(args.workload.activeDecodingRequests ?? sessions),
  );

  const weights = resolveWeightsMemory({
    variant: args.weightVariant,
    totalParametersB: args.totalParametersB,
    activeParameterCountB: args.activeParameterCountB,
  });

  const {bytes: kvBytes, source: kvSource} = resolveKvBytesPerToken({
    attention: args.attention,
    kvCacheDtype: kvDtype,
    totalParametersB: args.totalParametersB,
  });

  const residentTokens = computeResidentTokens({
    mode,
    concurrentSessions: sessions,
    activeDecodingRequests: active,
    averageResidentContext: args.workload.averageResidentContext,
    maxContextTokens: args.workload.maxContextTokens,
    averageOutputTokens: args.workload.averageOutputTokens ?? 0,
    prefixCacheHitRate: args.workload.prefixCacheHitRate ?? 0,
  });

  const perCard =
    args.gpuMemoryGb != null && Number.isFinite(args.gpuMemoryGb) && args.gpuMemoryGb > 0
      ? args.gpuMemoryGb
      : defaultGpuMemoryGiB(args.gpuFamily);
  const rawVram = perCard != null && args.gpuCount > 0 ? perCard * args.gpuCount : 0;

  const overhead = estimateRuntimeOverheadGiB(weights.weightsMemoryGiB);
  const activations = estimateActivationsGiB(weights.weightsMemoryGiB, active);

  // --- A. Model fit (single replica) ---
  // Hard gate: weights must sit in raw VRAM (physical). Usable util applies to
  // KV headroom below — not to rejecting a card that can hold the checkpoint.
  const emptyKvBudget = buildMemoryBudget({
    rawVramGiB: rawVram,
    util,
    weightsGiB: weights.weightsMemoryGiB,
    kvGiB: 0,
    activationsGiB: activations,
    overheadGiB: overhead,
  });

  const weightsFit =
    rawVram > 0 && weights.weightsMemoryGiB <= rawVram * 1.005;
  const nodesForModelFit = weightsFit ? 1 : 0; // 0 = impossible without multi-node TP

  // --- B. KV capacity ---
  const kvGiBTotal =
    (residentTokens * kvBytes * FRAGMENTATION_FACTOR) / 1024 ** 3;

  const kvCapacityTokensPerNode =
    emptyKvBudget.availableKvMemoryGiB > 0 && kvBytes > 0
      ? Math.floor(
          (emptyKvBudget.availableKvMemoryGiB * 1024 ** 3) / (kvBytes * FRAGMENTATION_FACTOR),
        )
      : 0;

  let nodesForKvCapacity = 0;
  if (weightsFit && kvCapacityTokensPerNode > 0) {
    nodesForKvCapacity = Math.max(1, Math.ceil(residentTokens / kvCapacityTokensPerNode));
  } else if (weightsFit && kvGiBTotal <= 0.01) {
    nodesForKvCapacity = 1;
  } else if (!weightsFit) {
    nodesForKvCapacity = 0;
  } else {
    // Weights fit but no KV room even for tiny cache.
    nodesForKvCapacity = 0;
  }

  // --- C. Throughput (optional) ---
  let nodesForThroughput: number | null = null;
  let throughputStatus: 'ok' | 'insufficient_data' = 'insufficient_data';
  const decodeTokPerS = args.nodeDecodeTokPerS;
  const targetPerUser = args.workload.targetOutputTokPerSPerUser;
  if (
    decodeTokPerS != null &&
    decodeTokPerS > 0 &&
    targetPerUser != null &&
    targetPerUser > 0
  ) {
    throughputStatus = 'ok';
    const needTok = active * targetPerUser;
    nodesForThroughput = Math.max(1, Math.ceil(needTok / decodeTokPerS));
  }

  // --- D. Combine ---
  const availabilityReserve = Math.max(0, Math.round(args.workload.availabilityReserve ?? 0));
  const capacityNodes = Math.max(nodesForModelFit, nodesForKvCapacity, nodesForThroughput ?? 0);

  let kind: InferenceSizingResult['kind'];
  let nodeCount: number;
  let bottleneck: SizingBottleneck;

  if (!weightsFit || nodesForModelFit === 0) {
    kind = 'impossible';
    nodeCount = 1;
    bottleneck = 'impossible';
  } else if (nodesForKvCapacity === 0 && kvGiBTotal > 0.01) {
    kind = 'impossible';
    nodeCount = 1;
    bottleneck = 'kv_cache';
  } else {
    nodeCount = capacityNodes + availabilityReserve;
    kind = nodeCount > 1 ? 'replicas' : 'fits';
    if (nodesForThroughput != null && nodesForThroughput >= nodesForKvCapacity && nodesForThroughput > 1) {
      bottleneck = 'throughput';
    } else if (nodesForKvCapacity > nodesForModelFit) {
      bottleneck = 'kv_cache';
    } else if (nodeCount === 1) {
      bottleneck = 'none';
    } else {
      bottleneck = 'kv_cache';
    }
  }

  // Per-node KV after packing sessions across replicas.
  const nodesForPack = Math.max(1, kind === 'impossible' ? 1 : nodeCount - availabilityReserve);
  const tokensPerNode = Math.ceil(residentTokens / nodesForPack);
  const kvPerNodeGiB = (tokensPerNode * kvBytes * FRAGMENTATION_FACTOR) / 1024 ** 3;

  const perNode = buildMemoryBudget({
    rawVramGiB: rawVram,
    util,
    weightsGiB: weights.weightsMemoryGiB,
    kvGiB: kind === 'impossible' ? kvGiBTotal : kvPerNodeGiB,
    activationsGiB: activations,
    overheadGiB: overhead,
  });

  const totalGiB = roundGiB(perNode.modelRuntimeMemoryGiB + perNode.kvCacheGiB);
  const utilizationPct =
    perNode.usableVramGiB > 0
      ? Math.round((totalGiB / perNode.usableVramGiB) * 1000) / 10
      : null;

  const confidence: SizingConfidence =
    weights.confidence === 'measured' && kvSource === 'measured'
      ? 'measured'
      : weights.confidence === 'theoretical' || kvSource === 'fallback'
        ? 'theoretical'
        : 'estimated';

  // Fold fragmentation into overhead so parts sum to totalGiB.
  const vramParts = (
    [
      {id: 'weights' as const, gib: perNode.weightsGiB},
      {id: 'kv' as const, gib: perNode.kvCacheGiB},
      {id: 'activations' as const, gib: perNode.activationsGiB},
      {
        id: 'overhead' as const,
        gib: perNode.runtimeOverheadGiB + perNode.fragmentationGiB,
      },
    ] as const
  ).map((p) => ({
    id: p.id,
    label: PART_LABEL[p.id],
    gib: roundGiB(p.gib),
  }));

  const partsSum = vramParts.reduce((s, p) => s + p.gib, 0);
  const totalFromParts = roundGiB(partsSum);

  return {
    kind,
    nodeCount: kind === 'impossible' ? 1 : nodeCount,
    nodesForModelFit: nodesForModelFit || 0,
    nodesForKvCapacity,
    nodesForThroughput,
    nodesForAvailability: availabilityReserve,
    throughputStatus,
    bottleneck,
    confidence,
    weightFormat: weights.format,
    weightFormatLabel: formatLabel(weights.format),
    kvCacheDtype: kvDtype,
    weights,
    kvBytesPerToken: kvBytes,
    kvBytesPerTokenSource: kvSource,
    residentTokens,
    residentMode: mode,
    kvCapacityTokensPerNode,
    estimatedActiveConcurrency: active,
    perNode,
    vramParts,
    totalGiB: totalFromParts,
    capacityGiB: perNode.rawVramGiB > 0 ? perNode.rawVramGiB : null,
    utilizationPct:
      perNode.rawVramGiB > 0
        ? Math.round((totalFromParts / perNode.rawVramGiB) * 1000) / 10
        : utilizationPct,
    loadBand: loadBandForUtilization(
      perNode.rawVramGiB > 0
        ? Math.round((totalGiB / perNode.rawVramGiB) * 1000) / 10
        : utilizationPct,
    ),
    debug: {
      taskA_modelFit: {weightsFit, nodesForModelFit, modelRuntime: emptyKvBudget.modelRuntimeMemoryGiB, usable: emptyKvBudget.usableVramGiB},
      taskB_kv: {
        residentTokens,
        tokensPerNode,
        kvBytesPerToken: kvBytes,
        kvSource,
        kvGiBTotal: roundGiB(kvGiBTotal),
        kvPerNodeGiB: roundGiB(kvPerNodeGiB),
        kvCapacityTokensPerNode,
        nodesForKvCapacity,
        fragmentationFactor: FRAGMENTATION_FACTOR,
      },
      taskC_throughput: {status: throughputStatus, nodeDecodeTokPerS: decodeTokPerS ?? null, nodesForThroughput},
      taskD_sla: {sessions, active, availabilityReserve, requiredNodes: kind === 'impossible' ? null : nodeCount},
      weights: weights.debug,
      memoryBudget: perNode,
      note: 'active_parameters never used for weight bytes',
    },
  };
}

/** Bottleneck label for UI. */
export function bottleneckLabel(b: SizingBottleneck): string {
  switch (b) {
    case 'model_fit':
      return 'Ограничение: веса';
    case 'kv_cache':
      return 'Ограничение: KV cache';
    case 'throughput':
      return 'Ограничение: throughput';
    case 'impossible':
      return 'Не влезает';
    case 'none':
      return 'Запас по памяти';
  }
}

export function formatFreeOnNode(budget: MemoryBudget): string {
  const free = budget.freeReserveGiB;
  const pct =
    budget.usableVramGiB > 0
      ? Math.round((free / budget.usableVramGiB) * 1000) / 10
      : 0;
  const freeStr = free >= 100 ? free.toFixed(0) : free.toFixed(1);
  return `Свободно на ноду: ${freeStr} GiB / ${pct}%`;
}
