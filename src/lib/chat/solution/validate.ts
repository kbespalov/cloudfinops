/**
 * Structured validation of a composed solution against requirements.
 * Deterministic checks — no LLM reasoning tool.
 */

import type {
  RequirementSpec,
  Solution,
  SolutionComponent,
  ValidationCheck,
  ValidationReport,
  RepairSuggestion,
} from './types';

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function hasRole(components: SolutionComponent[], role: string): boolean {
  return components.some((c) => c.role === role);
}

function sumMonthly(components: SolutionComponent[]): number | null {
  let total = 0;
  let any = false;
  for (const c of components) {
    if (c.monthlyCostRub == null || !Number.isFinite(c.monthlyCostRub)) continue;
    total += c.monthlyCostRub;
    any = true;
  }
  return any ? Math.round(total * 100) / 100 : null;
}

export type ValidateInput = {
  solution: Solution | {
    components: SolutionComponent[];
    provider?: string;
    monthlyCostRub?: number | null;
    unresolved?: string[];
    requirementsCoverage?: number;
  };
  requirements?: RequirementSpec;
  validationLevel?: 'basic' | 'pricing' | 'compatibility' | 'full';
};

export function validateSolution(input: ValidateInput): ValidationReport {
  const level = input.validationLevel ?? 'full';
  const req = input.requirements ?? {};
  const components = input.solution.components ?? [];
  const unresolved = 'unresolved' in input.solution ? (input.solution.unresolved ?? []) : [];
  const provider =
    'provider' in input.solution ? input.solution.provider : undefined;
  const checks: ValidationCheck[] = [];
  const repairs: RepairSuggestion[] = [];

  const total =
    input.solution.monthlyCostRub != null
      ? input.solution.monthlyCostRub
      : sumMonthly(components);

  // --- Requirement coverage ---
  const vcpuNeed = num(req.vcpu) ?? num(req.vcpuMin);
  const workerCfg = components.find((c) => c.role === 'worker_nodes')?.configuration;
  const computeCfg = components.find((c) => c.role === 'compute' || c.role === 'vcpu')
    ?.configuration;
  const actualVcpu =
    num(workerCfg?.vcpu) != null && num(workerCfg?.count) != null
      ? (workerCfg!.vcpu as number) * (workerCfg!.count as number)
      : num(computeCfg?.vcpu) ?? num(workerCfg?.vcpu);

  if (vcpuNeed != null) {
    const ok = actualVcpu != null && actualVcpu >= vcpuNeed;
    checks.push({
      code: 'VCPU_REQUIREMENT',
      status: ok ? 'passed' : actualVcpu == null ? 'warning' : 'failed',
      required: vcpuNeed,
      actual: actualVcpu ?? null,
      message: ok
        ? undefined
        : actualVcpu == null
          ? 'Не удалось проверить vCPU по компонентам'
          : `Фактически ${actualVcpu} vCPU < требуемых ${vcpuNeed}`,
    });
    if (!ok && actualVcpu != null) {
      repairs.push({
        action: 'raise_quantity',
        role: 'worker_nodes',
        message: `Увеличь worker vCPU/count до покрытия ${vcpuNeed}`,
      });
    }
  }

  const ramNeed = num(req.ramGiB) ?? num(req.ramGiBMin);
  const actualRam =
    num(workerCfg?.ramGiB) != null && num(workerCfg?.count) != null
      ? (workerCfg!.ramGiB as number) * (workerCfg!.count as number)
      : num(computeCfg?.ramGiB) ?? num(workerCfg?.ramGiB);
  if (ramNeed != null) {
    const ok = actualRam != null && actualRam >= ramNeed;
    checks.push({
      code: 'RAM_REQUIREMENT',
      status: ok ? 'passed' : actualRam == null ? 'warning' : 'failed',
      required: ramNeed,
      actual: actualRam ?? null,
    });
  }

  if (req.managed === true || req.workload === 'kubernetes') {
    const ok = hasRole(components, 'control_plane');
    checks.push({
      code: 'MANAGED_K8S',
      status: ok ? 'passed' : 'failed',
      message: ok ? undefined : 'Нет control_plane (Managed Kubernetes master)',
    });
    if (!ok) {
      repairs.push({
        action: 'add_component',
        role: 'control_plane',
        requiredCapabilities: ['managed_kubernetes'],
      });
    }
  }

  const storageNeed = num(req.objectStorageGiB);
  if (storageNeed != null) {
    const ok = hasRole(components, 'object_storage');
    checks.push({
      code: 'OBJECT_STORAGE',
      status: ok ? 'passed' : 'failed',
      required: storageNeed,
      message: ok ? undefined : 'Object storage не включён в решение',
    });
    if (!ok) {
      repairs.push({
        action: 'add_component',
        role: 'object_storage',
        requiredCapabilities: [`capacityGiB:${storageNeed}`],
      });
    }
  }

  if (req.providers?.length && provider) {
    const ok = req.providers.includes(provider);
    checks.push({
      code: 'PROVIDER_ALLOWLIST',
      status: ok ? 'passed' : 'failed',
      required: req.providers,
      actual: provider,
      message: ok ? undefined : `Провайдер ${provider} вне allowlist`,
    });
  }

  // --- Pricing ---
  if (level === 'pricing' || level === 'full' || level === 'basic') {
    const budget = num(req.budgetMonthRub);
    if (budget != null && total != null) {
      const ok = total <= budget;
      checks.push({
        code: 'BUDGET',
        status: ok ? 'passed' : 'failed',
        required: budget,
        actual: total,
        message: ok ? undefined : `Итого ${total} ₽ > бюджета ${budget} ₽`,
      });
    }

    const missingPrice = components.filter(
      (c) => c.monthlyCostRub == null || !Number.isFinite(c.monthlyCostRub),
    );
    checks.push({
      code: 'PRICE_COMPLETENESS',
      status: missingPrice.length ? 'warning' : 'passed',
      actual: 1 - missingPrice.length / Math.max(1, components.length),
      message: missingPrice.length
        ? `Нет цены у ролей: ${missingPrice.map((c) => c.role).join(', ')}`
        : undefined,
    });

    if (unresolved.includes('cdn_egress') || unresolved.includes('network_egress')) {
      checks.push({
        code: 'EGRESS_NOT_PRICED',
        status: 'warning',
        message: 'Стоимость исходящего трафика отсутствует или не рассчитана',
      });
      repairs.push({
        action: 'add_component',
        role: 'cdn_egress',
        message: 'Укажи объём egress/CDN в requirements и пересобери',
      });
    }

    if (
      num(req.egressGiB) == null &&
      num(req.cdnEgressGiB) == null &&
      !hasRole(components, 'cdn_egress')
    ) {
      checks.push({
        code: 'EGRESS_ASSUMED_ABSENT',
        status: 'warning',
        message: 'Исходящий трафик не запрашивался — в цене не учтён',
      });
    }
  }

  // --- Compatibility / quality ---
  if (level === 'compatibility' || level === 'full') {
    const synthetic = components.filter((c) => c.synthetic);
    if (synthetic.length) {
      checks.push({
        code: 'SYNTHETIC_COMPONENTS',
        status: 'warning',
        message: `Synthetic/оценка: ${synthetic.map((c) => c.role).join(', ')}`,
      });
    }

    const gpuOnly = components.some((c) => c.scope === 'gpu-only');
    const hasHost = components.some((c) =>
      ['compute', 'vcpu', 'ram', 'worker_nodes'].includes(c.role),
    );
    if (gpuOnly && !hasHost) {
      checks.push({
        code: 'GPU_SCOPE_MIX',
        status: 'warning',
        message: 'Есть gpu-only без хоста — несравнимо с полной конфигурацией',
      });
      repairs.push({
        action: 'add_component',
        role: 'compute',
        requiredCapabilities: ['vcpu', 'ramGiB'],
      });
    }

    for (const role of unresolved) {
      checks.push({
        code: 'UNRESOLVED_COMPONENT',
        status: 'failed',
        message: `Не удалось подобрать компонент: ${role}`,
      });
      repairs.push({action: 'add_component', role});
    }
  }

  const failed = checks.filter((c) => c.status === 'failed');
  const passedHard = checks.filter((c) => c.status === 'passed').length;
  const relevant = checks.filter((c) => c.status !== 'warning');
  const coverage =
    'requirementsCoverage' in input.solution &&
    typeof input.solution.requirementsCoverage === 'number'
      ? input.solution.requirementsCoverage
      : relevant.length
        ? Math.round((passedHard / relevant.length) * 100) / 100
        : 1;

  return {
    valid: failed.length === 0,
    coverage,
    checks,
    repairSuggestions: repairs,
  };
}
