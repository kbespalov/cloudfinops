import type {
  CatalogData,
  CatalogMeter,
  CatalogSource,
  CategoryKey,
} from '../../scripts/build-catalog';
import catalogJson from '@/data/catalog.generated.json';

export type {CatalogData, CatalogMeter, CatalogSource, CategoryKey};

/** Primary mutually exclusive categories (filters). */
export type CategoryFilter = 'all' | Exclude<CategoryKey, 'other'>;

/** Optional refine facets — not peer categories; can nest under Compute. */
export type ComputeFacet = 'all' | 'vcpu' | 'ram' | 'flavor' | 'disk' | 'image' | 'snapshot';

/** Block disk media — shown only when Compute → Диск is selected. */
export type DiskFacet = 'all' | 'hdd' | 'ssd' | 'nvme';

/** vCPU guarantee — shown only when Compute → Ядра is selected. */
export type VcpuShareFacet = 'all' | 'dedicated' | 'shared';

/** vCPU CPU generation — shown only when Compute → Ядра is selected. */
export type VcpuPlatformFacet =
  | 'all'
  | 'ice-lake'
  | 'cascade-lake'
  | 'sapphire'
  | 'other';

/** Popular GPU families for quick filters under GPU category (by catalog volume). */
export type GpuFacet =
  | 'all'
  | 'h100'
  | 'h200'
  | 'b300'
  | 'a100'
  | 'l40s'
  | 'v100'
  | 'l4'
  | 'a30'
  | 't4';

/** Object storage classes from SKU dimensions.storageClass. */
export type StorageFacet = 'all' | 'standard' | 'warm' | 'cold' | 'ice';

/** Storage kind — capacity vs API operations. */
export type StorageKindFacet = 'all' | 'capacity' | 'operations';

/** Network kind — public IP vs egress (ingress/NAT stay under «Все»). */
export type NetworkFacet = 'all' | 'public-ip' | 'egress';

/** Kubernetes master topology — zonal (not HA) vs regional (fault-tolerant). */
export type KubernetesAvailabilityFacet = 'all' | 'zonal' | 'regional';

export type GroupMode = 'none' | 'provider' | 'category';
export type PeriodMode = 'unit' | 'month' | 'year';
export type Density = 's' | 'm' | 'l';
export type SortKey = 'price-asc' | 'price-desc' | 'name' | 'provider';

export const catalog = catalogJson as CatalogData;

export const CATEGORY_ORDER: Exclude<CategoryKey, 'other'>[] = [
  'compute',
  'gpu',
  'storage',
  'network',
  'kubernetes',
];

export const CATEGORY_TITLE: Record<CategoryKey, string> = {
  compute: 'Compute',
  gpu: 'GPU',
  storage: 'Storage',
  network: 'Network',
  kubernetes: 'Kubernetes',
  other: 'Other',
};

const MONTH_HOURS = 720;

const PLATFORM_LABELS: Record<string, string> = {
  'amd-zen4': 'AMD Zen 4',
  'intel-ice-lake': 'Intel Ice Lake',
  'intel-cascade-lake': 'Intel Cascade Lake',
  'intel-sapphire-rapids': 'Intel Sapphire Rapids',
  'intel-broadwell': 'Intel Broadwell',
  /** Cloud.ru Evolution: same price on 6248R or 6348 hosts */
  'intel-cascade-or-ice': 'Cascade / Ice Lake',
  unknown: 'Платформа не указана',
};

