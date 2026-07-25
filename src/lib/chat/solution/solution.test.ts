import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareSolutions} from './compare';
import {composeSolution, KUBERNETES_RECIPE_POLICY} from './compose';
import {normalizeRequirementSpec} from './normalize';
import {priceSolution} from './price';
import {searchCatalog} from './search-catalog';
import {detectDiskMediaPreference, normalizeGpuModelTraced} from './synonyms';
import {validateSolution} from './validate';
import {runToolSync} from '../tools';

describe('synonyms + normalize', () => {
  it('traces ашка → H100', () => {
    const t = normalizeGpuModelTraced('ашка');
    assert.equal(t.normalized, 'H100');
    assert.ok(t.appliedRules.some((r) => r.ruleId.startsWith('gpu-alias')));
  });

  it('maps «быстрый диск» to soft nvme|ssd preference, not hard nvme', () => {
    const d = detectDiskMediaPreference('нужен быстрый диск');
    assert.equal(d.hardConstraint, false);
    assert.deepEqual(d.mediaPreference, ['nvme', 'ssd']);
  });

  it('normalizes flat bag into RequirementSpec envelope', () => {
    const {spec, assumptions} = normalizeRequirementSpec({
      solutionType: 'kubernetes',
      requirements: {
        workerCount: 3,
        objectStorageGiB: 1024,
        budgetMonthRub: 100_000,
      },
      strategy: 'cheapest',
    });
    assert.equal(spec.solutionType, 'kubernetes');
    assert.equal(spec.currency, 'RUB');
    assert.equal(spec.period.hoursPerMonth, 720);
    assert.ok(spec.requiredRoles.includes('k8s_master'));
    assert.ok(spec.requiredRoles.includes('k8s_worker'));
    assert.ok(spec.requiredRoles.includes('object_storage'));
    assert.equal(spec.constraints.budgetMonthlyRub, 100_000);
    assert.ok(assumptions.some((a) => a.code === 'DEFAULT_MONTH_HOURS'));
  });
});

describe('search_catalog', () => {
  it('returns candidates with meterId and conflictingFields support', () => {
    const result = searchCatalog({text: 'H100', category: 'gpu', limit: 8});
    assert.ok(result.candidates.length > 0);
    const first = result.candidates[0]!;
    assert.ok(first.meterId.includes(':'));
    assert.ok(Array.isArray(first.match.exactFields));
    assert.ok(Array.isArray(first.match.conflictingFields));
  });
});

describe('compose_solution', () => {
  it('builds virtual_machine solutions with estimated costs only', () => {
    const result = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 8, ramGiB: 32, diskGiB: 100},
      strategy: 'cheapest',
      maxSolutions: 6,
    });
    assert.ok(result.solutions.length >= 1);
    assert.ok(result.requirementSpec.id.startsWith('req_'));
    assert.ok(
      result.solutions.every(
        (s) => s.estimatedMonthlyCostRub != null && s.estimatedMonthlyCostRub > 0,
      ),
    );
    assert.match(result.note, /price_solution/);
  });

  it('kubernetes recipe respects policy: S3 only if requested; egress unresolved otherwise', () => {
    assert.equal(KUBERNETES_RECIPE_POLICY.objectStorage, 'only_if_requested');
    const withS3 = composeSolution({
      solutionType: 'kubernetes',
      requirements: {
        workerCount: 3,
        workerVcpu: 4,
        workerRamGiB: 16,
        objectStorageGiB: 1024,
        k8sTier: 'basic',
      },
      strategy: 'cheapest',
      maxSolutions: 6,
    });
    assert.ok(withS3.solutions.length >= 1);
    const best = withS3.solutions[0]!;
    assert.ok(best.components.some((c) => c.role === 'k8s_master'));
    assert.ok(best.components.some((c) => c.role === 'k8s_worker'));
    assert.ok(best.components.some((c) => c.role === 'object_storage'));
    assert.ok(
      best.unresolved.some(
        (u) => typeof u !== 'string' && u.code === 'EGRESS_VOLUME_UNKNOWN',
      ),
    );
    // No public IP / LB auto-added
    assert.ok(!best.components.some((c) => c.role === 'public_ip'));
    assert.ok(!best.components.some((c) => c.role === 'load_balancer'));
  });

  it('does not add S3 when not requested', () => {
    const result = composeSolution({
      solutionType: 'kubernetes',
      requirements: {workerCount: 2, workerVcpu: 2, workerRamGiB: 8},
      maxSolutions: 3,
    });
    assert.ok(result.solutions.length >= 1);
    assert.ok(
      result.solutions.every((s) => !s.components.some((c) => c.role === 'object_storage')),
    );
  });
});

