/**
 * Deterministic solution composer (recipes over quote + catalog pickers).
 * LLM chooses solutionType / requirements / strategy; backend builds BOM + prices.
 */

import {amountNumber, catalog, type PeriodMode} from '@/lib/catalog';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {
  addCdnEgressParts,
  addPublicIpParts,
  listGpuPresets,
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
import {normalizeGpuModel, normalizeProviderIds} from './synonyms';
import type {
  ComposeInput,
  ComposeStrategy,
  RequirementSpec,
  Solution,
  SolutionComponent,
  SolutionType,
} from './types';

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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

/** Build calculator preset from requirements (shared with get_quote shortcut). */
export function buildPresetFromRequirements(req: RequirementSpec): {
  preset: CalculatorPreset;
  assumedHost: {vcpu: number; ramGiB: number; diskGiB: number; source: string} | null;
  assumptions: string[];
} {
  const assumptions: string[] = [];
  const gpuModel = normalizeGpuModel(
    typeof req.gpuModel === 'string' ? req.gpuModel : undefined,
  );
  const diskGiB = num(req.diskGiB) ?? 100;
  if (req.diskGiB == null) assumptions.push('Системный диск по умолчанию: 100 GiB SSD');

  if (gpuModel) {
    const gpuCount = num(req.gpuCount) ?? 1;
    let hostVcpu = num(req.vcpu) ?? num(req.vcpuMin);
    let hostRam = num(req.ramGiB) ?? num(req.ramGiBMin);
    let assumedHost: {vcpu: number; ramGiB: number; diskGiB: number; source: string} | null =
      null;
    if (!hostVcpu || !hostRam) {
      const def = defaultGpuHost(gpuModel, gpuCount);
      if (def) {
        hostVcpu = def.vcpu;
        hostRam = def.ramGiB;
        assumedHost = def;
        assumptions.push(
          `Типовой хост для ${gpuModel}×${gpuCount}: ${def.vcpu} vCPU / ${def.ramGiB} GiB (источник формы: ${def.source})`,
        );
      }
    }
    const useDisk = hostVcpu && hostRam ? (num(req.diskGiB) ?? assumedHost?.diskGiB ?? 100) : diskGiB;
    const preset: GpuPreset = {
      id: `compose-gpu-${gpuModel}-${gpuCount}`,
      kind: 'gpu',
      title: `${gpuModel} ×${gpuCount}`,
      subtitle: 'compose_solution',
      gpuModelMatch: gpuModel,
      gpuCount,
      vcpu: hostVcpu,
      ramGiB: hostRam,
      diskGiB: useDisk,
    };
    return {preset, assumedHost, assumptions};
  }

  const resolvedVcpu = num(req.vcpu) ?? num(req.vcpuMin) ?? 1;
  const resolvedRam = num(req.ramGiB) ?? num(req.ramGiBMin) ?? resolvedVcpu * 4;
  if (req.ramGiB == null && req.ramGiBMin == null) {
    assumptions.push(`RAM не указан — принято ${resolvedRam} GiB (4×vCPU, general)`);
  }
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

function coverageScore(
  requiredRoles: string[],
  components: SolutionComponent[],
  unresolved: string[],
): number {
  if (!requiredRoles.length) return unresolved.length ? 0.85 : 1;
  const have = new Set(components.map((c) => c.role));
  const hit = requiredRoles.filter((r) => have.has(r)).length;
  const base = hit / requiredRoles.length;
  const penalty = Math.min(0.25, unresolved.length * 0.08);
  return Math.round(Math.max(0, base - penalty) * 100) / 100;
}

function priceCompleteness(components: SolutionComponent[]): number {
  if (!components.length) return 0;
  const priced = components.filter((c) => c.monthlyCostRub != null && c.monthlyCostRub >= 0);
  return Math.round((priced.length / components.length) * 100) / 100;
}

function sortSolutions(solutions: Solution[], strategy: ComposeStrategy): Solution[] {
  const copy = solutions.slice();
  if (strategy === 'performance') {
    copy.sort((a, b) => {
      const av = a.components.reduce((s, c) => s + (Number(c.configuration?.vcpu) || 0), 0);
      const bv = b.components.reduce((s, c) => s + (Number(c.configuration?.vcpu) || 0), 0);
      return bv - av || (a.monthlyCostRub ?? 1e18) - (b.monthlyCostRub ?? 1e18);
    });
    return copy;
  }
  if (strategy === 'availability') {
    copy.sort((a, b) => {
      const aHa = a.components.some((c) => c.configuration?.k8sTier === 'ha') ? 1 : 0;
      const bHa = b.components.some((c) => c.configuration?.k8sTier === 'ha') ? 1 : 0;
      return bHa - aHa || (a.monthlyCostRub ?? 1e18) - (b.monthlyCostRub ?? 1e18);
    });
    return copy;
  }
  if (strategy === 'balanced') {
    copy.sort((a, b) => {
      const as = (a.requirementsCoverage || 0) * 100000 - (a.monthlyCostRub ?? 1e18);
      const bs = (b.requirementsCoverage || 0) * 100000 - (b.monthlyCostRub ?? 1e18);
      return bs - as;
    });
    return copy;
  }
  // cheapest
  copy.sort((a, b) => (a.monthlyCostRub ?? 1e18) - (b.monthlyCostRub ?? 1e18));
  return copy;
}

function statusFor(
  coverage: number,
  unresolved: string[],
  budget: number | undefined,
  total: number | null,
): Solution['status'] {
  if (coverage < 0.5 || (total == null && unresolved.length)) return 'invalid';
  if (budget != null && total != null && total > budget) return 'partial';
  if (unresolved.length || coverage < 0.95) return 'partial';
  return 'valid';
}

function composeVirtualMachine(
  req: RequirementSpec,
  providers: string[] | undefined,
  budget: number | undefined,
): Solution[] {
  const {preset, assumptions} = buildPresetFromRequirements(req);
  let view = toViewQuote(quotePreset(preset, 'month'));
  const ipCount = num(req.publicIpCount);
  if (ipCount) view = addPublicIpParts(view, ipCount, 'month');
  const cdn = num(req.cdnEgressGiB);
  if (cdn) view = addCdnEgressParts(view, cdn, 'month');

  const solutions: Solution[] = [];
  for (const q of view.quotes) {
    if (providers?.length && !providers.includes(q.provider)) continue;
    const components: SolutionComponent[] = q.parts.map((p, i) => ({
      role: p.id || `part_${i}`,
      productId: null,
      meterId: null,
      title: p.label,
      quantity: 1,
      monthlyCostRub: round2(p.amount),
      scope: q.scope,
    }));
    // Attach primary meters when available from underlying quote.
    const unresolved: string[] = [];
    if (req.objectStorageGiB) unresolved.push('object_storage');
    if (req.egressGiB && !cdn) unresolved.push('network_egress');
    const total = round2(q.total);
    const coverage = coverageScore(['compute'], components, unresolved);
    const tradeoffs: string[] = [];
    if (q.scope === 'gpu-synthetic') {
      tradeoffs.push('GPU-хост собран из unit-ставок (synthetic) — помечай как оценку сборки');
    }
    if (q.scope === 'gpu-only') {
      tradeoffs.push('В цене только GPU; vCPU/RAM отдельно');
    }
    solutions.push({
      id: `vm-${q.provider}`,
      provider: q.provider,
      providerName: q.providerName,
      solutionType: 'virtual_machine',
      status: statusFor(coverage, unresolved, budget, total),
      components,
      monthlyCostRub: total,
      requirementsCoverage: coverage,
      priceCompleteness: priceCompleteness(components),
      assumptions: [...assumptions],
      tradeoffs,
      unresolved,
    });
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
    role: 'object_storage',
    productId: meter.id,
    meterId: meter.id,
    title: `${meter.name} · ${volumeGiB} GiB`,
    quantity: volumeGiB,
    unit: 'GiB-month',
    monthlyCostRub: round2(rate * volumeGiB),
    synthetic: Boolean(meter.synthetic),
    configuration: {storageClass, volumeGiB},
  };
}

function composeKubernetes(
  req: RequirementSpec,
  providers: string[] | undefined,
  budget: number | undefined,
): Solution[] {
  const tier = req.k8sTier === 'ha' ? 'ha' : 'basic';
  const workerCount = Math.max(1, Math.round(num(req.workerCount) ?? 3));
  const workerVcpu =
    num(req.workerVcpu) ??
    num(req.vcpu) ??
    num(req.vcpuMin) ??
    (num(req.servicesCount) ? Math.max(2, Math.ceil((req.servicesCount as number) / 5)) : 4);
  const workerRam =
    num(req.workerRamGiB) ?? num(req.ramGiB) ?? num(req.ramGiBMin) ?? workerVcpu * 4;
  const workerDisk = num(req.workerDiskGiB) ?? num(req.diskGiB) ?? 100;

  const assumptions = [
    `Managed Kubernetes control plane: ${tier === 'ha' ? 'HA/региональный' : 'базовый/зональный'}`,
    `Worker-ноды: ${workerCount}× ${workerVcpu} vCPU / ${workerRam} GiB / ${workerDisk} GiB SSD`,
  ];
  if (req.servicesCount && !req.workerVcpu && !req.vcpu) {
    assumptions.push(
      `Число сервисов=${req.servicesCount} → эвристика worker ${workerVcpu} vCPU (уточни при необходимости)`,
    );
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
  const providerIds = providers?.length
    ? providers
    : catalog.providers.map((p) => p.id);

  const solutions: Solution[] = [];
  for (const providerId of providerIds) {
    const master = pickK8sMasterMeter(providerId, tier);
    if (!master) continue;
    const masterAmount = amountNumber(master.meter, 'month');
    if (masterAmount == null) continue;

    const workerQ = workerView.quotes.find((q) => q.provider === providerId);
    if (!workerQ) continue;

    const providerName =
      catalog.providers.find((p) => p.id === providerId)?.name ?? providerId;
    const components: SolutionComponent[] = [
      {
        role: 'control_plane',
        productId: master.meter.id,
        meterId: master.meter.id,
        title: master.meter.name,
        quantity: 1,
        monthlyCostRub: round2(masterAmount),
        synthetic: master.synthetic,
        configuration: {k8sTier: master.effectiveTier},
      },
      {
        role: 'worker_nodes',
        productId: null,
        meterId: null,
        title: `${workerCount}× worker ${workerVcpu} vCPU / ${workerRam} GiB`,
        quantity: workerCount,
        monthlyCostRub: round2(workerQ.total * workerCount),
        scope: workerQ.scope,
        configuration: {
          vcpu: workerVcpu,
          ramGiB: workerRam,
          diskGiB: workerDisk,
          count: workerCount,
        },
      },
    ];

    const unresolved: string[] = [];
    const tradeoffs: string[] = [];
    if (master.synthetic) {
      tradeoffs.push('Цена мастера synthetic/оценка Cloud FinOps — помечай в ответе');
    }

    const storageGiB = num(req.objectStorageGiB);
    if (storageGiB) {
      const storage = addStorageComponent(
        providerId,
        storageGiB,
        req.storageClass === 'cold' ? 'cold' : 'standard',
      );
      if (storage) components.push(storage);
      else unresolved.push('object_storage');
    }

    const ipCount = num(req.publicIpCount);
    if (ipCount) {
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
          role: 'public_ip',
          productId: null,
          meterId: null,
          title: ipPart.label,
          quantity: ipCount,
          monthlyCostRub: round2(ipPart.amount),
        });
      } else unresolved.push('public_ip');
    }

    const cdn = num(req.cdnEgressGiB) ?? num(req.egressGiB);
    if (cdn) {
      const withCdn = addCdnEgressParts(
        {
          presetId: workerPreset.id,
          quotes: [
            {
              ...workerQ,
              total: 0,
              parts: [],
            },
          ],
          alternateQuotes: [],
          best: null,
        },
        cdn,
        'month',
      );
      const cdnPart = withCdn.quotes[0]?.parts.find((p) => p.id === 'cdn');
      if (cdnPart) {
        components.push({
          role: 'cdn_egress',
          productId: null,
          meterId: null,
          title: cdnPart.label,
          quantity: cdn,
          unit: 'GiB-month',
          monthlyCostRub: round2(cdnPart.amount),
        });
      } else unresolved.push('cdn_egress');
    } else if (req.egressGiB == null && req.cdnEgressGiB == null) {
      tradeoffs.push('Исходящий трафик не включён — объём не указан');
    }

    const total = round2(
      components.reduce((s, c) => s + (c.monthlyCostRub ?? 0), 0),
    );
    const required = ['control_plane', 'worker_nodes'];
    if (storageGiB) required.push('object_storage');
    const coverage = coverageScore(required, components, unresolved);
    solutions.push({
      id: `k8s-${providerId}`,
      provider: providerId,
      providerName,
      solutionType: 'kubernetes',
      status: statusFor(coverage, unresolved, budget, total),
      components,
      monthlyCostRub: total,
      requirementsCoverage: coverage,
      priceCompleteness: priceCompleteness(components),
      assumptions,
      tradeoffs,
      unresolved,
    });
  }
  return solutions;
}

