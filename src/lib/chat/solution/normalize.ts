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

/** Volumes at/above this GiB with HDD media are treated as attached block storage, not boot disk. */
const BLOCK_STORAGE_DISK_THRESHOLD_GIB = 2048;

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

function pushUniqueRole(roles: SolutionComponentRole[], role: SolutionComponentRole): void {
  if (!roles.includes(role)) roles.push(role);
}

function removeRole(roles: SolutionComponentRole[], role: SolutionComponentRole): void {
  const i = roles.indexOf(role);
  if (i >= 0) roles.splice(i, 1);
}

function defaultRoles(type: SolutionType): {
  required: SolutionComponentRole[];
  optional: SolutionComponentRole[];
} {
  switch (type) {
    case 'kubernetes':
      return {
        required: ['k8s_master', 'k8s_worker'],
        optional: ['object_storage', 'public_ip', 'cdn_egress', 'internet_egress', 'load_balancer', 'block_storage'],
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

/**
 * Promote quantities into requiredRoles so incomplete LLM envelopes cannot claim 100% coverage.
 * Mutates spec in place; returns new assumptions/rules.
 */
export function enrichSpecFromQuantities(spec: RequirementSpec): {
  assumptions: Assumption[];
  appliedRules: NormalizationRule[];
} {
  const assumptions: Assumption[] = [];
  const appliedRules: NormalizationRule[] = [];
  const q = spec.quantities;
  const requiredRoles = [...spec.requiredRoles];
  const optionalRoles = [...spec.optionalRoles];

  if (q.storageGiB) {
    pushUniqueRole(requiredRoles, 'object_storage');
    removeRole(optionalRoles, 'object_storage');
  }

  let blockStorageGiB = q.blockStorageGiB;
  const media = spec.constraints.storage?.media;
  const diskGiB = q.diskGiB;
  if (
    blockStorageGiB == null &&
    diskGiB != null &&
    media === 'hdd' &&
    diskGiB >= BLOCK_STORAGE_DISK_THRESHOLD_GIB
  ) {
    blockStorageGiB = diskGiB;
    q.blockStorageGiB = diskGiB;
    // Keep a small system disk for workers/VMs; large volume is attached block.
    if (q.workerDiskGiB == null || q.workerDiskGiB === diskGiB) {
      q.workerDiskGiB = 100;
    }
    if (q.diskGiB === diskGiB) {
      q.diskGiB = 100;
    }
    appliedRules.push({
      field: 'quantities.blockStorageGiB',
      from: `diskGiB=${diskGiB}+hdd`,
      to: String(blockStorageGiB),
      ruleId: 'large-hdd-as-block-storage',
    });
  }

  if (blockStorageGiB) {
    pushUniqueRole(requiredRoles, 'block_storage');
    removeRole(optionalRoles, 'block_storage');
  }

  if (q.publicIpCount) {
    pushUniqueRole(requiredRoles, 'public_ip');
    removeRole(optionalRoles, 'public_ip');
  }

  if (q.egressGiB) {
    pushUniqueRole(requiredRoles, 'internet_egress');
    removeRole(optionalRoles, 'internet_egress');
  }

  if (q.cdnEgressGiB) {
    q.cdnRequested = true;
    pushUniqueRole(requiredRoles, 'cdn_egress');
    removeRole(optionalRoles, 'cdn_egress');
  } else if (q.cdnRequested) {
    // Volume unknown: optional role + clarification warning (not hard missing-role).
    pushUniqueRole(optionalRoles, 'cdn_egress');
    assumptions.push({
      code: 'CDN_VOLUME_UNKNOWN',
      message: 'CDN запрошен, но объём CDN-трафика не указан — полная оценка невозможна',
      field: 'quantities.cdnEgressGiB',
      impact: 'high',
    });
  }

  if (spec.solutionType === 'kubernetes') {
    if (q.workerCount != null && q.workerCount > 0) {
      q.workerCountExplicit = q.workerCountExplicit !== false;
    } else {
      q.workerCount = undefined;
      q.workerCountExplicit = false;
      assumptions.push({
        code: 'WORKER_COUNT_UNKNOWN',
        message: 'Число worker-нод не указано — полный расчёт невозможен (preview возможен на 1 ноде)',
        field: 'quantities.workerCount',
        impact: 'high',
      });
    }

    const extras = spec.extras ?? {};
    const shapeScope = extras.workerShapeScope;
    if (q.workerVcpu == null && spec.constraints.minVcpu != null) {
      q.workerVcpu = spec.constraints.minVcpu;
    }
    if (q.workerRamGiB == null && spec.constraints.minRamGiB != null) {
      q.workerRamGiB = spec.constraints.minRamGiB;
    }
    const hasShape = q.workerVcpu != null || q.workerRamGiB != null;
    // Confirmed scopes skip the warning; field names alone are not confirmation.
    if (hasShape && shapeScope !== 'per_worker' && shapeScope !== 'cluster') {
      assumptions.push({
        code: 'WORKER_SHAPE_SCOPE_AMBIGUOUS',
        message:
          'vCPU/RAM интерпретированы как на одну worker-ноду; уточните, если это размер всего пула',
        field: 'quantities.workerVcpu',
        impact: 'medium',
      });
      spec.extras = {...extras, workerShapeScope: 'per_worker_assumed'};
    }
  }

  spec.requiredRoles = requiredRoles;
  spec.optionalRoles = optionalRoles;
  return {assumptions, appliedRules};
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
    const spec: RequirementSpec = {
      ...input.requirements,
      period: input.requirements.period ?? {hoursPerMonth: 720 as const},
      currency: 'RUB' as const,
      vatMode: 'included' as const,
      requiredRoles: [...input.requirements.requiredRoles],
      optionalRoles: [...(input.requirements.optionalRoles ?? [])],
      quantities: {...input.requirements.quantities},
      constraints: {...input.requirements.constraints},
      extras: input.requirements.extras ? {...input.requirements.extras} : undefined,
    };
    assumptions.push({
      code: 'DEFAULT_MONTH_HOURS',
      message: 'Для месячной цены использовано 720 часов',
      field: 'period.hoursPerMonth',
      value: 720,
      impact: 'low',
    });
    const enriched = enrichSpecFromQuantities(spec);
    assumptions.push(...enriched.assumptions);
    appliedRules.push(...enriched.appliedRules);
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
  const egressGiB = num(flat.egressGiB) ?? num(flat.internetEgressGiB);
  const cdnEgressGiB = num(flat.cdnEgressGiB);
  const cdnRequested =
    flat.cdnRequested === true ||
    flat.cdn === true ||
    cdnEgressGiB != null ||
    (typeof flat.rawText === 'string' && /\bcdn\b/i.test(flat.rawText));

  const publicIpCount =
    num(flat.publicIpCount) ??
    (solutionType === 'web_application' ? 1 : undefined);

  if (gpuTrace.normalized && !requiredRoles.includes('gpu_compute')) {
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

  const explicitDiskGiB = num(flat.diskGiB);
  const explicitBlockStorageGiB =
    num(flat.blockStorageGiB) ?? num(flat.blockDiskGiB) ?? num(flat.hddGiB);
  const diskGiB = explicitDiskGiB ?? 100;
  if (explicitDiskGiB == null && (solutionType === 'virtual_machine' || solutionType === 'kubernetes')) {
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

  const explicitWorkerCount = num(flat.workerCount);
  const workerCount = explicitWorkerCount;
  const workerCountExplicit = explicitWorkerCount != null;

  const workerVcpu = num(flat.workerVcpu);
  const workerRamGiB = num(flat.workerRamGiB);
  const workerShapeExplicit = workerVcpu != null || workerRamGiB != null;
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
      String(explicitBlockStorageGiB ?? ''),
      String(egressGiB ?? ''),
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
      availabilityZones:
        num(flat.availabilityZones) ??
        (flat.zones === 1 || flat.singleZone === true ? 1 : undefined),
      minVcpu,
      minRamGiB: resolvedRam,
      gpu: gpuTrace.normalized
        ? {
            model: gpuTrace.normalized,
            minCount: num(flat.gpuCount) ?? 1,
          }
        : undefined,
      storage: {
        minGiB: storageGiB ?? explicitBlockStorageGiB,
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
      workerCountExplicit,
      instanceCount: num(flat.instanceCount) ?? 1,
      storageGiB,
      blockStorageGiB: explicitBlockStorageGiB,
      egressGiB,
      cdnEgressGiB,
      cdnRequested: cdnRequested || undefined,
      publicIpCount,
      diskGiB,
      workerVcpu,
      workerRamGiB,
      workerDiskGiB: num(flat.workerDiskGiB) ?? (explicitBlockStorageGiB ? 100 : diskGiB),
    },
    rawText: typeof flat.rawText === 'string' ? flat.rawText : input.rawText,
    extras: {
      ...(typeof flat.workload === 'string' ? {workload: flat.workload} : {}),
      ...(typeof flat.model === 'string' ? {model: flat.model} : {}),
      ...(typeof flat.servicesCount === 'number' ? {servicesCount: flat.servicesCount} : {}),
      ...(typeof flat.hotPercent === 'number' ? {hotPercent: flat.hotPercent} : {}),
      managed: flat.managed === true || solutionType === 'kubernetes',
      workerShapeExplicit,
      ...(typeof flat.workerShapeScope === 'string'
        ? {workerShapeScope: flat.workerShapeScope}
        : {}),
    },
  };

  const enriched = enrichSpecFromQuantities(spec);
  assumptions.push(...enriched.assumptions);
  appliedRules.push(...enriched.appliedRules);

  return {spec, assumptions, appliedRules};
}
