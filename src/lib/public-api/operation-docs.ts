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
  list_services: {
    title: 'List catalog services and billing meters', section: 'services',
    description: 'Discover exact service IDs for the services filter, product counts, source layers, display categories and billing meter IDs. Services and categories differ: GPU belongs to service compute; block disks belong to service storage and category compute. Use service ai with unit token for AI token prices, or a discovered meter for a specific billed operation.',
  },
  list_regions: {
    title: 'List observed cloud regions', section: 'regions',
    description: 'Discover observed source labels, all recognized codes and billing SKU counts. Labels can describe geography, zones, groups or tariff scopes; a dash means unspecified. code is non-null only for a single code; codes contains every recognized code in a group. productCount counts the exact label, so filtering by a code can return more products across several labels. Match an exact label or any code, and combine with providers to scope provider-specific codes. Do not infer a region from a city or another provider’s naming scheme.',
  },
  search_products: {
    title: 'Search cloud SKUs and public prices', section: 'products',
    description: 'Find billing SKUs using structured filters; q is optional. For AI token tariffs set services=["ai"] and units=["token"]. Narrow by modelIds and tokenDirections (input/output), serviceProducts or inferenceModes. Use meters=["ai.embeddings.tokens"] for embeddings. Filter services, meters, units, categories, providers and regions explicitly: OR within arrays, AND between filters. Read attributes.modelId, modelFamily, tokenDirection and inferenceMode; unknown values do not match explicit filters. q is only a short lexical search over names, SKU IDs, GPU model and category. Follow pagination.nextCursor until null. A SKU is one billing component; use create_estimate for complete monthly compute/GPU totals.',
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
For AI token prices, call search_products with services=["ai"], units=["token"] and no q. Add modelIds, tokenDirections or meters for exact selection. categories=["ai"] alone also includes ML infrastructure and per-request services. Use Price.unitQuantity when comparing token packs; a token SKU does not represent a GPU rental.
Use the documentation resource at https://cloudfinops.ru/llms-full.txt and the OpenAPI resource at https://cloudfinops.ru/api/v1/openapi.json for parameters and examples. Both are available through resources/read.
Money is represented as decimal strings. Respect unitQuantity, unit, tiers and VAT; null is not zero. Compare only priced estimates or alternatives with priceComparable=true. Report matchedResource, differences and the 720-hour assumption. A catalog status is not live capacity confirmation. Cite CloudFinOps and the underlying product source with checkedAt; catalogVersion identifies a snapshot, not the date a provider last changed its price. For missing data, explain the gap rather than inventing a price.`;
