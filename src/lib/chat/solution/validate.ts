/**
 * Structured validation — requirements / compatibility / pricing / provenance.
 * valid is computed by backend, never by the LLM.
 */

import {catalog} from '@/lib/catalog';
import {enrichSpecFromQuantities, normalizeRequirementSpec} from './normalize';
import type {
  RequirementSpec,
  RepairSuggestion,
  Solution,
  SolutionComponent,
  ValidationIssue,
  ValidationReport,
} from './types';

/** Hard errors that mean incomplete user input / repairable BOM gaps — not catalog bugs. */
const CLARIFICATION_ERROR_CODES = new Set([
  'WORKER_COUNT_UNKNOWN',
  'HA_INSUFFICIENT_WORKERS',
  'MISSING_REQUIRED_ROLE',
  'BLOCK_STORAGE_UNAVAILABLE',
  'PUBLIC_IP_UNAVAILABLE',
  'INTERNET_EGRESS_UNAVAILABLE',
]);

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function hasRole(components: SolutionComponent[], role: string): boolean {
  return components.some((c) => c.role === role);
}

export type ValidateInput = {
  solution: Solution | Record<string, unknown>;
  requirements?: RequirementSpec | Record<string, unknown>;
  validationLevel?: 'basic' | 'pricing' | 'compatibility' | 'provenance' | 'full';
};

function asSolution(raw: Record<string, unknown> | Solution): Solution {
  const s = raw as Solution;
  return {
    ...s,
    id: typeof s.id === 'string' ? s.id : 'unknown',
    components: Array.isArray(s.components) ? s.components : [],
    unresolved: Array.isArray(s.unresolved) ? s.unresolved : [],
    assumptions: Array.isArray(s.assumptions) ? s.assumptions : [],
    coverage: s.coverage ?? {
      requiredSatisfied: 0,
      requiredTotal: 0,
      optionalSatisfied: 0,
      optionalTotal: 0,
      score: typeof s.requirementsCoverage === 'number' ? s.requirementsCoverage : 0,
    },
    estimatedMonthlyCostRub:
      s.estimatedMonthlyCostRub ??
      (typeof s.monthlyCostRub === 'number' ? s.monthlyCostRub : null),
  };
}