function composeWebOrCustom(
  solutionType: 'web_application' | 'custom',
  req: RequirementSpec,
  providers: string[] | undefined,
  budget: number | undefined,
): Solution[] {
  // Base VM (+ optional IP/CDN/S3) per provider.
  const baseReq: RequirementSpec = {
    ...req,
    publicIpCount: num(req.publicIpCount) ?? (solutionType === 'web_application' ? 1 : undefined),
  };
  const vmSolutions = composeVirtualMachine(baseReq, providers, budget);
  const storageGiB = num(req.objectStorageGiB);
  if (!storageGiB && !num(req.cdnEgressGiB)) {
    return vmSolutions.map((s) => ({...s, solutionType, id: `${solutionType}-${s.provider}`}));
  }

  return vmSolutions.map((s) => {
    const components = [...s.components];
    const unresolved = [...s.unresolved];
    const assumptions = [...s.assumptions];
    if (storageGiB) {
      const storage = addStorageComponent(
        s.provider,
        storageGiB,
        req.storageClass === 'cold' ? 'cold' : 'standard',
      );
      if (storage) components.push(storage);
      else unresolved.push('object_storage');
    }
    const total = round2(components.reduce((sum, c) => sum + (c.monthlyCostRub ?? 0), 0));
    const coverage = coverageScore(
      ['compute', ...(storageGiB ? ['object_storage'] : [])],
      components,
      unresolved,
    );
    return {
      ...s,
      id: `${solutionType}-${s.provider}`,
      solutionType,
      components,
      monthlyCostRub: total,
      requirementsCoverage: coverage,
      priceCompleteness: priceCompleteness(components),
      assumptions,
      unresolved,
      status: statusFor(coverage, unresolved, budget, total),
    };
  });
}