export function formatPlatform(family: string | null | undefined): string | null {
  if (!family) return null;
  if (PLATFORM_LABELS[family]) return PLATFORM_LABELS[family];
  return family
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Object API requests — comparable pack size (AWS S3 style). */
export const REQUEST_PRICE_PACK = 10_000;

export function isRequestMeter(meter: CatalogMeter): boolean {
  return meter.unitQuantity === 'request' || meter.meter === 'storage.object.requests';
}

export function amountNumber(meter: CatalogMeter, period: PeriodMode): number | null {
  // Requests: always price per 10_000 operations (ignore month/year toggle)
  if (isRequestMeter(meter)) {
    if (meter.normalizedAmount != null) {
      const pack = Number(meter.normalizedAmount);
      return Number.isFinite(pack) ? pack : null;
    }
    const perRequest = Number(meter.nativeAmount);
    if (!Number.isFinite(perRequest)) return null;
    return perRequest * REQUEST_PRICE_PACK;
  }

  const base = meter.normalizedAmount ?? meter.nativeAmount;
  if (base == null) return null;
  const n = Number(base);
  if (!Number.isFinite(n)) return null;

  const srcPeriod = meter.normalizedPeriod || meter.unitPeriod;
  if (srcPeriod === 'hour') {
    if (period === 'month') return n * MONTH_HOURS;
    if (period === 'year') return n * MONTH_HOURS * 12;
    return n;
  }
  if (srcPeriod === 'month') {
    if (period === 'unit') return n / MONTH_HOURS;
    if (period === 'year') return n * 12;
    return n;
  }
  // usage / one-shot — amount is already the unit price (e.g. ₽/GiB traffic)
  return n;
}

export function displayAmount(meter: CatalogMeter, period: PeriodMode): string | null {
  const n = amountNumber(meter, period);
  if (n == null) return null;
  if (isRequestMeter(meter)) return formatRub(n, 2);
  // Unit prices can be tiny; month/year keep 2 digits so the column stays aligned
  return formatRub(n, period === 'unit' ? 4 : 2);
}

export function periodLabel(period: PeriodMode): string {
  if (period === 'month') return 'в месяц';
  if (period === 'year') return 'в год';
  return 'в час';
}

export function meterPriceLabel(meter: CatalogMeter, period: PeriodMode): string {
  if (isRequestMeter(meter)) return 'за 10 000 запросов';
  const periodRu = periodLabel(period);
  const q = meter.unitQuantity;
  if (q && !['flavor', 'master', 'address', 'vCPU', 'GiB-RAM', 'GB-RAM'].includes(q)) {
    return `за ${q} · ${periodRu}`;
  }
  if (q === 'vCPU') return `за vCPU · ${periodRu}`;
  if (q === 'GiB-RAM' || q === 'GB-RAM') return `за GiB RAM · ${periodRu}`;
  return periodRu;
}

export function formatRub(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatAsOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short', year: 'numeric'});
}

/** Resolve SKU sourceRefs to public pricing/docs links. */
export function resolveMeterSources(meter: CatalogMeter): CatalogSource[] {
  const map = catalog.sources || {};
  const seen = new Set<string>();
  const out: CatalogSource[] = [];
  for (const ref of meter.sourceRefs || []) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const src = map[ref];
    if (src?.url) out.push(src);
  }
  return out;
}

export function isVcpuMeter(meter: CatalogMeter): boolean {
  return meter.meter.includes('vcpu') || meter.unitQuantity === 'vCPU';
}

export function isRamMeter(meter: CatalogMeter): boolean {
  return (
    meter.meter.includes('.ram') ||
    meter.meter.endsWith('ram') ||
    meter.unitQuantity === 'GiB-RAM' ||
    meter.unitQuantity === 'GB-RAM'
  );
}

export function isFlavorMeter(meter: CatalogMeter): boolean {
  return meter.meter === 'compute.flavor' || meter.unitQuantity === 'flavor';
}

export function isDiskMeter(meter: CatalogMeter): boolean {
  return meter.meter.startsWith('storage.block');
}

export function isImageMeter(meter: CatalogMeter): boolean {
  return meter.meter.startsWith('storage.image');
}

/** Disk snapshot capacity (taxonomy: storage.snapshot.*). */
export function isSnapshotMeter(meter: CatalogMeter): boolean {
  return meter.meter.startsWith('storage.snapshot');
}

export function meterMatchesCategory(meter: CatalogMeter, category: CategoryFilter): boolean {
  if (category === 'all') return true;
  return meter.categoryKey === category;
}

export function meterMatchesComputeFacet(meter: CatalogMeter, facet: ComputeFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'compute') return false;
  if (facet === 'vcpu') return isVcpuMeter(meter);
  if (facet === 'ram') return isRamMeter(meter);
  if (facet === 'flavor') return isFlavorMeter(meter);
  if (facet === 'disk') return isDiskMeter(meter);
  if (facet === 'image') return isImageMeter(meter);
  if (facet === 'snapshot') return isSnapshotMeter(meter);
  return true;
}

