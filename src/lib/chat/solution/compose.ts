/**
 * Solution composer orchestrator:
 * normalize → recipe → estimated Solution[] (not authoritative priced totals).
 */

import {amountNumber, catalog, type PeriodMode} from '@/lib/catalog';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {
  addCdnEgressParts,
  addInternetEgressParts,
  addPublicIpParts,
  listGpuPresets,
  pickBlockStorageMeter,
  quotePreset,
  toViewQuote,
} from '@/lib/calculator/quote';
import type {ComputePreset, GpuPreset, CalculatorPreset} from '@/lib/calculator/presets';
import {
  pickK8sMasterMeter,
  pickObjectStorageCapacity,
  quoteLakehouse,
} from '@/lib/calculator/lakehouse-quote';
import {
  resolveLakehouseInput,
  type LakehouseSize,
} from '@/lib/calculator/lakehouse-presets';
import {recommendInferenceInfra} from '../inference-recommend';
import {componentId, solutionId} from './ids';
import {normalizeRequirementSpec} from './normalize';
import type {
  Assumption,
  BillingScope,
  ComposeInput,
  ComposeStrategy,
  CoverageCounters,
  RequirementSpec,
  Solution,
  SolutionComponent,
  SolutionComponentRole,
  UnresolvedRequirement,
} from './types';

const RECIPE_VM = 'virtual_machine-v2';
const RECIPE_K8S = 'kubernetes-v2';
const RECIPE_WEB = 'web_application-v1';
const RECIPE_LAKE = 'lakehouse-v1';
const RECIPE_INF = 'inference-v1';

/** Kubernetes recipe policy — do not auto-add unrequested components. */
export const KUBERNETES_RECIPE_POLICY = {
  addMasterFee: 'required_if_available' as const,
  workerDisk: 'reuse_included_or_add' as const,
  publicIp: 'only_if_required' as const,
  loadBalancer: 'optional_if_application_public' as const,
  objectStorage: 'only_if_requested' as const,
  egress: 'price_if_volume_known_otherwise_unresolved' as const,
};

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function billingFromQuoteScope(scope: string | undefined): BillingScope {
  if (scope === 'gpu-only') return 'gpu';
  if (scope === 'bundle' || scope === 'compute' || scope === 'gpu-synthetic') return 'whole_instance';
  return 'unknown';
}

function coverageOf(
  required: SolutionComponentRole[],
  optional: SolutionComponentRole[],
  components: SolutionComponent[],
  clarificationSlots = 0,
): CoverageCounters {
  const have = new Set(components.map((c) => c.role));
  const requiredSatisfied = required.filter((r) => have.has(r)).length;
  const optionalSatisfied = optional.filter((r) => have.has(r)).length;
  const requiredTotal = required.length + clarificationSlots;
  const score =
    requiredTotal === 0
      ? 1
      : Math.round((requiredSatisfied / requiredTotal) * 100) / 100;
  return {
    requiredSatisfied,
    requiredTotal,
    optionalSatisfied,
    optionalTotal: optional.length,
    score,
  };
}

function defaultGpuHost(
  gpuModel: string,
  gpuCount: number,
): {vcpu: number; ramGiB: number; diskGiB: number; source: string} | null {
  const q = gpuModel.toLowerCase();
  const candidates = listGpuPresets().filter(
    (p) =>
      p.gpuCount === gpuCount &&
      p.vcpu != null &&
      p.ramGiB != null &&
      (q.includes(p.gpuModelMatch.toLowerCase()) || p.gpuModelMatch.toLowerCase().includes(q)),
  );
  if (!candidates.length) return null;
  const chosen =
    candidates.find((p) => p.shapeSource === 'cloud-ru') ??
    candidates.slice().sort((a, b) => (a.vcpu ?? 0) - (b.vcpu ?? 0))[0];
  return {
    vcpu: chosen.vcpu as number,
    ramGiB: chosen.ramGiB as number,
    diskGiB: chosen.diskGiB ?? 100,
    source: chosen.shapeSource ?? 'catalog',
  };
}

