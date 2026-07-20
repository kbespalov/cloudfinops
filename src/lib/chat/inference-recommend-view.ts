/**
 * Client-safe types + helpers for the Self-host LLM calculator.
 * Keep free of catalog/quote/embeddings — those pull node:fs into the browser bundle.
 */

import type {InferenceDtype} from '@/data/inference-models';

export type InferenceConfigQuote = {
  provider: string;
  totalMonth: number | null;
  scope: string;
  note?: string | null;
};

export type InferenceConfigRow = {
  gpuFamily: string;
  gpuCount: number;
  quant: InferenceDtype;
  interconnect?: string;
  estimatedVramGiB: number;
  notes?: string;
  /** Short RU rationale for this recipe (for the assistant to surface). */
  why: string;
  assumedHost: string | null;
  /** Structured host for calculator quoting (null when unknown). */
  host: {
    vcpu: number;
    ramGiB: number;
    diskGiB: number;
    /** GPU-only tariff — vCPU/RAM billed separately. */
    unitOnly: boolean;
    /** Dedicated / HGX node (e.g. Selectel B300) — quote without host composition. */
    dedicated: boolean;
    /** Per-card VRAM (GiB) — disambiguates H100 80GB vs 94GB flavors. */
    gpuMemoryGb?: number | null;
  } | null;
  best: {provider: string; totalMonth: number | null} | null;
  quotes: InferenceConfigQuote[];
};

export type InferenceRecommendResult = {
  ok: boolean;
  notFound?: boolean;
  model?: {
    id: string;
    displayName: string;
    arch: string;
    parameterCountB?: number;
    activeParameterCountB?: number;
    parameterCountNote?: string;
    deployment: 'self-host' | 'api-only' | 'weights-pending';
    confidence: string;
    contextDefault: number;
  };
  selectedQuant?: InferenceDtype | 'mixed';
  primaryRecommendation?: {
    gpuFamily: string;
    gpuCount: number;
    quant: InferenceDtype;
    bestProvider: string | null;
    bestMonth: number | null;
    why: string;
  } | null;
  configs?: InferenceConfigRow[];
  /** Instruction for the LLM final answer shape. */
  answerHint?: string;
  hostedAlternative?: {
    query: string;
    providersMatched: {
      provider: string;
      offerings: number;
      cheapestMonth: number | null;
      label: string | null;
      /** ₽ / 1M input tokens when separable from output. */
      inputMonth: number | null;
      /** ₽ / 1M output tokens when separable. */
      outputMonth: number | null;
    }[];
    note: string;
  };
  caveats?: string[];
  disclaimer?: string;
  error?: string;
};

/** First config with a RU catalog quote; falls back to 0 when none are priced. */
export function defaultPricedConfigIndex(
  configs: Array<{best?: {totalMonth: number | null} | null}>,
): number {
  const idx = configs.findIndex((c) => c.best?.totalMonth != null);
  return idx >= 0 ? idx : 0;
}
