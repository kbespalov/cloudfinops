/**
 * Human summaries for exact / functional peer sets — built from PeerFeatures, not retrieval.
 */
import type {PeerFeatures, PeerSelection} from '@/lib/catalog/peer-match';
import {comparableFilterFromMeter} from '@/lib/catalog/find-similar';
import type {CatalogMeter} from '@/lib/catalog';

function hardVal(features: PeerFeatures, key: string): unknown {
  const d = features.hard[key];
  return d?.state === 'known' ? d.value : null;
}

export function functionalSummaryFromSeed(seed: CatalogMeter): string {
  const filter = comparableFilterFromMeter(seed);
  return filter?.summary ?? 'Похожие предложения';
}

export function exactSummaryFromFeatures(features: PeerFeatures): string | null {
  switch (features.category) {
    case 'kubernetes': {
      const topo = hardVal(features, 'k8sTopology');
      const topoRu = topo === 'zonal' ? 'базовый' : topo === 'regional' ? 'HA' : null;
      const tier = hardVal(features, 'masterSizeTier');
      const tierTitle =
        tier === 'small' ? 'Small' : tier === 'medium' ? 'Medium' : tier === 'large' ? 'Large' : null;
      const vcpu = features.soft.vCpuPerMaster?.state === 'known' ? features.soft.vCpuPerMaster.value : null;
      const ram = features.soft.ramPerMaster?.state === 'known' ? features.soft.ramPerMaster.value : null;
      const mc = hardVal(features, 'masterCount');
      if (!topoRu) return null;
      if (vcpu != null && ram != null) {
        const shape =
          typeof mc === 'number' && mc > 1
            ? `${mc} × ${vcpu} vCPU / ${ram} ГиБ`
            : `${vcpu} vCPU / ${ram} ГиБ`;
        return `Мастер Kubernetes · ${topoRu} · ${shape}`;
      }
      if (tierTitle) return `Мастер Kubernetes · ${topoRu} · ${tierTitle}`;
      return `Мастер Kubernetes · ${topoRu}`;
    }
    case 'compute': {
      const kind = hardVal(features, 'resourceKind');
      if (kind === 'vcpu') {
        const share = hardVal(features, 'shareFacet');
        const shareRu = share === 'dedicated' ? '100%' : share === 'shared' ? 'Shared' : null;
        return ['Compute · Ядра', shareRu].filter(Boolean).join(' · ');
      }
      if (kind === 'ram') return 'Compute · RAM';
      if (kind === 'disk') {
        const media = hardVal(features, 'diskMedia');
        const bill = hardVal(features, 'diskBillingKind');
        const mediaRu = typeof media === 'string' ? media.toUpperCase() : 'Диск';
        return `Compute · Диск · ${mediaRu} · ${bill === 'iops' ? 'IOPS' : 'ёмкость'}`;
      }
      return null;
    }
    case 'gpu': {
      const fam = hardVal(features, 'gpuFamily');
      const count = hardVal(features, 'gpuCount');
      const alloc = features.allocationBasis.state === 'known' ? features.allocationBasis.value : null;
      const allocRu =
        alloc === 'card' ? 'только GPU' : alloc === 'whole-flavor' ? 'целиком' : null;
      const vram = hardVal(features, 'gpuVramGiB');
      return [
        'GPU',
        typeof fam === 'string' ? fam.toUpperCase() : null,
        vram != null ? `${vram} GiB` : null,
        allocRu,
        count != null ? `×${count}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'network': {
      const route = hardVal(features, 'trafficRoute');
      if (route === 'internet') return 'Network · Исходящий · internet';
      if (route === 'interzone') return 'Network · Исходящий · interzone';
      if (route === 'object-storage') return 'Network · Исходящий · object-storage';
      return 'Network · Исходящий трафик';
    }
    case 'ai': {
      const model = hardVal(features, 'canonicalModelId');
      const dir = hardVal(features, 'tokenDirection');
      const dirRu = dir === 'input' ? 'Input' : dir === 'output' ? 'Output' : null;
      return ['AI', model, dirRu].filter(Boolean).join(' · ');
    }
    default:
      return null;
  }
}

export function similarBannerCopy(selection: PeerSelection): {
  title: string;
  detail: string;
  priceCompareActive: boolean;
} {
  const functional = functionalSummaryFromSeed(selection.seed.meter);
  const exact = exactSummaryFromFeatures(selection.seed.features);
  const seedOk = selection.seed.priceEligibility.eligible;
  const exactPEProviders = selection.providerSelections.filter((p) => p.exactPriceEligible).length;
  // +1 for seed provider when seed is price-eligible
  const exactProviderCount = exactPEProviders + (seedOk ? 1 : 0);
  const hasExactSemantic =
    exactPEProviders > 0 ||
    selection.providerSelections.some((p) => p.exactPriceIneligible) ||
    selection.retrieved.some((r) => r.classification.mode === 'exact');

  if (!seedOk) {
    const reasons = selection.seed.priceEligibility.reasons;
    const why = reasons.includes('derived-synthetic')
      ? 'цена выбранного тарифа рассчитана из составной конфигурации'
      : 'единица цены выбранного тарифа не верифицирована';
    return {
      title: exact ?? functional,
      detail: `точные аналоги без прямого сравнения цены — ${why}`,
      priceCompareActive: false,
    };
  }

  if (exactProviderCount >= 2) {
    return {
      title: exact ?? functional,
      detail:
        exactProviderCount >= 3
          ? 'точные аналоги · к лучшему и медиане'
          : 'точные аналоги · к лучшему офферу',
      priceCompareActive: true,
    };
  }

  if (hasExactSemantic) {
    return {
      title: exact ?? functional,
      detail: 'точные аналоги найдены, но недостаточно провайдеров для сравнения цены',
      priceCompareActive: false,
    };
  }

  return {
    title: functional,
    detail: 'похожие предложения · без прямого сравнения цены',
    priceCompareActive: false,
  };
}
