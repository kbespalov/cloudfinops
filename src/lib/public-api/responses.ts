import {z} from 'zod';
import {PUBLIC_UNITS} from './constants';
import {computeResourceSchema,gpuResourceSchema} from './schemas';
const text=z.string(), nullable=text.nullable();
const decimal=text.regex(/^-?\d+(\.\d+)?$/);
const money=z.strictObject({amount:decimal,currency:nullable});
const vat=z.enum(['included','excluded','unknown']);
const providerRef=z.strictObject({id:text,name:text});
export const priceSchema=z.strictObject({
  id:text,model:z.enum(['per_unit','tiered','fixed']),unit:z.enum(PUBLIC_UNITS),unitQuantity:decimal,unitLabel:text,
  unitPrice:money.nullable(),tiers:z.array(z.strictObject({from:decimal,to:decimal.nullable(),unitPrice:money})).nullable(),
  vat,currency:nullable,effectiveFrom:nullable,checkedAt:nullable,
});
export const productSchema=z.strictObject({
  id:text,providerSku:text,name:text,status:text,provider:providerRef,category:text,meter:text,
  region:nullable,regionCode:nullable,derived:z.boolean(),
  attributes:z.strictObject({vcpu:z.number().nullable(),memoryGiB:z.number().nullable(),gpuModel:nullable,gpuCount:z.number().nullable(),purchaseModel:nullable,pricingMode:nullable,storageClass:nullable,region:nullable}),
  providerAttributes:z.record(text,z.unknown()),prices:z.array(priceSchema),
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
  })),lowestPriceProviderIds:z.array(text),
  coverage:z.strictObject({requested:z.number(),priced:z.number(),unavailable:z.number(),incomplete:z.number(),error:z.number()}),
});
const provider=z.strictObject({id:text,name:text,productCount:z.number(),categories:z.array(text),estimateResourceTypes:z.array(z.enum(['compute','gpu'])),sources:z.array(z.strictObject({id:text,title:text,url:text}))});
const meta=z.object({apiVersion:z.literal('v1'),catalogVersion:text,taxonomyVersion:text,generatedAt:text,disclaimer:text,calculationVersion:text.optional()});
const pagination=z.strictObject({nextCursor:nullable,limit:z.number()});
const envelope=(data:z.ZodType,listed=false)=>z.strictObject({data,meta,...(listed?{pagination}:{})});
export const responseSchemas={
  list_providers:envelope(z.array(provider),true), get_provider:envelope(provider),
  list_categories:envelope(z.array(z.strictObject({id:text,title:text,productCount:z.number()})),true),
  list_regions:envelope(z.array(z.strictObject({label:text,code:nullable,productCount:z.number()})),true),
  search_products:envelope(z.array(productSchema),true),get_product:envelope(productSchema),
  list_product_alternatives:envelope(z.array(z.strictObject({product:productSchema,mode:z.enum(['exact','functional']),priceComparable:z.boolean(),differences:z.array(difference),ineligibleReasons:z.array(text)})),true),
  create_estimate:envelope(estimateSchema),
};
export const errorSchema=z.strictObject({error:z.strictObject({code:text,message:text,details:z.array(z.object({path:text,code:text,message:text.optional()}))})});
