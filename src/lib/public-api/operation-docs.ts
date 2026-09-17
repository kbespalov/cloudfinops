import type {RestOperationId} from './operations';

/** Shared descriptions for OpenAPI, MCP discovery and the Markdown reference. */
export const OPERATION_DOCS: Record<RestOperationId, {title: string; description: string; section: string}> = {
  list_providers: {
    title: 'List Russian cloud providers', section: 'providers',
    description: 'Discover cloud providers, their IDs, catalog categories, product counts and public pricing sources. Use provider IDs returned here in search_products and create_estimate; do not invent provider slugs. Coverage describes the catalog, not live infrastructure capacity.',
  },
  get_provider: {
    title: 'Get a cloud provider', section: 'provider',
    description: 'Get one provider by the ID returned from GET /providers, including catalog coverage and pricing sources. Unknown IDs return 404.',
  },
  list_categories: {
    title: 'List catalog categories', section: 'categories',
    description: 'Discover category IDs and product counts for filtering products. The compute category includes block disks; storage covers object storage. Estimate calculation supports compute and GPU, not every catalog category.',
  },
  list_regions: {
    title: 'List observed cloud regions', section: 'regions',
    description: 'Discover region labels and codes present in the pricing catalog. Copy an exact label or non-null code into a region filter; do not infer a provider region from a city or another provider’s naming scheme.',
  },
  search_products: {
    title: 'Search cloud SKUs and public prices', section: 'products',
    description: 'Find billing SKUs and price rules for Russian cloud compute, GPU, storage, networking, CDN, Kubernetes and AI services. Use short queries such as L4, H100 or SSD; q searches names, SKU IDs, GPU model and category, not every provider attribute. Apply providers/categories/regions filters explicitly. Follow pagination.nextCursor until null when a complete comparison is needed. A SKU may be a single billed component, not a complete VM. Use create_estimate for a monthly compute/GPU configuration total.',
  },
  get_product: {
    title: 'Get SKU attributes and billing rules', section: 'product',
    description: 'Read one billing SKU using its exact prod_ ID from search_products. Returns attributes, providerAttributes, prices, VAT, units, tiers and the source URL with checkedAt. Product IDs and providerSku are different identifiers. Null means unknown or not applicable, never zero. Extra provider attributes retain source-specific conventions; do not assume vramGb is always per GPU.',
  },
  list_product_alternatives: {
    title: 'Find comparable cloud SKUs', section: 'alternatives',
    description: 'Find alternatives at other providers for a product ID returned by search_products. Inspect differences and ineligibleReasons. Rank two rates by price only when priceComparable=true; functional similarity alone does not imply equivalent billing or configuration. This compares SKUs, not full monthly deployments.',
  },
  create_estimate: {
    title: 'Compare monthly VM and GPU costs', section: 'estimates',
    description: 'Calculate a monthly cost estimate from public Russian cloud tariffs for compute (vcpu and memoryGiB) or GPU (gpuModel and gpuCount). The month is 720 hours and instance scope defaults to 100 GiB SSD. Numeric sizes are minimums: inspect matchedResource and differences. For GPU-only pricing set scope=gpu_only and omit vcpu, memoryGiB and disk. Compare only quotes with status=priced and use lowestPriceProviderIds, which retains ties. Incomplete, unavailable and error are not free offers. Amounts are decimal strings in RUB including VAT for priced quotes. This does not provision resources or verify capacity; cite the selected product sources and checkedAt when presenting estimates.',
  },
};

export const MCP_INSTRUCTIONS = `CloudFinOps provides read-only public cloud pricing and configuration estimates for Russia through REST and MCP. It does not access user cloud accounts or provision resources.
Use list_providers to discover supported provider IDs. Use search_products for SKU discovery, get_product for detailed price rules and sources, list_product_alternatives for comparable SKUs, and create_estimate for complete monthly VM/GPU costs. Do not replace a configuration estimate with the price of one CPU or GPU billing component.
Use the documentation resource at https://cloudfinops.ru/llms-full.txt and the OpenAPI resource at https://cloudfinops.ru/api/v1/openapi.json for parameters and examples. Both are available through resources/read.
Money is represented as decimal strings. Respect unitQuantity, unit, tiers and VAT; null is not zero. Compare only priced estimates or alternatives with priceComparable=true. Report matchedResource, differences and the 720-hour assumption. A catalog status is not live capacity confirmation. Cite CloudFinOps and the underlying product source with checkedAt; catalogVersion identifies a snapshot, not the date a provider last changed its price. For missing data, explain the gap rather than inventing a price.`;
