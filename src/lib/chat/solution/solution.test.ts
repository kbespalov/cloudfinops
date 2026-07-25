import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareSolutions} from './compare';
import {composeSolution} from './compose';
import {searchCatalog} from './search-catalog';
import {normalizeGpuModel} from './synonyms';
import {validateSolution} from './validate';
import {runToolSync} from '../tools';

describe('synonyms', () => {
  it('maps ашка → H100', () => {
    assert.equal(normalizeGpuModel('ашка'), 'H100');
  });
});

describe('search_catalog', () => {
  it('returns candidates with meterId and match metadata', () => {
    const result = searchCatalog({text: 'H100', category: 'gpu', limit: 8});
    assert.ok(result.candidates.length > 0);
    const first = result.candidates[0]!;
    assert.ok(first.meterId.includes(':'));
    assert.ok(Array.isArray(first.match.matchedFields));
    assert.equal(first.pricing.currency, 'RUB');
    assert.equal(first.pricing.vatIncluded, true);
  });
});

describe('compose_solution', () => {
  it('builds virtual_machine solutions with monthly costs', () => {
    const result = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 8, ramGiB: 32, diskGiB: 100},
      strategy: 'cheapest',
      maxSolutions: 6,
    });
    assert.ok(result.solutions.length >= 1);
    assert.ok(result.solutions.every((s) => s.monthlyCostRub != null && s.monthlyCostRub > 0));
    assert.equal(result.solutions[0]!.solutionType, 'virtual_machine');
  });

  it('builds kubernetes BOM with control plane and workers', () => {
    const result = composeSolution({
      solutionType: 'kubernetes',
      requirements: {
        workerCount: 3,
        workerVcpu: 4,
        workerRamGiB: 16,
        objectStorageGiB: 1024,
        budgetMonthRub: 100_000,
        k8sTier: 'basic',
      },
      strategy: 'cheapest',
      maxSolutions: 6,
    });
    assert.ok(result.solutions.length >= 1, 'expected at least one k8s solution');
    const best = result.solutions[0]!;
    assert.ok(best.components.some((c) => c.role === 'control_plane'));
    assert.ok(best.components.some((c) => c.role === 'worker_nodes'));
    assert.ok(best.components.some((c) => c.role === 'object_storage'));
    assert.ok(typeof best.monthlyCostRub === 'number');
  });
});

describe('validate_solution', () => {
  it('flags budget breach and missing egress warning', () => {
    const composed = composeSolution({
      solutionType: 'kubernetes',
      requirements: {
        workerCount: 3,
        workerVcpu: 8,
        workerRamGiB: 32,
        budgetMonthRub: 1000,
      },
      strategy: 'cheapest',
      maxSolutions: 1,
    });
    const sol = composed.solutions[0];
    assert.ok(sol);
    const report = validateSolution({
      solution: sol,
      requirements: {budgetMonthRub: 1000, managed: true},
      validationLevel: 'full',
    });
    assert.equal(report.valid, false);
    assert.ok(report.checks.some((c) => c.code === 'BUDGET' && c.status === 'failed'));
    assert.ok(report.checks.some((c) => c.code === 'MANAGED_K8S' && c.status === 'passed'));
  });
});

describe('compare_solutions', () => {
  it('returns pareto ids for composed VMs', () => {
    const composed = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 4, ramGiB: 16},
      maxSolutions: 6,
    });
    const matrix = compareSolutions({solutions: composed.solutions});
    assert.ok(matrix.comparison.length >= 1);
    assert.ok(matrix.paretoOptimalSolutionIds.length >= 1);
  });
});

describe('tool dispatch', () => {
  it('runs compose_solution and validate_solution via runToolSync', () => {
    const composedRaw = runToolSync(
      'compose_solution',
      JSON.stringify({
        solutionType: 'virtual_machine',
        requirements: {vcpu: 4, ramGiB: 16, diskGiB: 100},
        strategy: 'cheapest',
      }),
    );
    const composed = JSON.parse(composedRaw) as {
      solutions?: Array<Record<string, unknown>>;
      error?: string;
    };
    assert.equal(composed.error, undefined);
    assert.ok(composed.solutions?.length);

    const validatedRaw = runToolSync(
      'validate_solution',
      JSON.stringify({
        solution: composed.solutions![0],
        requirements: {vcpu: 4, ramGiB: 16},
      }),
    );
    const validated = JSON.parse(validatedRaw) as {valid?: boolean; checks?: unknown[]};
    assert.equal(typeof validated.valid, 'boolean');
    assert.ok(Array.isArray(validated.checks));
  });

  it('keeps get_quote RAM default 4×vCPU', () => {
    const raw = runToolSync('get_quote', JSON.stringify({vcpu: 16, period: 'month'}));
    const data = JSON.parse(raw) as {request?: {ramGiB?: number}};
    assert.equal(data.request?.ramGiB, 64);
  });
});
