/**
 * Exact vs functional peer matching (P0).
 * Retrieval stays in find-similar; this module owns eligibility, rank, and representatives.
 */
import {
  amountNumber,
  extractAiModelKey,
  extractAiTokenDirection,
  extractCdnTrafficDirection,
  extractDiskMedia,
  extractGpuCount,
  extractGpuInterconnect,
  extractGpuModel,
  extractKubernetesAvailability,
  extractStorageClass,
  extractStorageKind,
  extractVcpuPlatformFacet,
  extractVcpuShareClass,
  gpuPriceBasisLabel,
  isAiTokenMeter,
  isDiskMeter,
  isFlavorMeter,
  isRamMeter,
  isRequestMeter,
  isVcpuMeter,
  meterMatchesAiFacet,
  meterMatchesAiFamilyFacet,
  meterMatchesAiModel,
  meterMatchesCategory,
  meterMatchesCdnFacet,
  meterMatchesCdnTrafficFacet,
  meterMatchesComputeFacet,
  meterMatchesDiskFacet,
  meterMatchesGpuFacet,
  meterMatchesGpuInterconnectFacet,
  meterMatchesNetworkFacet,
  meterMatchesStorageFacet,
  meterMatchesStorageKindFacet,
  meterMatchesVcpuPlatformFacet,
  meterMatchesVcpuShareFacet,
  requestBillingPackSize,
  REQUEST_PRICE_PACK,
  type CatalogMeter,
  type CategoryKey,
} from '@/lib/catalog';
import {
  comparableFilterFromMeter,
  kubernetesMasterHasShape,
  kubernetesMasterSizeTier,
  meterMatchesKubernetesSimilar,
} from '@/lib/catalog/find-similar';

export type DimensionState = 'known' | 'unknown' | 'not-applicable';

export type DimensionValue<T> =
  | {state: 'known'; value: T}
  | {state: 'unknown'}
  | {state: 'not-applicable'};

export type PriceDerivation = 'atomic' | 'derived-synthetic';
export type AllocationBasis =
  | 'card'
  | 'whole-flavor'
  | 'whole-host'
  | 'resource-component'
  | 'unknown';

export type PeerDimension = string;
export type PriceIneligibleReason =
  | 'derived-synthetic'
  | 'normalization-unverified'
  | 'canonical-unit-unknown'
  | 'canonical-unit-mismatch'
  | 'zero-price'
  | 'peer-ineligible';

export type PeerDifference = {
  dimension: PeerDimension;
  seed: DimensionValue<unknown>;
  candidate: DimensionValue<unknown>;
  diagnostic?: string;
};

export type PeerRank = readonly [
  hardDiffCount: number,
  unknownHardCount: number,
  softDiffCount: number,
  domainDistance: number,
  syntheticPenalty: number,
];

export type PeerFeatures = {
  category: CategoryKey;
  hard: Record<string, DimensionValue<unknown>>;
  soft: Record<string, DimensionValue<unknown>>;
  priceDerivation: DimensionValue<PriceDerivation>;
  allocationBasis: DimensionValue<AllocationBasis>;
  canonicalPriceUnit: DimensionValue<string>;
  normalizationConfidence: 'verified' | 'inferred' | 'unknown';
  /** Zero / included tariff — semantic exact ok, but must not anchor price badges. */
  listedPrice: DimensionValue<'zero' | 'positive'>;
  sourcePackSize?: number;
};

export type PeerClassification = {
  mode: 'exact' | 'functional';
  priceEligible: boolean;
  hardDiffs: PeerDifference[];
  unknownHard: PeerDimension[];
  softDiffs: PeerDifference[];
  priceIneligibleReasons: PriceIneligibleReason[];
  diagnostics: string[];
  rank: PeerRank;
};

export type MeterPriceEligibility = {
  eligible: boolean;
  reasons: PriceIneligibleReason[];
};

export type ClassifiedPeer = {
  meter: CatalogMeter;
  features: PeerFeatures;
  classification: PeerClassification;
};

export type ProviderPeerSelection = {
  provider: string;
  exactPriceEligible: ClassifiedPeer | null;
  exactPriceIneligible: ClassifiedPeer | null;
  functional: ClassifiedPeer | null;
  exactExtraCount: number;
};

export type PeerSelection = {
  seed: {
    meter: CatalogMeter;
    features: PeerFeatures;
    priceEligibility: MeterPriceEligibility;
  };
  retrieved: ClassifiedPeer[];
  providerSelections: ProviderPeerSelection[];
};

export function known<T>(value: T): DimensionValue<T> {
  return {state: 'known', value};
}
export function unknown<T = never>(): DimensionValue<T> {
  return {state: 'unknown'};
}
export function na<T = never>(): DimensionValue<T> {
  return {state: 'not-applicable'};
}