/** Shared with get_quote facade — builds calculator preset from RequirementSpec or flat bag. */
export function buildPresetFromRequirements(req: RequirementSpec | Record<string, unknown>): {
  preset: CalculatorPreset;
  assumedHost: {vcpu: number; ramGiB: number; diskGiB: number; source: string} | null;
  assumptions: string[];
} {
  const {spec, assumptions: ass} = normalizeRequirementSpec({
    solutionType:
      'solutionType' in req && typeof req.solutionType === 'string'
        ? req.solutionType
        : 'virtual_machine',
    requirements: req as RequirementSpec | Record<string, unknown>,
  });
  const assumptions = ass.map((a) => a.message);
  const gpuModel = spec.constraints.gpu?.model;
  const diskGiB = spec.quantities.diskGiB ?? 100;

  if (gpuModel) {
    const gpuCount = spec.constraints.gpu?.minCount ?? 1;
    let hostVcpu = spec.constraints.minVcpu;
    let hostRam = spec.constraints.minRamGiB;
    let assumedHost: {vcpu: number; ramGiB: number; diskGiB: number; source: string} | null = null;
    if (!hostVcpu || !hostRam) {
      const def = defaultGpuHost(gpuModel, gpuCount);
      if (def) {
        hostVcpu = def.vcpu;
        hostRam = def.ramGiB;
        assumedHost = def;
        assumptions.push(
          `Типовой хост для ${gpuModel}×${gpuCount}: ${def.vcpu} vCPU / ${def.ramGiB} GiB (${def.source})`,
        );
      }
    }
    const preset: GpuPreset = {
      id: `compose-gpu-${gpuModel}-${gpuCount}`,
      kind: 'gpu',
      title: `${gpuModel} ×${gpuCount}`,
      subtitle: 'compose_solution',
      gpuModelMatch: gpuModel,
      gpuCount,
      vcpu: hostVcpu,
      ramGiB: hostRam,
      diskGiB: hostVcpu && hostRam ? (spec.quantities.diskGiB ?? assumedHost?.diskGiB ?? 100) : diskGiB,
    };
    return {preset, assumedHost, assumptions};
  }

  const resolvedVcpu = spec.constraints.minVcpu ?? 1;
  const resolvedRam = spec.constraints.minRamGiB ?? resolvedVcpu * 4;
  const preset: ComputePreset = {
    id: `compose-compute-${resolvedVcpu}-${resolvedRam}`,
    kind: 'compute',
    family: 'general',
    title: `${resolvedVcpu} / ${resolvedRam}`,
    subtitle: 'compose_solution',
    vcpu: resolvedVcpu,
    ramGiB: resolvedRam,
    diskGiB,
  };
  return {preset, assumedHost: null, assumptions};
}

function sortSolutions(solutions: Solution[], strategy: ComposeStrategy): Solution[] {
  const copy = solutions.slice();
  if (strategy === 'balanced') {
    copy.sort((a, b) => {
      const as = a.coverage.score * 100000 - (a.estimatedMonthlyCostRub ?? 1e18);
      const bs = b.coverage.score * 100000 - (b.estimatedMonthlyCostRub ?? 1e18);
      return bs - as;
    });
    return copy;
  }
  if (strategy === 'performance') {
    copy.sort((a, b) => {
      const av = a.components.reduce((s, c) => s + (Number(c.configuration?.vcpu) || 0), 0);
      const bv = b.components.reduce((s, c) => s + (Number(c.configuration?.vcpu) || 0), 0);
      return bv - av || (a.estimatedMonthlyCostRub ?? 1e18) - (b.estimatedMonthlyCostRub ?? 1e18);
    });
    return copy;
  }
  if (strategy === 'availability') {
    copy.sort((a, b) => {
      const aHa = a.components.some((c) => c.configuration?.k8sTier === 'ha') ? 1 : 0;
      const bHa = b.components.some((c) => c.configuration?.k8sTier === 'ha') ? 1 : 0;
      return bHa - aHa || (a.estimatedMonthlyCostRub ?? 1e18) - (b.estimatedMonthlyCostRub ?? 1e18);
    });
    return copy;
  }
  // Prefer higher requirement coverage, then cheaper estimate — incomplete BOMs
  // must not win solely by omitting expensive required components (e.g. 100 ТБ HDD).
  copy.sort((a, b) => {
    const cov = (b.coverage.score ?? 0) - (a.coverage.score ?? 0);
    if (Math.abs(cov) > 1e-9) return cov;
    return (a.estimatedMonthlyCostRub ?? 1e18) - (b.estimatedMonthlyCostRub ?? 1e18);
  });
  return copy;
}

