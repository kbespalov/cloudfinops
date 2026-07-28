/**
 * Chat tool: min/max general-compute shapes (vCPU+RAM, no GPU) per provider.
 * Not about cheapest ₽ — about smallest/largest orderable compute footprint.
 */

import {
  providerShapeLimits,
  type ProviderShapeLimits,
  type ShapeMode,
  type ShapePoint,
} from '@/lib/calculator/compute-shapes';
import {
  CALCULATOR_PROVIDER_IDS,
  CALCULATOR_PROVIDER_NAMES,
  type CalculatorProviderId,
} from '@/lib/calculator/quote-view';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';

export type ComputeShapeLimitsArgs = {
  /** Subset of provider ids. Default = all calculator providers. */
  providers?: string[];
};

export type ComputeShapeLimitsProviderRow = {
  providerId: string;
  provider: string;
  shapeMode: ShapeMode | null;
  min: ShapePoint | null;
  max: ShapePoint | null;
  platformMax: ShapePoint | null;
  envelopes: ProviderShapeLimits['envelopes'];
  publishedShapes: number | null;
  note?: string;
};

export type ComputeShapeLimitsResult = {
  ok: boolean;
  scope: 'general-compute';
  includesGpu: false;
  providers: ComputeShapeLimitsProviderRow[];
  catalogAsOf: string;
  note: string;
  error?: string;
};

function resolveProviders(raw?: string[]): CalculatorProviderId[] {
  if (!raw?.length) return [...CALCULATOR_PROVIDER_IDS];
  const out: CalculatorProviderId[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (!(CALCULATOR_PROVIDER_IDS as readonly string[]).includes(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as CalculatorProviderId);
  }
  return out.length ? out : [...CALCULATOR_PROVIDER_IDS];
}

/** Min/max CPU+RAM shapes for public general compute (no GPU). */
export function getComputeShapeLimits(args: ComputeShapeLimitsArgs = {}): ComputeShapeLimitsResult {
  const ids = resolveProviders(args.providers);
  const providers: ComputeShapeLimitsProviderRow[] = ids.map((providerId) => {
    const lim = providerShapeLimits(providerId);
    return {
      providerId,
      provider: CALCULATOR_PROVIDER_NAMES[providerId],
      shapeMode: lim.shapeMode,
      min: lim.min,
      max: lim.max,
      platformMax: lim.platformMax,
      envelopes: lim.envelopes,
      publishedShapes: lim.publishedShapes,
      note: lim.note,
    };
  });

  return {
    ok: true,
    scope: 'general-compute',
    includesGpu: false,
    providers,
    catalogAsOf: catalogAsOfIso(),
    note:
      'Общие ВМ (CPU+RAM), без GPU. min = наименьший вычислительный footprint в публичном каталоге ' +
      '(не самая дешёвая ВМ в ₽). max = наибольшая self-serve / published форма; если у провайдера note про ' +
      'объединение потолков — max не одна orderable пара (смотри envelopes/note). ' +
      'platformMax — жёсткий лимит гипервизора, часто через поддержку; указывай vCPU и RAM, если RAM>0. ' +
      'Цены сюда не входят — для ₽ используй get_quote.',
  };
}