/** Human-readable billing unit for the specs column (e.g. «GiB · час»). */
export function billingUnitLabel(meter: CatalogMeter): string {
  // Prefer normalized unit so catalog rows share one period (hour) across providers
  const q = meter.unitQuantity;
  const p = meter.normalizedPeriod || meter.unitPeriod;
  const periodRu =
    p === 'hour'
      ? 'час'
      : p === 'month'
        ? 'мес'
        : p === 'year'
          ? 'год'
          : p === 'minute'
            ? 'мин'
            : p || null;
  if (q && periodRu) return `${q} · ${periodRu}`;
  if (q) return q;
  if (periodRu) return periodRu;
  return '—';
}

export function meterMatchesDiskFacet(meter: CatalogMeter, facet: DiskFacet): boolean {
  if (facet === 'all') return true;
  if (!isDiskMeter(meter)) return false;
  const media = extractDiskMedia(meter);
  if (!media) return false;
  return media.toLowerCase() === facet;
}

/** dedicated = 100% / 1:1; shared = 20% / 50% / 1:3 etc. */
export function extractVcpuShareClass(meter: CatalogMeter): 'dedicated' | 'shared' | null {
  if (!isVcpuMeter(meter)) return null;
  const share = meter.dimensions.guaranteedVcpuShare;
  const alloc = meter.dimensions.cpuAllocation;

  if (share === '100%' || alloc === '1:1') return 'dedicated';
  if (typeof share === 'string' && share && share !== '100%') return 'shared';
  if (typeof alloc === 'string' && alloc && alloc !== '1:1') return 'shared';
  return null;
}

export function meterMatchesVcpuShareFacet(meter: CatalogMeter, facet: VcpuShareFacet): boolean {
  if (facet === 'all') return true;
  if (!isVcpuMeter(meter)) return false;
  return extractVcpuShareClass(meter) === facet;
}

export function extractVcpuPlatformFacet(meter: CatalogMeter): Exclude<VcpuPlatformFacet, 'all'> {
  const family = meter.cpuPlatformFamily || '';
  if (family === 'intel-ice-lake') return 'ice-lake';
  if (family === 'intel-cascade-lake') return 'cascade-lake';
  if (family === 'intel-sapphire-rapids') return 'sapphire';
  return 'other';
}

export function meterMatchesVcpuPlatformFacet(
  meter: CatalogMeter,
  facet: VcpuPlatformFacet,
): boolean {
  if (facet === 'all') return true;
  if (!isVcpuMeter(meter)) return false;
  return extractVcpuPlatformFacet(meter) === facet;
}

function gpuHaystack(meter: CatalogMeter): string {
  const model = typeof meter.dimensions.gpuModel === 'string' ? meter.dimensions.gpuModel : '';
  return `${model} ${meter.name} ${meter.sku}`;
}

export function meterMatchesGpuFacet(meter: CatalogMeter, facet: GpuFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'gpu') return false;
  const hay = gpuHaystack(meter);
  if (facet === 'h100') return /H100/i.test(hay);
  if (facet === 'h200') return /H200/i.test(hay);
  if (facet === 'b300') return /B300/i.test(hay);
  if (facet === 'a100') return /A100/i.test(hay);
  if (facet === 'l40s') return /L40S/i.test(hay);
  // Include V100S in the V100 quick-filter bucket
  if (facet === 'v100') return /V100/i.test(hay);
  // L4 / L4 vGPU, but not L40 / L40S
  if (facet === 'l4') return !/L40/i.test(hay) && /\bL4\b|L4 vGPU/i.test(hay);
  if (facet === 'a30') return /A30/i.test(hay);
  if (facet === 't4') return /\bT4\b|Tesla T4/i.test(hay);
  return true;
}

export function extractGpuModel(meter: CatalogMeter): string | null {
  const model = meter.dimensions.gpuModel;
  if (typeof model === 'string' && model && model !== 'unknown') return model;
  return null;
}

export function extractStorageClass(meter: CatalogMeter): string | null {
  const cls = meter.dimensions.storageClass;
  if (typeof cls === 'string' && cls) return cls;
  return null;
}

