import {CATEGORY_IDS} from './constants';

export type AttributeOperator = 'eq' | 'in' | 'range';
export type AttributeValue = string | number;
export type AttributeFilter = {eq: AttributeValue} | {in: AttributeValue[]} | {range: {min?: number; max?: number}};
export type LegacyAttributeParameter = 'serviceProducts' | 'modelIds' | 'tokenDirections' | 'inferenceModes';
type Definition = {
  id: string; label: string; description: string; categories: readonly string[];
  type: 'string' | 'enum' | 'integer' | 'number'; unit?: string; minimum?: number;
  values?: readonly string[]; valueLabels?: Record<string, string>; legacyParameter?: LegacyAttributeParameter;
};

/** Public contract. No catalog imports: shared by validation, discovery, docs and the form. */
export const ATTRIBUTE_DEFINITIONS = [
  {id: 'vcpu', label: 'Число vCPU', type: 'integer', minimum: 0, categories: ['compute', 'gpu', 'kubernetes', 'ai'], description: 'Число vCPU, указанное у SKU. Не задаёт размер конфигурации для ставки за один vCPU.'},
  {id: 'memoryGiB', label: 'Оперативная память', type: 'number', minimum: 0, unit: 'GiB', categories: ['compute', 'gpu', 'kubernetes', 'ai'], description: 'Память хоста у SKU в GiB. Это не видеопамять и не запрос на сборку конфигурации.'},
  {id: 'gpuModel', label: 'Модель GPU', type: 'string', categories: ['gpu', 'ai'], description: 'Точное значение Product.attributes.gpuModel с учётом регистра. Названия разных провайдеров и варианты vGPU не объединяются.'},
  {id: 'gpuCount', label: 'Число GPU', type: 'integer', minimum: 0, categories: ['gpu', 'ai'], description: 'Количество GPU, указанное у SKU.'},
  {id: 'storageClass', label: 'Класс хранения', type: 'string', categories: ['storage', 'network'], description: 'Класс хранилища, к которому относится ставка: в том числе исходящий трафик в категории network.'},
  {id: 'purchaseModel', label: 'Модель потребления', type: 'string', categories: ['compute', 'gpu'], description: 'Точное значение модели потребления, например on-demand или preemptible.'},
  {id: 'pricingMode', label: 'Способ тарификации', type: 'string', categories: CATEGORY_IDS, description: 'Исходный способ тарификации SKU: например unit, bundle, tiered или fixed.'},
  {id: 'serviceProduct', label: 'Продукт провайдера', type: 'string', categories: ['ai'], legacyParameter: 'serviceProducts', description: 'Точный идентификатор продукта, например foundation-models. При необходимости ограничьте провайдера.'},
  {id: 'modelId', label: 'Модель AI', type: 'string', categories: ['ai'], legacyParameter: 'modelIds', description: 'Точный ID модели с учётом регистра. Идентификаторы разных провайдеров автоматически не объединяются.'},
  {id: 'modelFamily', label: 'Семейство AI-модели', type: 'string', categories: ['ai'], description: 'Значение семейства из каталога. Это не единый межпровайдерный идентификатор.'},
  {id: 'tokenDirection', label: 'Тип токенов', type: 'enum', values: ['input', 'output'], valueLabels: {input: 'Входные', output: 'Выходные'}, categories: ['ai'], legacyParameter: 'tokenDirections', description: 'Направление токенов. Дополнительно задайте units=token для выбора токенных ставок. У части embeddings направление неизвестно.'},
  {id: 'inferenceMode', label: 'Режим выполнения AI', type: 'string', categories: ['ai'], legacyParameter: 'inferenceModes', description: 'Режим выполнения, явно указанный у SKU: например synchronous или batch.'},
] as const satisfies readonly Definition[];

export type AttributeId = typeof ATTRIBUTE_DEFINITIONS[number]['id'];
export type AttributeFilters = Partial<Record<AttributeId, AttributeFilter>>;
export const attributeDefinitions: readonly (Definition & {id: AttributeId})[] = ATTRIBUTE_DEFINITIONS;
export function attributeOperators(definition: Pick<Definition, 'type'>): AttributeOperator[] {
  return definition.type === 'number' || definition.type === 'integer' ? ['eq', 'in', 'range'] : ['eq', 'in'];
}
export const OPERATOR_LABELS: Record<AttributeOperator, string> = {eq: 'Точное совпадение', in: 'Одно из значений', range: 'Диапазон'};

export type CategoryAttributes = {
  category: string; title: string; productCount: number;
  attributes: Array<{
    id: AttributeId; label: string; description: string; type: Definition['type']; unit: string | null;
    minimum: number | null; operators: AttributeOperator[]; allowedValues: string[] | null;
    values: Array<{value: AttributeValue; label: string; productCount: number}>;
    observedRange: {min: number; max: number} | null; knownCount: number; missingCount: number;
  }>;
};

/** Semantic cursor equality: property order, duplicates and order within `in` do not matter. */
export function canonicalAttributeFilters(filters: AttributeFilters): string {
  return JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)).map(([id, filter]) => [id,
    'eq' in filter ? ['eq', filter.eq] : 'in' in filter ? ['in', [...new Set(filter.in)].sort((a, b) => String(a).localeCompare(String(b)))] : ['range', filter.range.min ?? null, filter.range.max ?? null],
  ]));
}