function finishSolution(input: {
  spec: RequirementSpec;
  provider: string;
  providerName: string;
  components: SolutionComponent[];
  assumptions: Assumption[];
  unresolved: UnresolvedRequirement[];
  tradeoffs: string[];
  recipeVersion: string;
}): Solution {
  const estimate = round2(
    input.components.reduce((s, c) => s + (c.estimatedMonthlyCostRub ?? 0), 0),
  );
  const clarificationSlots =
    input.spec.solutionType === 'kubernetes' &&
    input.spec.quantities.workerCountExplicit !== true
      ? 1
      : 0;
  const coverage = coverageOf(
    input.spec.requiredRoles,
    input.spec.optionalRoles,
    input.components,
    clarificationSlots,
  );
  const id = solutionId(input.spec.id, input.provider, input.components);
  const blocking = input.unresolved.some((u) => u.severity === 'blocking');
  const status =
    blocking || coverage.score < 0.5
      ? 'invalid'
      : coverage.score < 1 || input.unresolved.length
        ? 'partial'
        : 'valid';
  return {
    id,
    requirementSpecId: input.spec.id,
    provider: input.provider,
    providerName: input.providerName,
    solutionType: input.spec.solutionType,
    strategy: input.spec.strategy,
    components: input.components,
    assumptions: input.assumptions,
    unresolved: input.unresolved,
    tradeoffs: input.tradeoffs,
    coverage,
    estimatedMonthlyCostRub: estimate,
    // Compat aliases for prompt/fast-path
    monthlyCostRub: estimate,
    requirementsCoverage: coverage.score,
    status,
    priceCompleteness: undefined,
    provenance: {
      recipeVersion: input.recipeVersion,
      catalogAsOf: catalogAsOfIso(),
      generatedAt: new Date().toISOString(),
    },
  };
}

function composeVirtualMachine(spec: RequirementSpec, baseAssumptions: Assumption[]): Solution[] {
  const {preset} = buildPresetFromRequirements(spec);
  let view = toViewQuote(quotePreset(preset, 'month'));
  const ipCount = spec.quantities.publicIpCount;
  if (ipCount) view = addPublicIpParts(view, ipCount, 'month');
  const cdn = spec.quantities.cdnEgressGiB;
  if (cdn) view = addCdnEgressParts(view, cdn, 'month');

  const providers = spec.constraints.providers;
  const solutions: Solution[] = [];

  for (const q of view.quotes) {
    if (providers?.length && !providers.includes(q.provider)) continue;
    if (spec.constraints.excludedProviders?.includes(q.provider)) continue;

    const role: SolutionComponentRole =
      preset.kind === 'gpu' ? 'gpu_compute' : 'compute';
    const components: SolutionComponent[] = q.parts.map((p, i) => {
      const partRole: SolutionComponentRole =
        p.id === 'ip'
          ? 'public_ip'
          : p.id === 'cdn'
            ? 'cdn_egress'
            : p.id === 'disk'
              ? 'block_storage'
              : role;
      return {
        id: componentId(partRole, q.provider, undefined, 1),
        role: partRole,
        provider: q.provider,
        title: p.label,
        quantity: 1,
        estimatedMonthlyCostRub: round2(p.amount),
        selection: {
          method: q.scope === 'gpu-synthetic' ? 'synthetic' : 'nearest_match',
        },
        scope: {billingScope: billingFromQuoteScope(q.scope)},
        configuration: {partId: p.id, index: i},
      };
    });

    const unresolved: UnresolvedRequirement[] = [];
    if (spec.quantities.storageGiB) {
      const storage = addStorageComponent(
        q.provider,
        spec.quantities.storageGiB,
        spec.constraints.storage?.class === 'cold' ? 'cold' : 'standard',
      );
      if (storage) components.push(storage);
      else {
        unresolved.push({
          code: 'OBJECT_STORAGE_UNAVAILABLE',
          message: 'Object storage не найден у провайдера',
          role: 'object_storage',
          severity: 'blocking',
        });
      }
    }
    if (!spec.quantities.egressGiB && !spec.quantities.cdnEgressGiB) {
      unresolved.push({
        code: 'EGRESS_VOLUME_UNKNOWN',
        message: 'Объём исходящего трафика не указан, стоимость egress не включена',
        role: 'internet_egress',
        severity: 'warning',
      });
    }

    const tradeoffs: string[] = [];
    if (q.scope === 'gpu-synthetic') {
      tradeoffs.push('GPU-хост собран из unit-ставок (synthetic) — оценка сборки');
    }
    if (q.scope === 'gpu-only') {
      tradeoffs.push('В оценке только GPU; vCPU/RAM отдельно');
    }

    solutions.push(
      finishSolution({
        spec,
        provider: q.provider,
        providerName: q.providerName,
        components,
        assumptions: baseAssumptions,
        unresolved,
        tradeoffs,
        recipeVersion: RECIPE_VM,
      }),
    );
  }
  return solutions;
}

