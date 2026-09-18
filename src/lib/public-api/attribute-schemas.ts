import {z} from 'zod';
import {attributeDefinitions, attributeOperators, type AttributeFilter, type AttributeId, type LegacyAttributeParameter} from './attribute-registry';

export function attributeValueSchema(def: typeof attributeDefinitions[number]) {
  if (def.type === 'enum') return z.enum(def.values!);
  if (def.type === 'string') return z.string().min(1).max(200);
  const number = z.number().finite().min(def.minimum ?? 0);
  return def.type === 'integer' ? number.int() : number;
}

const shape = Object.fromEntries(attributeDefinitions.map(def => {
  const value = attributeValueSchema(def);
  const variants: z.ZodType<AttributeFilter>[] = [
    z.strictObject({eq: value}), z.strictObject({in: z.array(value).min(1).max(100)}),
  ];
  if (attributeOperators(def).includes('range')) {
    const bound = def.type === 'integer' ? z.number().finite().min(def.minimum ?? 0).int() : z.number().finite().min(def.minimum ?? 0);
    variants.push(z.strictObject({range: z.union([
      z.strictObject({min: bound, max: bound.optional()}),
      z.strictObject({min: bound.optional(), max: bound}),
    ])
      .refine(r => r.min === undefined || r.max === undefined || r.min <= r.max, 'min must not exceed max')}));
  }
  return [def.id, z.union(variants).optional().describe(def.description + ' Categories: ' + def.categories.join(', ') + '.')];
})) as unknown as Record<AttributeId, z.ZodOptional<z.ZodType<AttributeFilter>>>;

export const attributeFiltersSchema = z.strictObject(shape).refine(filters => new TextEncoder().encode(JSON.stringify(filters)).length <= 8000, 'attributes must not exceed 8000 UTF-8 bytes').describe('Exact filters on Product.attributes. One operator per attribute: eq, in (OR), or inclusive range with min and/or max for numbers. AND across attributes; null never matches. REST: one URL-encoded JSON object; MCP: object. Maximum 8000 UTF-8 bytes of compact JSON. Discover categories, types, operators and observed values at GET /attributes. Numbers describe existing SKUs; use /estimates for a requested configuration.');

export const legacyAttributeQueryShape = Object.fromEntries(attributeDefinitions.filter(def => def.legacyParameter).map(def => [
  def.legacyParameter!, z.array(def.type === 'string' ? z.string().trim().min(1).max(200) : attributeValueSchema(def)).max(def.values?.length ?? 100).optional().describe(`Compatibility filter for attributes.${def.id}. Exact values combined with OR. Prefer attributes={"${def.id}":{"in":[...]}}. ${def.description}`),
])) as unknown as Record<LegacyAttributeParameter, z.ZodOptional<z.ZodArray<z.ZodType<string>>>>;

export const productAttributesSchema = z.strictObject({
  ...Object.fromEntries(attributeDefinitions.map(def => [def.id, attributeValueSchema(def).nullable().describe(def.description)])),
  region: z.string().nullable(),
});