/** Hard keys that must always be present for a category. */
export function requiredHardDimensions(category: CategoryKey): readonly PeerDimension[] {
  switch (category) {
    case 'compute':
      return [
        'resourceKind',
        'purchaseModel',
        'shareFacet',
        'workloadClass',
        'diskMedia',
        'diskBillingKind',
        'diskRedundancy',
        'diskAttachment',
        'allocationBasis',
      ];
    case 'gpu':
      return [
        'gpuFamily',
        'gpuCount',
        'gpuInterconnect',
        'gpuVramGiB',
        'purchaseModel',
        'allocationBasis',
      ];
    case 'storage':
      return ['storageClass', 'storageKind', 'storageOperation', 'purchaseModel', 'allocationBasis'];
    case 'network':
      return ['networkKind', 'trafficRoute', 'purchaseModel', 'allocationBasis'];
    case 'cdn':
      return ['cdnKind', 'cdnDirection', 'purchaseModel', 'allocationBasis'];
    case 'kubernetes':
      // Size tier is the exact axis (Small/Medium/Large). Shape is soft for ranking.
      // Wide retrieval is topology-only so Small packages appear as functional for Medium seeds.
      return [
        'k8sTopology',
        'masterCount',
        'masterSizeTier',
        'purchaseModel',
        'allocationBasis',
      ];
    case 'ai':
      return ['canonicalModelId', 'tokenDirection', 'purchaseModel', 'allocationBasis'];
    default:
      return ['purchaseModel', 'allocationBasis'];
  }
}

export function assertCompletePeerFeatures(features: PeerFeatures): void {
  for (const key of requiredHardDimensions(features.category)) {
    if (!(key in features.hard)) {
      throw new Error(`extractPeerFeatures missing hard key «${key}» for ${features.category}`);
    }
  }
}

type DimCompare =
  | {kind: 'match'}
  | {kind: 'hardDiff'; diagnostic?: string}
  | {kind: 'unknownHard'; diagnostic?: string};

function compareDim(seed: DimensionValue<unknown>, cand: DimensionValue<unknown>): DimCompare {
  if (seed.state === 'not-applicable' && cand.state === 'not-applicable') return {kind: 'match'};
  if (seed.state === 'known' && cand.state === 'known') {
    return Object.is(seed.value, cand.value)
      ? {kind: 'match'}
      : {kind: 'hardDiff'};
  }
  if (seed.state === 'known' && cand.state === 'not-applicable') {
    return {kind: 'hardDiff', diagnostic: 'extractor-bug: known vs n/a'};
  }
  if (seed.state === 'not-applicable' && cand.state === 'known') {
    return {kind: 'hardDiff', diagnostic: 'extractor-bug: n/a vs known'};
  }
  if (
    (seed.state === 'unknown' && cand.state === 'not-applicable') ||
    (seed.state === 'not-applicable' && cand.state === 'unknown')
  ) {
    return {kind: 'unknownHard', diagnostic: 'inconsistent applicability'};
  }
  // known|unknown vs unknown, unknown vs known
  return {kind: 'unknownHard'};
}

function isPreemptible(meter: CatalogMeter): boolean {
  const pm = String(meter.purchaseModel || meter.dimensions?.purchaseModel || '').toLowerCase();
  const name = String(meter.name || '').toLowerCase();
  const sku = String(meter.sku || '').toLowerCase();
  return (
    pm.includes('preempt') ||
    pm.includes('spot') ||
    /прерываем/.test(name) ||
    sku.includes('preempt') ||
    sku.includes('.spot')
  );
}

function purchaseModelOf(meter: CatalogMeter): DimensionValue<'on-demand' | 'preemptible'> {
  const cat = meter.categoryKey;
  if (cat === 'compute' || cat === 'gpu') {
    if (isPreemptible(meter)) return known('preemptible');
    const pm = meter.purchaseModel ?? meter.dimensions?.purchaseModel;
    if (pm === 'on-demand' || pm == null || pm === '') return known('on-demand');
    if (typeof pm === 'string' && pm.toLowerCase().includes('preempt')) return known('preemptible');
    return known('on-demand');
  }
  return na();
}

function priceDerivationOf(meter: CatalogMeter): DimensionValue<PriceDerivation> {
  if (meter.synthetic || meter.sku.includes('.synthetic') || meter.priceProvenance === 'derived') {
    return known('derived-synthetic');
  }
  return known('atomic');
}

