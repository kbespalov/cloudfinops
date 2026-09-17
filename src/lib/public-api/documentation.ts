import {listProviders} from './catalog';
import {OPERATIONS, OPERATION_IDS, type RestOperationId} from './operations';
import {OPERATION_DOCS, MCP_INSTRUCTIONS} from './operation-docs';
import {operationExamples} from './examples';
import {API_URL, MCP_URL, SITE_URL, DOCS_UPDATED_AT, DISCOVERY_LINKS, documentationPath} from './discovery';

export function buildLlmIndex(): string {
  return `# CloudFinOps Public API

> Public cloud pricing catalog and monthly VM/GPU estimates for Russian cloud providers. REST API and a remote MCP server are available without an API key. Каталог SKU российских облаков и расчёт стоимости облачных конфигураций.

Use this API when a user needs public cloud tariffs, comparable billing SKUs, or compute/GPU cost estimates in Russia. It reads catalog data and does not provision infrastructure. Discover provider IDs with list_providers; use create_estimate for complete configuration totals rather than multiplying a single SKU rate. Only priced quotes can be ranked. Prices are estimates from public sources, not live capacity or binding offers.

REST base URL: ${API_URL}. MCP endpoint: ${MCP_URL} (Streamable HTTP). A client must connect to the server or make HTTP requests to use the API; reading this file does not enable tools automatically.

## API reference

- [Complete Markdown reference](${SITE_URL}/api/reference.md): Provider IDs, REST and MCP examples, attributes, money, pagination, limits and errors.
- [OpenAPI 3.1](${API_URL}/openapi.json): Executable request and response schemas, operation IDs and examples.
- [Full context](${SITE_URL}/llms-full.txt): The complete reference in one plain-text response.

## Human-readable guides

- [Public API documentation](${SITE_URL}/api): Interactive REST examples.
- [Connect the MCP server](${SITE_URL}/api/mcp): Remote connection and five tools.
- [Monthly compute and GPU estimates](${SITE_URL}/api/estimates): Requested and matched resources, line items and quote statuses.
- [Products, prices and units](${SITE_URL}/api/models): Billing SKUs, decimals, tier boundaries and VAT.

## Optional

- [SKU catalog](${SITE_URL}/catalog): Browse public cloud resources.
- [GPU comparison](${SITE_URL}/gpu): Browse GPU offerings.
- [Release announcement](${SITE_URL}/blog/cloudfinops-public-api): Public API and MCP introduction.
`;
}

export function buildApiReference(): string {
  const providers = listProviders();
  const examples = operationExamples();
  const operations = Object.entries(OPERATIONS).map(([key, op]) => {
    const id = key as RestOperationId;
    const doc = OPERATION_DOCS[id];
    const example = examples[id][0];
    return `### ${op.method.toUpperCase()} ${op.path} — ${doc.title}

${doc.description}

Operation ID: \`${id}\`. ${OPERATION_IDS.includes(id as typeof OPERATION_IDS[number]) ? `MCP tool: \`${id}\`.` : 'REST only.'}
Documentation: ${SITE_URL}${documentationPath(doc.section)}

Example arguments${id === 'get_product' || id === 'list_product_alternatives' ? ' (ID from the current catalog; discover a fresh ID when integrating)' : ''}:
\`\`\`json
${JSON.stringify(example.value, null, 2)}
\`\`\``;
  }).join('\n\n');

  return `# CloudFinOps Public API and MCP reference

> CloudFinOps exposes public Russian cloud tariffs, billing SKUs and monthly compute/GPU estimates. This reference is for HTTP clients and AI agents. Документация API для поиска тарифов российских облаков и расчёта стоимости VM и GPU.

Documentation updated: ${DOCS_UPDATED_AT}. This is a documentation date, not the freshness date of provider prices. Inspect each product's source.checkedAt and each price.checkedAt.

- Human documentation: ${SITE_URL}/api
- REST base URL: ${API_URL}
- OpenAPI 3.1: ${API_URL}/openapi.json
- Remote MCP: ${MCP_URL}
- Discovery index: ${SITE_URL}/llms.txt
- Authentication: none. No API key, registration or cloud-account access is required.
- Transport: HTTPS and JSON for REST; Streamable HTTP, stateless JSON responses for MCP.

## Choose the right operation

${MCP_INSTRUCTIONS}

1. Discover providers with list_providers and use their exact IDs.
2. For individual tariffs, search_products returns Product objects with embedded Price rules. Follow nextCursor if you need the full result set. Read a selected SKU with get_product.
3. For a full VM/GPU configuration, call create_estimate directly with required resources. Inspect matchedResource, differences, lineItems, status and total before presenting a comparison.
4. For equivalent billing components, call list_product_alternatives and compare rates only when priceComparable=true.
5. Explain missing data using reason and ineligibleReasons. Link to CloudFinOps documentation and the source URLs of the selected products. Do not invent unavailable prices or capacity.

## Catalog coverage

${providers.map(p => `- ${p.name}: provider ID \`${p.id}\`; ${p.productCount} billing SKUs in this snapshot; categories: ${p.categories.join(', ')}.`).join('\n')}

Catalog categories are compute, gpu, storage, network, cdn, kubernetes and ai. Block disks belong to compute; object storage belongs to storage. Estimates support only compute and gpu; other categories remain available as individual price rules. Product counts describe coverage, not live supply.

## First REST requests