export const STORAGE_CLASS_TITLE: Record<string, string> = {
  standard: 'Standard',
  warm: 'Warm',
  cold: 'Cold',
  ice: 'Ice',
  'intelligent-tiering': 'Intelligent Tiering',
  'single-zone': 'Single-zone',
};

/** Media class for block disks (HDD / SSD / NVMe). */
export function extractDiskMedia(meter: CatalogMeter): 'HDD' | 'SSD' | 'NVMe' | null {
  if (!meter.meter.startsWith('storage.block.')) return null;
  const tier = meter.dimensions.performanceTier;
  const media = meter.dimensions.storageMedia;
  const iface = meter.dimensions.storageInterface;
  if (tier === 'hdd' || media === 'hdd') return 'HDD';
  if (tier === 'nvme' || iface === 'nvme') return 'NVMe';
  if (tier === 'ssd' || media === 'ssd' || tier === 'provisioned-iops') return 'SSD';
  return 'SSD';
}

/** Optional native/performance variant after media (Fast v2, Light, Non-replicated…). */
const DISK_TYPE_VARIANT: Record<string, string | null> = {
  'network-hdd': null,
  'ceph-hdd': null,
  hdd: null,
  'network-ssd': null,
  'ceph-ssd': null,
  ssd: null,
  'ssd-nvme': null,
  'network-ssd-nonreplicated': 'Non-replicated',
  'network-ssd-io-m3': 'Ultra',
  'fast-ssd-v2': 'Fast v2',
  'universal-ssd-v2': 'Universal v2',
  'nbs-pl2': 'NBS-PL2',
  'ef-nvme': 'Low Latency',
  light: 'Light',
  basic: 'Basic',
  average: 'Average',
  high: 'High',
};

export function extractDiskVariant(meter: CatalogMeter): string | null {
  if (!meter.meter.startsWith('storage.block.')) return null;

  const redundancy = meter.dimensions.redundancy;
  if (redundancy === 'non-replicated') return 'Non-replicated';
  if (redundancy === 'triple-replicated') return 'Ultra';

  const native = meter.dimensions.nativePerformanceTier;
  if (typeof native === 'string' && native) {
    if (native === 'nbs-pl2') return 'NBS-PL2';
    if (['light', 'basic', 'average', 'high'].includes(native)) {
      return native.charAt(0).toUpperCase() + native.slice(1);
    }
  }

  const diskType = meter.dimensions.diskType;
  if (typeof diskType === 'string' && diskType in DISK_TYPE_VARIANT) {
    return DISK_TYPE_VARIANT[diskType];
  }
  return null;
}

function displayBlockDiskName(meter: CatalogMeter): string {
  const media = extractDiskMedia(meter) || 'SSD';
  const variant = extractDiskVariant(meter);
  const parts = ['Диск', media];
  if (variant) parts.push(variant);
  if (meter.meter === 'storage.block.iops') parts.push('IOPS');
  return parts.join(' · ');
}

/** Taxonomy-aligned label for catalog UI (keeps native name in SKU/drawer meta). */
export function displayMeterName(meter: CatalogMeter): string {
  if (meter.meter.startsWith('storage.block.')) {
    return displayBlockDiskName(meter);
  }

  if (isImageMeter(meter)) return 'Образ ВМ';
  if (isSnapshotMeter(meter)) return 'Снимок диска';

  if (meter.categoryKey === 'storage' || meter.meter.startsWith('storage.object.')) {
    const cls = extractStorageClass(meter);
    const clsTitle = cls ? STORAGE_CLASS_TITLE[cls] || cls : null;
    const op =
      typeof meter.dimensions.operation === 'string' ? meter.dimensions.operation : null;

    if (meter.meter === 'storage.object.capacity' && clsTitle) {
      if (cls === 'intelligent-tiering' && typeof meter.dimensions.accessTier === 'string') {
        const tier = meter.dimensions.accessTier;
        const tierTitle =
          tier === 'frequent'
            ? 'Frequent'
            : tier === 'infrequent'
              ? 'Infrequent'
              : tier === 'archive'
                ? 'Archive'
                : tier;
        return `Объектное хранилище · ${clsTitle} · ${tierTitle}`;
      }
      const topology = meter.dimensions.topology;
      if (topology === 'single-zone' || topology === 'multi-zone') {
        const topoTitle = topology === 'single-zone' ? 'Single-zone' : 'Multi-zone';
        return `Объектное хранилище · ${clsTitle} · ${topoTitle}`;
      }
      return `Объектное хранилище · ${clsTitle}`;
    }

    if (meter.meter === 'storage.object.requests' && clsTitle) {
      return op
        ? `Объектное хранилище · ${clsTitle} · ${op}`
        : `Объектное хранилище · ${clsTitle} · Requests`;
    }
  }

  return meter.name;
}

