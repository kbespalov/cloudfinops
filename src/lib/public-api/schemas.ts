import {z} from 'zod';
import {CATEGORY_IDS, MAX_PAGE_LIMIT} from './constants';
const size = z.number().finite().min(0.001).max(1_000_000);
const count = z.number().int().min(1).max(4096);
const label = z.string().trim().min(1).max(200);
const disk = z.strictObject({sizeGiB: size.describe('Minimum disk capacity in GiB.'), media: z.enum(['ssd', 'hdd']).describe('Required disk media; never silently substituted.')});
const common = {
  disk: disk.default({sizeGiB: 100, media: 'ssd'}).describe('Instance disk. Defaults to 100 GiB SSD.'),
  purchaseModel: z.enum(['on-demand', 'preemptible']).default('on-demand').describe('Exact purchase model; preemptible is never silently substituted for on-demand.'),
  region: label.optional().describe('Exact region label or code from GET /regions or a discovered product; omit to search all catalog regions.'),
};
export const computeResourceSchema = z.strictObject({
  type: z.literal('compute'), vcpu: count.describe('Minimum virtual CPU count.'), memoryGiB: size.describe('Minimum host RAM in GiB.'), ...common,
});
export const gpuResourceSchema = z.strictObject({
  type: z.literal('gpu'), gpuModel: label.describe('GPU model found in the catalog, for example L4 or H100. Physical GPUs are not substituted with vGPU.'), gpuCount: count.describe('Minimum GPU count; the selected configuration may contain more.'),
  vcpu: count.optional().describe('Minimum host vCPU for instance scope. Omit for gpu_only.'), memoryGiB: size.optional().describe('Minimum host RAM in GiB, not GPU VRAM. Omit for gpu_only.'), ...common, disk: disk.optional(),
  scope: z.enum(['instance', 'gpu_only']).default('instance').describe('instance includes the host and disk; gpu_only prices the accelerator only and forbids host resources.'),
  interconnect: label.nullable().default(null).describe('Exact catalog interconnect such as PCIe or NVLink. Null means unconstrained.'),
  form: label.optional().describe('Match only an explicitly populated gpuForm/formFactor attribute. No current catalog SKU populates these fields; omit this filter until such metadata is available.'),
});
export const estimateRequestSchema = z.strictObject({
  resource: z.discriminatedUnion('type', [computeResourceSchema, gpuResourceSchema]),
  providers: z.array(label).min(1).max(100).refine(v => new Set(v).size === v.length, 'duplicate providers').optional().describe('Unique provider IDs from list_providers. Omit for all catalog providers.'),
  period: z.literal('month').default('month').describe('Only month is supported, calculated as 720 hours.'),
  addons: z.strictObject({
    publicIpCount: z.number().int().min(0).max(10000).default(0),
    objectStorageGiB: z.number().finite().min(0).max(1e9).default(0),
    internetEgressGiB: z.number().finite().min(0).max(1e9).default(0),
    cdnEgressGiB: z.number().finite().min(0).max(1e9).default(0),
  }).default({publicIpCount: 0, objectStorageGiB: 0, internetEgressGiB: 0, cdnEgressGiB: 0}),
});
export const productQuerySchema = z.strictObject({
  q: z.string().trim().max(500).optional().describe('Short lexical query, e.g. L4, H100 or SSD. Searches names, SKUs, GPU model and category, not arbitrary attributes. Omit to enumerate products.'),
  providers: z.array(label).max(100).optional().describe('Provider IDs from list_providers. REST: comma-separated; MCP: JSON array.'),
  categories: z.array(z.enum(CATEGORY_IDS)).max(7).optional().describe('Filter catalog categories. Block disks belong to compute; object storage belongs to storage.'),
  regions: z.array(label).max(100).optional().describe('Exact labels or codes returned by GET /regions or product region fields.'),
  status: label.optional().describe('Catalog status, for example available. This does not verify current provider capacity.'),
  limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional().describe('Products per page, 1–100; default 50.'),
  cursor: z.string().min(1).max(16000).optional().describe('Opaque pagination.nextCursor from the previous response. Do not construct it. Filters are retained; on 409 restart from page one.'),
});
export const productIdSchema = z.strictObject({id: z.string().regex(/^prod_[a-f0-9]{20}$/).describe('Exact product.id returned by search_products, not providerSku.')});
export const emptySchema = z.strictObject({});
export function validationDetails(error: z.ZodError) {
  return error.issues.map(issue => ({path: '/' + issue.path.join('/'), code: issue.code, message: issue.message}));
}
