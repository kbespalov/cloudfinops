/**
 * Authoritative pricing engine.
 * Default resolutionMode=strict_pinned — never silently replace a missing meterId.
 */

import {amountNumber, catalog} from '@/lib/catalog';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {composeSolution} from './compose';
import type {
  PricedLine,
  PricedSolution,
  PricingResolutionMode,
  RequirementSpec,
  Solution,
  SolutionComponent,
  SolutionType,
} from './types';

export type PriceSolutionInput = {
  solution?: Solution;
  components?: Array<{
    id?: string;
    componentId?: string;
    meterId?: string;
    productId?: string;
    quantity: number;
    role?: string;
    estimatedMonthlyCostRub?: number | null;
    configuration?: Record<string, unknown>;
  }>;
  solutionType?: SolutionType;
  requirements?: RequirementSpec | Record<string, unknown>;
  provider?: string;
  resolutionMode?: PricingResolutionMode;
};

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function priceComponent(
  c: {
    id?: string;
    componentId?: string;
    meterId?: string;
    productId?: string;
    quantity: number;
    role?: string;
    estimatedMonthlyCostRub?: number | null;
  },
  mode: PricingResolutionMode,
): PricedLine {
  const componentId = c.componentId ?? c.id ?? c.role ?? 'unknown';
  const id = c.meterId ?? c.productId;
  const qty = Number.isFinite(c.quantity) && c.quantity > 0 ? c.quantity : 1;

  if (!id) {
    // Shape-only line: keep estimate only when allow_shape_resolution
    if (mode === 'allow_shape_resolution' && c.estimatedMonthlyCostRub != null) {
      return {
        componentId,
        quantity: qty,
        normalizedUnitPriceRub: round2(c.estimatedMonthlyCostRub / qty),
        normalizedMonthlyCostRub: round2(c.estimatedMonthlyCostRub),
        pricingBasis: {
          originalUnit: 'estimate',
          originalPrice: c.estimatedMonthlyCostRub,
          hoursPerMonth: 720,
        },
        resolution: 'shape_resolved',
      };
    }
    return {
      componentId,
      quantity: qty,
      normalizedUnitPriceRub: null,
      normalizedMonthlyCostRub: null,
      pricingBasis: {originalUnit: 'unknown', originalPrice: null},
      resolution: 'unpriced',
    };
  }

  const meter = catalog.meters.find((m) => m.id === id || m.sku === id);
  if (!meter) {
    return {
      componentId,
      meterId: id,
      quantity: qty,
      normalizedUnitPriceRub: null,
      normalizedMonthlyCostRub: null,
      pricingBasis: {originalUnit: 'missing', originalPrice: null},
      resolution: 'unpriced',
    };
  }

  const unit = amountNumber(meter, 'month');
  const monthly = unit != null ? round2(unit * qty) : null;
  return {
    componentId,
    meterId: meter.id,
    quantity: qty,
    normalizedUnitPriceRub: unit != null ? round2(unit) : null,
    normalizedMonthlyCostRub: monthly,
    pricingBasis: {
      originalUnit: meter.unitQuantity ?? 'month',
      originalPrice: unit,
      hoursPerMonth: 720,
      usageQuantity: qty,
    },
    resolution: meter.synthetic ? 'synthetic' : 'pinned',
  };
}

export function priceSolution(input: PriceSolutionInput): PricedSolution | {error: string} {
  const mode = input.resolutionMode ?? 'strict_pinned';

  let components = input.components;
  let solutionId = 'ad-hoc';
  let provider = input.provider ?? 'unknown';
  let providerName = provider;

  if (input.solution) {
    solutionId = input.solution.id;
    provider = input.solution.provider;
    providerName = input.solution.providerName;
    components = input.solution.components.map((c: SolutionComponent) => ({
      id: c.id,
      meterId: c.meterId,
      productId: c.productId ?? undefined,
      quantity: c.quantity,
      role: c.role,
      estimatedMonthlyCostRub: c.estimatedMonthlyCostRub,
    }));
  }

  if (!components?.length) {
    if (input.solutionType) {
      const composed = composeSolution({
        solutionType: input.solutionType,
        requirements: input.requirements,
        providers: input.provider ? [input.provider] : undefined,
        strategy: 'cheapest',
        maxSolutions: 1,
      });
      const sol = composed.solutions[0];
      if (!sol) return {error: 'Не удалось собрать решение для shape-resolve.'};
      return priceSolution({
        solution: sol,
        resolutionMode: 'allow_shape_resolution',
      }) as PricedSolution;
    }
    return {error: 'Укажи solution или components[] с meterId.'};
  }

  const lines = components.map((c) => priceComponent(c, mode));
  const unresolvedMeterIds = lines
    .filter((l) => l.resolution === 'unpriced' && l.meterId)
    .map((l) => l.meterId!) ;

  const monthly = lines.every((l) => l.normalizedMonthlyCostRub == null)
    ? null
    : round2(lines.reduce((s, l) => s + (l.normalizedMonthlyCostRub ?? 0), 0));

  const required = components.length;
  const priced = lines.filter((l) => l.normalizedMonthlyCostRub != null).length;

  return {
    solutionId,
    provider,
    providerName,
    lines,
    totals: {
      monthlyRubVatIncluded: monthly,
      annualRubVatIncluded: monthly != null ? round2(monthly * 12) : null,
    },
    completeness: {
      pricedRequiredComponents: priced,
      totalRequiredComponents: required,
      score: required ? Math.round((priced / required) * 100) / 100 : 0,
    },
    catalogAsOf: catalogAsOfIso(),
    unresolvedMeterIds: unresolvedMeterIds.length ? unresolvedMeterIds : undefined,
  };
}
