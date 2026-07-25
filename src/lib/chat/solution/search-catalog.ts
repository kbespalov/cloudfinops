/**
 * Universal catalog search with explainable match metadata for the agent.
 * Wraps lexical/hybrid search and enriches rows with meterId + match fields.
 */

import {
  amountNumber,
  catalog,
  extractGpuModel,
  extractStorageClass,
  resolveMeterSources,
  type CatalogMeter,
  type CategoryKey,
} from '@/lib/catalog';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {
  searchPricesDetailed,
  searchPricesDetailedAsync,
  type PriceRow,
  type SearchParams,
} from '../search';
import {
  categoryFromEntityTypes,
  expandQueryText,
  normalizeGpuModel,
  normalizeProviderIds,
  normalizeRegion,
} from './synonyms';
import type {
  CatalogCandidate,
  CatalogEntityType,
  CatalogFilter,
  MatchInfo,
  SearchCatalogInput,
} from './types';

const CATEGORIES: CategoryKey[] = [
  'compute',
  'gpu',
  'storage',
  'network',
  'cdn',
  'kubernetes',
  'ai',
  'other',
];

function meterByRow(row: PriceRow): CatalogMeter | undefined {
  const id = `${row.provider}:${row.sku}`;
  return catalog.meters.find((m) => m.id === id || (m.provider === row.provider && m.sku === row.sku));
}

function entityTypeFor(meter: CatalogMeter): CatalogEntityType {
  if (meter.categoryKey === 'gpu') return 'gpu_node';
  if (meter.categoryKey === 'storage') return 'storage';
  if (meter.categoryKey === 'kubernetes') return 'managed_service';
  if (meter.meter.includes('flavor') || meter.pricingMode === 'bundle') return 'instance_type';
  return 'sku';
}