function addStorageComponent(
  provider: string,
  volumeGiB: number,
  storageClass: 'standard' | 'cold',
): SolutionComponent | null {
  const meter = pickObjectStorageCapacity(provider, storageClass);
  if (!meter) return null;
  const rate = amountNumber(meter, 'month');
  if (rate == null) return null;
  return {
    id: componentId('object_storage', provider, meter.id, volumeGiB),
    role: 'object_storage',
    meterId: meter.id,
    productId: meter.id,
    sku: meter.sku,
    provider,
    title: `${meter.name} · ${volumeGiB} GiB`,
    quantity: volumeGiB,
    unit: 'GiB-month',
    estimatedMonthlyCostRub: round2(rate * volumeGiB),
    selection: {method: 'exact_structural_match'},
    scope: {billingScope: 'disk'},
    synthetic: Boolean(meter.synthetic),
    configuration: {storageClass, volumeGiB},
  };
}

function addBlockStorageComponent(
  provider: string,
  volumeGiB: number,
  media: 'hdd' | 'ssd' | 'nvme' | undefined,
): SolutionComponent | null {
  const picked = pickBlockStorageMeter(
    provider,
    media === 'hdd' || media === 'nvme' ? media : 'ssd',
  );
  if (!picked) return null;
  const mediaLabel = media === 'hdd' ? 'HDD' : media === 'nvme' ? 'NVMe' : 'SSD';
  return {
    id: componentId('block_storage', provider, picked.meter.id, volumeGiB),
    role: 'block_storage',
    meterId: picked.meter.id,
    productId: picked.meter.id,
    sku: picked.meter.sku,
    provider,
    title: `${picked.meter.name} · ${mediaLabel} ${volumeGiB} GiB`,
    quantity: volumeGiB,
    unit: 'GiB-month',
    estimatedMonthlyCostRub: round2(picked.rateMonth * volumeGiB),
    selection: {method: 'exact_structural_match'},
    scope: {billingScope: 'disk'},
    synthetic: Boolean(picked.meter.synthetic),
    configuration: {media: media ?? 'ssd', volumeGiB, diskIncluded: false},
  };
}

