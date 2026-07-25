/**
 * Normalize LLM / flat requirement bags into a stable RequirementSpec envelope.
 */

import {createHash} from 'node:crypto';
import {
  detectDiskMediaPreference,
  normalizeGpuModelTraced,
  normalizeProviderIds,
  normalizeRegion,
} from './synonyms';
import type {
  Assumption,
  ComposeStrategy,
  NormalizationRule,
  RequirementSpec,
  SolutionComponentRole,
  SolutionType,
} from './types';

const SOLUTION_TYPES: SolutionType[] = [
  'virtual_machine',
  'kubernetes',
  'inference',
  'lakehouse',
  'web_application',
  'custom',
];

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isRequirementSpec(raw: unknown): raw is RequirementSpec {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as RequirementSpec).id === 'string' &&
    typeof (raw as RequirementSpec).solutionType === 'string' &&
    Array.isArray((raw as RequirementSpec).requiredRoles)
  );
}

function hashId(parts: string[]): string {
  return `req_${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)}`;
}

function defaultRoles(type: SolutionType): {
  required: SolutionComponentRole[];
  optional: SolutionComponentRole[];
} {
  switch (type) {
    case 'kubernetes':
      return {
        required: ['k8s_master', 'k8s_worker'],
        optional: ['object_storage', 'public_ip', 'cdn_egress', 'internet_egress', 'load_balancer'],
      };
    case 'web_application':
      return {
        required: ['compute'],
        optional: ['public_ip', 'object_storage', 'cdn_egress', 'block_storage'],
      };
    case 'inference':
      return {required: ['gpu_compute'], optional: ['compute', 'public_ip']};
    case 'lakehouse':
      return {
        required: ['object_storage', 'k8s_master', 'k8s_worker'],
        optional: ['internet_egress'],
      };
    case 'custom':
      return {required: ['compute'], optional: ['public_ip', 'object_storage', 'cdn_egress']};
    default:
      return {required: ['compute'], optional: ['block_storage', 'public_ip']};
  }
}

export type NormalizeRequirementsResult = {
  spec: RequirementSpec;
  assumptions: Assumption[];
  appliedRules: NormalizationRule[];
};

/**
 * Accept either a full RequirementSpec or a flat bag (legacy tool args).
 */
