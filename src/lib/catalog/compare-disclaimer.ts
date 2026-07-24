import {catalog, formatAsOf} from '@/lib/catalog';

/** Catalog snapshot date (from prices/index.yaml → catalog.asOf). */
export function catalogAsOfIso(): string {
  return catalog.asOf;
}

export function catalogAsOfLabel(): string {
  return formatAsOf(catalog.asOf);
}

/** Short scope line for UI tooltips and SEO. */
export function catalogCompareScopeHint(): string {
  return (
    `Для выбранной конфигурации среди предложений, доступных в каталоге Cloud FinOps ` +
    `на ${catalogAsOfLabel()}. Расчёт по публичным тарифам без индивидуальных скидок и промоакций.`
  );
}

/**
 * Verbal conclusion for chat / fast-path tables.
 * Always binds the minimum to catalog scope + asOf; marks derived/synthetic winners.
 */
export function cheapestInCatalogLine(args: {
  provider: string;
  priceText: string;
  /**
   * Winner is a synthetic/lattice catalog row (not a published price-list line).
   * Distinct from `composed`, which is a sum of published unit rates.
   */
  derived?: boolean;
  /** Winner total is composed from published unit rates (e.g. GPU + host). */
  composed?: boolean;
  /** Extra detail after provider name, e.g. " (Basic SSD)". */
  detail?: string;
}): string {
  const detail = args.detail?.trim() ? args.detail : '';
  const mark = args.derived
    ? ' (оценка Cloud FinOps, не строка прайса провайдера)'
    : args.composed
      ? ' (составная цена из публичных unit-ставок)'
      : '';
  return (
    `Минимальная цена в каталоге Cloud FinOps на ${catalogAsOfLabel()}${mark}: ` +
    `**${args.provider}**${detail} — ${args.priceText}. ` +
    `Среди публичных тарифов в выборке; без промо и индивидуальных скидок.`
  );
}