function composeKubernetes(spec: RequirementSpec, baseAssumptions: Assumption[]): Solution[] {
  const tier = spec.constraints.k8sTier === 'ha' ? 'ha' : 'basic';
  const workerCountExplicit = spec.quantities.workerCountExplicit === true;
  const workerCount = Math.max(
    1,
    Math.round(workerCountExplicit ? (spec.quantities.workerCount as number) : 1),
  );
  const workerVcpu = spec.quantities.workerVcpu ?? spec.constraints.minVcpu ?? 4;
  const workerRam = spec.quantities.workerRamGiB ?? spec.constraints.minRamGiB ?? workerVcpu * 4;
  const workerDisk = spec.quantities.workerDiskGiB ?? spec.quantities.diskGiB ?? 100;

  const assumptions: Assumption[] = [
    ...baseAssumptions,
    {
      code: 'K8S_TIER',
      message: `Managed Kubernetes control plane: ${tier === 'ha' ? 'HA' : 'basic/зональный'}`,
      field: 'constraints.k8sTier',
      value: tier,
      impact: 'medium',
    },
    {
      code: 'WORKER_SHAPE',
      message: `Worker-ноды: ${workerCount}× ${workerVcpu} vCPU / ${workerRam} GiB / ${workerDisk} GiB SSD`,
      impact: 'medium',
    },
    {
      code: 'WORKER_DISK_INCLUDED',
      message: 'Системный диск worker-узлов считается включённым в выбранный preset',
      impact: 'medium',
    },
  ];
  if (!workerCountExplicit) {
    assumptions.push({
      code: 'PRELIMINARY_SINGLE_WORKER',
      message: 'Предварительная оценка на 1 worker-ноде — число нод не указано',
      field: 'quantities.workerCount',
      value: 1,
      impact: 'high',
    });
  }

  const workerPreset: ComputePreset = {
    id: `k8s-worker-${workerVcpu}-${workerRam}`,
    kind: 'compute',
    family: 'general',
    title: `${workerVcpu}/${workerRam}`,
    subtitle: 'k8s-worker',
    vcpu: workerVcpu,
    ramGiB: workerRam,
    diskGiB: workerDisk,
  };
  const workerView = toViewQuote(quotePreset(workerPreset, 'month'));
  const providerIds = spec.constraints.providers?.length
    ? spec.constraints.providers
    : catalog.providers.map((p) => p.id);

  const solutions: Solution[] = [];
  for (const providerId of providerIds) {
    if (spec.constraints.excludedProviders?.includes(providerId)) continue;
    const master = pickK8sMasterMeter(providerId, tier);
    if (!master && KUBERNETES_RECIPE_POLICY.addMasterFee === 'required_if_available') {
      continue;
    }
    if (!master) continue;
    const masterAmount = amountNumber(master.meter, 'month');
    if (masterAmount == null) continue;
    const workerQ = workerView.quotes.find((q) => q.provider === providerId);
    if (!workerQ) continue;

    const providerName =
      catalog.providers.find((p) => p.id === providerId)?.name ?? providerId;
    const components: SolutionComponent[] = [
      {
        id: componentId('k8s_master', providerId, master.meter.id, 1),
        role: 'k8s_master',
        meterId: master.meter.id,
        productId: master.meter.id,
        sku: master.meter.sku,
        provider: providerId,
        title: master.meter.name,
        quantity: 1,
        estimatedMonthlyCostRub: round2(masterAmount),
        selection: {
          method: master.synthetic ? 'synthetic' : 'exact_structural_match',
        },
        scope: {billingScope: 'service_fee'},
        synthetic: master.synthetic,
        configuration: {k8sTier: master.effectiveTier},
      },
      {
        id: componentId('k8s_worker', providerId, undefined, workerCount),
        role: 'k8s_worker',
        provider: providerId,
        title: `${workerCount}× worker ${workerVcpu} vCPU / ${workerRam} GiB`,
        quantity: workerCount,
        estimatedMonthlyCostRub: round2(workerQ.total * workerCount),
        selection: {method: 'nearest_match'},
        scope: {billingScope: 'whole_instance'},
        configuration: {
          vcpu: workerVcpu,
          ramGiB: workerRam,
          diskGiB: workerDisk,
          count: workerCount,
          diskIncluded: true,
          preliminary: !workerCountExplicit,
        },
      },
    ];

    const unresolved: UnresolvedRequirement[] = [];
    const tradeoffs: string[] = [];
    if (master.synthetic) {
      tradeoffs.push('Цена мастера synthetic/оценка Cloud FinOps');
    }
    if (!workerCountExplicit) {
      unresolved.push({
        code: 'WORKER_COUNT_UNKNOWN',
        message: 'Число worker-нод не указано',
        role: 'k8s_worker',
        severity: 'blocking',
      });
    }

    // Attached block storage (HDD/SSD) — distinct from worker boot disk
    if (spec.quantities.blockStorageGiB) {
      const block = addBlockStorageComponent(
        providerId,
        spec.quantities.blockStorageGiB,
        spec.constraints.storage?.media,
      );
      if (block) components.push(block);
      else {
        unresolved.push({
          code: 'BLOCK_STORAGE_UNAVAILABLE',
          message: 'Блочное хранилище (HDD/SSD) не найдено у провайдера',
          role: 'block_storage',
          severity: 'blocking',
        });
      }
    }

    // object storage — only if requested
    if (
      KUBERNETES_RECIPE_POLICY.objectStorage === 'only_if_requested' &&
      spec.quantities.storageGiB
    ) {
      const storage = addStorageComponent(
        providerId,
        spec.quantities.storageGiB,
        spec.constraints.storage?.class === 'cold' ? 'cold' : 'standard',
      );
      if (storage) components.push(storage);
      else {
        unresolved.push({
          code: 'OBJECT_STORAGE_UNAVAILABLE',
          message: 'Object storage не найден',
          role: 'object_storage',
          severity: 'blocking',
        });
      }
    }

    // public IP — only if required/requested
    const ipCount = spec.quantities.publicIpCount;
    if (KUBERNETES_RECIPE_POLICY.publicIp === 'only_if_required' && ipCount) {
      const withIp = addPublicIpParts(
        {
          presetId: workerPreset.id,
          quotes: [workerQ],
          alternateQuotes: [],
          best: workerQ,
        },
        ipCount,
        'month',
      );
      const ipPart = withIp.quotes[0]?.parts.find((p) => p.id === 'ip');
      if (ipPart) {
        components.push({
          id: componentId('public_ip', providerId, undefined, ipCount),
          role: 'public_ip',
          provider: providerId,
          title: ipPart.label,
          quantity: ipCount,
          estimatedMonthlyCostRub: round2(ipPart.amount),
          selection: {method: 'nearest_match'},
          scope: {billingScope: 'service_fee'},
        });
      } else {
        unresolved.push({
          code: 'PUBLIC_IP_UNAVAILABLE',
          message: 'Публичный IP недоступен у провайдера',
          role: 'public_ip',
          severity: 'blocking',
        });
      }
    }

    // Internet egress — never conflate with CDN
    const egressGiB = spec.quantities.egressGiB;
    if (egressGiB) {
      const withEgress = addInternetEgressParts(
        {
          presetId: workerPreset.id,
          quotes: [{...workerQ, total: 0, parts: []}],
          alternateQuotes: [],
          best: null,
        },
        egressGiB,
        'month',
      );
      const egressPart = withEgress.quotes[0]?.parts.find((p) => p.id === 'egress');
      if (egressPart) {
        components.push({
          id: componentId('internet_egress', providerId, undefined, egressGiB),
          role: 'internet_egress',
          provider: providerId,
          title: egressPart.label,
          quantity: egressGiB,
          unit: 'GiB-month',
          estimatedMonthlyCostRub: round2(egressPart.amount),
          selection: {method: 'nearest_match'},
          scope: {billingScope: 'traffic'},
        });
      } else {
        unresolved.push({
          code: 'INTERNET_EGRESS_UNAVAILABLE',
          message: 'Internet egress не найден у провайдера',
          role: 'internet_egress',
          severity: 'blocking',
        });
      }
    } else if (
      KUBERNETES_RECIPE_POLICY.egress === 'price_if_volume_known_otherwise_unresolved' &&
      !spec.quantities.cdnEgressGiB
    ) {
      unresolved.push({
        code: 'EGRESS_VOLUME_UNKNOWN',
        message: 'Исходящий интернет-трафик не включён — объём не указан',
        role: 'internet_egress',
        severity: 'warning',
      });
    }

    const cdn = spec.quantities.cdnEgressGiB;
    if (cdn) {
      const withCdn = addCdnEgressParts(
        {
          presetId: workerPreset.id,
          quotes: [{...workerQ, total: 0, parts: []}],
          alternateQuotes: [],
          best: null,
        },
        cdn,
        'month',
      );
      const cdnPart = withCdn.quotes[0]?.parts.find((p) => p.id === 'cdn');
      if (cdnPart) {
        components.push({
          id: componentId('cdn_egress', providerId, undefined, cdn),
          role: 'cdn_egress',
          provider: providerId,
          title: cdnPart.label,
          quantity: cdn,
          unit: 'GiB-month',
          estimatedMonthlyCostRub: round2(cdnPart.amount),
          selection: {method: 'nearest_match'},
          scope: {billingScope: 'traffic'},
        });
      } else {
        unresolved.push({
          code: 'CDN_EGRESS_UNAVAILABLE',
          message: 'CDN egress не найден',
          role: 'cdn_egress',
          severity: 'warning',
        });
      }
    } else if (spec.quantities.cdnRequested) {
      unresolved.push({
        code: 'CDN_VOLUME_UNKNOWN',
        message: 'CDN запрошен, но объём трафика не указан — не оценён',
        role: 'cdn_egress',
        severity: 'warning',
      });
    }

    solutions.push(
      finishSolution({
        spec,
        provider: providerId,
        providerName,
        components,
        assumptions,
        unresolved,
        tradeoffs,
        recipeVersion: RECIPE_K8S,
      }),
    );
  }
  return solutions;
}

