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

/**
 * Coarse GPU attach / fabric filter — PCIe cards vs NVLink-class (incl. SXM / NVL).
 * Used to find independently attachable cards vs dense fabric hosts.
 */
export type GpuInterconnectFacet = 'all' | 'pcie' | 'nvlink';

/** Object storage classes from SKU dimensions.storageClass. */
export type StorageFacet = 'all' | 'standard' | 'warm' | 'cold' | 'ice';

/** Storage kind — capacity vs API operations. */
export type StorageKindFacet = 'all' | 'capacity' | 'operations';

/** Network kind — public IP vs egress (ingress/NAT stay under «Все»). */
export type NetworkFacet = 'all' | 'public-ip' | 'egress';

/** CDN kind — traffic vs monthly resource vs requests vs paid add-ons. */
export type CdnFacet = 'all' | 'traffic' | 'resource' | 'requests' | 'options';

/** CDN traffic direction — shown only when CDN → Трафик is selected. */
export type CdnTrafficFacet = 'all' | 'ingress' | 'egress';

/** Kubernetes master topology — zonal (not HA) vs regional (fault-tolerant). */
export type KubernetesAvailabilityFacet = 'all' | 'zonal' | 'regional';

/** AI inference token direction — prompt vs completion. */
export type AiFacet = 'all' | 'input' | 'output';

/** Quick family chips on the AI tab (brand / lineage, not exact SKU). */
export type AiFamilyFacet =
  | 'all'
  | 'gpt-oss'
  | 'qwen'
  | 'gemma'
  | 'yandexgpt'
  | 'alice'
  | 'deepseek'
  | 'glm'
  | 'gigachat'
  | 'kimi';

export const AI_FAMILY_TITLE: Record<Exclude<AiFamilyFacet, 'all'>, string> = {
  'gpt-oss': 'gpt-oss',
  qwen: 'Qwen',
  gemma: 'Gemma',
  yandexgpt: 'YandexGPT',
  alice: 'Alice',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  gigachat: 'GigaChat',
  kimi: 'Kimi',
};

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
  'cdn',
  'kubernetes',
  'ai',
];