function allocationBasisOf(meter: CatalogMeter): DimensionValue<AllocationBasis> {
  if (meter.categoryKey === 'gpu') {
    const basis = gpuPriceBasisLabel(meter);
    if (basis === 'целиком') return known('whole-flavor');
    if (basis === 'только GPU') return known('card');
    return unknown();
  }
  if (meter.categoryKey === 'kubernetes') {
    // Fixed package vs shaped synthetic are the same commercial object (control plane).
    // Do not split exact peers on allocationBasis here — size tier + topology decide.
    return known('whole-flavor');
  }
  if (isVcpuMeter(meter) || isRamMeter(meter) || isDiskMeter(meter)) {
    return known('resource-component');
  }
  if (isFlavorMeter(meter)) return known('whole-flavor');
  if (meter.categoryKey === 'ai' || meter.categoryKey === 'storage' || meter.categoryKey === 'cdn') {
    return known('resource-component');
  }
  if (meter.categoryKey === 'network') return known('resource-component');
  return unknown();
}

function workloadClassOf(meter: CatalogMeter): DimensionValue<'gpu-host' | 'general'> {
  if (meter.categoryKey !== 'compute') return na();
  const hay = `${meter.sku} ${meter.meter} ${meter.name}`;
  // Positive GPU evidence only — never infer general from a flavor/host bundle by regex absence.
  if (/gpu/i.test(hay) || meter.dimensions.workloadFamily === 'gpu') return known('gpu-host');
  // Unit vCPU/RAM meters without GPU markers are general-compute components.
  if (isVcpuMeter(meter) || isRamMeter(meter)) return known('general');
  return unknown();
}

function resourceKindOf(meter: CatalogMeter): DimensionValue<'vcpu' | 'ram' | 'disk' | 'other'> {
  if (isVcpuMeter(meter)) return known('vcpu');
  if (isRamMeter(meter)) return known('ram');
  if (isDiskMeter(meter)) return known('disk');
  if (isFlavorMeter(meter)) return known('other');
  if (meter.categoryKey === 'compute') return known('other');
  return na();
}

function diskRedundancyOf(meter: CatalogMeter): DimensionValue<string> {
  if (!isDiskMeter(meter)) return na();
  const r = meter.dimensions.redundancy;
  if (typeof r === 'string' && r.trim()) return known(r.trim().toLowerCase());
  const dt = String(meter.dimensions.diskType ?? '').toLowerCase();
  if (dt.includes('nonreplicated') || dt.includes('non-replicated')) return known('non-replicated');
  if (dt.includes('triple') || dt.includes('ultra')) return known('triple-replicated');
  return unknown();
}

function diskAttachmentOf(meter: CatalogMeter): DimensionValue<'local' | 'network'> {
  if (!isDiskMeter(meter)) return na();
  const topo = String(meter.dimensions.storageTopology ?? '').toLowerCase();
  if (topo === 'local' || /local/.test(topo)) return known('local');
  if (topo === 'network' || /network/.test(topo)) return known('network');
  const hay = `${meter.sku} ${meter.name} ${meter.dimensions.diskType ?? ''}`.toLowerCase();
  if (/\blocal\b|локальн/.test(hay)) return known('local');
  if (/network|сетев|nbs|ceph/.test(hay)) return known('network');
  return unknown();
}

export type TrafficRoute = 'internet' | 'interzone' | 'object-storage';

export function extractTrafficRoute(meter: CatalogMeter): {
  value: DimensionValue<TrafficRoute>;
  evidence: string[];
  confidence: 'high' | 'low';
} {
  if (meter.categoryKey !== 'network' || meter.meter !== 'network.traffic.egress') {
    return {value: na(), evidence: [], confidence: 'high'};
  }
  const hay = `${meter.sku} ${meter.name} ${meter.meter} ${JSON.stringify(meter.dimensions)}`.toLowerCase();
  if (/interzone|межзон|inter-zone|между зон/.test(hay)) {
    return {value: known('interzone'), evidence: [`sku:${meter.sku}`], confidence: 'high'};
  }
  if (/object-storage|object_storage|hotbox|s3|object storage|object-download/.test(hay)) {
    return {value: known('object-storage'), evidence: [`sku:${meter.sku}`], confidence: 'high'};
  }
  if (/internet|публичн|внешн|public-internet/.test(hay)) {
    return {value: known('internet'), evidence: [`sku:${meter.sku}`], confidence: 'high'};
  }
  return {value: unknown(), evidence: [], confidence: 'low'};
}

function gpuFamilyOf(meter: CatalogMeter): DimensionValue<string> {
  if (meter.categoryKey !== 'gpu') return na();
  const model = extractGpuModel(meter) || meter.name;
  const hay = `${model} ${meter.sku}`;
  if (/H200/i.test(hay)) return known('h200');
  if (/H100/i.test(hay)) return known('h100');
  if (/B300/i.test(hay)) return known('b300');
  if (/A100/i.test(hay)) return known('a100');
  if (/L40S/i.test(hay)) return known('l40s');
  if (/V100/i.test(hay)) return known('v100');
  if (/\bL4\b/i.test(hay)) return known('l4');
  if (/A30/i.test(hay)) return known('a30');
  if (/\bT4\b/i.test(hay)) return known('t4');
  return unknown();
}