function composeWebOrCustom(
  spec: RequirementSpec,
  baseAssumptions: Assumption[],
): Solution[] {
  // Reuse VM recipe with optional extras already in normalize roles.
  const vmSpec: RequirementSpec = {
    ...spec,
    solutionType: 'virtual_machine',
    quantities: {
      ...spec.quantities,
      publicIpCount:
        spec.quantities.publicIpCount ??
        (spec.solutionType === 'web_application' ? 1 : undefined),
    },
  };
  return composeVirtualMachine(vmSpec, baseAssumptions).map((s) => ({
    ...s,
    solutionType: spec.solutionType,
    id: solutionId(spec.id, s.provider, s.components),
    provenance: {...s.provenance, recipeVersion: RECIPE_WEB},
  }));
}

function composeLakehouse(spec: RequirementSpec, baseAssumptions: Assumption[]): Solution[] {
  const sizeRaw =
    typeof spec.extras?.workload === 'string' ? spec.extras.workload : 'medium';
  const presetId: LakehouseSize =
    sizeRaw === 'small' || sizeRaw === 'medium' || sizeRaw === 'large' ? sizeRaw : 'medium';
  const input = resolveLakehouseInput(presetId, {
    lakeTiB: spec.quantities.storageGiB ? spec.quantities.storageGiB / 1024 : undefined,
    hotPercent:
      typeof spec.extras?.hotPercent === 'number' ? spec.extras.hotPercent : undefined,
    k8sTier: spec.constraints.k8sTier === 'ha' ? 'ha' : 'basic',
  });
  const result = quoteLakehouse(input, 'month' as PeriodMode);
  return result.quotes
    .filter(
      (q) =>
        !spec.constraints.providers?.length ||
        spec.constraints.providers.includes(q.provider),
    )
    .map((q) => {
      const components: SolutionComponent[] = q.parts.map((p) => {
        const role: SolutionComponentRole =
          p.id === 'storage'
            ? 'object_storage'
            : p.id === 'k8s'
              ? 'k8s_master'
              : 'k8s_worker';
        return {
          id: componentId(role, q.provider, undefined, 1),
          role,
          provider: q.provider,
          title: p.label,
          quantity: 1,
          estimatedMonthlyCostRub: round2(p.amount),
          selection: {method: 'nearest_match'},
          scope: {
            billingScope: role === 'object_storage' ? 'disk' : role === 'k8s_master' ? 'service_fee' : 'whole_instance',
          },
        };
      });
      return finishSolution({
        spec,
        provider: q.provider,
        providerName: q.providerName,
        components,
        assumptions: [
          ...baseAssumptions,
          {
            code: 'LAKEHOUSE_PRESET',
            message: `DIY open lakehouse preset=${presetId}, lake=${input.lakeTiB} TiB`,
            impact: 'medium',
          },
        ],
        unresolved: [
          {
            code: 'LAKEHOUSE_EXTRAS_EXCLUDED',
            message: 'Managed Spark/Trino PaaS и S3 requests/egress не включены',
            severity: 'warning',
          },
        ],
        tradeoffs: q.note ? [q.note] : [],
        recipeVersion: RECIPE_LAKE,
      });
    });
}