export function meterMatchesStorageFacet(meter: CatalogMeter, facet: StorageFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'storage') return false;
  return extractStorageClass(meter) === facet;
}

export function extractStorageKind(meter: CatalogMeter): 'capacity' | 'operations' | null {
  if (meter.categoryKey !== 'storage') return null;
  if (meter.meter === 'storage.object.requests' || isRequestMeter(meter)) return 'operations';
  if (meter.meter === 'storage.object.capacity' || meter.meter.endsWith('.capacity')) {
    return 'capacity';
  }
  return null;
}

export function meterMatchesStorageKindFacet(
  meter: CatalogMeter,
  facet: StorageKindFacet,
): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'storage') return false;
  return extractStorageKind(meter) === facet;
}

export function extractNetworkKind(meter: CatalogMeter): 'public-ip' | 'egress' | null {
  if (
    meter.meter === 'network.ipv4.attached' ||
    meter.meter === 'network.ipv4.reserved' ||
    meter.meter.startsWith('network.ipv4.')
  ) {
    return 'public-ip';
  }
  if (meter.meter === 'network.traffic.egress') return 'egress';
  return null;
}

export function meterMatchesNetworkFacet(meter: CatalogMeter, facet: NetworkFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'network') return false;
  return extractNetworkKind(meter) === facet;
}

/** Zonal = single-zone / not HA; regional = multi-zone / fault-tolerant. */
export function extractKubernetesAvailability(
  meter: CatalogMeter,
): 'zonal' | 'regional' | null {
  if (meter.categoryKey !== 'kubernetes') return null;
  const dims = meter.dimensions;
  if (dims.availability === 'zonal' || dims.availability === 'regional') {
    return dims.availability;
  }
  if (dims.faultTolerant === true) return 'regional';
  if (dims.faultTolerant === false) return 'zonal';
  if (dims.topology === 'regional' || dims.topology === 'high-availability') return 'regional';
  if (dims.topology === 'zonal' || dims.topology === 'basic') return 'zonal';
  if (dims.masterCount === 3) return 'regional';
  if (dims.masterCount === 1) return 'zonal';
  if (meter.comparableTier === 'ha') return 'regional';
  if (meter.comparableTier === 'basic') return 'zonal';
  return null;
}

export function kubernetesAvailabilityLabel(availability: 'zonal' | 'regional'): string {
  return availability === 'zonal' ? 'Зональный' : 'Региональный';
}

export function kubernetesFaultToleranceHint(availability: 'zonal' | 'regional'): string {
  return availability === 'zonal' ? 'Не отказоустойчивый' : 'Отказоустойчивый';
}

export function meterMatchesKubernetesAvailabilityFacet(
  meter: CatalogMeter,
  facet: KubernetesAvailabilityFacet,
): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'kubernetes') return false;
  return extractKubernetesAvailability(meter) === facet;
}

export function meterMatchesSearch(meter: CatalogMeter, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    meter.sku.toLowerCase().includes(s) ||
    meter.name.toLowerCase().includes(s) ||
    displayMeterName(meter).toLowerCase().includes(s) ||
    meter.providerName.toLowerCase().includes(s) ||
    meter.meter.toLowerCase().includes(s) ||
    (meter.cpuPlatformFamily || '').toLowerCase().includes(s) ||
    (formatPlatform(meter.cpuPlatformFamily) || '').toLowerCase().includes(s) ||
    (meter.region || '').toLowerCase().includes(s) ||
    (extractStorageClass(meter) || '').toLowerCase().includes(s)
  );
}

export function extractVcpu(meter: CatalogMeter): number | null {
  const dims = meter.dimensions;
  if (typeof dims.vcpu === 'number') return dims.vcpu;
  if (isVcpuMeter(meter)) return 1;
  return null;
}