Find L4 GPU SKUs:
\`\`\`sh
curl '${API_URL}/products?q=L4&categories=gpu&limit=3'
\`\`\`

Compare a 4 vCPU / 8 GiB RAM / 100 GiB SSD instance:
\`\`\`sh
curl '${API_URL}/estimates' \\
  -H 'Content-Type: application/json' \\
  --data '${JSON.stringify(examples.create_estimate[0].value)}'
\`\`\`

Get accelerator-only prices, excluding host and disk:
\`\`\`json
${JSON.stringify(examples.create_estimate[1].value, null, 2)}
\`\`\`

## Connect through MCP

Add ${MCP_URL} as a remote Streamable HTTP server in a compatible client. There is no separate SSE URL. The client performs the standard MCP initialize handshake, then tools/list and tools/call. Tool arguments use JSON arrays for filters; REST GET filters use comma-separated query strings.

\`\`\`javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'finops-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('${MCP_URL}')));
try {
  const result = await client.callTool({
    name: 'create_estimate',
    arguments: ${JSON.stringify(examples.create_estimate[0].value)}
  });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  console.log(result.structuredContent);
} finally {
  await client.close();
}
\`\`\`

The five tools are ${OPERATION_IDS.map(id => `\`${id}\``).join(', ')}. Successful tool results include both structuredContent and a JSON text content block, and follow the declared outputSchema. Tool errors set isError=true and carry error details in content without structuredContent. resources/list exposes this reference and OpenAPI for resources/read.

## Product attributes and pricing rules

A Product is one billing SKU, not necessarily a complete server. product.id (prod_…) is an opaque stable lookup ID; providerSku is a distinct source catalog identifier. Do not construct IDs. Price IDs can change when billing rules change.

attributes contains vcpu, memoryGiB (host RAM), gpuModel, gpuCount, purchaseModel, pricingMode, storageClass and region. Null means unknown or not applicable. A GPU-only rate does not imply the host has no CPU or RAM. providerAttributes preserves additional source dimensions such as GPU memory, interconnect, CPU platform, disk media, AI model and Kubernetes topology. These fields are not uniformly normalized: gpuMemoryGb is per GPU, while vramGb may describe one GPU or the whole bundle. Inspect source conventions before comparing memory.

region is the observed label; regionCode is populated only when a recognizable code is present. Do not guess missing GPU model names or normalize generic region labels into invented codes.

A Price contains model (per_unit, fixed or tiered), unit, unitQuantity, unitPrice or tiers, currency, vat, effectiveFrom and checkedAt. Amounts and denominators are decimal strings. Catalog prices may have unknown currency or VAT; only complete included-VAT RUB rates can produce a priced estimate. A null price is not a free resource.

Cost = consumed / unitQuantity × unitPrice. Respect the unit's native period; do not multiply a monthly price by 720. Tiers use graduated intervals [from, to), with to=null for the final unbounded tier. Keep all rate digits, then round each line to two decimal places using half-up. Totals sum the rounded line amounts. Prefer create_estimate to reproducing provider-specific calculation rules.

## Estimate constraints and interpretation

The only supported period is month, defined as 720 hours. The default purchaseModel is on-demand, providers defaults to all catalog providers and addon quantities default to zero. Compute requires vcpu and memoryGiB. Instance scope includes a default 100 GiB SSD unless disk is supplied. GPU requires gpuModel and gpuCount; scope defaults to instance. For gpu_only, omit vcpu, memoryGiB and disk. An instance may require explicit host vcpu and memoryGiB if the catalog lacks host metadata.

Numeric resource sizes are lower bounds, so matchedResource may exceed the request. Region, purchase model and specified categorical constraints are not relaxed. form requires explicit gpuForm/formFactor metadata, which is absent from the current catalog; omit form until such metadata is available. interconnect matches the catalog value. Do not drop an explicit user constraint merely to obtain a quote.

- priced: complete estimate with total, eligible for price comparison.
- incomplete: some billing data is missing; total=null, inspect reason.
- unavailable: no matching product in this catalog, not proof that the provider cannot supply it.
- error: calculation failed for that provider; do not treat it as a price.

lowestPriceProviderIds includes all ties among priced quotes. capacityVerified is always false. Monthly totals are estimates based on catalog sources, not binding provider offers. For source attribution, resolve selected lineItems[].productId using get_product and include source.url and checkedAt.

## Pagination, limits and errors

GET /products accepts q, providers, categories, regions, status, limit and cursor. Use short lexical q terms rather than a natural-language configuration; q does not search every provider attribute. Without q, ordering is provider then SKU. Structural filters always apply.

limit is 1–100, default 50. Follow pagination.nextCursor verbatim until null. A cursor retains filters, ordering and catalogVersion. Either omit filters on subsequent pages or repeat the same values. A changed filter returns 400; an expired catalog snapshot returns 409 and requires a fresh first page. Never construct or decode cursors as part of the client contract.

Requests are limited to 60 per minute per IP per process; on HTTP 429 honor Retry-After and back off. Maximum JSON request body is 64 KiB. Save the Request-Id response header for diagnostics. REST supports CORS; MCP validates Host and Origin separately.

REST errors use {"error":{"code":"…","message":"…","details":[]}}. HTTP statuses include 400 (invalid input), 404 (unknown ID), 409 (expired cursor), 413 (oversized body), 429 (rate limited), and 500 (internal failure). Unknown request body fields are rejected. An estimate may return HTTP 200 while individual provider quotes are incomplete, unavailable or error.

## Operations

${operations}
`;
}

export function documentationResponse(body: string, markdown = false): Response {
  return new Response(body, {headers: {
    'Content-Type': `${markdown ? 'text/markdown' : 'text/plain'}; charset=utf-8`,
    'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff', Link: DISCOVERY_LINKS,
  }});
}