export function normalizeRequirementSpec(input: {
  solutionType?: SolutionType | string;
  requirements?: RequirementSpec | Record<string, unknown>;
  providers?: string[];
  strategy?: ComposeStrategy | string;
  budgetMonthRub?: number;
  rawText?: string;
}): NormalizeRequirementsResult {
  const assumptions: Assumption[] = [];
  const appliedRules: NormalizationRule[] = [];
  const flat =
    input.requirements && typeof input.requirements === 'object' && !Array.isArray(input.requirements)
      ? (input.requirements as Record<string, unknown>)
      : {};

  if (isRequirementSpec(input.requirements)) {
    const spec = {
      ...input.requirements,
      period: input.requirements.period ?? {hoursPerMonth: 720 as const},
      currency: 'RUB' as const,
      vatMode: 'included' as const,
    };
    assumptions.push({
      code: 'DEFAULT_MONTH_HOURS',
      message: 'Для месячной цены использовано 720 часов',
      field: 'period.hoursPerMonth',
      value: 720,
      impact: 'low',
    });
    return {spec, assumptions, appliedRules};
  }

  const typeRaw =
    (typeof input.solutionType === 'string' && input.solutionType) ||
    (typeof flat.solutionType === 'string' && flat.solutionType) ||
    (typeof flat.workload === 'string' &&
    /k8s|kubernetes/i.test(flat.workload)
      ? 'kubernetes'
      : undefined) ||
    'virtual_machine';
  const solutionType = (SOLUTION_TYPES.includes(typeRaw as SolutionType)
    ? typeRaw
    : 'virtual_machine') as SolutionType;

  const strategyRaw =
    (typeof input.strategy === 'string' && input.strategy) ||
    (typeof flat.strategy === 'string' && flat.strategy) ||
    'cheapest';
  const strategy = (
    ['cheapest', 'balanced', 'performance', 'availability'].includes(strategyRaw)
      ? strategyRaw
      : 'cheapest'
  ) as ComposeStrategy;

  const gpuTrace = normalizeGpuModelTraced(
    typeof flat.gpuModel === 'string'
      ? flat.gpuModel
      : typeof (flat.gpu as {model?: string} | undefined)?.model === 'string'
        ? (flat.gpu as {model: string}).model
        : undefined,
  );
  appliedRules.push(...gpuTrace.appliedRules);

  const diskPref = detectDiskMediaPreference(
    typeof flat.diskMedia === 'string'
      ? flat.diskMedia
      : typeof flat.rawText === 'string'
        ? flat.rawText
        : input.rawText,
  );
  appliedRules.push(...diskPref.rules);

  const providers = normalizeProviderIds(
    input.providers ??
      (Array.isArray(flat.providers) ? (flat.providers as string[]) : undefined) ??
      (typeof flat.provider === 'string' ? [flat.provider] : undefined),
  );
  const region = normalizeRegion(
    typeof flat.region === 'string' ? flat.region : undefined,
  );

  const minVcpu = num(flat.minVcpu) ?? num(flat.vcpuMin) ?? num(flat.vcpu);
  const minRam = num(flat.minRamGiB) ?? num(flat.ramGiBMin) ?? num(flat.ramGiB);
  const budget =
    num(input.budgetMonthRub) ?? num(flat.budgetMonthRub) ?? num(flat.budgetMonthlyRub);

  const roles = defaultRoles(solutionType);
  const requiredRoles = [...roles.required];
  const optionalRoles = [...roles.optional];

  const storageGiB =
    num(flat.storageGiB) ?? num(flat.objectStorageGiB) ?? num(flat.objectStorage);
  if (storageGiB) {
    if (!requiredRoles.includes('object_storage')) requiredRoles.push('object_storage');
  }
  const egressGiB = num(flat.egressGiB) ?? num(flat.internetEgressGiB);
  const cdnEgressGiB = num(flat.cdnEgressGiB);
  if (cdnEgressGiB && !optionalRoles.includes('cdn_egress')) optionalRoles.push('cdn_egress');
  if (egressGiB && !optionalRoles.includes('internet_egress')) {
    optionalRoles.push('internet_egress');
  }

  const publicIpCount =
    num(flat.publicIpCount) ??
    (solutionType === 'web_application' ? 1 : undefined);
  if (publicIpCount && !requiredRoles.includes('public_ip') && solutionType === 'web_application') {
    requiredRoles.push('public_ip');
  }

  if (gpuTrace.normalized && !requiredRoles.includes('gpu_compute')) {
    // GPU VM: compute host + gpu
    if (solutionType === 'virtual_machine') {
      requiredRoles.push('gpu_compute');
    }
  }

  if (minRam == null && minVcpu != null && solutionType === 'virtual_machine') {
    assumptions.push({
      code: 'DEFAULT_RAM_RATIO',
      message: `RAM не указан — принято ${minVcpu * 4} GiB (4×vCPU, general)`,
      field: 'constraints.minRamGiB',
      value: minVcpu * 4,
      impact: 'medium',
    });
  }

  const diskGiB = num(flat.diskGiB) ?? 100;
  if (flat.diskGiB == null && (solutionType === 'virtual_machine' || solutionType === 'kubernetes')) {
    assumptions.push({
      code: 'DEFAULT_SYSTEM_DISK',
      message: 'Системный диск по умолчанию: 100 GiB SSD',
      field: 'quantities.diskGiB',
      value: 100,
      impact: 'low',
    });
  }

  assumptions.push({
    code: 'DEFAULT_MONTH_HOURS',
    message: 'Для месячной цены использовано 720 часов',
    field: 'period.hoursPerMonth',
    value: 720,
    impact: 'low',
  });

  const workerCount = num(flat.workerCount) ?? (solutionType === 'kubernetes' ? 3 : undefined);
  if (solutionType === 'kubernetes' && flat.workerCount == null) {
    assumptions.push({
      code: 'DEFAULT_WORKER_COUNT',
      message: 'Число worker-нод по умолчанию: 3',
      field: 'quantities.workerCount',
      value: 3,
      impact: 'medium',
    });
  }

  const resolvedRam = minRam ?? (minVcpu != null ? minVcpu * 4 : undefined);

  const spec: RequirementSpec = {
    id: hashId([
      solutionType,
      strategy,
      String(minVcpu ?? ''),
      String(resolvedRam ?? ''),
      String(budget ?? ''),
      String(workerCount ?? ''),
      String(storageGiB ?? ''),
      (providers ?? []).join(','),
    ]),
    solutionType,
    strategy,
    period: {hoursPerMonth: 720},
    currency: 'RUB',
    vatMode: 'included',
    constraints: {
      budgetMonthlyRub: budget,
      providers,
      region,
      minVcpu,
      minRamGiB: resolvedRam,
      gpu: gpuTrace.normalized
        ? {
            model: gpuTrace.normalized,
            minCount: num(flat.gpuCount) ?? 1,
          }
        : undefined,
      storage: {
        minGiB: storageGiB,
        media: diskPref.media,
        mediaPreference: diskPref.mediaPreference,
        class:
          typeof flat.storageClass === 'string'
            ? flat.storageClass
            : storageGiB
              ? 'standard'
              : undefined,
      },
      k8sTier: flat.k8sTier === 'ha' ? 'ha' : flat.k8sTier === 'basic' ? 'basic' : undefined,
    },
    requiredRoles,
    optionalRoles,
    quantities: {
      workerCount,
      instanceCount: num(flat.instanceCount) ?? 1,
      storageGiB,
      egressGiB,
      cdnEgressGiB,
      publicIpCount,
      diskGiB,
      workerVcpu: num(flat.workerVcpu) ?? minVcpu,
      workerRamGiB: num(flat.workerRamGiB) ?? resolvedRam,
      workerDiskGiB: num(flat.workerDiskGiB) ?? diskGiB,
    },
    rawText: typeof flat.rawText === 'string' ? flat.rawText : input.rawText,
    extras: {
      ...(typeof flat.workload === 'string' ? {workload: flat.workload} : {}),
      ...(typeof flat.model === 'string' ? {model: flat.model} : {}),
      ...(typeof flat.servicesCount === 'number' ? {servicesCount: flat.servicesCount} : {}),
      ...(typeof flat.hotPercent === 'number' ? {hotPercent: flat.hotPercent} : {}),
      managed: flat.managed === true || solutionType === 'kubernetes',
    },
  };

  return {spec, assumptions, appliedRules};
}