function gpuVramOf(meter: CatalogMeter): DimensionValue<number> {
  if (meter.categoryKey !== 'gpu') return na();
  const explicit = Number(meter.dimensions.gpuMemoryGb ?? meter.dimensions.gpuMemoryGiB ?? NaN);
  if (Number.isFinite(explicit) && explicit > 0) return known(explicit);
  const hay = `${meter.name} ${meter.sku} ${extractGpuModel(meter) ?? ''}`;
  const m = hay.match(/(\d{2,3})\s*(?:GB|GiB|ГБ)/i);
  if (m) return known(Number(m[1]));
  // Common card defaults when named without memory
  if (/A100/i.test(hay) && /80/i.test(hay)) return known(80);
  if (/A100/i.test(hay) && /40/i.test(hay)) return known(40);
  if (/H100/i.test(hay) && /80/i.test(hay)) return known(80);
  if (/H200/i.test(hay)) return known(141);
  return unknown();
}

function gpuInterconnectOf(meter: CatalogMeter): DimensionValue<'pcie' | 'nvlink'> {
  if (meter.categoryKey !== 'gpu') return na();
  const link = extractGpuInterconnect(meter);
  if (!link) {
    const hay = `${meter.sku} ${meter.name}`.toLowerCase();
    if (/nvlink|nvl|sxm/.test(hay)) return known('nvlink');
    if (/pcie|pci-e/.test(hay)) return known('pcie');
    return unknown();
  }
  const s = link.toLowerCase();
  if (s.includes('nvlink') || s.includes('nvl') || s.includes('sxm')) return known('nvlink');
  if (s.includes('pcie') || s.includes('pci')) return known('pcie');
  return unknown();
}

function canonicalUnitOf(meter: CatalogMeter): {
  unit: DimensionValue<string>;
  confidence: 'verified' | 'inferred' | 'unknown';
  sourcePackSize?: number;
} {
  if (isRequestMeter(meter)) {
    const pack = requestBillingPackSize(meter);
    const hasNorm = meter.normalizedAmount != null;
    return {
      unit: known('request-10k'),
      confidence: hasNorm || pack === 1 || pack === REQUEST_PRICE_PACK ? 'verified' : 'inferred',
      sourcePackSize: pack,
    };
  }
  if (isAiTokenMeter(meter) || meter.unitQuantity === '1M-token') {
    return {unit: known('token-1M'), confidence: 'verified'};
  }
  if (isVcpuMeter(meter)) return {unit: known('vcpu-hour'), confidence: 'verified'};
  if (isRamMeter(meter)) return {unit: known('gib-ram-hour'), confidence: 'verified'};
  if (isDiskMeter(meter)) {
    if (meter.unitQuantity === 'IOPS') return {unit: known('iops-month'), confidence: 'verified'};
    return {unit: known('gib-month'), confidence: 'verified'};
  }
  if (meter.categoryKey === 'gpu') {
    const basis = gpuPriceBasisLabel(meter);
    if (basis === 'только GPU') return {unit: known('gpu-card-hour'), confidence: 'verified'};
    if (basis === 'целиком') return {unit: known('gpu-flavor-hour'), confidence: 'verified'};
    return {unit: unknown(), confidence: 'unknown'};
  }
  if (meter.categoryKey === 'kubernetes') return {unit: known('master-hour'), confidence: 'verified'};
  if (meter.categoryKey === 'network' && meter.meter === 'network.traffic.egress') {
    return {unit: known('gib-egress'), confidence: 'verified'};
  }
  if (meter.categoryKey === 'storage' && extractStorageKind(meter) === 'capacity') {
    return {unit: known('gib-month'), confidence: 'verified'};
  }
  if (meter.categoryKey === 'cdn') {
    const kind = meter.meter;
    if (kind.includes('traffic')) return {unit: known('gib-cdn'), confidence: 'verified'};
    if (isRequestMeter(meter) || kind.includes('request')) {
      return {unit: known('request-10k'), confidence: meter.normalizedAmount != null ? 'verified' : 'inferred'};
    }
    return {unit: known('cdn-resource-month'), confidence: 'inferred'};
  }
  return {unit: known(`${meter.unitQuantity || 'unit'}`), confidence: 'inferred'};
}

function cdnDirectionOf(meter: CatalogMeter): DimensionValue<string> {
  if (meter.categoryKey !== 'cdn') return na();
  const dir = extractCdnTrafficDirection(meter);
  if (dir === 'ingress' || dir === 'egress') return known(dir);
  const hay = `${meter.sku} ${meter.name} ${JSON.stringify(meter.dimensions)}`.toLowerCase();
  if (/bidirectional|двунаправ|both|in\+out|ingress\+egress/.test(hay)) return known('bidirectional');
  if (meter.meter.includes('traffic') && !dir) return unknown();
  return na();
}

