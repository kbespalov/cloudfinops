# CloudFinOps Public API v1

REST base: `https://cloudfinops.ru/api/v1`. Interactive documentation: `/api`.
Machine-readable contract: `/api/v1/openapi.json` (OpenAPI 3.1). MCP: `/mcp`
(Streamable HTTP, stateless JSON responses). Discovery: `/llms.txt`.
No authentication or persisted estimates in v1. All operations are read-only;
`POST /estimates` calculates a value and returns 200.

## Operations

| REST | MCP tool |
| --- | --- |
| GET /providers | list_providers |
| GET /providers/{id} | — |
| GET /categories | — |
| GET /regions | — |
| GET /products | search_products |
| GET /products/{id} | get_product |
| GET /products/{id}/alternatives | list_product_alternatives |
| POST /estimates | create_estimate |

The operation registry drives REST, MCP and OpenAPI. Responses share
`{data, meta: {apiVersion, catalogVersion, taxonomyVersion, generatedAt}}`;
estimates additionally have `calculationVersion`. Lists include `pagination`.
Successful MCP calls return that envelope as structuredContent and JSON text. Tool errors set isError=true and return details in text content without structuredContent, so SDK clients do not validate an error against the success outputSchema.

## Catalog

A Product is one billing SKU, not an entire VM offer. Prices are embedded rules;
there is no separate prices endpoint. IDs are opaque. Use `providerSku` for source
traceability. Product IDs survive rate changes. Price IDs include units, amounts,
tiers, VAT, currency and effective date, but not source recheck dates.

Product filters: `q`, `providers`, `categories`, `regions`, `status`, `limit`,
`cursor`. REST arrays are comma-separated; MCP arrays are JSON arrays. Without q,
order is provider then SKU. With q, lexical rank precedes SKU tie-breaking.
Structural filters always apply. Region matching uses exact observed labels or
codes from `/regions`; it does not assume an AWS-style region taxonomy.

`limit` is 1–100 (default 50). Use nextCursor with the same filters or omit the
filters; the cursor retains them. A conflicting filter is 400, an old snapshot is
409. Restart pagination after 409. Do not interpret or edit opaque cursors.

Money amounts and denominators are decimal strings. A Price contains its model,
unit, unitQuantity, unitPrice or tiers, currency, vat, effectiveFrom and checkedAt.
When a documented normalized rate exists, its unit/VAT/currency travel with it.
Otherwise the source rate and its native period are preserved. `other` indicates
an unsupported or unspecified billing unit and is never priced in an estimate.
Unknown currency stays null. No VAT or currency conversion is inferred.

Formula: `consumed / unitQuantity * unitPrice`. Tiers are graduated intervals
`[from,to)` in consumed base units; null to is unbounded. Tier rates are converted
to the Price denominator without losing precision. Rate digits are preserved;
only final line amounts round to two decimals, half-up. Totals sum displayed lines.

Alternatives reuse taxonomy/peer eligibility, differences and exclusion reasons.
`priceComparable=false` prohibits ranking the pair by price.

## Estimates

```json
{
  "resource": {
    "type": "compute",
    "vcpu": 4,
    "memoryGiB": 8,
    "disk": {"sizeGiB": 100, "media": "ssd"},
    "purchaseModel": "on-demand"
  },
  "period": "month",
  "providers": ["yandex-cloud", "cloud-ru"],
  "addons": {"publicIpCount": 1, "internetEgressGiB": 4096}
}
```

Defaults are echoed in input: all catalog providers, month=720 hours, on-demand,
100 GiB SSD for an instance, addons=0; GPU scope=instance. Unknown fields and
invalid categorical values are errors, not silently ignored defaults. vcpu and
gpuCount are positive integers. Memory/disk may be fractional, with limits in
OpenAPI. There is no hour/year period in v1.
Compute accepts vcpu, memoryGiB, disk, purchaseModel and region. The UI calculator's
family preset is not part of this API and is rejected instead of being ignored.

GPU requires `gpuModel` and `gpuCount`, with optional `vcpu`, `memoryGiB`, disk,
`region`, `interconnect`, `form`, `purchaseModel`, and `scope: instance|gpu_only`.
A physical GPU is not replaced by vGPU. gpu_only excludes host resources (omit
vcpu, memoryGiB, disk). Numeric sizes are lower bounds; actual selected quantities
are billed and exposed in matchedResource and differences. Categorical constraints
never relax. Bundles are one line; CPU/RAM/GPU are not billed twice. A requested
boot disk is included only if explicit bundle metadata confirms its size and
media; otherwise a compatible disk line is required.