function composeInference(spec: RequirementSpec, baseAssumptions: Assumption[]): Solution[] {
  const model =
    (typeof spec.extras?.model === 'string' && spec.extras.model) ||
    (typeof spec.extras?.workload === 'string' && spec.extras.workload) ||
    '';
  if (!model) {
    return [
      finishSolution({
        spec,
        provider: 'n/a',
        providerName: 'n/a',
        components: [],
        assumptions: baseAssumptions,
        unresolved: [
          {
            code: 'MODEL_MISSING',
            message: 'Не указана модель для inference',
            role: 'gpu_compute',
            severity: 'blocking',
          },
        ],
        tradeoffs: [],
        recipeVersion: RECIPE_INF,
      }),
    ];
  }
  const result = recommendInferenceInfra({model, quant: 'auto', maxConfigs: 3});
  if (!result.ok || !result.configs?.length) {
    return [
      finishSolution({
        spec,
        provider: 'n/a',
        providerName: 'n/a',
        components: [],
        assumptions: [...baseAssumptions, {code: 'MODEL', message: `Модель: ${model}`, impact: 'low'}],
        unresolved: [
          {
            code: 'GPU_CONFIG_MISSING',
            message: 'Не удалось подобрать GPU-конфиг',
            role: 'gpu_compute',
            severity: 'blocking',
          },
        ],
        tradeoffs: [],
        recipeVersion: RECIPE_INF,
      }),
    ];
  }
  const solutions: Solution[] = [];
  for (const cfg of result.configs) {
    for (const q of cfg.quotes ?? []) {
      if (spec.constraints.providers?.length && !spec.constraints.providers.includes(q.provider)) {
        continue;
      }
      const providerName =
        catalog.providers.find((p) => p.id === q.provider)?.name ?? q.provider;
      const total = round2(q.totalMonth ?? null);
      const components: SolutionComponent[] = [
        {
          id: componentId('gpu_compute', q.provider, undefined, 1),
          role: 'gpu_compute',
          provider: q.provider,
          title: `${cfg.gpuCount}× ${cfg.gpuFamily} (${cfg.quant})`,
          quantity: 1,
          estimatedMonthlyCostRub: total,
          selection: {method: 'nearest_match'},
          scope: {billingScope: 'whole_instance'},
          configuration: {
            gpuModel: cfg.gpuFamily,
            gpuCount: cfg.gpuCount,
            quant: cfg.quant,
          },
        },
      ];
      solutions.push(
        finishSolution({
          spec,
          provider: q.provider,
          providerName,
          components,
          assumptions: [
            ...baseAssumptions,
            {
              code: 'INFERENCE_MODEL',
              message: `Self-host inference для ${model}`,
              impact: 'medium',
            },
          ],
          unresolved: [],
          tradeoffs: ['Hosted API может быть дешевле при низком трафике'],
          recipeVersion: RECIPE_INF,
        }),
      );
    }
  }
  return solutions;
}