export function extractPeerFeatures(meter: CatalogMeter): PeerFeatures {
  const category = meter.categoryKey;
  const hard: Record<string, DimensionValue<unknown>> = {};
  const soft: Record<string, DimensionValue<unknown>> = {};
  const allocationBasis = allocationBasisOf(meter);
  const priceDerivation = priceDerivationOf(meter);
  const {unit, confidence, sourcePackSize} = canonicalUnitOf(meter);

  // Fill all required keys with defaults, then overwrite.
  for (const key of requiredHardDimensions(category)) {
    hard[key] = unknown();
  }
  hard.purchaseModel = purchaseModelOf(meter);
  hard.allocationBasis = allocationBasis;

  if (category === 'compute') {
    hard.resourceKind = resourceKindOf(meter);
    hard.shareFacet = isVcpuMeter(meter)
      ? extractVcpuShareClass(meter)
        ? known(extractVcpuShareClass(meter)!)
        : unknown()
      : na();
    hard.workloadClass = workloadClassOf(meter);
    if (isDiskMeter(meter)) {
      const media = extractDiskMedia(meter);
      hard.diskMedia = media ? known(media.toLowerCase()) : unknown();
      hard.diskBillingKind =
        meter.meter === 'storage.block.iops' || meter.unitQuantity === 'IOPS'
          ? known('iops')
          : known('capacity');
      hard.diskRedundancy = diskRedundancyOf(meter);
      hard.diskAttachment = diskAttachmentOf(meter);
    } else {
      hard.diskMedia = na();
      hard.diskBillingKind = na();
      hard.diskRedundancy = na();
      hard.diskAttachment = na();
    }
    const plat = extractVcpuPlatformFacet(meter);
    if (plat) soft.cpuPlatform = known(plat);
  }

  if (category === 'gpu') {
    hard.gpuFamily = gpuFamilyOf(meter);
    const count = extractGpuCount(meter);
    hard.gpuCount = count != null ? known(count) : unknown();
    hard.gpuInterconnect = gpuInterconnectOf(meter);
    hard.gpuVramGiB = gpuVramOf(meter);
  }

  if (category === 'storage') {
    const cls = extractStorageClass(meter);
    hard.storageClass = cls ? known(cls) : unknown();
    const kind = extractStorageKind(meter);
    hard.storageKind = kind ? known(kind) : unknown();
    const op = meter.dimensions.operation;
    hard.storageOperation =
      kind === 'operations' && typeof op === 'string' && op.trim()
        ? known(op.trim().toUpperCase())
        : kind === 'operations'
          ? unknown()
          : na();
  }

  if (category === 'network') {
    hard.networkKind = meter.meter.startsWith('network.ipv4')
      ? known('public-ip')
      : meter.meter === 'network.traffic.egress'
        ? known('egress')
        : unknown();
    hard.trafficRoute = extractTrafficRoute(meter).value;
  }

  if (category === 'cdn') {
    hard.cdnKind = meter.meter.includes('request')
      ? known('requests')
      : meter.meter.includes('traffic')
        ? known('traffic')
        : meter.meter.includes('resource')
          ? known('resource')
          : known('options');
    hard.cdnDirection = cdnDirectionOf(meter);
  }

  if (category === 'kubernetes') {
    const topo = extractKubernetesAvailability(meter);
    hard.k8sTopology = topo ? known(topo) : unknown();
    const mc = Number(meter.dimensions.masterCount);
    hard.masterCount = Number.isFinite(mc) && mc > 0 ? known(mc) : unknown();
    const tier = kubernetesMasterSizeTier(meter);
    hard.masterSizeTier = tier ? known(tier) : unknown();
    // Shape is soft: 4/8 vs 4/16 stay same Medium exact; used only for rank/summary.
    if (kubernetesMasterHasShape(meter)) {
      soft.vCpuPerMaster = known(Number(meter.dimensions.vcpu));
      soft.ramPerMaster = known(Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb));
    }
  }

  if (category === 'ai') {
    const mid = extractAiModelKey(meter);
    hard.canonicalModelId = mid ? known(mid.toLowerCase()) : unknown();
    const dir = extractAiTokenDirection(meter);
    hard.tokenDirection = dir ? known(dir) : unknown();
  }

  // Use month for recurring; request/usage meters return the unit pack price either way.
  const amt = amountNumber(meter, 'month');
  const listedPrice: DimensionValue<'zero' | 'positive'> =
    amt == null || !Number.isFinite(amt)
      ? unknown()
      : amt === 0
        ? known('zero')
        : amt > 0
          ? known('positive')
          : unknown();

  const features: PeerFeatures = {
    category,
    hard,
    soft,
    priceDerivation,
    allocationBasis,
    canonicalPriceUnit: unit,
    normalizationConfidence: confidence,
    listedPrice,
    sourcePackSize,
  };
  assertCompletePeerFeatures(features);
  return features;
}

