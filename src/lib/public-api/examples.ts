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
    list_attributes: [{name: 'gpu', summary: 'GPU attribute types, operators and observed values', value: {categories: ['gpu']}}],
    list_services: [{name: 'all', summary: 'Discover service IDs and billing meters', value: {}}],
    list_regions: [{name: 'all', summary: 'Observed region labels and codes', value: {}}],
    search_products: [
      {name: 'gpu', summary: 'Find L4 GPU billing SKUs', value: {categories: ['gpu'], attributes: {gpuModel: {eq: 'NVIDIA L4'}}, limit: 3}},
      {name: 'compute_range', summary: 'Existing compute SKUs with 4–16 vCPU and at least 8 GiB RAM', value: {categories: ['compute'], attributes: {vcpu: {range: {min: 4, max: 16}}, memoryGiB: {range: {min: 8}}}}},
      {name: 'ai_tokens', summary: 'All AI token tariffs without text search', value: {services: ['ai'], units: ['token'], limit: 100}},
      {name: 'ai_model_input', summary: 'Input token rates for one explicit model ID', value: {services: ['ai'], units: ['token'], attributes: {modelId: {eq: 'gpt-oss-120b'}, tokenDirection: {eq: 'input'}}}},
      {name: 'embeddings', summary: 'Embedding token tariffs only', value: {services: ['ai'], meters: ['ai.embeddings.tokens'], units: ['token']}},
    ],
    get_product: [{name: 'gpu', summary: 'Read a GPU SKU from this catalog snapshot', value: {id}}],
    list_product_alternatives: [{name: 'gpu', summary: 'Find alternatives for a discovered GPU SKU', value: {id}}],
    create_estimate: [
      {name: 'compute', summary: '4 vCPU, 8 GiB RAM and 100 GiB SSD across providers', value: {resource: {type: 'compute', vcpu: 4, memoryGiB: 8, disk: {sizeGiB: 100, media: 'ssd'}}}},
      {name: 'gpu_only', summary: 'One L4 accelerator without host costs', value: {resource: {type: 'gpu', gpuModel: 'L4', gpuCount: 1, scope: 'gpu_only'}}},
    ],
  };
}