function composeLakehouse(req: RequirementSpec, providers: string[] | undefined): Solution[] {
  const sizeRaw = typeof req.workload === 'string' ? req.workload : 'medium';
  const presetId: LakehouseSize =
    sizeRaw === 'small' || sizeRaw === 'medium' || sizeRaw === 'large' ? sizeRaw : 'medium';
  const input = resolveLakehouseInput(presetId, {
    lakeTiB: num(req.objectStorageGiB) ? (req.objectStorageGiB as number) / 1024 : undefined,
    hotPercent: typeof req.hotPercent === 'number' ? req.hotPercent : undefined,
    k8sTier: req.k8sTier === 'ha' ? 'ha' : 'basic',
  });
  const result = quoteLakehouse(input, 'month' as PeriodMode);
  return result.quotes
    .filter((q) => !providers?.length || providers.includes(q.provider))
    .map((q) => {
      const components: SolutionComponent[] = q.parts.map((p) => ({
        role: p.id,
        productId: null,
        meterId: null,
        title: p.label,
        quantity: 1,
        monthlyCostRub: round2(p.amount),
      }));
      const total = round2(q.total);
      return {
        id: `lakehouse-${q.provider}`,
        provider: q.provider,
        providerName: q.providerName,
        solutionType: 'lakehouse' as SolutionType,
        status: 'valid' as const,
        components,
        monthlyCostRub: total,
        requirementsCoverage: 1,
        priceCompleteness: priceCompleteness(components),
        assumptions: [
          `DIY open lakehouse preset=${presetId}, lake=${input.lakeTiB} TiB, k8s=${input.k8sTier}`,
        ],
        tradeoffs: [
          'Managed Spark/Trino PaaS и S3 requests/egress в сумму не входят',
          ...(q.note ? [q.note] : []),
        ],
        unresolved: [] as string[],
      };
    });
}