export function extractRamGiB(meter: CatalogMeter): number | null {
  const dims = meter.dimensions;
  if (typeof dims.ramGiB === 'number') return dims.ramGiB;
  if (typeof dims.ramGb === 'number') return dims.ramGb;
  if (isRamMeter(meter)) return 1;
  return null;
}

export function paramsLabel(meter: CatalogMeter): string {
  const dims = meter.dimensions;
  const parts: string[] = [];

  const k8sAvailability = extractKubernetesAvailability(meter);
  if (k8sAvailability) parts.push(kubernetesAvailabilityLabel(k8sAvailability));

  if (meter.pricingMode === 'bundle' || meter.unitQuantity === 'flavor') {
    if (typeof dims.vcpu === 'number') parts.push(`${dims.vcpu} vCPU`);
    const ram = typeof dims.ramGiB === 'number' ? dims.ramGiB : dims.ramGb;
    if (typeof ram === 'number') parts.push(`${ram} GiB RAM`);
    if (typeof dims.gpuCount === 'number') parts.push(`${dims.gpuCount} GPU`);
    if (typeof dims.gpuModel === 'string') parts.push(dims.gpuModel);
  } else {
    if (meter.unitQuantity && !['flavor', 'master', 'address'].includes(meter.unitQuantity)) {
      parts.push(meter.unitQuantity);
    }
    if (typeof dims.guaranteedVcpuShare === 'string') parts.push(dims.guaranteedVcpuShare);
    if (typeof dims.gpuCount === 'number') parts.push(`${dims.gpuCount} GPU`);
  }

  const platform = formatPlatform(meter.cpuPlatformFamily);
  if (platform && platform !== 'Платформа не указана') parts.push(platform);

  if (meter.purchaseModel === 'preemptible') parts.push('preemptible');
  if (meter.synthetic) parts.push('synthetic');

  return parts.slice(0, 4).join(' · ') || '—';
}

export function sortMeters(
  meters: CatalogMeter[],
  sort: SortKey,
  period: PeriodMode,
): CatalogMeter[] {
  const list = [...meters];
  list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
    if (sort === 'provider') return a.providerName.localeCompare(b.providerName, 'ru');
    const pa = amountNumber(a, period);
    const pb = amountNumber(b, period);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return sort === 'price-desc' ? pb - pa : pa - pb;
  });
  return list;
}

export type GroupSummary = {
  id: string;
  title: string;
  categoryKey: CategoryKey | null;
  items: CatalogMeter[];
  count: number;
  priceMin: number | null;
  priceMax: number | null;
  providerCount: number;
  updatedAt: string | null;
};

export function buildGroupSummaries(
  filtered: CatalogMeter[],
  groupMode: GroupMode,
  period: PeriodMode,
): GroupSummary[] {
  if (groupMode === 'none') return [];

  const map = new Map<string, CatalogMeter[]>();
  for (const m of filtered) {
    const id =
      groupMode === 'category' ? `category:${m.categoryKey}` : `provider:${m.provider}`;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(m);
  }

  const summaries: GroupSummary[] = [];
  for (const [id, items] of map) {
    const prices = items
      .map((m) => amountNumber(m, period))
      .filter((n): n is number => n != null);
    const providers = new Set(items.map((m) => m.provider));
    const dates = items.map((m) => m.checkedAt).filter((d): d is string => Boolean(d));
    dates.sort();
    const categoryKey =
      groupMode === 'category' ? (items[0]?.categoryKey ?? null) : null;
    const title =
      groupMode === 'category'
        ? CATEGORY_TITLE[items[0]!.categoryKey]
        : items[0]!.providerName;

    summaries.push({
      id,
      title,
      categoryKey,
      items,
      count: items.length,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      providerCount: providers.size,
      updatedAt: dates.length ? dates[dates.length - 1]! : null,
    });
  }

  if (groupMode === 'category') {
    summaries.sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.categoryKey as Exclude<CategoryKey, 'other'>) -
        CATEGORY_ORDER.indexOf(b.categoryKey as Exclude<CategoryKey, 'other'>),
    );
  } else {
    summaries.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }
  return summaries;
}