describe('validate_solution', () => {
  it('flags budget breach as requirements error', () => {
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
      requirements: composed.requirementSpec,
      validationLevel: 'full',
    });
    assert.equal(report.valid, false);
    assert.equal(report.status, 'invalid');
    assert.ok(report.issues.some((i) => i.code === 'BUDGET' && i.severity === 'error'));
    assert.ok(report.checks.requirementsSatisfied === false || report.hardFailureCount > 0);
  });

  it('detects whole_instance + cpu/ram duplicate billing scope', () => {
    const composed = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 4, ramGiB: 16},
      maxSolutions: 1,
    });
    const sol = composed.solutions[0]!;
    sol.components.push({
      id: 'cmp_fake_cpu',
      role: 'other',
      provider: sol.provider,
      title: 'vCPU unit',
      quantity: 4,
      estimatedMonthlyCostRub: 100,
      selection: {method: 'fallback'},
      scope: {billingScope: 'cpu'},
    });
    const report = validateSolution({
      solution: sol,
      requirements: composed.requirementSpec,
      validationLevel: 'full',
    });
    assert.ok(report.issues.some((i) => i.code === 'DUPLICATE_BILLING_SCOPE'));
    assert.ok(report.repairSuggestions.some((r) => r.action === 'remove_component'));
  });
});

describe('price_solution authority', () => {
  it('strict_pinned leaves shape-only lines unpriced', () => {
    const composed = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 4, ramGiB: 16},
      maxSolutions: 1,
    });
    const sol = composed.solutions[0]!;
    const priced = priceSolution({solution: sol, resolutionMode: 'strict_pinned'});
    assert.ok(!('error' in priced));
    if ('error' in priced) return;
    // VM parts often lack meterId → unpriced or shape via estimate only when allowed
    assert.ok(priced.completeness);
    assert.ok('monthlyRubVatIncluded' in priced.totals);
  });

  it('allow_shape_resolution prices estimated lines', () => {
    const composed = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 4, ramGiB: 16},
      maxSolutions: 1,
    });
    const sol = composed.solutions[0]!;
    const priced = priceSolution({solution: sol, resolutionMode: 'allow_shape_resolution'});
    assert.ok(!('error' in priced));
    if ('error' in priced) return;
    assert.ok(priced.totals.monthlyRubVatIncluded != null);
    assert.ok(priced.completeness.score > 0);
  });

  it('does not silently replace missing pinned meterId', () => {
    const priced = priceSolution({
      components: [
        {
          id: 'c1',
          meterId: 'no-such-provider:missing-sku-xyz',
          quantity: 1,
          role: 'compute',
        },
      ],
      resolutionMode: 'strict_pinned',
    });
    assert.ok(!('error' in priced));
    if ('error' in priced) return;
    assert.equal(priced.lines[0]?.resolution, 'unpriced');
    assert.ok(priced.unresolvedMeterIds?.length);
  });
});