export type ComposeResult = {
  requirementSpec: RequirementSpec;
  strategy: ComposeStrategy;
  catalogAsOf: string;
  currency: 'RUB';
  vatIncluded: true;
  assumptions: Assumption[];
  normalizationRules: {field: string; from: string; to: string; ruleId: string}[];
  solutions: Solution[];
  note: string;
};

export function composeSolution(input: ComposeInput): ComposeResult {
  const {spec, assumptions, appliedRules} = normalizeRequirementSpec({
    solutionType: input.solutionType,
    requirements: input.requirements,
    providers: input.providers,
    strategy: input.strategy,
    budgetMonthRub: input.budgetMonthRub,
  });

  // Apply simple repairs from previous validate (raise_quantity / add_component hints).
  if (input.repairs?.length) {
    for (const r of input.repairs) {
      if (r.action === 'raise_quantity' && r.minimumQuantity > 0) {
        if (!spec.quantities.workerCount || r.minimumQuantity > spec.quantities.workerCount) {
          spec.quantities.workerCount = r.minimumQuantity;
        }
      }
      if (r.action === 'add_component' && r.role === 'object_storage') {
        const giB = num(r.constraints?.storageGiB) ?? spec.quantities.storageGiB ?? 1024;
        spec.quantities.storageGiB = giB;
        if (!spec.requiredRoles.includes('object_storage')) {
          spec.requiredRoles.push('object_storage');
        }
      }
      if (r.action === 'add_component' && r.role === 'public_ip') {
        spec.quantities.publicIpCount = Math.max(1, spec.quantities.publicIpCount ?? 1);
        if (!spec.requiredRoles.includes('public_ip')) {
          spec.requiredRoles.push('public_ip');
        }
      }
      if (r.action === 'add_component' && r.role === 'block_storage') {
        const giB =
          num(r.constraints?.blockStorageGiB) ??
          num(r.constraints?.volumeGiB) ??
          spec.quantities.blockStorageGiB ??
          1024;
        spec.quantities.blockStorageGiB = giB;
        if (!spec.requiredRoles.includes('block_storage')) {
          spec.requiredRoles.push('block_storage');
        }
      }
      if (r.action === 'add_component' && r.role === 'internet_egress') {
        const giB =
          num(r.constraints?.egressGiB) ??
          num(r.constraints?.volumeGiB) ??
          spec.quantities.egressGiB ??
          1024;
        spec.quantities.egressGiB = giB;
        if (!spec.requiredRoles.includes('internet_egress')) {
          spec.requiredRoles.push('internet_egress');
        }
      }
      if (r.action === 'add_component' && r.role === 'cdn_egress') {
        const giB =
          num(r.constraints?.cdnEgressGiB) ??
          num(r.constraints?.volumeGiB) ??
          spec.quantities.cdnEgressGiB;
        if (giB) spec.quantities.cdnEgressGiB = giB;
        spec.quantities.cdnRequested = true;
      }
    }
  }

  const maxSolutions = Math.min(Math.max(input.maxSolutions ?? 6, 1), 12);
  let solutions: Solution[];
  switch (spec.solutionType) {
    case 'kubernetes':
      solutions = composeKubernetes(spec, assumptions);
      break;
    case 'web_application':
    case 'custom':
      solutions = composeWebOrCustom(spec, assumptions);
      break;
    case 'lakehouse':
      solutions = composeLakehouse(spec, assumptions);
      break;
    case 'inference':
      solutions = composeInference(spec, assumptions);
      break;
    default:
      solutions = composeVirtualMachine(spec, assumptions);
  }

  const sorted = sortSolutions(solutions, spec.strategy).slice(0, maxSolutions);
  return {
    requirementSpec: spec,
    strategy: spec.strategy,
    catalogAsOf: catalogAsOfIso(),
    currency: 'RUB',
    vatIncluded: true,
    assumptions,
    normalizationRules: appliedRules,
    solutions: sorted,
    note:
      'estimatedMonthlyCostRub — только для ранжирования. Authoritative totals — только из price_solution. После compose вызови validate_solution; не объявляй valid при hard fail.',
  };
}
