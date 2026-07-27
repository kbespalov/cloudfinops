/**
 * Map a catalog meter to the facet filter that keeps only like-for-like peers
 * across providers (same storage class, GPU family, disk media, …).
 */
import {
  extractAiFamilyFacet,
  extractAiModelFamily,
  extractAiModelKey,
  extractAiTokenDirection,
  extractCdnKind,
  extractCdnTrafficDirection,
  extractDiskMedia,
  extractGpuCount,
  extractGpuInterconnect,
  extractGpuModel,
  extractKubernetesAvailability,
  extractNetworkKind,
  extractStorageClass,
  extractStorageKind,
  extractVcpuPlatformFacet,
  extractVcpuShareClass,
  gpuPriceBasisLabel,
  isDiskMeter,
  isFlavorMeter,
  isImageMeter,
  isRamMeter,
  isSnapshotMeter,
  isVcpuMeter,
  type AiFacet,
  type AiFamilyFacet,
  type CatalogMeter,
  type CategoryFilter,
  type CdnFacet,
  type CdnTrafficFacet,
  type ComputeFacet,
  type DiskFacet,
  type GpuFacet,
  type GpuInterconnectFacet,
  type KubernetesAvailabilityFacet,
  type NetworkFacet,
  type StorageFacet,
  type StorageKindFacet,
  type VcpuPlatformFacet,
  type VcpuShareFacet,
} from '@/lib/catalog';

/** Card-only vs full GPU+host flavor — must not be mixed in «найти похожие». */
export type GpuPriceBasisFilter = 'только GPU' | 'целиком';

/** Block-disk billing axis — GiB capacity must not mix with ₽/IOPS add-ons. */
export type DiskBillingKindFilter = 'capacity' | 'iops';

export type ComparableCatalogFilter = {
  category: Exclude<CategoryFilter, 'all'>;
  facet: ComputeFacet;
  diskFacet: DiskFacet;
  /** Set for disk finds: capacity (₽/GiB) vs IOPS add-on. */
  diskBillingKind: DiskBillingKindFilter | null;
  vcpuShareFacet: VcpuShareFacet;
  vcpuPlatformFacet: VcpuPlatformFacet;
  gpuFacet: GpuFacet;
  gpuInterconnectFacet: GpuInterconnectFacet;
  /** Set for GPU finds: keep card-only with card-only, host flavors with host flavors. */
  gpuPriceBasis: GpuPriceBasisFilter | null;
  /** Exact card count (×N). Null = any count. */
  gpuCount: number | null;
  storageFacet: StorageFacet;
  storageKindFacet: StorageKindFacet;
  /** Object-storage request verb (GET/PUT/…) when kind=operations. */
  storageOperation: string | null;
  networkFacet: NetworkFacet;
  cdnFacet: CdnFacet;
  cdnTrafficFacet: CdnTrafficFacet;
  kubernetesAvailabilityFacet: KubernetesAvailabilityFacet;
  /** Exact master shape when known (e.g. 2 vCPU / 4 GiB ≠ 2/8). */
  kubernetesMasterVcpu: number | null;
  kubernetesMasterRamGiB: number | null;
  /**
   * Seed has no published vCPU/RAM (Selectel/MWS/T1 package).
   * Peers must also be shapeless — do not mix with 2/4 · 2/8 synthetics.
   */
  kubernetesShapelessOnly: boolean;
  /** T-shirt size when known (small/medium/large). */
  kubernetesMasterSize: string | null;
  aiFacet: AiFacet;
  aiFamilyFacet: AiFamilyFacet;
  /** Exact modelId / modelFamily key (gpt-oss-120b ≠ gpt-oss-20b). */
  aiModelId: string | null;
  /** Human summary for the banner, e.g. «Storage · Standard · Хранение». */
  summary: string;
};