export function evaluateMeterPriceEligibility(features: PeerFeatures): MeterPriceEligibility {
  const reasons: PriceIneligibleReason[] = [];
  if (features.priceDerivation.state === 'known' && features.priceDerivation.value === 'derived-synthetic') {
    reasons.push('derived-synthetic');
  }
  if (features.canonicalPriceUnit.state !== 'known') {
    reasons.push('canonical-unit-unknown');
  }
  if (features.normalizationConfidence !== 'verified') {
    reasons.push('normalization-unverified');
  }
  // 0 ₽ stays price-eligible: compare-delta uses equal-free / free-vs-paid (not ∞%).
  // Excluding zero made near-zero paid anchors (e.g. Selectel 0,01) produce +7000% noise.
  if (features.listedPrice.state === 'unknown') {
    reasons.push('canonical-unit-unknown');
  }
  return {eligible: reasons.length === 0, reasons};
}

function syntheticPenalty(features: PeerFeatures): number {
  if (features.priceDerivation.state === 'known' && features.priceDerivation.value === 'derived-synthetic') {
    return 1;
  }
  return 0;
}

function domainDistance(seed: PeerFeatures, cand: PeerFeatures, softDiffs: PeerDifference[]): number {
  let d = softDiffs.length;
  // Prefer same soft platform when both known
  const sp = seed.soft.cpuPlatform;
  const cp = cand.soft.cpuPlatform;
  if (sp?.state === 'known' && cp?.state === 'known' && sp.value !== cp.value) d += 1;
  return d;
}

export function classifyPeer(seed: PeerFeatures, candidate: PeerFeatures): PeerClassification {
  const hardDiffs: PeerDifference[] = [];
  const unknownHard: PeerDimension[] = [];
  const softDiffs: PeerDifference[] = [];
  const diagnostics: string[] = [];

  if (seed.category !== candidate.category) {
    hardDiffs.push({
      dimension: 'category',
      seed: known(seed.category),
      candidate: known(candidate.category),
    });
  }

  const keys = new Set([...Object.keys(seed.hard), ...Object.keys(candidate.hard)]);
  for (const key of keys) {
    const s = seed.hard[key] ?? unknown();
    const c = candidate.hard[key] ?? unknown();
    const cmp = compareDim(s, c);
    if (cmp.kind === 'hardDiff') {
      hardDiffs.push({dimension: key, seed: s, candidate: c, diagnostic: cmp.diagnostic});
      if (cmp.diagnostic) diagnostics.push(`${key}: ${cmp.diagnostic}`);
    } else if (cmp.kind === 'unknownHard') {
      unknownHard.push(key);
      if (cmp.diagnostic) diagnostics.push(`${key}: ${cmp.diagnostic}`);
    }
  }

  for (const key of new Set([...Object.keys(seed.soft), ...Object.keys(candidate.soft)])) {
    const s = seed.soft[key] ?? unknown();
    const c = candidate.soft[key] ?? unknown();
    if (s.state === 'known' && c.state === 'known' && !Object.is(s.value, c.value)) {
      softDiffs.push({dimension: key, seed: s, candidate: c});
    }
  }

  const mode: 'exact' | 'functional' =
    hardDiffs.length === 0 && unknownHard.length === 0 ? 'exact' : 'functional';

  const seedElig = evaluateMeterPriceEligibility(seed);
  const candElig = evaluateMeterPriceEligibility(candidate);
  const unitsMatch =
    seed.canonicalPriceUnit.state === 'known' &&
    candidate.canonicalPriceUnit.state === 'known' &&
    seed.canonicalPriceUnit.value === candidate.canonicalPriceUnit.value;

  const priceIneligibleReasons: PriceIneligibleReason[] = [];
  if (!seedElig.eligible) priceIneligibleReasons.push(...seedElig.reasons);
  if (!candElig.eligible) {
    for (const r of candElig.reasons) {
      if (!priceIneligibleReasons.includes(r)) priceIneligibleReasons.push(r);
    }
    if (!candElig.eligible) priceIneligibleReasons.push('peer-ineligible');
  }
  if (!unitsMatch) priceIneligibleReasons.push('canonical-unit-mismatch');

  const priceEligible =
    mode === 'exact' &&
    seedElig.eligible &&
    candElig.eligible &&
    unitsMatch &&
    seed.normalizationConfidence === 'verified' &&
    candidate.normalizationConfidence === 'verified';

  const rank: PeerRank = [
    hardDiffs.length,
    unknownHard.length,
    softDiffs.length,
    domainDistance(seed, candidate, softDiffs),
    Math.max(syntheticPenalty(seed), syntheticPenalty(candidate)),
  ];

  return {
    mode,
    priceEligible,
    hardDiffs,
    unknownHard,
    softDiffs,
    priceIneligibleReasons: [...new Set(priceIneligibleReasons)],
    diagnostics,
    rank,
  };
}

