/**
 * Compare validated + priced solutions (self-contained payload).
 * Incomplete cheap solutions do not beat fully priced ones.
 */

import type {
  ComparisonMatrix,
  ComparisonRow,
  ComposeStrategy,
  PricedSolution,
  Solution,
  ValidationReport,
} from './types';

export type CompareInput = {
  /** Self-contained solutions (preferred). */
  solutions: Array<
    Solution & {
      priced?: PricedSolution;
      validation?: ValidationReport;
      /** Authoritative monthly total when already priced. */
      monthlyCostRub?: number | null;
      priceCompleteness?: number;
    }
  >;
  solutionIds?: string[];
  strategy?: ComposeStrategy;
  minCoverage?: number;
  minPriceCompleteness?: number;
  dimensions?: string[];
};

function isDominated(row: ComparisonRow, all: ComparisonRow[]): string[] {
  const dominatedBy: string[] = [];
  for (const other of all) {
    if (other.solutionId === row.solutionId || !other.eligible) continue;
    if (!row.eligible) continue;
    const priceBetterOrEq =
      other.monthlyCostRub != null &&
      row.monthlyCostRub != null &&
      other.monthlyCostRub <= row.monthlyCostRub;
    const covBetterOrEq = other.requirementCoverage >= row.requirementCoverage;
    const compBetterOrEq = other.priceCompleteness >= row.priceCompleteness;
    const strictlyBetter =
      (other.monthlyCostRub != null &&
        row.monthlyCostRub != null &&
        other.monthlyCostRub < row.monthlyCostRub) ||
      other.requirementCoverage > row.requirementCoverage ||
      other.priceCompleteness > row.priceCompleteness;
    if (priceBetterOrEq && covBetterOrEq && compBetterOrEq && strictlyBetter) {
      dominatedBy.push(other.solutionId);
    }
  }
  return dominatedBy;
}

export function compareSolutions(input: CompareInput): ComparisonMatrix {
  const minCoverage = input.minCoverage ?? 0.8;
  const minCompleteness = input.minPriceCompleteness ?? 0.8;
  let solutions = input.solutions ?? [];
  if (input.solutionIds?.length) {
    const want = new Set(input.solutionIds);
    solutions = solutions.filter((s) => want.has(s.id));
  }

  const comparison: ComparisonRow[] = solutions.map((s) => {
    const validationStatus = s.validation?.status ?? 'unknown';
    const coverage = s.coverage?.score ?? s.requirementsCoverage ?? 0;
    const completeness =
      s.priced?.completeness.score ??
      s.priceCompleteness ??
      (s.components?.length
        ? s.components.filter((c) => c.estimatedMonthlyCostRub != null).length /
          s.components.length
        : 0);
    const monthly =
      s.priced?.totals.monthlyRubVatIncluded ??
      s.monthlyCostRub ??
      s.estimatedMonthlyCostRub ??
      null;
    const unresolvedCount = Array.isArray(s.unresolved) ? s.unresolved.length : 0;
    const eligible =
      validationStatus !== 'invalid' &&
      coverage >= minCoverage &&
      completeness >= minCompleteness &&
      monthly != null;

    return {
      solutionId: s.id,
      provider: s.provider,
      providerName: s.providerName,
      monthlyCostRub: monthly,
      requirementCoverage: coverage,
      priceCompleteness: Math.round(completeness * 100) / 100,
      validationStatus,
      unresolvedCount,
      dominatedBySolutionIds: [],
      eligible,
    };
  });

  for (const row of comparison) {
    row.dominatedBySolutionIds = isDominated(row, comparison);
  }

  const paretoOptimalSolutionIds = comparison
    .filter((r) => r.eligible && r.dominatedBySolutionIds.length === 0)
    .map((r) => r.solutionId);

  const strategy = input.strategy ?? 'cheapest';
  let recommendedSolutionId: string | undefined;
  let recommendationReason: string | undefined;

  const eligible = comparison.filter((r) => r.eligible);
  if (eligible.length) {
    if (strategy === 'balanced') {
      const scored = eligible
        .map((r) => ({
          id: r.solutionId,
          score:
            r.requirementCoverage * 0.4 +
            r.priceCompleteness * 0.3 +
            (1 - Math.min(1, (r.monthlyCostRub ?? 0) / 1_000_000)) * 0.2 +
            (r.unresolvedCount === 0 ? 0.1 : 0),
        }))
        .sort((a, b) => b.score - a.score);
      recommendedSolutionId = scored[0]?.id;
      recommendationReason = 'balanced: coverage + completeness + price + unresolved';
    } else {
      const cheapest = eligible
        .slice()
        .sort((a, b) => (a.monthlyCostRub ?? 1e18) - (b.monthlyCostRub ?? 1e18));
      recommendedSolutionId = cheapest[0]?.solutionId;
      recommendationReason =
        'cheapest among valid solutions with coverage/completeness thresholds';
    }
  }

  comparison.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.monthlyCostRub == null && b.monthlyCostRub == null) return 0;
    if (a.monthlyCostRub == null) return 1;
    if (b.monthlyCostRub == null) return -1;
    return a.monthlyCostRub - b.monthlyCostRub;
  });

  return {
    comparison,
    paretoOptimalSolutionIds,
    recommendedSolutionId,
    recommendationReason,
    dimensions: input.dimensions?.length
      ? input.dimensions
      : ['price', 'requirementCoverage', 'priceCompleteness'],
  };
}