const EMPTY_NESTED = {
  facet: 'all' as ComputeFacet,
  diskFacet: 'all' as DiskFacet,
  diskBillingKind: null as DiskBillingKindFilter | null,
  vcpuShareFacet: 'all' as VcpuShareFacet,
  vcpuPlatformFacet: 'all' as VcpuPlatformFacet,
  gpuFacet: 'all' as GpuFacet,
  gpuInterconnectFacet: 'all' as GpuInterconnectFacet,
  gpuPriceBasis: null as GpuPriceBasisFilter | null,
  gpuCount: null as number | null,
  storageFacet: 'all' as StorageFacet,
  storageKindFacet: 'all' as StorageKindFacet,
  storageOperation: null as string | null,
  networkFacet: 'all' as NetworkFacet,
  cdnFacet: 'all' as CdnFacet,
  cdnTrafficFacet: 'all' as CdnTrafficFacet,
  kubernetesAvailabilityFacet: 'all' as KubernetesAvailabilityFacet,
  kubernetesMasterVcpu: null as number | null,
  kubernetesMasterRamGiB: null as number | null,
  kubernetesShapelessOnly: false,
  kubernetesMasterSize: null as string | null,
  aiFacet: 'all' as AiFacet,
  aiFamilyFacet: 'all' as AiFamilyFacet,
  aiModelId: null as string | null,
};

function gpuFacetFromMeter(meter: CatalogMeter): Exclude<GpuFacet, 'all'> | null {
  const hay = `${extractGpuModel(meter) ?? ''} ${meter.name} ${meter.sku}`;
  if (/H200/i.test(hay)) return 'h200';
  if (/H100/i.test(hay)) return 'h100';
  if (/B300/i.test(hay)) return 'b300';
  if (/A100/i.test(hay)) return 'a100';
  if (/L40S/i.test(hay)) return 'l40s';
  if (/V100/i.test(hay)) return 'v100';
  if (!/L40/i.test(hay) && /\bL4\b|L4 vGPU/i.test(hay)) return 'l4';
  if (/A30/i.test(hay)) return 'a30';
  if (/\bT4\b|Tesla T4/i.test(hay)) return 't4';
  return null;
}

function interconnectFacetFromMeter(
  meter: CatalogMeter,
): Exclude<GpuInterconnectFacet, 'all'> | null {
  const link = extractGpuInterconnect(meter);
  if (!link) return null;
  const s = link.toLowerCase();
  if (s.includes('nvlink') || s.includes('nvl') || s.includes('sxm')) return 'nvlink';
  if (s.includes('pcie') || s.includes('pci')) return 'pcie';
  return null;
}

function storageClassFacet(cls: string | null): Exclude<StorageFacet, 'all'> | null {
  if (cls === 'standard' || cls === 'warm' || cls === 'cold' || cls === 'ice') return cls;
  return null;
}

function storageOperationOf(meter: CatalogMeter): string | null {
  const op = meter.dimensions.operation;
  if (typeof op !== 'string') return null;
  const normalized = op.trim().toUpperCase();
  return normalized || null;
}

function diskBillingKindOf(meter: CatalogMeter): DiskBillingKindFilter | null {
  if (!isDiskMeter(meter)) return null;
  if (meter.meter === 'storage.block.iops' || meter.unitQuantity === 'IOPS') return 'iops';
  return 'capacity';
}

/** True when master publishes concrete vCPU + RAM (synthetic/native bundle). */
export function kubernetesMasterHasShape(meter: CatalogMeter): boolean {
  const vcpu = Number(meter.dimensions.vcpu);
  const ram = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
  return Number.isFinite(vcpu) && vcpu > 0 && Number.isFinite(ram) && ram > 0;
}

export function extractKubernetesMasterSize(meter: CatalogMeter): string | null {
  const raw = meter.dimensions.masterSize;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return s || null;
}

/**
 * Like-for-like peer check for Kubernetes find-similar.
 * Excludes 0₽ fixed-component rows; shapeless packages stay with shapeless.
 */