function compareRank(a: PeerRank, b: PeerRank): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

function pickByRank(
  items: ClassifiedPeer[],
  opts: {usePrice: boolean; period?: 'month'},
): ClassifiedPeer | null {
  if (items.length === 0) return null;
  const period = opts.period ?? 'month';
  const sorted = [...items].sort((a, b) => {
    const r = compareRank(a.classification.rank, b.classification.rank);
    if (r !== 0) return r;
    if (opts.usePrice) {
      const pa = amountNumber(a.meter, period);
      const pb = amountNumber(b.meter, period);
      const fa = pa != null && Number.isFinite(pa) ? pa : Number.POSITIVE_INFINITY;
      const fb = pb != null && Number.isFinite(pb) ? pb : Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
    }
    return a.meter.sku.localeCompare(b.meter.sku);
  });
  return sorted[0] ?? null;
}

/** Wide retrieval — same axes as Catalog find-similar (no purchaseModel). */
export function retrieveFunctionalCandidates(
  seed: CatalogMeter,
  catalogMeters: readonly CatalogMeter[],
): CatalogMeter[] {
  const filter = comparableFilterFromMeter(seed);
  if (!filter) return [];
  return catalogMeters.filter((m) => {
    if (m.status !== 'available') return false;
    if (!meterMatchesCategory(m, filter.category)) return false;
    if (filter.category === 'compute' && !meterMatchesComputeFacet(m, filter.facet)) return false;
    if (
      filter.category === 'compute' &&
      filter.facet === 'disk' &&
      !meterMatchesDiskFacet(m, filter.diskFacet)
    ) {
      return false;
    }
    if (filter.category === 'compute' && filter.facet === 'disk' && filter.diskBillingKind) {
      const isIops = m.meter === 'storage.block.iops' || m.unitQuantity === 'IOPS';
      if (filter.diskBillingKind === 'iops' ? !isIops : isIops) return false;
    }
    if (
      filter.category === 'compute' &&
      filter.facet === 'vcpu' &&
      !meterMatchesVcpuShareFacet(m, filter.vcpuShareFacet)
    ) {
      return false;
    }
    if (
      filter.category === 'compute' &&
      filter.facet === 'vcpu' &&
      !meterMatchesVcpuPlatformFacet(m, filter.vcpuPlatformFacet)
    ) {
      return false;
    }
    if (filter.category === 'gpu' && !meterMatchesGpuFacet(m, filter.gpuFacet)) return false;
    if (
      filter.category === 'gpu' &&
      !meterMatchesGpuInterconnectFacet(m, filter.gpuInterconnectFacet)
    ) {
      return false;
    }
    if (filter.category === 'gpu' && filter.gpuPriceBasis) {
      if (gpuPriceBasisLabel(m) !== filter.gpuPriceBasis) return false;
    }
    if (filter.category === 'gpu' && filter.gpuCount != null) {
      if (extractGpuCount(m) !== filter.gpuCount) return false;
    }
    if (filter.category === 'storage' && !meterMatchesStorageKindFacet(m, filter.storageKindFacet)) {
      return false;
    }
    if (filter.category === 'storage' && !meterMatchesStorageFacet(m, filter.storageFacet)) {
      return false;
    }
    if (filter.category === 'storage' && filter.storageOperation) {
      if (String(m.dimensions.operation ?? '').trim().toUpperCase() !== filter.storageOperation) {
        return false;
      }
    }
    if (filter.category === 'network' && !meterMatchesNetworkFacet(m, filter.networkFacet)) {
      return false;
    }
    if (filter.category === 'cdn' && !meterMatchesCdnFacet(m, filter.cdnFacet)) return false;
    if (filter.category === 'cdn' && !meterMatchesCdnTrafficFacet(m, filter.cdnTrafficFacet)) {
      return false;
    }
    if (filter.category === 'kubernetes') {
      // Wide retrieval: same topology only. Size tier is an exact-gate in classifyPeer,
      // so Selectel/VK/MWS Small still appear as functional alternatives for Medium seeds.
      if (
        !meterMatchesKubernetesSimilar(m, {
          kubernetesAvailabilityFacet: filter.kubernetesAvailabilityFacet,
          kubernetesMasterVcpu: null,
          kubernetesMasterRamGiB: null,
          kubernetesShapelessOnly: false,
          kubernetesMasterSize: null,
        })
      ) {
        return false;
      }
    }
    if (filter.category === 'ai' && !meterMatchesAiFacet(m, filter.aiFacet)) return false;
    if (filter.category === 'ai' && !meterMatchesAiFamilyFacet(m, filter.aiFamilyFacet)) {
      return false;
    }
    if (filter.category === 'ai' && !meterMatchesAiModel(m, filter.aiModelId)) return false;
    return true;
  });
}

