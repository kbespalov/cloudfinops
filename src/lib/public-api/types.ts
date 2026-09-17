import type {CategoryKey} from '@/lib/catalog';
import type {Money} from './money';
import type {PublicUnit} from './constants';

export type VatMode = 'included' | 'excluded' | 'unknown';

export type ApiMeta = {
  apiVersion: 'v1';
  catalogVersion: string;
  taxonomyVersion: string;
  generatedAt: string;
  calculationVersion?: string;
};

export type ApiErrorDetail = {
  path: string;
  code: string;
  value?: unknown;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
  };
};

export type Pagination = {
  nextCursor: string | null;
  limit: number;
};

export type PriceTier = {
  from: string;
  to: string | null;
  unitPrice: Money;
};

export type PublicPrice = {
  id: string;
  model: 'per_unit' | 'tiered' | 'fixed';
  unit: PublicUnit;
  unitQuantity: string;
  unitLabel: string;
  unitPrice: Money | null;
  tiers: PriceTier[] | null;
  vat: VatMode;
  currency: string | null;
  effectiveFrom: string | null;
  checkedAt: string | null;
};

export type ProductSource = {
  id: string | null;
  title: string | null;
  url: string | null;
  checkedAt: string | null;
};

export type ProductAttributes = {
  vcpu: number | null;
  memoryGiB: number | null;
  gpuModel: string | null;
  gpuCount: number | null;
  purchaseModel: string | null;
  pricingMode: string | null;
  storageClass: string | null;
  region: string | null;
};

export type PublicProduct = {
  id: string;
  providerSku: string;
  name: string;
  status: string;
  provider: {id: string; name: string};
  category: Exclude<CategoryKey, 'other'> | 'other';
  meter: string;
  region: string | null;
  regionCode: string | null;
  derived: boolean;
  attributes: ProductAttributes;
  providerAttributes: Record<string, unknown>;
  prices: PublicPrice[];
  source: ProductSource;
};

export type PublicProvider = {
  id: string;
  name: string;
  productCount: number;
  categories: string[];
  estimateResourceTypes: Array<'compute' | 'gpu'>;
  sources: Array<{id: string; title: string; url: string}>;
};

export type PublicCategory = {
  id: string;
  title: string;
  productCount: number;
};

export type PublicRegion = {
  label: string;
  code: string | null;
  productCount: number;
};

export type AlternativeDifference = {
  dimension: string;
  seed: unknown;
  candidate: unknown;
};

export type ProductAlternative = {
  product: PublicProduct;
  mode: 'exact' | 'functional';
  priceComparable: boolean;
  differences: AlternativeDifference[];
  ineligibleReasons: string[];
};

export type DiskSpec = {
  sizeGiB: number;
  media: 'ssd' | 'hdd';
};

export type ComputeResource = {
  type: 'compute';
  vcpu: number;
  memoryGiB: number;
  disk?: DiskSpec;
  purchaseModel?: 'on-demand' | 'preemptible';
  region?: string;
};

export type GpuResource = {
  type: 'gpu';
  gpuModel: string;
  gpuCount: number;
  vcpu?: number;
  memoryGiB?: number;
  disk?: DiskSpec;
  scope?: 'instance' | 'gpu_only';
  interconnect?: string | null;
  form?: string;
  region?: string;
  purchaseModel?: 'on-demand' | 'preemptible';
};

export type EstimateResource = ComputeResource | GpuResource;

export type EstimateAddons = {
  publicIpCount?: number;
  objectStorageGiB?: number;
  internetEgressGiB?: number;
  cdnEgressGiB?: number;
};

export type EstimateRequest = {
  period?: 'month';
  resource: EstimateResource;
  providers?: string[];
  addons?: EstimateAddons;
};

export type QuoteStatus = 'priced' | 'unavailable' | 'incomplete' | 'error';

export type QuoteReason = {
  code: string;
  message: string;
  path: string;
};

export type EstimateLineItem = {
  vat: VatMode;
  unit: PublicUnit;
  role: string;
  productId: string | null;
  priceId: string | null;
  quantity: string;
  amount: Money | null;
  label: string;
};

export type MatchedResource = Record<string, unknown>;

export type ProviderQuote = {
  provider: {id: string; name: string};
  status: QuoteStatus;
  total: Money | null;
  scope: string | null;
  matchedResource: MatchedResource | null;
  differences: AlternativeDifference[];
  lineItems: EstimateLineItem[];
  reason: QuoteReason | null;
  note: string | null;
};

export type EstimateCoverage = {
  requested: number;
  priced: number;
  unavailable: number;
  incomplete: number;
  error: number;
};

export type EstimateResult = {
  input: {
    resource: EstimateResource;
    providers: string[];
    addons: EstimateAddons;
    period: 'month';
    monthHours: 720;
  };
  assumptions: {
    capacityVerified: false;
    vat: 'catalog_billable_included_rub';
    period: 'month';
  };
  quotes: ProviderQuote[];
  lowestPriceProviderIds: string[];
  coverage: EstimateCoverage;
};
