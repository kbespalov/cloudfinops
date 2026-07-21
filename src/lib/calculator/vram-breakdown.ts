/**
 * Additive inference VRAM model:
 *   Total = Weights + KV_cache + Activations + Overhead
 *
 * Weights and overhead are ≈ constant for a model/quant (full MoE experts).
 * KV scales with concurrent live sequences × (avgContext / contextDefault).
 * Max context is a ceiling label — not “every sequence is always max”.
 * Activations scale with engine batch (default 1; not “online users”).
 *
 * `recipeTotalGiB` is the light-load anchor at contextDefault (1 sequence).
 * Catalog row estimates that are just host capacity must not be used as the
 * recipe — pass a canonical model recipe (usually the densest recommended node).
 */

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
  /** Effective context used for KV (avg live), tokens. */
  contextTokens: number;
  avgContextTokens: number;
  maxContextTokens: number;
  batchSize: number;
  /** Concurrent live sequences (prefill/decode), not registered users. */
  concurrentUsers: number;
  quant: string;
};

const PART_LABEL: Record<VramPartId, string> = {
  weights: 'Веса модели',
  kv: 'KV-кэш',
  activations: 'Активации',
  overhead: 'Оверхед',
};

/**
 * Activations ≈ 0.42% of weights at batch=1 (calibrated to ~2.9 GiB on ~685 GiB
 * FP8 checkpoints). Hard-capped so cluster-sizing slack in fat MoE recipes
 * does not land in activations.
 */
const ACT_WEIGHT_FRAC = 0.0042;
const ACT_REF_MAX_GIB = 48;

/** Per-card VRAM defaults when the catalog host omits gpuMemoryGb. */
export function defaultGpuMemoryGiB(family: string): number | null {
  const f = family.trim().toUpperCase();
  if (f === 'H200') return 141;
  if (f === 'H100') return 80;
  if (f === 'A100') return 80;
  if (f === 'A10') return 24;
  if (f === 'L40S') return 48;
  if (f === 'L40') return 48;
  if (f === 'L4') return 24;
  if (f === 'B300') return 288;
  if (f === 'B200') return 192;
  if (f.includes('6000')) return 96;
  if (f.includes('4090')) return 24;
  return null;
}