describe('compare_solutions', () => {
  it('excludes incomplete cheap solutions from Pareto eligibility', () => {
    const composed = composeSolution({
      solutionType: 'virtual_machine',
      requirements: {vcpu: 4, ramGiB: 16},
      maxSolutions: 4,
    });
    const cheapIncomplete = {
      ...composed.solutions[0]!,
      id: 'sol_cheap_incomplete',
      estimatedMonthlyCostRub: 1000,
      monthlyCostRub: 1000,
      coverage: {...composed.solutions[0]!.coverage, score: 0.5},
      requirementsCoverage: 0.5,
      priceCompleteness: 0.4,
      validation: {
        solutionId: 'sol_cheap_incomplete',
        status: 'valid_with_warnings' as const,
        valid: true,
        coverage: 0.5,
        issues: [],
        hardFailureCount: 0,
        warningCount: 1,
        checks: {
          requirementsSatisfied: true,
          scopeConsistent: true,
          priceComplete: false,
          provenanceComplete: true,
        },
        repairSuggestions: [],
      },
    };
    const full = {
      ...composed.solutions[0]!,
      id: 'sol_full',
      estimatedMonthlyCostRub: 50_000,
      monthlyCostRub: 50_000,
      coverage: {...composed.solutions[0]!.coverage, score: 1},
      requirementsCoverage: 1,
      priceCompleteness: 1,
      priced: {
        solutionId: 'sol_full',
        provider: composed.solutions[0]!.provider,
        providerName: composed.solutions[0]!.providerName,
        lines: [],
        totals: {monthlyRubVatIncluded: 50_000, annualRubVatIncluded: 600_000},
        completeness: {
          pricedRequiredComponents: 2,
          totalRequiredComponents: 2,
          score: 1,
        },
      },
      validation: {
        solutionId: 'sol_full',
        status: 'valid' as const,
        valid: true,
        coverage: 1,
        issues: [],
        hardFailureCount: 0,
        warningCount: 0,
        checks: {
          requirementsSatisfied: true,
          scopeConsistent: true,
          priceComplete: true,
          provenanceComplete: true,
        },
        repairSuggestions: [],
      },
    };
    const matrix = compareSolutions({
      solutions: [cheapIncomplete, full],
      strategy: 'cheapest',
      minCoverage: 0.8,
      minPriceCompleteness: 0.8,
    });
    assert.ok(!matrix.paretoOptimalSolutionIds.includes('sol_cheap_incomplete'));
    assert.ok(matrix.paretoOptimalSolutionIds.includes('sol_full'));
    assert.equal(matrix.recommendedSolutionId, 'sol_full');
  });
});

describe('tool dispatch', () => {
  it('runs compose → validate → price via runToolSync', () => {
    const composedRaw = runToolSync(
      'compose_solution',
      JSON.stringify({
        solutionType: 'kubernetes',
        requirements: {
          workerCount: 3,
          workerVcpu: 4,
          workerRamGiB: 16,
          objectStorageGiB: 512,
        },
        strategy: 'cheapest',
      }),
    );
    const composed = JSON.parse(composedRaw) as {
      solutions?: Array<Record<string, unknown>>;
      requirementSpec?: {id?: string};
      error?: string;
    };
    assert.equal(composed.error, undefined);
    assert.ok(composed.solutions?.length);
    assert.ok(composed.requirementSpec?.id);

    const validatedRaw = runToolSync(
      'validate_solution',
      JSON.stringify({
        solution: composed.solutions![0],
        requirements: composed.requirementSpec,
      }),
    );
    const validated = JSON.parse(validatedRaw) as {
      status?: string;
      valid?: boolean;
      issues?: unknown[];
    };
    assert.ok(['valid', 'valid_with_warnings', 'invalid'].includes(validated.status ?? ''));

    const pricedRaw = runToolSync(
      'price_solution',
      JSON.stringify({
        solution: composed.solutions![0],
        resolutionMode: 'allow_shape_resolution',
      }),
    );
    const priced = JSON.parse(pricedRaw) as {
      totals?: {monthlyRubVatIncluded?: number | null};
    };
    assert.ok(priced.totals);
  });

  it('keeps get_quote RAM default 4×vCPU', () => {
    const raw = runToolSync('get_quote', JSON.stringify({vcpu: 16, period: 'month'}));
    const data = JSON.parse(raw) as {request?: {ramGiB?: number}};
    assert.equal(data.request?.ramGiB, 64);
  });
});