function composeInference(req: RequirementSpec, providers: string[] | undefined): Solution[] {
  const model = typeof req.workload === 'string' && req.workload ? req.workload : '';
  if (!model) {
    return [
      {
        id: 'inference-missing-model',
        provider: 'n/a',
        providerName: 'n/a',
        solutionType: 'inference',
        status: 'invalid',
        components: [],
        monthlyCostRub: null,
        requirementsCoverage: 0,
        priceCompleteness: 0,
        assumptions: [],
        tradeoffs: [],
        unresolved: ['model'],
      },
    ];
  }
  const result = recommendInferenceInfra({
    model,
    quant: 'auto',
    maxConfigs: 3,
  });
  if (!result.ok || !result.configs?.length) {
    return [
      {
        id: 'inference-empty',
        provider: 'n/a',
        providerName: 'n/a',
        solutionType: 'inference',
        status: 'invalid',
        components: [],
        monthlyCostRub: null,
        requirementsCoverage: 0,
        priceCompleteness: 0,
        assumptions: [`Модель: ${model}`],
        tradeoffs: [],
        unresolved: ['gpu_config'],
      },
    ];
  }

  const solutions: Solution[] = [];
  for (const cfg of result.configs) {
    for (const q of cfg.quotes ?? []) {
      if (providers?.length && !providers.includes(q.provider)) continue;
      const total = round2(q.totalMonth ?? null);
      const providerName =
        catalog.providers.find((p) => p.id === q.provider)?.name ?? q.provider;
      solutions.push({
        id: `inference-${q.provider}-${cfg.gpuFamily}-${cfg.gpuCount}`,
        provider: q.provider,
        providerName,
        solutionType: 'inference',
        status: total != null ? 'valid' : 'partial',
        components: [
          {
            role: 'gpu_nodes',
            productId: null,
            meterId: null,
            title: `${cfg.gpuCount}× ${cfg.gpuFamily} (${cfg.quant})`,
            quantity: 1,
            monthlyCostRub: total,
            configuration: {
              gpuModel: cfg.gpuFamily,
              gpuCount: cfg.gpuCount,
              quant: cfg.quant,
            },
          },
        ],
        monthlyCostRub: total,
        requirementsCoverage: 0.9,
        priceCompleteness: total != null ? 1 : 0,
        assumptions: [
          `Self-host inference для ${model}; детали VRAM — в recommend_inference_infra`,
        ],
        tradeoffs: ['Hosted API альтернатива может быть дешевле при низком трафике'],
        unresolved: [],
      });
    }
  }
  return solutions;
}