function roundGiB(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Common GPU VRAM SKUs. Catalog rows often store these as lazy "fits on this
 * card" markers — not measured model need. Using them as recipeTotal makes
 * every config show «N из N GiB» / Впритык.
 */
const HOST_SKU_GIB = new Set([
  16, 24, 40, 48, 80, 96, 141, 160, 180, 192, 288, 282, 320, 384, 564, 576, 640,
  1128, 1152, 2304,
]);

/**
 * Physics floor for light-load need (batch=1, users=1) when the catalog only
 * has host-capacity markers. KV scales gently with contextDefault.
 */
export function estimateLightLoadRecipeGiB(
  weightsGiB: number,
  contextDefault = 32_768,
): number {
  const weights = Math.max(0, weightsGiB);
  const overhead = estimateOverheadGiB(weights);
  const act = clamp(weights * ACT_WEIGHT_FRAC, 0.5, ACT_REF_MAX_GIB);
  const ctxScale = Math.max(1_024, contextDefault) / 32_768;
  const kv = clamp(weights * 0.025 * ctxScale, 0.75, Math.max(8, weights * 0.18));
  return roundGiB(weights + overhead + act + kv);
}

/** True when estimate looks like "fits on this GPU SKU", not engineered need. */
export function looksLikeHostSkuCapacity(estimate: number, weightsGiB: number): boolean {
  if (!Number.isFinite(estimate) || estimate <= 0) return false;
  const n = Math.round(estimate);
  if (!HOST_SKU_GIB.has(n)) return false;
  const weights = Math.max(0, weightsGiB);
  const margin = estimate - weights;
  if (margin < 0) return false;
  // Thin fit: 38→48, 70→80 — "rounded up to the card".
  if (margin <= Math.max(12, weights * 0.22)) return true;
  // Fat overshoot on a node SKU: 1400→2304 (8×B300) — host capacity, not model need.
  // Keep modest engineered headroom (95→141, 52→80) as real recipes.
  if (margin >= Math.max(200, weights * 0.45)) return true;
  return false;
}

/**
 * Canonical light-load VRAM for a quant.
 * Prefer the tightest *engineered* catalog recipe that still covers weights.
 * Ignore sub-weight rows and host-SKU markers (24/48/80/…) — those are capacity
 * hints, not model need. Fall back to a weights-based floor.
 */
export function canonicalRecipeTotalGiB(
  weightsGiB: number,
  estimatedVramGiBList: number[],
  contextDefault = 32_768,
): number {
  const weights = Math.max(0, weightsGiB);
  const floor = estimateLightLoadRecipeGiB(weights, contextDefault);
  const adequate: number[] = [];
  let peak = 0;
  for (const n of estimatedVramGiBList) {
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > peak) peak = n;
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

/** «141 из 160 GiB» — need vs host capacity. */
export function formatVramUsage(totalGiB: number, capacityGiB: number | null | undefined): string {
  const used =
    totalGiB >= 100 ? String(Math.round(totalGiB * 10) / 10) : String(Math.round(totalGiB * 100) / 100);
  if (capacityGiB == null || !Number.isFinite(capacityGiB) || capacityGiB <= 0) {
    return `${used} GiB`;
  }
  const cap =
    capacityGiB >= 100
      ? String(Math.round(capacityGiB * 10) / 10)
      : String(Math.round(capacityGiB * 100) / 100);
  return `${used} из ${cap} GiB`;
}

/**
 * Fixed runtime overhead (CUDA/framework). Scales gently with model size,
 * matching ~10 GB on ~670B-class FP8 checkpoints.
 */
export function estimateOverheadGiB(weightsGiB: number): number {
  return roundGiB(clamp(2 + weightsGiB * 0.012, 2, 14));
}

export function buildVramBreakdown(args: {
  weightsGiB: number;
  /** Recipe total at light load (batch≈1, 1 sequence, context≈contextDefault). */
  recipeTotalGiB: number;
  /** Context length that the recipe headroom assumes. */
  contextDefault: number;
  batchSize?: number;
  /** Concurrent live sequences (not registered / online users). */
  concurrentUsers?: number;
  /** @deprecated Prefer avgContextTokens — kept as alias for avg. */
  contextTokens?: number;
  /** Mean live context across concurrent sequences (drives KV). */
  avgContextTokens?: number;
  /** Max context ceiling (display / hard cap); does not assume every seq is max. */
  maxContextTokens?: number;
  quant: string;
  gpuCount: number;
  gpuFamily: string;
  gpuMemoryGb?: number | null;
}): VramBreakdown {
  const weights = Math.max(0, args.weightsGiB);
  const batchSize = Math.max(1, Math.round(args.batchSize ?? 1));
  const concurrentUsers = Math.max(1, Math.round(args.concurrentUsers ?? 1));
  const contextDefault = Math.max(1_024, args.contextDefault || 32_768);
  const maxContextTokens = Math.max(
    1_024,
    args.maxContextTokens || args.contextTokens || contextDefault,
  );
  const avgContextTokens = Math.max(
    1_024,
    Math.min(
      maxContextTokens,
      args.avgContextTokens ?? args.contextTokens ?? Math.min(32_768, maxContextTokens),
    ),
  );

  const overheadTarget = estimateOverheadGiB(weights);
  const actRefTarget = clamp(weights * ACT_WEIGHT_FRAC, 0.5, ACT_REF_MAX_GIB);

  // Never treat a sub-weight catalog capacity as the recipe (would invent
  // fake runtime on top of full weights).
  const recipeTotal = Math.max(weights + overheadTarget + actRefTarget, args.recipeTotalGiB || 0);
  const surplus = Math.max(0, recipeTotal - weights);

  let overhead: number;
  let kvRef: number;
  let actRef: number;

  if (surplus >= overheadTarget + actRefTarget) {
    // Room for real overhead + activations; remainder at contextDefault is KV.
    overhead = overheadTarget;
    actRef = actRefTarget;
    kvRef = surplus - overhead - actRef;
  } else {
    // Tight recipe (e.g. ~700 GiB on ~685 GiB weights): split surplus.
    overhead = Math.min(overheadTarget, surplus * 0.45);
    const rest = Math.max(0, surplus - overhead);
    // Prefer a bit more activations than KV at short default context (R1-like).
    actRef = Math.min(actRefTarget, rest * 0.56);
    kvRef = Math.max(0, rest - actRef);
  }

  // Live KV uses average context — not “every sequence at max”.
  const ctxScale = avgContextTokens / contextDefault;
  const kv = kvRef * batchSize * concurrentUsers * ctxScale;
  const activations = actRef * batchSize;
  const totalGiB = roundGiB(weights + kv + activations + overhead);

  const parts: VramPart[] = (
    [
      {id: 'weights' as const, gib: weights},
      {id: 'kv' as const, gib: kv},
      {id: 'activations' as const, gib: activations},
      {id: 'overhead' as const, gib: overhead},
    ] as const
  ).map((p) => ({
    id: p.id,
    label: PART_LABEL[p.id],
    gib: roundGiB(p.gib),
  }));

  // Absorb rounding drift into KV so weights/overhead stay stable across batch.
  const partsSum = parts.reduce((s, p) => s + p.gib, 0);
  const drift = roundGiB(totalGiB - partsSum);
  if (Math.abs(drift) >= 0.05) {
    const kvPart = parts.find((p) => p.id === 'kv');
    if (kvPart) kvPart.gib = roundGiB(Math.max(0, kvPart.gib + drift));
  }

  const perCard =
    args.gpuMemoryGb != null && Number.isFinite(args.gpuMemoryGb) && args.gpuMemoryGb > 0
      ? args.gpuMemoryGb
      : defaultGpuMemoryGiB(args.gpuFamily);
  const capacityGiB =
    perCard != null && args.gpuCount > 0 ? roundGiB(perCard * args.gpuCount) : null;
  const utilizationPct =
    capacityGiB != null && capacityGiB > 0
      ? Math.round((totalGiB / capacityGiB) * 1000) / 10
      : null;

  return {
    parts,
    totalGiB,
    capacityGiB,
    utilizationPct,
    loadBand: loadBandForUtilization(utilizationPct),
    contextTokens: avgContextTokens,
    avgContextTokens,
    maxContextTokens,
    batchSize,
    concurrentUsers,
    quant: args.quant,
  };
}

/**
 * Hard gate: full model weights must fit on the node.
 * Runtime/KV are checked separately — do not add overhead here or exact
 * card fits (48 GiB weights on L40S 48) get falsely rejected.
 */
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
  const capacity = perCard * args.gpuCount;
  return args.weightsGiB <= capacity * 1.005;
}

/**
 * How to serve concurrent *sequences* on a GPU node (1 card or NVLink shelf).
 *
 * One model replica = one node. Extra live sequences that blow KV need more
 * independent replicas — not tensor-parallel across nodes (no IB assumed).
 * If weights alone do not fit the node, replicas cannot help (`impossible`).
 * Replica count here is memory-bound only (no tok/s SLA benchmark).
 */
export type InferenceNodePlan = {
  kind: 'fits' | 'replicas' | 'impossible';
  nodeCount: number;
  maxUsersPerNode: number;
  usersPerNode: number;
  requestedUsers: number;
  /** One replica at the balanced usersPerNode (bands / bar). */
  perNode: VramBreakdown;
};

export type BuildVramArgs = Parameters<typeof buildVramBreakdown>[0];

function partGiB(b: VramBreakdown, id: VramPartId): number {
  return b.parts.find((p) => p.id === id)?.gib ?? 0;
}

/** RU plural: 1 нода, 2 ноды, 5 нод. */
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
 * Pack concurrent live sequences onto replica nodes of the given GPU shape.
 * `args.concurrentUsers` = concurrent requests/sequences (not registered users).
 */
export function planInferenceNodes(args: BuildVramArgs): InferenceNodePlan {
  const requestedUsers = Math.max(1, Math.round(args.concurrentUsers ?? 1));
  const weightsFit = nodeFitsModelWeights({
    weightsGiB: args.weightsGiB,
    gpuCount: args.gpuCount,
    gpuFamily: args.gpuFamily,
    gpuMemoryGb: args.gpuMemoryGb,
  });
  const base = buildVramBreakdown({...args, concurrentUsers: 1});
  const capacity = base.capacityGiB;

  if (!weightsFit || (capacity != null && partGiB(base, 'weights') > capacity)) {
    return {
      kind: 'impossible',
      nodeCount: 1,
      maxUsersPerNode: 0,
      usersPerNode: 1,
      requestedUsers,
      perNode: base,
    };
  }

  if (capacity == null || capacity <= 0) {
    const full = buildVramBreakdown({...args, concurrentUsers: requestedUsers});
    return {
      kind: 'fits',
      nodeCount: 1,
      maxUsersPerNode: requestedUsers,
      usersPerNode: requestedUsers,
      requestedUsers,
      perNode: full,
    };
  }

  // One live sequence at avg context must fit (weights + runtime + its KV).
  if (base.totalGiB > capacity) {
    return {
      kind: 'impossible',
      nodeCount: 1,
      maxUsersPerNode: 0,
      usersPerNode: 1,
      requestedUsers,
      perNode: base,
    };
  }

  const fixed =
    partGiB(base, 'weights') + partGiB(base, 'overhead') + partGiB(base, 'activations');
  const kvPerSeq = partGiB(base, 'kv');

  let maxUsersPerNode = 1;
  if (kvPerSeq <= 0.001) {
    maxUsersPerNode = requestedUsers;
  } else {
    const slack = Math.max(0, capacity - fixed);
    // Do NOT force ≥1 when slack < one sequence's KV — that case is impossible above.
    maxUsersPerNode = Math.max(1, Math.floor((slack + 1e-9) / kvPerSeq));
    while (maxUsersPerNode > 1) {
      const probe = buildVramBreakdown({...args, concurrentUsers: maxUsersPerNode});
      if ((probe.totalGiB ?? 0) <= capacity) break;
      maxUsersPerNode -= 1;
    }
  }

  if (requestedUsers <= maxUsersPerNode) {
    const perNode = buildVramBreakdown({...args, concurrentUsers: requestedUsers});
    return {
      kind: 'fits',
      nodeCount: 1,
      maxUsersPerNode,
      usersPerNode: requestedUsers,
      requestedUsers,
      perNode,
    };
  }

  const nodeCount = Math.max(1, Math.ceil(requestedUsers / maxUsersPerNode));
  const usersPerNode = Math.ceil(requestedUsers / nodeCount);
  const perNode = buildVramBreakdown({...args, concurrentUsers: usersPerNode});

  return {
    kind: 'replicas',
    nodeCount,
    maxUsersPerNode,
    usersPerNode,
    requestedUsers,
    perNode,
  };
}

/** Cool mono steps — keep brand/warning orange off data charts. */
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