export const CATEGORY_TITLE: Record<CategoryKey, string> = {
  compute: 'Compute',
  gpu: 'GPU',
  storage: 'Storage',
  network: 'Network',
  cdn: 'CDN',
  kubernetes: 'Kubernetes',
  ai: 'AI',
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

/** Comparable request pack for S3 + CDN (AWS S3 style: ₽ / 10 000 ops). */
export const REQUEST_PRICE_PACK = 10_000;

export function isRequestMeter(meter: CatalogMeter): boolean {
  if (meter.meter === 'storage.object.requests' || meter.meter === 'cdn.requests') return true;
  const q = meter.unitQuantity;
  return q === 'request' || q === '10k-request' || q === '100k-request';
}

/** How many requests the native/normalized amount is priced for. */
export function requestBillingPackSize(meter: CatalogMeter): number {
  const q = meter.unitQuantity;
  if (q === '100k-request') return 100_000;
  if (q === '10k-request') return 10_000;
  const dimPack = Number(meter.dimensions?.billablePackRequests);
  if (Number.isFinite(dimPack) && dimPack > 0) return dimPack;
  // Per-request native unit (typical S3): pack size 1.
  return 1;
}

/** Traffic / one-shot usage — priced per quantity, not per wall-clock hour. */
export function isUsageMeter(meter: CatalogMeter): boolean {
  return (
    meter.unitPeriod === 'usage' ||
    meter.normalizedPeriod === 'usage' ||
    meter.meter.startsWith('network.traffic.') ||
    meter.meter.startsWith('cdn.traffic.') ||
    meter.meter === 'cdn.requests' ||
    meter.meter.startsWith('ai.inference.') ||
    meter.meter.startsWith('ai.embeddings.')
  );
}

/** Token-priced AI meters (generation / speech / embeddings). Excludes per-request AI SKUs. */
export function isAiTokenMeter(meter: CatalogMeter): boolean {
  if (isRequestMeter(meter)) return false;
  return (
    meter.meter.startsWith('ai.inference.') ||
    meter.meter.startsWith('ai.embeddings.') ||
    (meter.categoryKey === 'ai' && meter.unitQuantity === '1M-token')
  );
}

export function isAddressMeter(meter: CatalogMeter): boolean {
  return (
    meter.unitQuantity === 'address' ||
    meter.meter === 'network.ipv4.attached' ||
    meter.meter === 'network.ipv4.reserved' ||
    meter.meter.startsWith('network.ipv4.')
  );
}

export function isGatewayMeter(meter: CatalogMeter): boolean {
  return meter.unitQuantity === 'gateway' || meter.meter.includes('nat.gateway');
}

export function amountNumber(meter: CatalogMeter, period: PeriodMode): number | null {
  // Requests: always price per 10_000 operations (ignore month/year toggle).
  // Convention: when normalizedAmount is set on a request meter, it is already ₽ / 10k
  // (S3 auto-pack, T1 VAT on 10k, Yandex 100k→10k). Never rescale normalized by native pack.
  if (isRequestMeter(meter)) {
    if (meter.normalizedAmount != null) {
      const pack = Number(meter.normalizedAmount);
      return Number.isFinite(pack) ? pack : null;
    }
    const packSize = requestBillingPackSize(meter);
    const native = Number(meter.nativeAmount);
    if (!Number.isFinite(native)) return null;
    if (packSize === 1) return native * REQUEST_PRICE_PACK;
    return native * (REQUEST_PRICE_PACK / packSize);
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
  if (isAiTokenMeter(meter)) return 'за 1M токенов';
  if (isUsageMeter(meter)) {
    const q = meter.unitQuantity;
    if (q === 'GiB' || q === 'GB') return 'за GiB';
    if (q === '1M-token') return 'за 1M токенов';
    if (q === '100k-request') return 'за 100 тыс. запросов';
    if (q === '10k-request') return 'за 10 тыс. запросов';
    if (q) return `за ${q}`;
    return 'за единицу';
  }
  const periodRu = periodLabel(period);
  if (isAddressMeter(meter)) return `за IP · ${periodRu}`;
  if (isGatewayMeter(meter)) return `за шлюз · ${periodRu}`;
  const gpuBasis = gpuPriceBasisLabel(meter);
  if (gpuBasis === 'целиком') return `конфигурация целиком (GPU+хост) · ${periodRu}`;
  if (gpuBasis === 'только GPU') return `только GPU · ${periodRu}`;
  const q = meter.unitQuantity;
  if (q && !['flavor', 'master', 'address', 'gateway', 'vCPU', 'GiB-RAM', 'GB-RAM'].includes(q)) {
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

/** Human-readable billing unit for the specs column (e.g. «GiB · час», «IP · час»). */
export function billingUnitLabel(meter: CatalogMeter): string {
  // Always the comparable pack — never mix 10k vs 100k in the params column.
  if (isRequestMeter(meter)) return '10 тыс. запросов';
  if (isAiTokenMeter(meter)) {
    const direction = extractAiTokenDirection(meter);
    if (direction === 'input') return 'input · 1M ток.';
    if (direction === 'output') return 'output · 1M ток.';
    return '1M ток.';
  }
  if (isUsageMeter(meter)) {
    const q = meter.unitQuantity;
    if (q === 'GiB' || q === 'GB') return 'GiB';
    if (q === '1M-token') return '1M ток.';
    if (q) return q;
    return '—';
  }

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
            : p && p !== 'usage'
              ? p
              : null;

  const quantityRu =
    q === 'address' || isAddressMeter(meter)
      ? 'IP'
      : q === 'gateway' || isGatewayMeter(meter)
        ? 'шлюз'
        : q === 'resource'
          ? 'ресурс'
          : q === 'account'
            ? 'аккаунт'
            : q;

  if (quantityRu && periodRu) return `${quantityRu} · ${periodRu}`;
  if (quantityRu) return quantityRu;
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

export function extractGpuCount(meter: CatalogMeter): number | null {
  const n = meter.dimensions.gpuCount;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** How the listed GPU price is billed — card-only vs full VM flavor. */
export function gpuPriceBasisLabel(meter: CatalogMeter): 'только GPU' | 'целиком' | null {
  if (meter.categoryKey !== 'gpu') return null;
  if (
    meter.pricingMode === 'bundle' ||
    meter.unitQuantity === 'flavor' ||
    meter.meter === 'compute.flavor'
  ) {
    return 'целиком';
  }
  if (meter.meter === 'compute.gpu') return 'только GPU';
  return null;
}

type GpuDisplayIdentity = {
  /** Leading brand/vendor, e.g. NVIDIA / Metax / Yandex. */
  vendor: string;
  /** Short card/family label without memory or interconnect. */
  card: string;
  memoryGb: number | null;
  interconnect: string | null;
  vgpuProfile: string | null;
  /** Public tariff does not name the silicon (Yandex Gen2 / Platform V4 / T4i). */
  unknownChip: boolean;
};

function gpuHayForIdentity(meter: CatalogMeter): string {
  return `${extractGpuModel(meter) ?? ''} ${meter.name} ${meter.sku}`;
}

/** Per-GPU VRAM for display (GB). Prefer model token, then explicit dims. */
export function extractGpuMemoryGb(meter: CatalogMeter): number | null {
  const hay = gpuHayForIdentity(meter);
  const named = hay.match(/(\d+)\s*G(?:B|iB|Б)/i);
  if (named) return Number(named[1]);

  const count = extractGpuCount(meter) ?? 1;
  const explicit = Number(meter.dimensions.gpuMemoryGb ?? NaN);
  if (Number.isFinite(explicit) && explicit > 0) {
    // Selectel/Yandex unit rows store per-card memory; multi-GPU flavors may store total in vramGb.
    return explicit;
  }
  const vram = Number(meter.dimensions.vramGb ?? NaN);
  if (!Number.isFinite(vram) || vram <= 0) return null;
  if (count > 1 && vram % count === 0) return vram / count;
  return vram;
}

/**
 * Normalize GPU attach / fabric token for display and filters.
 * Prefer explicit dimensions; fall back to model/name tokens, then family defaults
 * for cards that only ship as PCIe (L4/L40S/T4/…) or dense NVLink hosts (B300/HGX).
 */
export function extractGpuInterconnect(meter: CatalogMeter): string | null {
  const raw = meter.dimensions.gpuInterconnect ?? meter.dimensions.nvlink;
  if (raw === true || raw === 'true') return 'NVLink';
  if (typeof raw === 'string' && raw.trim()) {
    if (/nvlink|\bnvl\b/i.test(raw)) return 'NVLink';
    if (/pcie|pci\b/i.test(raw)) return 'PCIe';
    if (/sxm5/i.test(raw)) return 'SXM5';
    if (/sxm/i.test(raw)) return 'SXM';
    return raw.trim();
  }
  const hay = gpuHayForIdentity(meter);
  if (/NVLink/i.test(hay) || /\bNVL\b/i.test(hay)) return 'NVLink';
  if (/SXM5/i.test(hay)) return 'SXM5';
  if (/\bSXM\b/i.test(hay)) return 'SXM';
  if (/PCI(?:e)?/i.test(hay)) return 'PCIe';
  if (/HGX|\bB300\b/i.test(hay)) return 'NVLink';
  // PCIe-only silicon families (no SXM/NVLink SKU in this catalog).
  if (
    /L40S|\bL40\b|\bL4\b|\bA30\b|\bA2\b|A2000|A5000|\bT4\b|Tesla T4|V100S|RTX|GTX/i.test(
      hay,
    )
  ) {
    return 'PCIe';
  }
  return null;
}

/** Coarse bucket for catalog chips: PCIe vs NVLink-class (SXM / NVL / HGX). */
export function gpuInterconnectFacetOf(
  meter: CatalogMeter,
): Exclude<GpuInterconnectFacet, 'all'> | null {
  const link = extractGpuInterconnect(meter);
  if (!link) return null;
  if (/pcie|pci\b/i.test(link)) return 'pcie';
  if (/nvlink|\bnvl\b|sxm|hgx/i.test(link)) return 'nvlink';
  return null;
}

export function meterMatchesGpuInterconnectFacet(
  meter: CatalogMeter,
  facet: GpuInterconnectFacet,
): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'gpu') return false;
  return gpuInterconnectFacetOf(meter) === facet;
}

function extractGpuCardFamily(hay: string): string | null {
  if (/B300/i.test(hay)) return 'B300';
  if (/H200/i.test(hay)) return 'H200';
  if (/H100/i.test(hay)) return 'H100';
  if (/L40S/i.test(hay)) return 'L40S';
  if (/\bL40\b/i.test(hay)) return 'L40';
  if (/\bL4\b/i.test(hay) && !/L40/i.test(hay)) return 'L4';
  if (/A100/i.test(hay)) return 'A100';
  if (/\bA30\b/i.test(hay)) return 'A30';
  if (/A5000/i.test(hay)) return 'A5000';
  if (/A2000/i.test(hay)) return 'A2000';
  if (/V100S/i.test(hay)) return 'V100S';
  if (/V100/i.test(hay)) return 'V100';
  if (/RTX\s*6000\s*Pro/i.test(hay)) return 'RTX 6000 Pro';
  if (/RTX\s*6000\s*Ada/i.test(hay) || /RTX\s*6000/i.test(hay)) return 'RTX 6000 Ada';
  if (/RTX\s*4090/i.test(hay)) return 'RTX 4090';
  if (/RTX\s*2080/i.test(hay)) return 'RTX 2080 Ti';
  if (!/T4i/i.test(hay) && (/Tesla\s*T4/i.test(hay) || /\bT4\b/i.test(hay))) return 'T4';
  if (/GTX\s*1080/i.test(hay)) return 'GTX 1080';
  if (/Metax\s*C550|C550/i.test(hay)) return 'C550';
  if (/Metax\s*C500|C500/i.test(hay)) return 'C500';
  return null;
}

/** Structured GPU identity for consistent catalog naming. */
export function gpuDisplayIdentity(meter: CatalogMeter): GpuDisplayIdentity | null {
  if (meter.categoryKey !== 'gpu' && meter.meter !== 'compute.gpu') return null;

  const hay = gpuHayForIdentity(meter);
  const dims = meter.dimensions;
  const memoryGb = extractGpuMemoryGb(meter);
  const interconnect = extractGpuInterconnect(meter);
  const vgpuProfile =
    dims.virtualGpu === true && typeof dims.vgpuProfile === 'string'
      ? dims.vgpuProfile
      : /vGPU/i.test(hay)
        ? typeof dims.vgpuProfile === 'string'
          ? dims.vgpuProfile
          : null
        : null;

  // Yandex unnamed platforms — never invent an NVIDIA chip name.
  const platformId = String(dims.platformId ?? '');
  if (
    /gpu-standard-v4/i.test(platformId) ||
    /Platform V4/i.test(meter.name) ||
    /platform-v4/i.test(meter.sku)
  ) {
    return {
      vendor: 'Yandex',
      card: 'Platform V4',
      memoryGb,
      interconnect: null,
      vgpuProfile: null,
      unknownChip: true,
    };
  }
  if (
    /gpu-standard-v3i/i.test(platformId) ||
    /^Gen2\b/i.test(meter.name) ||
    /\.gen2(?:\.|$)/i.test(meter.sku)
  ) {
    return {
      vendor: 'Yandex',
      card: 'Gen2',
      memoryGb,
      interconnect: null,
      vgpuProfile: null,
      unknownChip: true,
    };
  }
  if (
    /t4i/i.test(platformId) ||
    /\.t4i(?:\.|$)/i.test(meter.sku) ||
    /^T4i\b/i.test(meter.name)
  ) {
    return {
      vendor: 'Yandex',
      card: 'T4i',
      memoryGb,
      interconnect: null,
      vgpuProfile: null,
      unknownChip: true,
    };
  }

  if (/Metax|C500|C550/i.test(hay)) {
    const card = /C550/i.test(hay) ? 'C550' : 'C500';
    return {
      vendor: 'Metax',
      card,
      memoryGb,
      interconnect,
      vgpuProfile: null,
      unknownChip: false,
    };
  }

  const family = extractGpuCardFamily(hay);
  if (family) {
    const card =
      dims.virtualGpu === true || /vGPU/i.test(hay) ? `${family} vGPU` : family;
    return {
      vendor: 'NVIDIA',
      card,
      memoryGb,
      interconnect,
      vgpuProfile,
      unknownChip: false,
    };
  }

  const model = extractGpuModel(meter);
  if (model) {
    return {
      vendor: /^NVIDIA\b/i.test(model) ? 'NVIDIA' : 'GPU',
      card: model.replace(/^NVIDIA\s+/i, '').replace(/\s+\d+\s*G(?:B|iB|Б).*$/i, '').trim() || model,
      memoryGb,
      interconnect,
      vgpuProfile,
      unknownChip: false,
    };
  }

  return null;
}

function isGpuPreemptible(meter: CatalogMeter): boolean {
  const pm = meter.purchaseModel ?? meter.dimensions.purchaseModel;
  return pm === 'preemptible' || /прерываем/i.test(meter.name);
}

/**
 * Canonical GPU tariff title (SKU / «Тариф» column):
 * `NVIDIA H100 80 ГБ · PCIe · ×1` — card identity only (no billing basis, no host BOM).
 */
export function formatGpuTariffName(meter: CatalogMeter): string | null {
  const id = gpuDisplayIdentity(meter);
  if (!id) return null;

  const parts: string[] = [];
  const head = [id.vendor, id.card].filter(Boolean).join(' ');
  parts.push(id.memoryGb != null ? `${head} ${id.memoryGb} ГБ` : head);
  if (id.interconnect) parts.push(id.interconnect);
  if (id.vgpuProfile) parts.push(id.vgpuProfile);
  else if (id.unknownChip) parts.push('чип не указан');

  const count = extractGpuCount(meter);
  if (count != null) parts.push(`×${count}`);
  if (isGpuPreemptible(meter)) parts.push('прерываемая');

  return parts.join(' · ');
}

/**
 * GPU «Состав» column — what the price covers, without repeating the card name.
 * Examples: `только GPU`, `целиком · 20 vCPU · 110 GiB`, `только GPU · оценка *`.
 */
export function formatGpuLabel(meter: CatalogMeter): string | null {
  if (meter.categoryKey !== 'gpu' && meter.meter !== 'compute.gpu') return null;

  const parts: string[] = [];
  const basis = gpuPriceBasisLabel(meter);
  if (basis) parts.push(basis);

  if (basis === 'целиком') {
    const vcpu = typeof meter.dimensions.vcpu === 'number' ? meter.dimensions.vcpu : null;
    const ram =
      typeof meter.dimensions.ramGiB === 'number'
        ? meter.dimensions.ramGiB
        : typeof meter.dimensions.ramGb === 'number'
          ? meter.dimensions.ramGb
          : null;
    if (vcpu != null) parts.push(`${vcpu} vCPU`);
    if (ram != null) parts.push(`${ram} GiB`);
  }

  if (meter.synthetic || meter.sku.includes('.synthetic')) {
    parts.push('оценка *');
  }

  return parts.length ? parts.join(' · ') : null;
}

/** Flavor codes like GPU-44-256-H200-1 / vGPU-2-8-L4-1Q — count buried in SKU string. */
function looksLikeGpuFlavorCode(name: string): boolean {
  const n = name.trim();
  return /^GPU\d*[A-Z]?[-_]/i.test(n) || /^vGPU[-_]/i.test(n);
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

/** Included / max IOPS from price-book dimensions (block disks). */
export function extractDiskIopsLimits(meter: CatalogMeter): {
  included: number | null;
  maximum: number | null;
  /** null = unknown; false = fixed IOPS in GiB rate (e.g. T1). */
  chargedSeparately: boolean | null;
} {
  if (!meter.meter.startsWith('storage.block.')) {
    return {included: null, maximum: null, chargedSeparately: null};
  }
  const dims = meter.dimensions;
  const included = typeof dims.includedIops === 'number' ? dims.includedIops : null;
  const maximum = typeof dims.maximumIops === 'number' ? dims.maximumIops : null;
  const chargedSeparately =
    typeof dims.iopsChargedSeparately === 'boolean' ? dims.iopsChargedSeparately : null;
  return {included, maximum, chargedSeparately};
}

function formatIopsCount(n: number): string {
  return n.toLocaleString('ru-RU');
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
  if (isAiTokenMeter(meter)) {
    const model = extractAiModelFamily(meter);
    const direction = extractAiTokenDirection(meter);
    if (model && direction) return `${model} · ${direction}`;
    if (model) return model;
  }

  // Normalize every GPU row: NVIDIA/card/VRAM first, then interconnect / count / basis.
  if (meter.categoryKey === 'gpu' || meter.meter === 'compute.gpu') {
    const gpuTitle = formatGpuTariffName(meter);
    if (gpuTitle) return gpuTitle;
  }
  // Legacy VK flavor codes outside categoryKey=gpu (defensive).
  if (meter.meter === 'compute.flavor' && looksLikeGpuFlavorCode(meter.name)) {
    const gpuLabel = formatGpuLabel(meter);
    if (gpuLabel) return gpuLabel;
  }

  if (meter.meter.startsWith('storage.block.')) {
    return displayBlockDiskName(meter);
  }

  if (meter.categoryKey === 'kubernetes') {
    return formatKubernetesDisplayName(meter);
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

export function extractAiModelFamily(meter: CatalogMeter): string | null {
  const dims = meter.dimensions;
  if (typeof dims.modelFamily === 'string' && dims.modelFamily.trim()) return dims.modelFamily;
  if (typeof dims.modelId === 'string' && dims.modelId.trim()) return dims.modelId;
  return null;
}

/**
 * Whether the model has public open weights suitable for self-host / dedicated GPU.
 * Sourced from PriceBook `dimensions.openWeights` (boolean). Missing → unknown (null).
 */
export function extractOpenWeights(meter: CatalogMeter): boolean | null {
  const v = meter.dimensions.openWeights;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return null;
}

/** AI meter with public open weights (Развернуть / self-host CTA). */
export function isOpenWeightAiMeter(meter: CatalogMeter): boolean {
  return meter.categoryKey === 'ai' && extractOpenWeights(meter) === true;
}

export function extractAiTokenDirection(meter: CatalogMeter): 'input' | 'output' | null {
  const dims = meter.dimensions;
  if (dims.tokenDirection === 'input' || meter.meter === 'ai.inference.tokens.input') return 'input';
  if (dims.tokenDirection === 'output' || meter.meter === 'ai.inference.tokens.output') {
    return 'output';
  }
  return null;
}

export function meterMatchesAiFacet(meter: CatalogMeter, facet: AiFacet): boolean {
  if (facet === 'all') return true;
  if (!isAiTokenMeter(meter)) return false;
  return extractAiTokenDirection(meter) === facet;
}

/** Map a concrete model name to a coarse family chip. */
export function extractAiFamilyFacet(meter: CatalogMeter): Exclude<AiFamilyFacet, 'all'> | null {
  if (!isAiTokenMeter(meter)) return null;
  const blob = `${extractAiModelFamily(meter) || ''} ${extractAiModelKey(meter) || ''}`.toLowerCase();
  if (!blob.trim()) return null;
  if (blob.includes('gpt-oss')) return 'gpt-oss';
  if (blob.includes('yandexgpt')) return 'yandexgpt';
  if (blob.includes('alice')) return 'alice';
  if (blob.includes('deepseek')) return 'deepseek';
  if (blob.includes('gemma')) return 'gemma';
  if (blob.includes('gigachat')) return 'gigachat';
  if (blob.includes('qwen')) return 'qwen';
  if (blob.includes('glm')) return 'glm';
  if (blob.includes('kimi')) return 'kimi';
  return null;
}

export function meterMatchesAiFamilyFacet(
  meter: CatalogMeter,
  facet: AiFamilyFacet,
): boolean {
  if (facet === 'all') return true;
  if (!isAiTokenMeter(meter)) return false;
  return extractAiFamilyFacet(meter) === facet;
}

/** Stable filter key for AI model selector (lowercase modelId / modelFamily). */
export function extractAiModelKey(meter: CatalogMeter): string | null {
  const dims = meter.dimensions;
  const raw =
    (typeof dims.modelId === 'string' && dims.modelId.trim()) ||
    (typeof dims.modelFamily === 'string' && dims.modelFamily.trim()) ||
    null;
  return raw ? raw.toLowerCase() : null;
}

export function meterMatchesAiModel(meter: CatalogMeter, modelKey: string | null): boolean {
  if (!modelKey) return true;
  if (!isAiTokenMeter(meter)) return false;
  return extractAiModelKey(meter) === modelKey.toLowerCase();
}

export function listAiModelOptions(
  meters: CatalogMeter[],
): {value: string; content: string; count: number}[] {
  const byKey = new Map<string, {label: string; count: number}>();
  for (const m of meters) {
    if (!isAiTokenMeter(m)) continue;
    const key = extractAiModelKey(m);
    if (!key) continue;
    const label = extractAiModelFamily(m) || key;
    const prev = byKey.get(key);
    if (prev) prev.count += 1;
    else byKey.set(key, {label, count: 1});
  }
  return [...byKey.entries()]
    .map(([value, {label, count}]) => ({value, content: label, count}))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.content.localeCompare(b.content, 'ru', {sensitivity: 'base'});
    });
}

export function meterMatchesNetworkFacet(meter: CatalogMeter, facet: NetworkFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'network') return false;
  return extractNetworkKind(meter) === facet;
}

export function extractCdnKind(
  meter: CatalogMeter,
): Exclude<CdnFacet, 'all'> | null {
  if (meter.categoryKey !== 'cdn') return null;
  if (meter.meter.startsWith('cdn.traffic.')) return 'traffic';
  if (meter.meter === 'cdn.resource') return 'resource';
  if (meter.meter === 'cdn.requests') return 'requests';
  if (
    meter.meter === 'cdn.origin.shielding' ||
    meter.meter === 'cdn.logs' ||
    meter.meter === 'cdn.dedicated-ip'
  ) {
    return 'options';
  }
  return null;
}

export function meterMatchesCdnFacet(meter: CatalogMeter, facet: CdnFacet): boolean {
  if (facet === 'all') return true;
  if (meter.categoryKey !== 'cdn') return false;
  return extractCdnKind(meter) === facet;
}

/** Pure ingress / egress; bidirectional stays under «Все». */
export function extractCdnTrafficDirection(
  meter: CatalogMeter,
): 'ingress' | 'egress' | 'bidirectional' | null {
  if (meter.categoryKey !== 'cdn') return null;
  if (meter.meter === 'cdn.traffic.ingress') return 'ingress';
  if (meter.meter === 'cdn.traffic.egress') return 'egress';
  if (meter.meter === 'cdn.traffic.bidirectional') return 'bidirectional';
  return null;
}

export function meterMatchesCdnTrafficFacet(
  meter: CatalogMeter,
  facet: CdnTrafficFacet,
): boolean {
  if (facet === 'all') return true;
  return extractCdnTrafficDirection(meter) === facet;
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

/** Display-name topology: базовый (1 zone) vs HA (fault-tolerant / multi-master). */
export function kubernetesTopologyDisplayLabel(
  availability: 'zonal' | 'regional' | null,
): 'базовый' | 'HA' | null {
  if (availability === 'zonal') return 'базовый';
  if (availability === 'regional') return 'HA';
  return null;
}

export function kubernetesFaultToleranceHint(availability: 'zonal' | 'regional'): string {
  return availability === 'zonal' ? 'Не отказоустойчивый' : 'Отказоустойчивый';
}

export type KubernetesPresetFamily = 'standard' | 'cpu-optimized' | 'memory-optimized';

/** Yandex preset family from dimensions or hostType (s-* / c-* / m-*). */
export function extractKubernetesPresetFamily(
  meter: CatalogMeter,
): KubernetesPresetFamily | null {
  if (meter.categoryKey !== 'kubernetes') return null;
  const explicit = String(meter.dimensions.presetFamily ?? '').toLowerCase();
  if (explicit === 'standard' || explicit === 'cpu-optimized' || explicit === 'memory-optimized') {
    return explicit;
  }
  const host = String(meter.dimensions.hostType ?? '');
  // Yandex resource presets: s-cN-mM Standard, c-cN-mM CPU-optimized, m-cN-mM Memory-optimized.
  if (/^m-c\d/i.test(host)) return 'memory-optimized';
  if (/^c-c\d/i.test(host)) return 'cpu-optimized';
  if (/^s-c\d/i.test(host)) return 'standard';
  return null;
}

function kubernetesPresetFamilyTitle(family: KubernetesPresetFamily): string {
  if (family === 'cpu-optimized') return 'CPU-optimized';
  if (family === 'memory-optimized') return 'Memory-optimized';
  return 'Standard';
}

/** Provider-original SKU title from price book (`dimensions.nativeName`), if stored. */
export function meterNativeName(meter: CatalogMeter): string | null {
  const native = meter.dimensions.nativeName;
  return typeof native === 'string' && native.trim() ? native.trim() : null;
}

function isKubernetesUnitComponent(meter: CatalogMeter): boolean {
  if (meter.categoryKey !== 'kubernetes') return false;
  if (/\.(vcpu|ram)$/i.test(meter.meter)) return true;
  const q = (meter.unitQuantity ?? '').toLowerCase();
  return q === 'vcpu' || q === 'gib-ram' || q === 'gib';
}

function kubernetesMasterCount(meter: CatalogMeter): number | null {
  const n = Number(meter.dimensions.masterCount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMasterCountRu(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} мастер`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} мастера`;
  return `${count} мастеров`;
}

function kubernetesShapeLabel(meter: CatalogMeter): string | null {
  const vcpu = Number(meter.dimensions.vcpu);
  const ram = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
  if (!(Number.isFinite(vcpu) && vcpu > 0 && Number.isFinite(ram) && ram > 0)) return null;
  const masters = kubernetesMasterCount(meter) ?? 1;
  return masters > 1 ? `${masters} × ${vcpu} vCPU / ${ram} ГиБ` : `${vcpu} vCPU / ${ram} ГиБ`;
}

/**
 * Unified K8s title:
 * - whole control plane: `Мастер Kubernetes · <базовый|HA> · …`
 * - unit meters: `Ресурсы мастера · vCPU|RAM`
 */
export function formatKubernetesDisplayName(meter: CatalogMeter): string {
  if (meter.categoryKey !== 'kubernetes') return meter.name;

  // Unit meters are billed per vCPU/GiB — not a whole control-plane SKU.
  if (isKubernetesUnitComponent(meter)) {
    if (isVcpuMeter(meter) || /\.vcpu$/i.test(meter.meter) || /vcpu/i.test(meter.sku)) {
      return 'Ресурсы мастера · vCPU';
    }
    if (isRamMeter(meter) || /\.ram$/i.test(meter.meter) || /ram/i.test(meter.sku)) {
      return 'Ресурсы мастера · RAM';
    }
    return meter.name.replace(/\s*\*$/, '').replace(/\s·\sоценка\s*\*?$/i, '');
  }

  const topo =
    kubernetesTopologyDisplayLabel(extractKubernetesAvailability(meter)) ?? 'базовый';
  const parts: string[] = ['Мастер Kubernetes', topo];
  const shape = kubernetesShapeLabel(meter);
  const family = extractKubernetesPresetFamily(meter);
  const shareRaw = meter.dimensions.guaranteedVcpuShare;
  const share =
    typeof shareRaw === 'string' && shareRaw.trim()
      ? shareRaw.trim().endsWith('%')
        ? `${shareRaw.trim()} vCPU`
        : shareRaw.trim()
      : null;
  const sizeRaw = meter.dimensions.masterSize;
  const sizeTier =
    typeof sizeRaw === 'string' && sizeRaw.trim()
      ? sizeRaw.trim().charAt(0).toUpperCase() + sizeRaw.trim().slice(1).toLowerCase()
      : null;
  const sizingModel = String(meter.dimensions.sizingModel ?? '');
  const isClusterFee =
    sizingModel === 'cluster-fee' ||
    meter.comparableTier === 'fixed-component' ||
    (!shape &&
      !sizeTier &&
      (meter.dimensions.comparabilityClass === 'native-fixed' ||
        meter.dimensions.comparabilityClass === 'fixed-component'));

  if (shape) {
    if (family) parts.push(kubernetesPresetFamilyTitle(family));
    parts.push(shape);
    if (share) parts.push(share);
  } else if (sizeTier && (sizingModel === 'marketing-tier' || !isClusterFee)) {
    // T1 KaaS: public price publishes Small/Medium/Large without vCPU/RAM.
    parts.push(sizeTier);
  } else if (isClusterFee || !sizeTier) {
    parts.push('плата за кластер');
  } else {
    parts.push(sizeTier);
  }

  if (meter.synthetic || meter.sku.includes('.synthetic')) {
    parts.push('оценка');
  }

  return parts.join(' · ');
}

/**
 * Specs column for Kubernetes — countable attrs (master count, synthetic), not title.
 * Canonical titles come from formatKubernetesDisplayName / price-book `name`.
 */
export function formatKubernetesParamsLabel(meter: CatalogMeter): string {
  if (meter.categoryKey !== 'kubernetes') return '—';
  if (isKubernetesUnitComponent(meter)) {
    const unit = billingUnitLabel(meter);
    return unit && unit !== '—' ? unit : '—';
  }

  const parts: string[] = [];
  const masters = kubernetesMasterCount(meter);
  if (masters != null) parts.push(formatMasterCountRu(masters));
  if (meter.dimensions.legacy === true) parts.push('legacy');
  if (meter.synthetic || meter.sku.includes('.synthetic')) parts.push('оценка');

  return parts.length ? parts.join(' · ') : '—';
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
    (meterNativeName(meter) || '').toLowerCase().includes(s) ||
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

/** Format AI model size from dimensions, e.g. `35B`, `35B · 3B active`, `1T`. */
export function formatParameterCount(meter: CatalogMeter): string | null {
  const dims = meter.dimensions;
  const total = Number(dims.parameterCountB);
  if (!Number.isFinite(total) || total <= 0) return null;

  const totalLabel =
    total >= 1000 && total % 1000 === 0
      ? `${total / 1000}T`
      : total >= 1000
        ? `${parseFloat((total / 1000).toFixed(2))}T`
        : `${total}B`;

  const active = Number(dims.activeParameterCountB);
  if (Number.isFinite(active) && active > 0 && active !== total) {
    const activeLabel = active >= 1000 ? `${parseFloat((active / 1000).toFixed(2))}T` : `${active}B`;
    return `${totalLabel} · ${activeLabel} active`;
  }
  return totalLabel;
}

export function paramsLabel(meter: CatalogMeter): string {
  if (meter.categoryKey === 'kubernetes') {
    return formatKubernetesParamsLabel(meter);
  }

  const dims = meter.dimensions;
  const parts: string[] = [];

  if (isAiTokenMeter(meter)) {
    const paramCount = formatParameterCount(meter);
    if (paramCount) parts.push(paramCount);
    const unit = billingUnitLabel(meter);
    if (unit && unit !== '—') parts.push(unit);
  } else if (
    meter.categoryKey === 'network' ||
    meter.categoryKey === 'cdn' ||
    isAddressMeter(meter) ||
    isGatewayMeter(meter) ||
    isUsageMeter(meter)
  ) {
    const unit = billingUnitLabel(meter);
    if (unit && unit !== '—') parts.push(unit);
    if (meter.categoryKey === 'cdn') {
      const cls = meter.dimensions.comparabilityClass;
      if (cls === 'bidirectional') parts.push('вход+выход');
      if (cls === 'egress-overage') parts.push('сверх пакета');
      if (cls === 'egress-regional' || cls === 'egress-coverage-addon') {
        if (meter.region && meter.region !== '—') parts.push(meter.region);
      }
      if (cls === 'egress-network-alt' && typeof meter.dimensions.networkProvider === 'string') {
        const net = String(meter.dimensions.networkProvider);
        parts.push(net === 'akamai' ? 'Akamai' : net);
      }
    }
  } else if (meter.pricingMode === 'bundle' || meter.unitQuantity === 'flavor') {
    if (typeof dims.vcpu === 'number') parts.push(`${dims.vcpu} vCPU`);
    const ram = typeof dims.ramGiB === 'number' ? dims.ramGiB : dims.ramGb;
    if (typeof ram === 'number') parts.push(`${ram} GiB RAM`);
    if (typeof dims.gpuCount === 'number') parts.push(`${dims.gpuCount} GPU`);
    if (typeof dims.gpuModel === 'string') parts.push(dims.gpuModel);
  } else {
    if (
      meter.unitQuantity &&
      !['flavor', 'master', 'address', 'gateway'].includes(meter.unitQuantity)
    ) {
      parts.push(meter.unitQuantity);
    }
    if (typeof dims.guaranteedVcpuShare === 'string') parts.push(dims.guaranteedVcpuShare);
    if (typeof dims.gpuCount === 'number') parts.push(`${dims.gpuCount} GPU`);
  }

  const iopsLimits = extractDiskIopsLimits(meter);
  if (iopsLimits.chargedSeparately === false && iopsLimits.maximum != null) {
    parts.push(`до ${formatIopsCount(iopsLimits.maximum)} IOPS`);
  } else {
    if (iopsLimits.included != null) {
      parts.push(`база ${formatIopsCount(iopsLimits.included)} IOPS`);
    }
    if (
      iopsLimits.maximum != null &&
      iopsLimits.maximum !== iopsLimits.included
    ) {
      parts.push(`до ${formatIopsCount(iopsLimits.maximum)}`);
    }
  }

  const platform = formatPlatform(meter.cpuPlatformFamily);
  if (platform && platform !== 'Платформа не указана') parts.push(platform);

  if (meter.purchaseModel === 'preemptible') parts.push('preemptible');
  if (meter.synthetic) parts.push('оценка *');

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
