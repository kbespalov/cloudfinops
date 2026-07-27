/**
 * Map a catalog meter to the facet filter that keeps only like-for-like peers
 * across providers (same storage class, GPU family, disk media, …).
 */
import {
  extractAiFamilyFacet,
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

export type ComparableCatalogFilter = {
  category: Exclude<CategoryFilter, 'all'>;
  facet: ComputeFacet;
  diskFacet: DiskFacet;
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
  aiFacet: AiFacet;
  aiFamilyFacet: AiFamilyFacet;
  /** Human summary for the banner, e.g. «Storage · Standard · Хранение». */
  summary: string;
};

const EMPTY_NESTED = {
  facet: 'all' as ComputeFacet,
  diskFacet: 'all' as DiskFacet,
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
  aiFacet: 'all' as AiFacet,
  aiFamilyFacet: 'all' as AiFamilyFacet,
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
      const availability = extractKubernetesAvailability(meter);
      if (!availability) return null;
      return {
        ...EMPTY_NESTED,
        category: 'kubernetes',
        kubernetesAvailabilityFacet: availability,
        summary:
          availability === 'zonal'
            ? 'Kubernetes · зональный'
            : 'Kubernetes · региональный',
      };
    }
    case 'ai': {
      const family = extractAiFamilyFacet(meter);
      const dir = extractAiTokenDirection(meter);
      if (!family && !dir) return null;
      const familyTitle = family ?? 'AI';
      const dirTitle = dir === 'input' ? ' · Input' : dir === 'output' ? ' · Output' : '';
      return {
        ...EMPTY_NESTED,
        category: 'ai',
        aiFamilyFacet: family ?? 'all',
        aiFacet: dir ?? 'all',
        summary: `AI · ${familyTitle}${dirTitle}`,
      };
    }
    case 'compute': {
      if (isDiskMeter(meter)) {
        const media = extractDiskMedia(meter);
        if (!media) return null;
        const disk = media.toLowerCase() as DiskFacet;
        if (disk !== 'hdd' && disk !== 'ssd' && disk !== 'nvme') return null;
        return {
          ...EMPTY_NESTED,
          category: 'compute',
          facet: 'disk',
          diskFacet: disk,
          summary: `Compute · Диск · ${media}`,
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