function numDim(meter: CatalogMeter, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = meter.dimensions?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function applyStructuralFilters(
  rows: PriceRow[],
  filters: CatalogFilter[] | undefined,
): {rows: PriceRow[]; filterNotes: string[]} {
  if (!filters?.length) return {rows, filterNotes: []};
  const notes: string[] = [];
  let out = rows;
  for (const f of filters) {
    const field = f.field.toLowerCase();
    out = out.filter((row) => {
      const meter = meterByRow(row);
      if (!meter) return false;
      if (field === 'vcpu' || field === 'vcpumin') {
        const vcpu = numDim(meter, 'vcpu', 'vCPU');
        if (vcpu == null) return f.operator === 'exists' ? false : true;
        if (f.operator === 'gte') return vcpu >= Number(f.value);
        if (f.operator === 'lte') return vcpu <= Number(f.value);
        if (f.operator === 'eq') return vcpu === Number(f.value);
      }
      if (field === 'ramgib' || field === 'ram' || field === 'ramgibmin') {
        const ram = numDim(meter, 'ramGiB', 'ramGb', 'memoryGiB');
        if (ram == null) return f.operator === 'exists' ? false : true;
        if (f.operator === 'gte') return ram >= Number(f.value);
        if (f.operator === 'lte') return ram <= Number(f.value);
        if (f.operator === 'eq') return ram === Number(f.value);
      }
      if (field === 'provider') {
        if (f.operator === 'eq') return meter.provider === String(f.value);
        if (f.operator === 'in' && Array.isArray(f.value)) {
          return f.value.map(String).includes(meter.provider);
        }
      }
      if (field === 'region') {
        const region = (meter.region ?? '').toLowerCase();
        const want = String(f.value).toLowerCase();
        if (f.operator === 'eq' || f.operator === 'contains') {
          return region.includes(want) || want.includes('ru');
        }
      }
      if (field === 'gpumodel') {
        const gm = (extractGpuModel(meter) ?? '').toLowerCase();
        return gm.includes(String(f.value).toLowerCase());
      }
      if (field === 'storageclass') {
        return (extractStorageClass(meter) ?? '').toLowerCase() === String(f.value).toLowerCase();
      }
      return true;
    });
    notes.push(`${f.field}:${f.operator}`);
  }
  return {rows: out, filterNotes: notes};
}

function buildMatch(
  meter: CatalogMeter,
  row: PriceRow,
  params: SearchParams,
  rankScore: number,
  filterNotes: string[],
): MatchInfo {
  const matched: string[] = [];
  const unmatched: string[] = [];
  const violations: string[] = [];
  const warnings: string[] = [];

  if (params.category && meter.categoryKey === params.category) matched.push('category');
  else if (params.category) unmatched.push('category');

  if (params.provider) {
    if (meter.provider === params.provider) matched.push('provider');
    else violations.push('provider');
  }

  if (params.gpuModel) {
    const gm = (extractGpuModel(meter) ?? '').toLowerCase();
    if (gm.includes(params.gpuModel.toLowerCase())) matched.push('gpuModel');
    else unmatched.push('gpuModel');
  }

  if (params.storageClass) {
    const cls = (extractStorageClass(meter) ?? '').toLowerCase();
    if (cls === params.storageClass.toLowerCase()) matched.push('storageClass');
    else unmatched.push('storageClass');
  }

  if (params.meterKind && row.meterKind === params.meterKind) matched.push('meterKind');

  const vcpu = numDim(meter, 'vcpu', 'vCPU');
  const ram = numDim(meter, 'ramGiB', 'ramGb');
  if (vcpu != null) matched.push('vcpu');
  if (ram != null) matched.push('ramGiB');

  if (meter.synthetic) warnings.push('synthetic_meter');
  if (row.month == null && row.hour == null) warnings.push('price_missing');
  if (filterNotes.length) matched.push(...filterNotes.map((n) => `filter:${n}`));

  return {
    score: Math.round(rankScore * 1000) / 1000,
    matchedFields: [...new Set(matched)],
    unmatchedFields: [...new Set(unmatched)],
    hardConstraintViolations: violations,
    warnings,
  };
}

function toCandidate(
  row: PriceRow,
  index: number,
  total: number,
  params: SearchParams,
  filterNotes: string[],
): CatalogCandidate | null {
  const meter = meterByRow(row);
  if (!meter) return null;
  const rankScore = total <= 1 ? 1 : 1 - index / total;
  const sources = resolveMeterSources(meter);
  const url = sources[0]?.url ?? null;
  const month = row.month ?? amountNumber(meter, 'month');
  const hour = row.hour ?? amountNumber(meter, 'unit');
  return {
    id: meter.id,
    meterId: meter.id,
    provider: meter.provider,
    providerName: meter.providerName,
    entityType: entityTypeFor(meter),
    title: row.name,
    sku: meter.sku,
    attributes: {
      category: meter.categoryKey,
      meter: meter.meter,
      config: row.config,
      unit: row.unit,
      vcpu: numDim(meter, 'vcpu', 'vCPU'),
      ramGiB: numDim(meter, 'ramGiB', 'ramGb'),
      gpuModel: extractGpuModel(meter),
      storageClass: extractStorageClass(meter),
      region: meter.region,
      k8sTier: row.k8sTier ?? null,
      synthetic: Boolean(meter.synthetic),
      priceKind: row.unit,
    },
    pricing: {
      amount: month,
      currency: 'RUB',
      period: 'month',
      vatIncluded: true,
      hour,
      month,
    },
    match: buildMatch(meter, row, params, rankScore, filterNotes),
    source: {
      url,
      priceUpdatedAt: catalogAsOfIso(),
    },
  };
}

function toSearchParams(input: SearchCatalogInput): SearchParams {
  const text = expandQueryText(input.text);
  const gpuFromText = normalizeGpuModel(input.gpuModel ?? input.text);
  const categoryRaw =
    input.category ?? categoryFromEntityTypes(input.entityTypes) ?? undefined;
  const category = CATEGORIES.includes(categoryRaw as CategoryKey)
    ? (categoryRaw as CategoryKey)
    : undefined;

  let provider: string | undefined;
  const fromList = normalizeProviderIds(input.providers);
  if (fromList?.length === 1) provider = fromList[0];

  // Map common filters into SearchParams.
  let gpuModel = input.gpuModel ? normalizeGpuModel(input.gpuModel) : undefined;
  let storageClass = input.storageClass;
  let meterKind = input.meterKind;
  let volumeGiB = input.volumeGiB;
  for (const f of input.filters ?? []) {
    const field = f.field.toLowerCase();
    if (field === 'gpumodel' && (f.operator === 'eq' || f.operator === 'contains')) {
      gpuModel = normalizeGpuModel(String(f.value));
    }
    if (field === 'storageclass' && f.operator === 'eq') {
      storageClass = String(f.value);
    }
    if (field === 'meterkind' && f.operator === 'eq') {
      const v = String(f.value);
      if (v === 'capacity' || v === 'requests') meterKind = v;
    }
    if (field === 'volumegib' && (f.operator === 'eq' || f.operator === 'gte')) {
      volumeGiB = Number(f.value);
    }
    if (field === 'provider' && f.operator === 'eq') {
      provider = String(f.value);
    }
    if (field === 'category' && f.operator === 'eq') {
      const c = String(f.value) as CategoryKey;
      if (CATEGORIES.includes(c)) {
        // prefer explicit filter category
        return {
          query: text || undefined,
          category: c,
          provider,
          gpuModel: gpuModel ?? (gpuFromText !== input.text ? gpuFromText : undefined),
          aiModel: input.aiModel,
          storageClass,
          meterKind,
          volumeGiB,
          limit: input.limit,
        };
      }
    }
  }

  void normalizeRegion(input.region); // soft hint only in MVP (regions vary)

  return {
    query: text || undefined,
    category,
    provider,
    gpuModel: gpuModel ?? (gpuFromText && gpuFromText !== input.text ? gpuFromText : undefined),
    aiModel: input.aiModel,
    storageClass,
    meterKind,
    volumeGiB,
    limit: input.limit,
  };
}

export type SearchCatalogResult = {
  count: number;
  totalMatches: number;
  currency: 'RUB';
  vatIncluded: true;
  catalogAsOf: string;
  applied: Record<string, unknown>;
  candidates: CatalogCandidate[];
  volumeEstimates?: unknown;
  note: string;
};

function finish(
  params: SearchParams,
  rows: PriceRow[],
  totalMatches: number,
  applied: Record<string, unknown> | undefined,
  volumeEstimates: unknown,
  filters: CatalogFilter[] | undefined,
): SearchCatalogResult {
  const {rows: filtered, filterNotes} = applyStructuralFilters(rows, filters);

  const candidates = filtered
    .map((row, i) => toCandidate(row, i, filtered.length, params, filterNotes))
    .filter((c): c is CatalogCandidate => c != null);

  return {
    count: candidates.length,
    totalMatches,
    currency: 'RUB',
    vatIncluded: true,
    catalogAsOf: catalogAsOfIso(),
    applied: {
      ...(applied ?? {}),
      filters: filterNotes,
      text: params.query ?? null,
    },
    candidates,
    ...(volumeEstimates ? {volumeEstimates} : {}),
    note:
      'НДС вкл., месяц=720ч. match.matchedFields/unmatchedFields — проверяемые критерии; не угадывай соответствие по названию SKU. Цены только из candidates.',
  };
}

export function searchCatalog(input: SearchCatalogInput): SearchCatalogResult {
  const params = toSearchParams(input);
  const result = searchPricesDetailed(params);
  let rows = result.rows;
  const multi = normalizeProviderIds(input.providers);
  if (multi && multi.length > 1) {
    rows = rows.filter((r) => multi.includes(r.provider));
  }
  return finish(
    params,
    rows,
    result.totalMatches,
    result.applied as Record<string, unknown> | undefined,
    result.volumeEstimates,
    input.filters,
  );
}

export async function searchCatalogAsync(input: SearchCatalogInput): Promise<SearchCatalogResult> {
  const params = toSearchParams(input);
  const result = await searchPricesDetailedAsync(params);
  let rows = result.rows;
  const multi = normalizeProviderIds(input.providers);
  if (multi && multi.length > 1) {
    rows = rows.filter((r) => multi.includes(r.provider));
  }
  return finish(
    params,
    rows,
    result.totalMatches,
    result.applied as Record<string, unknown> | undefined,
    result.volumeEstimates,
    input.filters,
  );
}

export function getProductDetails(
  productIds: string[],
  include?: Array<'attributes' | 'pricing' | 'limitations' | 'compatibility' | 'source'>,
): unknown {
  const want = new Set(include?.length ? include : ['attributes', 'pricing', 'source']);
  const products = [];
  for (const id of productIds.slice(0, 20)) {
    const meter = catalog.meters.find((m) => m.id === id || m.sku === id);
    if (!meter) {
      products.push({meterId: id, error: 'not_found'});
      continue;
    }
    const entry: Record<string, unknown> = {
      meterId: meter.id,
      sku: meter.sku,
      provider: meter.provider,
      providerName: meter.providerName,
      title: meter.name,
      category: meter.categoryKey,
    };
    if (want.has('attributes')) {
      entry.attributes = {
        meter: meter.meter,
        dimensions: meter.dimensions,
        region: meter.region,
        unitQuantity: meter.unitQuantity,
        purchaseModel: meter.purchaseModel,
        comparableTier: meter.comparableTier,
        synthetic: meter.synthetic,
        cpuPlatformFamily: meter.cpuPlatformFamily,
      };
    }
    if (want.has('pricing')) {
      entry.pricing = {
        hour: amountNumber(meter, 'unit'),
        month: amountNumber(meter, 'month'),
        year: amountNumber(meter, 'year'),
        currency: 'RUB',
        vatIncluded: true,
      };
    }
    if (want.has('limitations')) {
      entry.limitations = {
        status: meter.status,
        notes: meter.notes,
        priceProvenance: meter.priceProvenance,
      };
    }
    if (want.has('compatibility')) {
      entry.compatibility = {
        region: meter.region,
        categoryKey: meter.categoryKey,
        pricingMode: meter.pricingMode,
      };
    }
    if (want.has('source')) {
      const sources = resolveMeterSources(meter);
      entry.source = {
        url: sources[0]?.url ?? null,
        priceUpdatedAt: catalogAsOfIso(),
        checkedAt: meter.checkedAt,
      };
    }
    products.push(entry);
  }
  return {
    count: products.length,
    catalogAsOf: catalogAsOfIso(),
    products,
  };
}