export type ComposeResult = {
  solutionType: SolutionType;
  strategy: ComposeStrategy;
  catalogAsOf: string;
  currency: 'RUB';
  vatIncluded: true;
  assumptions: string[];
  solutions: Solution[];
  note: string;
};

export function composeSolution(input: ComposeInput): ComposeResult {
  const req = input.requirements ?? {};
  const strategy = input.strategy ?? 'cheapest';
  const maxSolutions = Math.min(Math.max(input.maxSolutions ?? 6, 1), 12);
  const budget = num(input.budgetMonthRub) ?? num(req.budgetMonthRub);
  const providers = normalizeProviderIds(input.providers ?? req.providers);

  let solutions: Solution[];
  switch (input.solutionType) {
    case 'virtual_machine':
      solutions = composeVirtualMachine(req, providers, budget);
      break;
    case 'kubernetes':
      solutions = composeKubernetes(req, providers, budget);
      break;
    case 'web_application':
      solutions = composeWebOrCustom('web_application', req, providers, budget);
      break;
    case 'custom':
      solutions = composeWebOrCustom('custom', req, providers, budget);
      break;
    case 'lakehouse':
      solutions = composeLakehouse(req, providers);
      break;
    case 'inference':
      solutions = composeInference(req, providers);
      break;
    default:
      solutions = composeVirtualMachine(req, providers, budget);
  }

  const sorted = sortSolutions(solutions, strategy).slice(0, maxSolutions);
  const globalAssumptions = [
    ...new Set(sorted.flatMap((s) => s.assumptions).slice(0, 8)),
  ];
  if (budget != null) {
    globalAssumptions.push(`Бюджет: ${budget.toLocaleString('ru-RU')} ₽/мес (с НДС)`);
  }

  return {
    solutionType: input.solutionType,
    strategy,
    catalogAsOf: catalogAsOfIso(),
    currency: 'RUB',
    vatIncluded: true,
    assumptions: globalAssumptions,
    solutions: sorted,
    note:
      'Композиция собрана backend-рецептом. После compose_solution вызови validate_solution. Не складывай цены вручную — бери monthlyCostRub / components.',
  };
}