Compute uses published flavors/vmTypes/envelopes and compatible CPU/RAM/region.
GPU uses published host configurations when present; if no host shape is known,
provide explicit vcpu and memoryGiB. If rates cannot be joined to that host, the
quote is incomplete. Synthetic catalog products never enter estimates.
For disks with separately billed IOPS, only the published included IOPS baseline
is used and shown in matchedResource.disk.includedIops; without that baseline the
quote is incomplete. Non-replicated capacity lacking size constraints is excluded. Missing components do
not become free.

Add-ons: publicIpCount, objectStorageGiB (standard class), internetEgressGiB,
cdnEgressGiB. Full included-RUB rates are required. Public IP must match the
instance region; other add-ons use the cheapest matching catalog rule, subject to
an explicit resource.region. These are volume estimates, not provider account
bills: free allowances are applied to the supplied volume, without knowledge of
other workloads' consumption.

| Status | Meaning | total |
| --- | --- | --- |
| priced | All requested parts have complete included-RUB pricing | sum of lines |
| unavailable | No admissible candidate in CloudFinOps catalog | null |
| incomplete | Candidate exists; a rate, VAT, host or disk condition is missing | null |
| error | Provider calculation failed | null |

Reasons contain code, message and path. Only priced quotes enter
lowestPriceProviderIds; ties are retained. coverage counts every requested provider.
`capacityVerified=false`: catalog data does not establish current provisioning
capacity. unavailable does not mean the provider does not sell the service.

## Errors and transport

Errors: `{error:{code,message,details:[{path,code}]}}` with appropriate HTTP status.
400 validation, 404 missing ID, 409 cursor expired, 413 body too large (64 KiB),
429 rate limit, 500 internal failure. Request-Id is a response header. Catalog
responses carry ETag and Cache-Control; estimates are no-store.

REST CORS allows all origins. MCP independently validates Host and Origin; no
wildcard MCP CORS. Production/local hosts are allowed; set MCP_ALLOWED_HOSTS to
comma-separated additional test hostnames. Do not populate it from request data.
The reverse proxy must overwrite X-Forwarded-For/X-Real-IP from trusted peers.
The in-process limiter is 60 requests/minute/IP **per process**, with Retry-After;
a multi-replica deployment needs an edge/shared limiter for a global quota.

## Release verification

```sh
npm run data:build
npm run typecheck
npm test
npm run build
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static
PORT=3107 HOSTNAME=127.0.0.1 node .next/standalone/server.js
# In a second terminal:
npm run test:api:smoke -- http://127.0.0.1:3107
```

For a remote staging server pass its base URL to the smoke script and allow its
hostname in MCP_ALLOWED_HOSTS. The smoke uses the official MCP client and exercises
all five tools plus REST lists, cursors, validation, totals, CORS and discovery.

Verified locally on 2026-09-18: 834 tests passed (including 22 public API tests),
typecheck and production build passed. The standalone production server passed
the HTTP smoke with all five MCP tools. Browser checks covered catalog results,
compute/GPU estimates, validation errors and MCP documentation; no console errors
were recorded. This verifies the local release candidate; the remote deployment
and its proxy were not tested in this run.

Out of scope: saved estimates, API keys, k8s/lakehouse/inference estimates, dense
search, hour/year estimates and a generated client SDK.

## Discovery and indexing

Documentation sections have standalone server-rendered URLs under `/api`, including
`/api/mcp`, `/api/products` and `/api/estimates`. Each page has its own canonical,
title, description, Open Graph metadata and TechArticle/BreadcrumbList structured
data. The sitemap and IndexNow submission list use the same page registry.
Existing `/api#section` links are upgraded to the corresponding URL in the browser.

`/llms.txt` is a compact index. `/llms-full.txt` and `/api/reference.md` expose the
full usage guide without executing JavaScript. Provider coverage and operation
examples are generated from the catalog and shared operation registry. The guide
explains tool selection, SKU versus configuration pricing, source attribution,
units, VAT, pagination and known metadata limitations.

MCP advertises input/output schemas, task-oriented descriptions and two readable
resources (the usage guide and OpenAPI). HTTP Link headers and HTML links connect
the service to its documentation and machine-readable contract. robots.txt already
allows crawling for all user agents; no special crawler content is served.

After deployment, run `npm run test:api:smoke -- https://cloudfinops.ru`, check that
the hosting/CDN also allows crawler requests, then run `npm run seo:indexnow`.
Submit or refresh the sitemap in the site's existing search-console accounts.
Run IndexNow only after the new URLs are live. Discovery files do not automatically
install an MCP server in AI clients or guarantee indexing or API usage.

References: Google Search Central AI features guidance
(https://developers.google.com/search/docs/appearance/ai-features), MCP TypeScript
SDK server guide (https://ts.sdk.modelcontextprotocol.io/server), the llms.txt
proposal (https://llmstxt.org/), and service discovery links in RFC 8631
(https://www.rfc-editor.org/rfc/rfc8631).