export function validateSolution(input: ValidateInput): ValidationReport {
  const level = input.validationLevel ?? 'full';
  const solution = asSolution(input.solution as Solution);

  // Always re-normalize + enrich so incomplete LLM requiredRoles cannot fake 100% coverage.
  const {spec, assumptions: normAssumptions} = normalizeRequirementSpec({
    solutionType: solution.solutionType,
    requirements: input.requirements ?? {
      solutionType: solution.solutionType,
      providers: solution.provider ? [solution.provider] : undefined,
    },
  });
  // Extra safety if caller passed an already-normalized envelope that skipped enrich somehow.
  enrichSpecFromQuantities(spec);

  const issues: ValidationIssue[] = [];
  const repairs: RepairSuggestion[] = [];
  const components = solution.components;

  // --- Requirements ---
  for (const role of spec.requiredRoles) {
    if (!hasRole(components, role)) {
      const repair: RepairSuggestion = {
        action: 'add_component',
        role,
        reasonCode: 'MISSING_REQUIRED_ROLE',
        message: `Добавь обязательный компонент ${role}`,
        constraints:
          role === 'block_storage' && spec.quantities.blockStorageGiB
            ? {blockStorageGiB: spec.quantities.blockStorageGiB}
            : role === 'internet_egress' && spec.quantities.egressGiB
              ? {egressGiB: spec.quantities.egressGiB}
              : role === 'public_ip' && spec.quantities.publicIpCount
                ? {publicIpCount: spec.quantities.publicIpCount}
                : role === 'cdn_egress' && spec.quantities.cdnEgressGiB
                  ? {cdnEgressGiB: spec.quantities.cdnEgressGiB}
                  : undefined,
      };
      repairs.push(repair);
      issues.push({
        code: 'MISSING_REQUIRED_ROLE',
        severity: 'error',
        category: 'requirements',
        requirementPath: `requiredRoles.${role}`,
        message: `Отсутствует обязательная роль: ${role}`,
        repair,
      });
    }
  }

  // Quantity-driven hard checks (independent of LLM requiredRoles omissions)
  if (spec.solutionType === 'kubernetes' && spec.quantities.workerCountExplicit !== true) {
    issues.push({
      code: 'WORKER_COUNT_UNKNOWN',
      severity: 'error',
      category: 'requirements',
      requirementPath: 'quantities.workerCount',
      message: 'Количество worker-нод не определено',
    });
  }

  const workerN = num(spec.quantities.workerCount);
  const wantsHa =
    spec.constraints.k8sTier === 'ha' ||
    spec.strategy === 'availability' ||
    (typeof spec.constraints.availabilityZones === 'number' &&
      spec.constraints.availabilityZones >= 2);
  if (
    spec.solutionType === 'kubernetes' &&
    wantsHa &&
    workerN != null &&
    workerN < 2 &&
    spec.quantities.workerCountExplicit === true
  ) {
    issues.push({
      code: 'HA_INSUFFICIENT_WORKERS',
      severity: 'error',
      category: 'compatibility',
      requirementPath: 'quantities.workerCount',
      required: '≥2 workers for HA / multi-zone',
      actual: workerN,
      message:
        'Отказоустойчивый / multi-zone Kubernetes несовместим с одной worker-нодой — нужно ≥2 (лучше ≥3) или снять требование HA',
    });
  }

  if (spec.quantities.blockStorageGiB && !hasRole(components, 'block_storage')) {
    if (!issues.some((i) => i.code === 'MISSING_REQUIRED_ROLE' && i.requirementPath?.includes('block_storage'))) {
      const repair: RepairSuggestion = {
        action: 'add_component',
        role: 'block_storage',
        reasonCode: 'MISSING_BLOCK_STORAGE',
        constraints: {blockStorageGiB: spec.quantities.blockStorageGiB},
        message: `Добавь блочный диск ${spec.quantities.blockStorageGiB} GiB`,
      };
      repairs.push(repair);
      issues.push({
        code: 'MISSING_REQUIRED_ROLE',
        severity: 'error',
        category: 'requirements',
        requirementPath: 'quantities.blockStorageGiB',
        required: spec.quantities.blockStorageGiB,
        message: `Не найден или не добавлен блочный диск ${spec.quantities.blockStorageGiB} GiB`,
        repair,
      });
    }
  }

  if (spec.quantities.publicIpCount && !hasRole(components, 'public_ip')) {
    if (!issues.some((i) => i.requirementPath?.includes('public_ip'))) {
      const repair: RepairSuggestion = {
        action: 'add_component',
        role: 'public_ip',
        reasonCode: 'MISSING_PUBLIC_IP',
        constraints: {publicIpCount: spec.quantities.publicIpCount},
      };
      repairs.push(repair);
      issues.push({
        code: 'MISSING_REQUIRED_ROLE',
        severity: 'error',
        category: 'requirements',
        requirementPath: 'quantities.publicIpCount',
        message: 'Отсутствует публичный IPv4',
        repair,
      });
    }
  }

  if (spec.quantities.egressGiB && !hasRole(components, 'internet_egress')) {
    if (!issues.some((i) => i.requirementPath?.includes('internet_egress'))) {
      const repair: RepairSuggestion = {
        action: 'add_component',
        role: 'internet_egress',
        reasonCode: 'MISSING_INTERNET_EGRESS',
        constraints: {egressGiB: spec.quantities.egressGiB},
      };
      repairs.push(repair);
      issues.push({
        code: 'MISSING_REQUIRED_ROLE',
        severity: 'error',
        category: 'requirements',
        requirementPath: 'quantities.egressGiB',
        message: `Отсутствует internet egress ${spec.quantities.egressGiB} GiB`,
        repair,
      });
    }
  }

  if (spec.quantities.cdnRequested && !spec.quantities.cdnEgressGiB) {
    issues.push({
      code: 'CDN_VOLUME_UNKNOWN',
      severity: 'warning',
      category: 'requirements',
      requirementPath: 'quantities.cdnEgressGiB',
      message: 'Объём CDN-трафика не указан — CDN невозможно полностью оценить',
    });
  }

  if (
    normAssumptions.some((a) => a.code === 'WORKER_SHAPE_SCOPE_AMBIGUOUS') ||
    (solution.assumptions ?? []).some(
      (a) => typeof a !== 'string' && a.code === 'WORKER_SHAPE_SCOPE_AMBIGUOUS',
    )
  ) {
    issues.push({
      code: 'WORKER_SHAPE_SCOPE_AMBIGUOUS',
      severity: 'warning',
      category: 'requirements',
      requirementPath: 'quantities.workerVcpu',
      message:
        'Требуется уточнить: vCPU/RAM — на одну worker-ноду или на весь кластер (принято на ноду)',
    });
  }

  const worker = components.find((c) => c.role === 'k8s_worker');
  const compute = components.find((c) => c.role === 'compute' || c.role === 'gpu_compute');
  const vcpuNeed = spec.constraints.minVcpu;
  if (vcpuNeed != null && spec.quantities.workerCountExplicit) {
    const actual =
      worker && num(worker.configuration?.vcpu) != null && num(worker.quantity) != null
        ? (worker.configuration!.vcpu as number) * worker.quantity
        : num(compute?.configuration?.vcpu) ?? num(worker?.configuration?.vcpu);
    // Only enforce cluster-total vCPU when shape is confirmed as cluster pool.
    if (
      spec.extras?.workerShapeScope === 'cluster' &&
      actual != null &&
      actual < vcpuNeed
    ) {
      const repair: RepairSuggestion | undefined = worker
        ? {
            action: 'raise_quantity',
            componentId: worker.id,
            minimumQuantity: Math.ceil(vcpuNeed / Math.max(1, Number(worker.configuration?.vcpu) || 1)),
            reasonCode: 'VCPU_REQUIREMENT',
          }
        : undefined;
      if (repair) repairs.push(repair);
      issues.push({
        code: 'VCPU_REQUIREMENT',
        severity: 'error',
        category: 'requirements',
        required: vcpuNeed,
        actual,
        message: `Фактически ${actual} vCPU < требуемых ${vcpuNeed}`,
        repair,
      });
    }
  }

  if (spec.constraints.providers?.length && solution.provider) {
    if (!spec.constraints.providers.includes(solution.provider)) {
      issues.push({
        code: 'PROVIDER_ALLOWLIST',
        severity: 'error',
        category: 'requirements',
        required: spec.constraints.providers,
        actual: solution.provider,
        message: `Провайдер ${solution.provider} вне allowlist`,
      });
    }
  }

  const budget = spec.constraints.budgetMonthlyRub;
  const total = solution.estimatedMonthlyCostRub;
  if (budget != null && total != null && total > budget) {
    issues.push({
      code: 'BUDGET',
      severity: 'error',
      category: 'requirements',
      required: budget,
      actual: total,
      message: `Оценка ${total} ₽ > бюджета ${budget} ₽ (оценка compose; перепроверь через price_solution)`,
    });
  }

  for (const u of solution.unresolved ?? []) {
    if (typeof u === 'string') {
      issues.push({
        code: 'UNRESOLVED',
        severity: 'warning',
        category: 'requirements',
        message: u,
      });
      continue;
    }
    // Avoid duplicating quantity hard-checks already emitted above.
    if (
      (u.code === 'WORKER_COUNT_UNKNOWN' &&
        issues.some((i) => i.code === 'WORKER_COUNT_UNKNOWN')) ||
      (u.code === 'CDN_VOLUME_UNKNOWN' &&
        issues.some((i) => i.code === 'CDN_VOLUME_UNKNOWN'))
    ) {
      continue;
    }
    issues.push({
      code: u.code,
      severity: u.severity === 'blocking' ? 'error' : 'warning',
      category: 'requirements',
      message: u.message,
      repair: u.role
        ? {action: 'add_component', role: u.role, reasonCode: u.code}
        : undefined,
    });
    if (u.role && u.severity === 'blocking' && u.role !== 'k8s_worker') {
      repairs.push({action: 'add_component', role: u.role, reasonCode: u.code});
    }
  }

  // --- Compatibility ---
  if (level === 'compatibility' || level === 'full') {
    const providers = new Set(components.map((c) => c.provider).filter(Boolean));
    if (providers.size > 1) {
      issues.push({
        code: 'CROSS_PROVIDER_COMPONENTS',
        severity: 'error',
        category: 'compatibility',
        message: `Компоненты от разных провайдеров: ${[...providers].join(', ')}`,
      });
    }

    const hasGpuOnly = components.some((c) => c.scope?.billingScope === 'gpu');
    const hasWhole = components.some((c) => c.scope?.billingScope === 'whole_instance');
    const hasCpuRam = components.some(
      (c) => c.scope?.billingScope === 'cpu' || c.scope?.billingScope === 'ram',
    );
    if (hasGpuOnly && hasWhole) {
      issues.push({
        code: 'GPU_SCOPE_MIX',
        severity: 'warning',
        category: 'compatibility',
        message: 'Смешаны GPU-only и whole-instance scope — несравнимо без пометки',
      });
    }
    if (hasWhole && hasCpuRam) {
      const cpuRam = components.filter(
        (c) => c.scope?.billingScope === 'cpu' || c.scope?.billingScope === 'ram',
      );
      for (const c of cpuRam) {
        const repair: RepairSuggestion = {
          action: 'remove_component',
          componentId: c.id,
          reasonCode: 'DUPLICATE_BILLING_SCOPE',
          message: 'Убери CPU/RAM unit — whole_instance уже включает их',
        };
        repairs.push(repair);
        issues.push({
          code: 'DUPLICATE_BILLING_SCOPE',
          severity: 'error',
          category: 'compatibility',
          componentId: c.id,
          message: 'Whole-instance + отдельный CPU/RAM — двойной учёт',
          repair,
        });
      }
    }

    // Only warn when attached block looks like a duplicate of the included boot disk.
    const disks = components.filter((c) => c.role === 'block_storage');
    const workerWithDisk = components.find(
      (c) =>
        (c.role === 'k8s_worker' || c.role === 'compute') &&
        c.configuration?.diskIncluded === true,
    );
    const bootGiB = num(workerWithDisk?.configuration?.diskGiB) ?? 100;
    if (disks.length && workerWithDisk) {
      for (const d of disks) {
        const vol = num(d.configuration?.volumeGiB) ?? d.quantity;
        const looksLikeBootDuplicate =
          vol != null && vol <= bootGiB * 1.5 && d.configuration?.diskIncluded !== false;
        if (!looksLikeBootDuplicate) continue;
        const repair: RepairSuggestion = {
          action: 'remove_component',
          componentId: d.id,
          reasonCode: 'DISK_ALREADY_INCLUDED',
        };
        repairs.push(repair);
        issues.push({
          code: 'DISK_ALREADY_INCLUDED',
          severity: 'warning',
          category: 'compatibility',
          componentId: d.id,
          message: 'Диск уже включён в preset worker/VM',
          repair,
        });
      }
    }

    const masterAsWorker = components.find(
      (c) =>
        c.role === 'k8s_worker' &&
        (c.scope?.billingScope === 'service_fee' || /master|control.?plane/i.test(c.title)),
    );
    if (masterAsWorker) {
      issues.push({
        code: 'MASTER_USED_AS_WORKER',
        severity: 'error',
        category: 'compatibility',
        componentId: masterAsWorker.id,
        message: 'K8s master meter использован как worker',
      });
    }
  }

  // --- Pricing ---
  if (level === 'pricing' || level === 'full' || level === 'basic') {
    const required = components.filter((c) => spec.requiredRoles.includes(c.role));
    const unpriced = required.filter(
      (c) => c.estimatedMonthlyCostRub == null || !Number.isFinite(c.estimatedMonthlyCostRub),
    );
    if (unpriced.length) {
      issues.push({
        code: 'PRICE_INCOMPLETE',
        severity: 'warning',
        category: 'pricing',
        message: `Нет оценки цены у: ${unpriced.map((c) => c.role).join(', ')}`,
      });
    }
    const synthetic = components.filter((c) => c.synthetic || c.selection?.method === 'synthetic');
    if (synthetic.length) {
      issues.push({
        code: 'SYNTHETIC_COMPONENTS',
        severity: 'warning',
        category: 'pricing',
        message: `Synthetic/оценка: ${synthetic.map((c) => c.role).join(', ')}`,
      });
    }
    const usageWithoutVolume = components.filter(
      (c) =>
        (c.role === 'cdn_egress' || c.role === 'internet_egress' || c.role === 'object_storage') &&
        (c.quantity == null || c.quantity <= 0),
    );
    for (const c of usageWithoutVolume) {
      issues.push({
        code: 'USAGE_VOLUME_MISSING',
        severity: 'warning',
        category: 'pricing',
        componentId: c.id,
        message: `Usage-based ${c.role} без объёма`,
      });
    }
  }

  // --- Provenance ---
  if (level === 'provenance' || level === 'full') {
    for (const c of components) {
      if (c.meterId) {
        const exists = catalog.meters.some((m) => m.id === c.meterId);
        if (!exists) {
          issues.push({
            code: 'METER_NOT_IN_CATALOG',
            severity: 'error',
            category: 'provenance',
            componentId: c.id,
            message: `meterId ${c.meterId} отсутствует в текущем каталоге`,
          });
        }
      } else if (spec.requiredRoles.includes(c.role) && c.selection?.method !== 'nearest_match') {
        issues.push({
          code: 'METER_ID_MISSING',
          severity: 'info',
          category: 'provenance',
          componentId: c.id,
          message: `Нет meterId у ${c.role} (shape-resolve)`,
        });
      }
    }
  }

  const hardFailureCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const requirementsSatisfied = !issues.some(
    (i) => i.category === 'requirements' && i.severity === 'error',
  );
  const scopeConsistent = !issues.some(
    (i) => i.category === 'compatibility' && i.severity === 'error',
  );
  const priceComplete = !issues.some(
    (i) => i.code === 'PRICE_INCOMPLETE' || i.code === 'USAGE_VOLUME_MISSING',
  );
  const provenanceComplete = !issues.some(
    (i) => i.category === 'provenance' && i.severity === 'error',
  );

  // Role coverage + open clarification slots (e.g. unknown workerCount) so 100% is impossible.
  const roleSatisfied = spec.requiredRoles.filter((r) => hasRole(components, r)).length;
  const clarificationSlots =
    spec.solutionType === 'kubernetes' && spec.quantities.workerCountExplicit !== true ? 1 : 0;
  const coverageTotal = spec.requiredRoles.length + clarificationSlots;
  const coverage =
    coverageTotal === 0
      ? 1
      : Math.round((roleSatisfied / coverageTotal) * 100) / 100;

  const hardErrors = issues.filter((i) => i.severity === 'error');
  const status: ValidationReport['status'] =
    hardFailureCount > 0
      ? hardErrors.every((i) => CLARIFICATION_ERROR_CODES.has(i.code))
        ? 'needs_clarification'
        : 'invalid'
      : warningCount > 0
        ? 'valid_with_warnings'
        : 'valid';

  // Deduplicate repairs
  const repairKey = (r: RepairSuggestion) => JSON.stringify(r);
  const uniqueRepairs = [...new Map(repairs.map((r) => [repairKey(r), r])).values()];

  return {
    solutionId: solution.id,
    status,
    valid: status === 'valid' || status === 'valid_with_warnings',
    coverage,
    issues,
    hardFailureCount,
    warningCount,
    checks: {
      requirementsSatisfied,
      scopeConsistent,
      priceComplete,
      provenanceComplete,
    },
    repairSuggestions: uniqueRepairs,
  };
}
