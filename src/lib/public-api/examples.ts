import {catalog} from '@/lib/catalog';
import {productId} from './ids';
import type {RestOperationId} from './operations';

export function operationExamples(): Record<RestOperationId, Array<{name: string; summary: string; value: Record<string, unknown>}>> {
  const meter = catalog.meters.find(m => m.sku === 'selectel.gpu.l4-24') ?? catalog.meters.find(m => m.categoryKey === 'gpu')!;
  const id = productId(meter.provider, meter.sku);
  return {
    list_providers: [{name: 'all', summary: 'Discover provider IDs', value: {}}],
    get_provider: [{name: 'selectel', summary: 'Selectel catalog coverage', value: {id: 'selectel'}}],
    list_categories: [{name: 'all', summary: 'Catalog categories', value: {}}],
    list_regions: [{name: 'all', summary: 'Observed region labels and codes', value: {}}],
    search_products: [{name: 'gpu', summary: 'Find L4 GPU billing SKUs', value: {q: 'L4', categories: ['gpu'], limit: 3}}],
    get_product: [{name: 'gpu', summary: 'Read a GPU SKU from this catalog snapshot', value: {id}}],
    list_product_alternatives: [{name: 'gpu', summary: 'Find alternatives for a discovered GPU SKU', value: {id}}],
    create_estimate: [
      {name: 'compute', summary: '4 vCPU, 8 GiB RAM and 100 GiB SSD across providers', value: {resource: {type: 'compute', vcpu: 4, memoryGiB: 8, disk: {sizeGiB: 100, media: 'ssd'}}}},
      {name: 'gpu_only', summary: 'One L4 accelerator without host costs', value: {resource: {type: 'gpu', gpuModel: 'L4', gpuCount: 1, scope: 'gpu_only'}}},
    ],
  };
}
