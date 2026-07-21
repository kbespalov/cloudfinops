/**
 * Additive inference VRAM model:
 *   Total = Weights + KV_cache + Activations + Overhead
 *
 * Weights and overhead are ≈ constant for a model/quant.
 * KV scales with batch × concurrent users × (context / contextDefault).
 * Activations scale with batch only.
 *
 * `recipeTotalGiB` is the light-load anchor at contextDefault (batch=1, users=1).
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
  contextTokens: number;
  batchSize: number;
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
 * Canonical light-load VRAM for a quant.
 * Prefer the tightest catalog recipe that still covers weights (min of adequate).
 * Ignore sub-weight rows — those are host capacity, not model need.
 */
export function canonicalRecipeTotalGiB(
  weightsGiB: number,
  estimatedVramGiBList: number[],
): number {
  const weights = Math.max(0, weightsGiB);
  const adequate: number[] = [];
  let peak = 0;
  for (const n of estimatedVramGiBList) {
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n > peak) peak = n;
    if (n >= weights) adequate.push(n);
  }
  if (adequate.length) return Math.min(...adequate);
  return Math.max(weights, peak);
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
  /** Recipe total at light load (batch≈1, users≈1, context≈contextDefault). */
  recipeTotalGiB: number;
  /** Context length that the recipe headroom assumes. */
  contextDefault: number;
  batchSize?: number;
  concurrentUsers?: number;
  contextTokens?: number;
  quant: string;
  gpuCount: number;
  gpuFamily: string;
  gpuMemoryGb?: number | null;
}): VramBreakdown {
  const weights = Math.max(0, args.weightsGiB);
  const batchSize = Math.max(1, Math.round(args.batchSize ?? 1));
  const concurrentUsers = Math.max(1, Math.round(args.concurrentUsers ?? 1));
  const contextDefault = Math.max(1_024, args.contextDefault || 32_768);
  const contextTokens = Math.max(1_024, args.contextTokens || contextDefault);

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

  const ctxScale = contextTokens / contextDefault;
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
    contextTokens,
    batchSize,
    concurrentUsers,
    quant: args.quant,
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
