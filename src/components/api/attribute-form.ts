import {attributeFiltersSchema} from '@/lib/public-api/attribute-schemas';
import {attributeDefinitions, type AttributeFilters, type AttributeId, type AttributeOperator} from '@/lib/public-api/attribute-registry';

export type AttributeDraft = {
  operator: AttributeOperator; value: string; values: string[]; min: string; max: string;
  invalidValue?: boolean; invalidMin?: boolean; invalidMax?: boolean;
};
export type AttributeDrafts = Partial<Record<AttributeId, AttributeDraft>>;
export const emptyAttributeDraft = (): AttributeDraft => ({operator: 'eq', value: '', values: [], min: '', max: ''});

/** Validate form output with the actual API schema, including range/type/operator rules. */
export function compileAttributeDrafts(drafts: AttributeDrafts): {filters: AttributeFilters; error: string} {
  const filters: AttributeFilters = {};
  for (const def of attributeDefinitions) {
    const draft = drafts[def.id];
    if (!draft) continue;
    // Number inputs report value="" for incomplete input such as "2e".
    // An invalid bound must not be interpreted as an omitted bound.
    if (draft.operator === 'eq' && draft.invalidValue || draft.operator === 'range' && (draft.invalidMin || draft.invalidMax)) {
      return {filters: {}, error: `${def.label}: завершите ввод числа или очистите поле.`};
    }
    const numeric = def.type === 'integer' || def.type === 'number';
    const value = (raw: string) => numeric ? raw.trim() === '' ? NaN : Number(raw) : raw;
    filters[def.id] = draft.operator === 'eq' ? {eq: value(draft.value)} : draft.operator === 'in' ? {in: draft.values.map(value)} : {
      range: {...(draft.min.trim() ? {min: Number(draft.min)} : {}), ...(draft.max.trim() ? {max: Number(draft.max)} : {})},
    };
  }
  const parsed = attributeFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    const id = parsed.error.issues[0].path[0];
    const def = attributeDefinitions.find(def => def.id === id);
    if (!def) return {filters: {}, error: 'Слишком много значений: сократите список характеристик.'};
    const draft = drafts[def.id]!;
    const hint = draft.operator === 'range' ? 'задайте хотя бы одну границу; нижняя не должна превышать верхнюю.' :
      draft.operator === 'in' ? 'выберите хотя бы одно допустимое значение.' :
      def.type === 'integer' ? 'укажите целое неотрицательное число.' : def.type === 'number' ? 'укажите неотрицательное число.' : 'укажите точное значение.';
    return {filters: {}, error: `${def.label}: ${hint}`};
  }
  return {filters: parsed.data, error: ''};
}