export function meterMatchesKubernetesSimilar(
  meter: CatalogMeter,
  filter: Pick<
    ComparableCatalogFilter,
    | 'kubernetesAvailabilityFacet'
    | 'kubernetesMasterVcpu'
    | 'kubernetesMasterRamGiB'
    | 'kubernetesShapelessOnly'
    | 'kubernetesMasterSize'
  >,
): boolean {
  if (meter.categoryKey !== 'kubernetes') return false;
  if (meter.comparableTier === 'fixed-component') return false;
  if (filter.kubernetesAvailabilityFacet !== 'all') {
    const availability = extractKubernetesAvailability(meter);
    if (availability !== filter.kubernetesAvailabilityFacet) return false;
  }

  if (filter.kubernetesShapelessOnly) {
    if (kubernetesMasterHasShape(meter)) return false;
    const peerSize = extractKubernetesMasterSize(meter);
    if (filter.kubernetesMasterSize) {
      if (peerSize) return peerSize === filter.kubernetesMasterSize;
      // Selectel/MWS (no size) only pair with T1 Small as entry package.
      return filter.kubernetesMasterSize === 'small';
    }
    // Seed is Selectel/MWS: keep entry tier (no size or Small), drop Medium/Large.
    return peerSize == null || peerSize === 'small';
  }

  if (filter.kubernetesMasterVcpu != null) {
    const v = Number(meter.dimensions.vcpu);
    if (Number.isFinite(v) && v !== filter.kubernetesMasterVcpu) return false;
  }
  if (filter.kubernetesMasterRamGiB != null) {
    const ram = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
    if (Number.isFinite(ram) && ram !== filter.kubernetesMasterRamGiB) return false;
  }
  // Shaped seed may still include shapeless native-fixed entry packages.
  if (!kubernetesMasterHasShape(meter)) {
    const peerSize = extractKubernetesMasterSize(meter);
    if (peerSize && peerSize !== 'small') return false;
  }
  return true;
}

