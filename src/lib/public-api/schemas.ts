import {z} from 'zod';
import {CATEGORY_IDS, MAX_PAGE_LIMIT} from './constants';
const size = z.number().finite().min(0.001).max(1_000_000);
const count = z.number().int().min(1).max(4096);
const label = z.string().trim().min(1).max(200);
const disk = z.strictObject({sizeGiB: size, media: z.enum(['ssd', 'hdd'])});
const common = {
  disk: disk.default({sizeGiB: 100, media: 'ssd'}),
  purchaseModel: z.enum(['on-demand', 'preemptible']).default('on-demand'),
  region: label.optional(),
};
export const computeResourceSchema = z.strictObject({
  type: z.literal('compute'), vcpu: count, memoryGiB: size, ...common,
});
export const gpuResourceSchema = z.strictObject({
  type: z.literal('gpu'), gpuModel: label, gpuCount: count,
  vcpu: count.optional(), memoryGiB: size.optional(), ...common, disk: disk.optional(),
  scope: z.enum(['instance', 'gpu_only']).default('instance'),
  interconnect: label.nullable().default(null), form: label.optional(),
});
export const estimateRequestSchema = z.strictObject({
  resource: z.discriminatedUnion('type', [computeResourceSchema, gpuResourceSchema]),
  providers: z.array(label).min(1).max(100).refine(v => new Set(v).size === v.length, 'duplicate providers').optional(),
  period: z.literal('month').default('month'),
  addons: z.strictObject({
    publicIpCount: z.number().int().min(0).max(10000).default(0),
    objectStorageGiB: z.number().finite().min(0).max(1e9).default(0),
    internetEgressGiB: z.number().finite().min(0).max(1e9).default(0),
    cdnEgressGiB: z.number().finite().min(0).max(1e9).default(0),
  }).default({publicIpCount: 0, objectStorageGiB: 0, internetEgressGiB: 0, cdnEgressGiB: 0}),
});
export const productQuerySchema = z.strictObject({
  q: z.string().trim().max(500).optional(),
  providers: z.array(label).max(100).optional(),
  categories: z.array(z.enum(CATEGORY_IDS)).max(7).optional(),
  regions: z.array(label).max(100).optional(),
  status: label.optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
  cursor: z.string().min(1).max(16000).optional(),
});
export const productIdSchema = z.strictObject({id: z.string().regex(/^prod_[a-f0-9]{20}$/)});
export const emptySchema = z.strictObject({});
export function validationDetails(error: z.ZodError) {
  return error.issues.map(issue => ({path: '/' + issue.path.join('/'), code: issue.code, message: issue.message}));
}
