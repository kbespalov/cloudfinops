/**
 * Concrete weight / checkpoint formats for the self-host inference calculator.
 * Never treat MoE active_parameters as the resident weight footprint.
 */

export type WeightFormatId =
  | 'bf16'
  | 'fp8'
  | 'nvfp4'
  | 'awq-int4'
  | 'gptq-int4'
  | 'int4'
  | 'int8';

export type KvCacheDtype = 'fp8' | 'bf16' | 'fp16';

export type WeightConfidence = 'measured' | 'estimated' | 'theoretical';

export type WeightCheckpointProfile = {
  format: WeightFormatId;
  /** On-disk checkpoint size (GiB), if known. */
  checkpointSizeGiB?: number;
  /**
   * Production resident weights in VRAM (GiB), including typical runtime
   * expansion for this format — preferred over naive params×bits.
   */
  weightsMemoryGiB: number;
  /** Naive total_params × bits/8 — lower bound only, never production. */
  theoreticalLowerBoundGiB?: number;
  effectiveBitsPerWeight?: number;
  quantizedComponents?: string;
  unquantizedComponents?: string;
  compatibleRuntimes?: string[];
  supportedGpuArch?: string[];
  qualityImpact?: string;
  source?: string;
  confidence: WeightConfidence;
};

/** Bits per parameter for naive theoretical bound (not production memory). */
export const NAIVE_BITS_PER_WEIGHT: Record<WeightFormatId, number> = {
  bf16: 16,
  fp8: 8,
  nvfp4: 4,
  'awq-int4': 4,
  'gptq-int4': 4,
  int4: 4,
  int8: 8,
};

export function bytesPerKvElement(dtype: KvCacheDtype): number {
  if (dtype === 'fp8') return 1;
  return 2; // bf16 / fp16
}

/** Map UI/API quant key → concrete format when model does not override. */
export function defaultFormatForDtype(dtype: string): WeightFormatId {
  const d = dtype.toLowerCase();
  if (d === 'bf16') return 'bf16';
  if (d === 'fp8') return 'fp8';
  if (d === 'int8') return 'int8';
  if (d === 'int4') return 'int4';
  if (d === 'nvfp4') return 'nvfp4';
  if (d === 'awq-int4' || d === 'awq') return 'awq-int4';
  if (d === 'gptq-int4' || d === 'gptq') return 'gptq-int4';
  return 'fp8';
}

export function formatLabel(format: WeightFormatId): string {
  switch (format) {
    case 'bf16':
      return 'BF16';
    case 'fp8':
      return 'FP8';
    case 'nvfp4':
      return 'NVFP4';
    case 'awq-int4':
      return 'AWQ INT4';
    case 'gptq-int4':
      return 'GPTQ INT4';
    case 'int4':
      return 'INT4';
    case 'int8':
      return 'INT8';
  }
}

/**
 * Naive raw weight bytes from *total* (resident) parameters — MoE must pass
 * full expert count, never active experts.
 */
export function naiveWeightGiB(totalParametersB: number, format: WeightFormatId): number {
  const bits = NAIVE_BITS_PER_WEIGHT[format];
  const bytes = totalParametersB * 1e9 * (bits / 8);
  return bytes / (1024 ** 3);
}

export type ResolvedWeights = {
  format: WeightFormatId;
  weightsMemoryGiB: number;
  checkpointSizeGiB: number | null;
  theoreticalLowerBoundGiB: number | null;
  effectiveBitsPerWeight: number | null;
  confidence: WeightConfidence;
  source: string | null;
  /** True when value came from checkpoint profile, not naive formula. */
  fromCheckpoint: boolean;
  debug: Record<string, number | string | boolean | null>;
};

export type WeightVariantLike = {
  dtype: string;
  weightsVramGiB: number;
  weightFormat?: WeightFormatId;
  checkpointSizeGiB?: number;
  theoreticalLowerBoundGiB?: number;
  effectiveBitsPerWeight?: number;
  confidence?: WeightConfidence;
  source?: string;
  quantizedComponents?: string;
  unquantizedComponents?: string;
};

/**
 * Resolve production weight memory for a model/quant.
 * Prefers checkpoint profile fields; falls back to curated weightsVramGiB;
 * last resort naive total_params × bits (marked theoretical).
 */
export function resolveWeightsMemory(args: {
  variant: WeightVariantLike;
  /** Total resident parameters (billions). MoE = all experts. */
  totalParametersB?: number | null;
  /** Never used for weight size — accepted only to assert callers don't pass it by mistake. */
  activeParameterCountB?: number | null;
}): ResolvedWeights {
  const format = args.variant.weightFormat ?? defaultFormatForDtype(args.variant.dtype);
  const theoretical =
    args.totalParametersB != null && args.totalParametersB > 0
      ? roundGiB(naiveWeightGiB(args.totalParametersB, format))
      : args.variant.theoreticalLowerBoundGiB != null
        ? roundGiB(args.variant.theoreticalLowerBoundGiB)
        : null;

  const curated = args.variant.weightsVramGiB;
  const hasCheckpointHint =
    args.variant.checkpointSizeGiB != null ||
    args.variant.confidence != null ||
    args.variant.weightFormat != null;

  // Production memory: curated weightsVramGiB is the checkpoint-backed estimate
  // when present (KB authors must set NVFP4/INT4 far below FP8 for MoE).
  if (Number.isFinite(curated) && curated > 0) {
    const confidence = args.variant.confidence ?? (hasCheckpointHint ? 'estimated' : 'estimated');
    return {
      format,
      weightsMemoryGiB: roundGiB(curated),
      checkpointSizeGiB:
        args.variant.checkpointSizeGiB != null ? roundGiB(args.variant.checkpointSizeGiB) : null,
      theoreticalLowerBoundGiB: theoretical,
      effectiveBitsPerWeight:
        args.variant.effectiveBitsPerWeight ?? NAIVE_BITS_PER_WEIGHT[format],
      confidence,
      source: args.variant.source ?? null,
      fromCheckpoint: hasCheckpointHint || confidence !== 'theoretical',
      debug: {
        totalParametersB: args.totalParametersB ?? null,
        activeParameterCountBIgnored: args.activeParameterCountB ?? null,
        curatedWeightsVramGiB: curated,
        format,
        usedActiveParamsForWeights: false,
      },
    };
  }

  if (theoretical != null) {
    return {
      format,
      weightsMemoryGiB: theoretical,
      checkpointSizeGiB: null,
      theoreticalLowerBoundGiB: theoretical,
      effectiveBitsPerWeight: NAIVE_BITS_PER_WEIGHT[format],
      confidence: 'theoretical',
      source: 'naive total_parameters × bits/8',
      fromCheckpoint: false,
      debug: {
        totalParametersB: args.totalParametersB ?? null,
        naiveGiB: theoretical,
        format,
        usedActiveParamsForWeights: false,
      },
    };
  }

  return {
    format,
    weightsMemoryGiB: 0,
    checkpointSizeGiB: null,
    theoreticalLowerBoundGiB: null,
    effectiveBitsPerWeight: NAIVE_BITS_PER_WEIGHT[format],
    confidence: 'theoretical',
    source: null,
    fromCheckpoint: false,
    debug: {error: 'no weights data'},
  };
}

function roundGiB(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}
