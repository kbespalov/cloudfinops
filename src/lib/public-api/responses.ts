import {z} from 'zod';
import {productAttributesSchema} from './attribute-schemas';
import {PUBLIC_UNITS} from './constants';
import {computeResourceSchema,gpuResourceSchema} from './schemas';
const text=z.string(), nullable=text.nullable();
const decimal=text.regex(/^-?\d+(\.\d+)?$/);
const money=z.strictObject({amount:decimal.describe('Exact decimal string; avoid binary floating point when calculating money.'),currency:nullable.describe('Currency code from the source. Null means unknown, not RUB by default.')});
const vat=z.enum(['included','excluded','unknown']);
const providerRef=z.strictObject({id:text,name:text});
const regionCode=nullable.describe('The only recognized provider code, lowercased. Null when there are zero or multiple codes; use codes (regions) or regionCodes (products) for groups.');
const regionCodes=z.array(text).describe('All distinct recognized provider codes in source order, lowercased. Empty when no explicit code is recognized.');
export const priceSchema=z.strictObject({
  id:text,model:z.enum(['per_unit','tiered','fixed']),unit:z.enum(PUBLIC_UNITS).describe('Consumption unit including its native time period, when applicable.'),unitQuantity:decimal.describe('Rate denominator: the price is for this many consumption units. For example 1000000 tokens.'),unitLabel:text,
  unitPrice:money.nullable(),tiers:z.array(z.strictObject({from:decimal,to:decimal.nullable(),unitPrice:money})).nullable(),
  vat,currency:nullable,effectiveFrom:nullable,checkedAt:nullable.describe('Date the source tariff was checked; not a live price or capacity guarantee.'),
});
export const productSchema=z.strictObject({
  id:text,providerSku:text,name:text,status:text,provider:providerRef,category:text,service:text.describe('Source service ID, e.g. ai, compute, storage or containers. Distinct from the display category.'),layer:text.describe('Source service layer, e.g. iaas or paas.'),meter:text,
  region:nullable.describe('Original source label, which may describe a city, country, zone, group or tariff scope.'),regionCode,regionCodes,derived:z.boolean(),
  attributes:productAttributesSchema,
  providerAttributes:z.record(text,z.unknown()).describe('Additional source dimensions. Conventions may differ across providers: gpuMemoryGb is per GPU, while vramGb may be per GPU or per bundle.'),prices:z.array(priceSchema),
  source:z.strictObject({id:nullable,title:nullable,url:nullable,checkedAt:nullable}),
});
const difference=z.strictObject({dimension:text,seed:z.unknown(),candidate:z.unknown()});
const reason=z.strictObject({code:text,message:text,path:text});
export const estimateSchema=z.strictObject({
  input:z.strictObject({resource:z.union([computeResourceSchema,gpuResourceSchema]),providers:z.array(text),addons:z.record(text,z.number()),period:z.literal('month'),monthHours:z.literal(720)}),
  assumptions:z.strictObject({capacityVerified:z.literal(false),vat:z.literal('catalog_billable_included_rub'),period:z.literal('month')}),
  quotes:z.array(z.strictObject({provider:providerRef,status:z.enum(['priced','unavailable','incomplete','error']),total:money.nullable(),scope:nullable,
    matchedResource:z.strictObject({
      type:z.enum(['compute','gpu']),purchaseModel:z.enum(['on-demand','preemptible']),scope:z.enum(['instance','gpu_only']),region:nullable,
      vcpu:z.number().optional(),memoryGiB:z.number().optional(),gpuModel:nullable.optional(),gpuCount:z.number().optional(),
      interconnect:nullable.optional(),form:nullable.optional(),disk:z.strictObject({sizeGiB:z.number(),media:z.enum(['ssd','hdd']),includedIops:z.number().optional()}).optional(),
    }).nullable(),differences:z.array(difference),reason:reason.nullable(),note:nullable,
    lineItems:z.array(z.strictObject({role:text,productId:nullable,priceId:nullable,quantity:decimal,amount:money.nullable(),label:text,vat,unit:z.enum(PUBLIC_UNITS)})),
  })),lowestPriceProviderIds:z.array(text).describe('All providers tied for the lowest total among quotes with status=priced only. Empty when none can be completely priced.'),
  coverage:z.strictObject({requested:z.number(),priced:z.number(),unavailable:z.number(),incomplete:z.number(),error:z.number()}),
});
const provider=z.strictObject({id:text,name:text,productCount:z.number(),categories:z.array(text),estimateResourceTypes:z.array(z.enum(['compute','gpu'])),sources:z.array(z.strictObject({id:text,title:text,url:text}))});
const meta=z.object({apiVersion:z.literal('v1'),catalogVersion:text,taxonomyVersion:text,generatedAt:text,disclaimer:text,calculationVersion:text.optional()});
const pagination=z.strictObject({nextCursor:nullable,limit:z.number()});
const envelope=(data:z.ZodType,listed=false)=>z.strictObject({data,meta,...(listed?{pagination}:{})});
export const responseSchemas={
  list_providers:envelope(z.array(provider),true), get_provider:envelope(provider),
  list_categories:envelope(z.array(z.strictObject({id:text,title:text,productCount:z.number()})),true),
  list_attributes:envelope(z.array(z.strictObject({category:text,title:text,productCount:z.number().int().nonnegative(),attributes:z.array(z.strictObject({
    id:text,label:text,description:text,type:z.enum(['string','enum','integer','number']),unit:nullable,minimum:z.number().nullable(),
    operators:z.array(z.enum(['eq','in','range'])),allowedValues:z.array(text).nullable().describe('Closed enum when non-null. Strings accept any nonempty exact value; observed values are suggestions, not a closed enum.'),
    values:z.array(z.strictObject({value:z.union([text,z.number()]),label:text,productCount:z.number().int().nonnegative()})).describe('Distinct observed values and SKU counts in this category, before other filters.'),
    observedRange:z.strictObject({min:z.number(),max:z.number()}).nullable().describe('Observed numeric bounds, not limits on configurable resources.'),
    knownCount:z.number().int().nonnegative(),missingCount:z.number().int().nonnegative(),
  }))})),true),
  list_services:envelope(z.array(z.strictObject({id:text,productCount:z.number().int().nonnegative(),layers:z.array(text),categories:z.array(text),meters:z.array(text)})),true),
  list_regions:envelope(z.array(z.strictObject({label:text.describe('Exact observed source label. A dash is an unspecified location, not a region code.'),code:regionCode,codes:regionCodes,productCount:z.number().int().nonnegative().describe('Number of billing SKUs with this exact label. Filtering by a code can match several labels and return more products.')})),true),
  search_products:envelope(z.array(productSchema),true),get_product:envelope(productSchema),
  list_product_alternatives:envelope(z.array(z.strictObject({product:productSchema,mode:z.enum(['exact','functional']),priceComparable:z.boolean(),differences:z.array(difference),ineligibleReasons:z.array(text)})),true),
  create_estimate:envelope(estimateSchema),
};
export const errorSchema=z.strictObject({error:z.strictObject({code:text,message:text,details:z.array(z.object({path:text,code:text,message:text.optional()}))})});