export function selectPeersForCompare(
  seed: CatalogMeter,
  catalogMeters: readonly CatalogMeter[],
): PeerSelection {
  const retrievedMeters = retrieveFunctionalCandidates(seed, catalogMeters);
  const seedFeatures = extractPeerFeatures(seed);
  const seedPriceEligibility = evaluateMeterPriceEligibility(seedFeatures);

  const retrieved: ClassifiedPeer[] = retrievedMeters
    .filter((c) => c.id !== seed.id)
    .map((c) => {
      const features = extractPeerFeatures(c);
      return {
        meter: c,
        features,
        classification: classifyPeer(seedFeatures, features),
      };
    });

  const byProvider = new Map<string, ClassifiedPeer[]>();
  for (const row of retrieved) {
    const list = byProvider.get(row.meter.provider) ?? [];
    list.push(row);
    byProvider.set(row.meter.provider, list);
  }

  const providerSelections: ProviderPeerSelection[] = [];
  for (const [provider, candidates] of byProvider) {
    const exactPE = candidates.filter(
      (c) => c.classification.mode === 'exact' && c.classification.priceEligible,
    );
    const exactNo = candidates.filter(
      (c) => c.classification.mode === 'exact' && !c.classification.priceEligible,
    );
    const functional = candidates.filter((c) => c.classification.mode === 'functional');

    const pickedPE = pickByRank(exactPE, {usePrice: true});
    // Prefer cheaper among equal-rank exactNo (e.g. Yandex 4/8 before 4/16).
    const pickedNo = pickByRank(exactNo, {usePrice: true});
    const pickedFunc = pickByRank(functional, {usePrice: true});

    const exactTotal = exactPE.length + exactNo.length;
    const primaryExact = pickedPE ?? pickedNo;
    const exactExtraCount = Math.max(0, exactTotal - (primaryExact ? 1 : 0));

    providerSelections.push({
      provider,
      exactPriceEligible: pickedPE,
      exactPriceIneligible: pickedNo,
      functional: pickedFunc,
      exactExtraCount,
    });
  }

  providerSelections.sort((a, b) => a.provider.localeCompare(b.provider));

  return {
    seed: {meter: seed, features: seedFeatures, priceEligibility: seedPriceEligibility},
    retrieved,
    providerSelections,
  };
}

/** Primary display rows: seed + one row per other provider (exactPE → exactNo → functional). */
export function primaryPeerRows(selection: PeerSelection): Array<{
  meter: CatalogMeter;
  bucket: 'seed' | 'exact-price-eligible' | 'exact-price-ineligible' | 'functional';
  classification?: PeerClassification;
  exactExtraCount: number;
}> {
  const rows: Array<{
    meter: CatalogMeter;
    bucket: 'seed' | 'exact-price-eligible' | 'exact-price-ineligible' | 'functional';
    classification?: PeerClassification;
    exactExtraCount: number;
  }> = [
    {
      meter: selection.seed.meter,
      bucket: 'seed',
      exactExtraCount: 0,
    },
  ];

  for (const p of selection.providerSelections) {
    if (p.provider === selection.seed.meter.provider) continue;
    if (p.exactPriceEligible) {
      rows.push({
        meter: p.exactPriceEligible.meter,
        bucket: 'exact-price-eligible',
        classification: p.exactPriceEligible.classification,
        exactExtraCount: p.exactExtraCount,
      });
    } else if (p.exactPriceIneligible) {
      rows.push({
        meter: p.exactPriceIneligible.meter,
        bucket: 'exact-price-ineligible',
        classification: p.exactPriceIneligible.classification,
        exactExtraCount: p.exactExtraCount,
      });
    } else if (p.functional) {
      rows.push({
        meter: p.functional.meter,
        bucket: 'functional',
        classification: p.functional.classification,
        exactExtraCount: 0,
      });
    }
  }
  return rows;
}

export function sameProviderCheaperExact(
  selection: PeerSelection,
  period: 'unit' | 'month' | 'year' = 'month',
): CatalogMeter | null {
  const seed = selection.seed.meter;
  const seedAmt = amountNumber(seed, period);
  if (seedAmt == null) return null;
  const same = selection.retrieved.filter(
    (r) =>
      r.meter.provider === seed.provider &&
      r.classification.mode === 'exact' &&
      r.classification.priceEligible,
  );
  let best: CatalogMeter | null = null;
  let bestAmt = seedAmt;
  for (const r of same) {
    const a = amountNumber(r.meter, period);
    if (a != null && a < bestAmt) {
      best = r.meter;
      bestAmt = a;
    }
  }
  return best;
}
