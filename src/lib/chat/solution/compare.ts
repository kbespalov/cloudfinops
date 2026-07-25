/**
 * Structured multi-solution comparison (matrix + Pareto), not free-text.
 */

import type {ComparisonMatrix, ComparisonRow, Solution} from './types';

export type CompareInput = {
  solutions: Solution[];
  solutionIds?: string[];
  dimensions?: Array<
    'price' | 'performance' | 'availability' | 'vendor_lock_in' | 'operational_complexity'
  >;
  weights?: Record<string, number>;
};

function isParetoOptimal(row: ComparisonRow, all: ComparisonRow[]): boolean {
  // Minimize price (null = dominated), maximize coverage & completeness.
  for (const other of all) {
    if (other.solutionId === row.solutionId) continue;
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
      return false;
    }
    // Null price is dominated by any priced solution with equal/better coverage.
    if (
      row.monthlyCostRub == null &&
      other.monthlyCostRub != null &&
      other.requirementCoverage >= row.requirementCoverage
    ) {
      return false;
    }
  }
  return true;
}

export function compareSolutions(input: CompareInput): ComparisonMatrix {
  let solutions = input.solutions ?? [];
  if (input.solutionIds?.length) {
    const want = new Set(input.solutionIds);
    solutions = solutions.filter((s) => want.has(s.id));
  }

  const dimensions = (input.dimensions?.length
    ? input.dimensions
    : ['price', 'performance']) as string[];

  // weights reserved for future scoring; MVP uses Pareto on price/coverage/completeness
  void input.weights;

  const comparison: ComparisonRow[] = solutions.map((s) => ({
    solutionId: s.id,
    provider: s.provider,
    providerName: s.providerName,
    monthlyCostRub: s.monthlyCostRub,
    requirementCoverage: s.requirementsCoverage,
    priceCompleteness: s.priceCompleteness,
    status: s.status,
  }));

  comparison.sort((a, b) => {
    if (a.monthlyCostRub == null && b.monthlyCostRub == null) return 0;
    if (a.monthlyCostRub == null) return 1;
    if (b.monthlyCostRub == null) return -1;
    return a.monthlyCostRub - b.monthlyCostRub;
  });

  const paretoOptimalSolutionIds = comparison
    .filter((row) => isParetoOptimal(row, comparison))
    .map((r) => r.solutionId);

  return {
    comparison,
    paretoOptimalSolutionIds,
    dimensions,
  };
}
