/**
 * Price a BOM of pinned meters (or fall back to shape resolve via compose).
 */

import {amountNumber, catalog} from '@/lib/catalog';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {composeSolution} from './compose';
import type {RequirementSpec, SolutionComponent, SolutionType} from './types';

export type PriceLine = {
  productId?: string;
  meterId?: string;
  quantity: number;
  role?: string;
  configuration?: Record<string, unknown>;
};

export type PriceSolutionInput = {
  components: PriceLine[];
  /** When lines lack meterIds, resolve via compose recipe. */
  solutionType?: SolutionType;
  requirements?: RequirementSpec;
  provider?: string;
};

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pricePinned(lines: PriceLine[]): {
  components: SolutionComponent[];
  unresolved: string[];
} {
  const components: SolutionComponent[] = [];
  const unresolved: string[] = [];
  for (const line of lines) {
    const id = line.meterId ?? line.productId;
    if (!id) {
      unresolved.push(line.role ?? 'unknown');
      continue;
    }
    const meter = catalog.meters.find((m) => m.id === id || m.sku === id);
    if (!meter) {
      unresolved.push(id);
      components.push({
        role: line.role ?? 'unknown',
        productId: id,
        meterId: id,
        title: id,
        quantity: line.quantity,
        monthlyCostRub: null,
        configuration: line.configuration,
      });
      continue;
    }
    const unit = amountNumber(meter, 'month');
    const qty = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
    components.push({
      role: line.role ?? meter.categoryKey,
      productId: meter.id,
      meterId: meter.id,
      title: meter.name,
      quantity: qty,
      unit: meter.unitQuantity ?? undefined,
      monthlyCostRub: unit != null ? round2(unit * qty) : null,
      synthetic: Boolean(meter.synthetic),
      configuration: line.configuration,
    });
  }
  return {components, unresolved};
}

export function priceSolution(input: PriceSolutionInput): unknown {
  if (input.components?.length) {
    const {components, unresolved} = pricePinned(input.components);
    const total = round2(
      components.reduce((s, c) => s + (c.monthlyCostRub ?? 0), 0),
    );
    const priced = components.filter((c) => c.monthlyCostRub != null).length;
    return {
      currency: 'RUB',
      vatIncluded: true,
      catalogAsOf: catalogAsOfIso(),
      period: 'month',
      periodNote: 'месяц = 720 ч',
      monthlyCostRub: total,
      priceCompleteness: components.length
        ? Math.round((priced / components.length) * 100) / 100
        : 0,
      components,
      unresolved,
      note: 'Цены из каталога по meterId × quantity. Не пересчитывай арифметику модели.',
    };
  }

  // Shape resolve fallback.
  if (input.solutionType) {
    const composed = composeSolution({
      solutionType: input.solutionType,
      requirements: input.requirements,
      providers: input.provider ? [input.provider] : undefined,
      strategy: 'cheapest',
      maxSolutions: 1,
    });
    const sol = composed.solutions[0];
    if (!sol) {
      return {error: 'Не удалось собрать и оценить решение по requirements.'};
    }
    return {
      currency: 'RUB',
      vatIncluded: true,
      catalogAsOf: catalogAsOfIso(),
      period: 'month',
      periodNote: 'месяц = 720 ч',
      solutionId: sol.id,
      provider: sol.provider,
      providerName: sol.providerName,
      monthlyCostRub: sol.monthlyCostRub,
      priceCompleteness: sol.priceCompleteness,
      components: sol.components,
      unresolved: sol.unresolved,
      assumptions: sol.assumptions,
      note: 'Оценка через compose_solution (shape-resolve), не pinned SKU.',
    };
  }

  return {error: 'Укажи components[] с meterId или solutionType+requirements.'};
}