/** Returns null when the meter has no strict comparable class to filter by. */
export function comparableFilterFromMeter(meter: CatalogMeter): ComparableCatalogFilter | null {
  switch (meter.categoryKey) {
    case 'storage': {
      const cls = storageClassFacet(extractStorageClass(meter));
      const kind = extractStorageKind(meter);
      if (!cls) return null;
      const operation = kind === 'operations' ? storageOperationOf(meter) : null;
      // Request SKUs without a verb aren't strictly comparable across providers.
      if (kind === 'operations' && !operation) return null;
      const parts = [
        'Storage',
        `${cls.charAt(0).toUpperCase()}${cls.slice(1)}`,
        kind === 'operations' ? operation : kind === 'capacity' ? 'Хранение' : null,
      ].filter(Boolean);
      return {
        ...EMPTY_NESTED,
        category: 'storage',
        storageFacet: cls,
        storageKindFacet: kind ?? 'all',
        storageOperation: operation,
        summary: parts.join(' · '),
      };
    }
    case 'gpu': {
      const gpu = gpuFacetFromMeter(meter);
      if (!gpu) return null;
      const basis = gpuPriceBasisLabel(meter);
      if (!basis) return null;
      const link = interconnectFacetFromMeter(meter);
      const count = extractGpuCount(meter);
      const parts = [
        'GPU',
        gpu.toUpperCase(),
        basis,
        link ? (link === 'nvlink' ? 'NVLink' : 'PCIe') : null,
        count != null ? `×${count}` : null,
      ].filter(Boolean);
      return {
        ...EMPTY_NESTED,
        category: 'gpu',
        gpuFacet: gpu,
        // Card-only compares across fabrics; host flavors keep fabric when known.
        gpuInterconnectFacet: basis === 'целиком' ? (link ?? 'all') : 'all',
        gpuPriceBasis: basis,
        gpuCount: count,
        summary: parts.join(' · '),
      };
    }
    case 'network': {
      const kind = extractNetworkKind(meter);
      if (!kind) return null;
      return {
        ...EMPTY_NESTED,
        category: 'network',
        networkFacet: kind,
        summary: kind === 'public-ip' ? 'Network · Публичный IP' : 'Network · Исходящий трафик',
      };
    }
    case 'cdn': {
      const kind = extractCdnKind(meter);
      if (!kind) return null;
      const dir = extractCdnTrafficDirection(meter);
      const traffic =
        kind === 'traffic' && (dir === 'ingress' || dir === 'egress') ? dir : ('all' as const);
      const kindTitle =
        kind === 'traffic'
          ? 'Трафик'
          : kind === 'resource'
            ? 'Ресурс'
            : kind === 'requests'
              ? 'Запросы'
              : 'Опции';
      const dirTitle =
        traffic === 'ingress' ? ' · Входящий' : traffic === 'egress' ? ' · Исходящий' : '';
      return {
        ...EMPTY_NESTED,
        category: 'cdn',
        cdnFacet: kind,
        cdnTrafficFacet: traffic,
        summary: `CDN · ${kindTitle}${dirTitle}`,
      };
    }
    case 'kubernetes': {
      if (meter.comparableTier === 'fixed-component') return null;
      const availability = extractKubernetesAvailability(meter);
      if (!availability) return null;
      const hasShape = kubernetesMasterHasShape(meter);
      const vcpu = Number(meter.dimensions.vcpu);
      const ramGiB = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
      const shapeVcpu = hasShape ? vcpu : null;
      const shapeRam = hasShape ? ramGiB : null;
      const masterSize = extractKubernetesMasterSize(meter);
      const topo = availability === 'zonal' ? 'зональный' : 'региональный';
      let detail = '';
      if (hasShape) detail = ` · ${shapeVcpu} vCPU / ${shapeRam} ГиБ`;
      else if (masterSize) {
        detail = ` · ${masterSize.charAt(0).toUpperCase()}${masterSize.slice(1)}`;
      } else detail = ' · фикс (форма не раскрыта)';
      return {
        ...EMPTY_NESTED,
        category: 'kubernetes',
        kubernetesAvailabilityFacet: availability,
        kubernetesMasterVcpu: shapeVcpu,
        kubernetesMasterRamGiB: shapeRam,
        kubernetesShapelessOnly: !hasShape,
        kubernetesMasterSize: masterSize,
        summary: `Kubernetes · ${topo}${detail}`,
      };
    }
    case 'ai': {
      const modelId = extractAiModelKey(meter);
      if (!modelId) return null;
      const family = extractAiFamilyFacet(meter);
      const dir = extractAiTokenDirection(meter);
      const modelTitle = extractAiModelFamily(meter) || modelId;
      const dirTitle = dir === 'input' ? ' · Input' : dir === 'output' ? ' · Output' : '';
      return {
        ...EMPTY_NESTED,
        category: 'ai',
        aiFamilyFacet: family ?? 'all',
        aiFacet: dir ?? 'all',
        aiModelId: modelId,
        summary: `AI · ${modelTitle}${dirTitle}`,
      };
    }
    case 'compute': {
      if (isDiskMeter(meter)) {
        const media = extractDiskMedia(meter);
        if (!media) return null;
        const disk = media.toLowerCase() as DiskFacet;
        if (disk !== 'hdd' && disk !== 'ssd' && disk !== 'nvme') return null;
        const billing = diskBillingKindOf(meter);
        if (!billing) return null;
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'disk',
          diskFacet: disk,
          diskBillingKind: billing,
          summary: `Compute · Диск · ${media} · ${billing === 'iops' ? 'IOPS' : 'ёмкость'}`,
        };
      }
      if (isVcpuMeter(meter)) {
        const share = extractVcpuShareClass(meter);
        const platform = extractVcpuPlatformFacet(meter);
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'vcpu',
          vcpuShareFacet: share ?? 'all',
          vcpuPlatformFacet: platform,
          summary: [
            'Compute · Ядра',
            share === 'dedicated' ? '100%' : share === 'shared' ? 'Shared' : null,
            platform,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      }
      if (isRamMeter(meter)) {
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'ram',
          summary: 'Compute · RAM',
        };
      }
      if (isFlavorMeter(meter)) {
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'flavor',
          summary: 'Compute · Flavor',
        };
      }
      if (isImageMeter(meter)) {
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'image',
          summary: 'Compute · Образ',
        };
      }
      if (isSnapshotMeter(meter)) {
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'snapshot',
          summary: 'Compute · Снимок',
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export function canFindSimilar(meter: CatalogMeter): boolean {
  return comparableFilterFromMeter(meter) != null;
}
