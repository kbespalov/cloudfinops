import {catalog, extractGpuCount, extractGpuModel, extractRamGiB, extractStorageClass, extractVcpu, type CatalogMeter, type CatalogData} from '@/lib/catalog';
import {serviceAttributes} from './service-attributes';
import {attributeDefinitions, attributeOperators, type AttributeFilters, type AttributeValue, type CategoryAttributes} from './attribute-registry';
import type {ProductAttributes} from './types';

export function productAttributes(meter: CatalogMeter): ProductAttributes {
  return {...serviceAttributes(meter), vcpu: extractVcpu(meter), memoryGiB: extractRamGiB(meter),
    gpuModel: extractGpuModel(meter), gpuCount: extractGpuCount(meter), purchaseModel: meter.purchaseModel,
    pricingMode: meter.pricingMode, storageClass: extractStorageClass(meter), region: meter.region};
}

export function matchesAttributes(meter: CatalogMeter, filters: AttributeFilters): boolean {
  const values = productAttributes(meter);
  return attributeDefinitions.every(def => {
    const filter = filters[def.id];
    if (!filter) return true;
    if (!def.categories.includes(meter.categoryKey)) return false;
    const value = values[def.id];
    if (value === null) return false;
    if ('eq' in filter) return value === filter.eq;
    if ('in' in filter) return filter.in.includes(value);
    return typeof value === 'number' && (filter.range.min === undefined || value >= filter.range.min) && (filter.range.max === undefined || value <= filter.range.max);
  });
}

export function listAttributes(data: CatalogData = catalog, categories: string[] = []): CategoryAttributes[] {
  return data.categories.filter(cat => (!categories.length || categories.includes(cat.key)) && attributeDefinitions.some(def => def.categories.includes(cat.key))).map(cat => {
    const rows = data.meters.filter(m => m.categoryKey === cat.key).map(productAttributes);
    return {category: cat.key, title: cat.title, productCount: rows.length, attributes: attributeDefinitions.filter(def => def.categories.includes(cat.key)).map(def => {
      const counts = new Map<AttributeValue, number>();
      for (const row of rows) {
        const value = row[def.id];
        if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const entries = [...counts].sort(([a], [b]) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru'));
      const numbers = entries.map(([value]) => value).filter((value): value is number => typeof value === 'number');
      const knownCount = entries.reduce((sum, [, count]) => sum + count, 0);
      return {id: def.id, label: def.label, description: def.description, type: def.type, unit: def.unit ?? null,
        minimum: def.minimum ?? null, operators: attributeOperators(def), allowedValues: def.values ? [...def.values] : null,
        values: entries.map(([value, productCount]) => ({value, label: def.valueLabels?.[String(value)] ?? String(value), productCount})),
        observedRange: numbers.length ? {min: Math.min(...numbers), max: Math.max(...numbers)} : null, knownCount, missingCount: rows.length - knownCount};
    })};
  });
}
