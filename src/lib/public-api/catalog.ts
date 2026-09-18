import type {z} from 'zod';
import {catalog, type CatalogMeter, type CatalogData} from '@/lib/catalog';
import {CATEGORY_IDS, PRODUCT_ARRAY_FILTERS} from './constants';
import {productQuerySchema} from './schemas';
import {catalogVersion} from './envelope';
import {decodeCursor, encodeCursor, parseLimit, invalidParameter, type CursorPayload} from './pagination';
import {meterToProduct} from './product';
import {matchesRegion, regionCode, regionCodes} from './regions';
import type {PublicCategory, PublicProduct, PublicProvider, PublicRegion, PublicService} from './types';
import {serviceAttributes} from './service-attributes';
import {resolveUnit} from './units';

export type ProductListQuery = z.infer<typeof productQuerySchema>;

function metersOf(data: CatalogData = catalog): CatalogMeter[] {
  return data.meters;
}

export function listProviders(data: CatalogData = catalog): PublicProvider[] {
  return data.providers.map((p) => {
    const subset = metersOf(data).filter((m) => m.provider === p.id);
    const categories = [...new Set(subset.map((m) => m.categoryKey))].filter((c) => c !== 'other');
    const sources = Object.values(data.sources)
      .filter((s) => s.provider === p.id)
      .map((s) => ({id: s.id, title: s.title, url: s.url}));
    return {
      id: p.id,
      name: p.name,
      productCount: p.count,
      categories,
      estimateResourceTypes: ['compute', 'gpu'] as Array<'compute' | 'gpu'>,
      sources,
    };
  });
}

export function getProvider(id: string, data: CatalogData = catalog): PublicProvider | null {
  return listProviders(data).find((p) => p.id === id) ?? null;
}

export function listCategories(data: CatalogData = catalog): PublicCategory[] {
  return data.categories
    .filter((c) => (CATEGORY_IDS as readonly string[]).includes(c.key))
    .map((c) => ({id: c.key, title: c.title, productCount: c.count}));
}

export function listRegions(data: CatalogData = catalog): PublicRegion[] {
  const counts = new Map<string, number>();
  for (const m of metersOf(data)) {
    if (!m.region) continue;
    counts.set(m.region, (counts.get(m.region) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({label, code: regionCode(label), codes: regionCodes(label), productCount: count}))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function listServices(data: CatalogData = catalog): PublicService[] {
  const services = [...new Set(metersOf(data).map(m => m.service))].sort();
  return services.map(id => {
    const rows = metersOf(data).filter(m => m.service === id);
    return {
      id, productCount: rows.length,
      layers: [...new Set(rows.map(m => m.layer))].sort(),
      categories: [...new Set(rows.map(m => m.categoryKey))].sort(),
      meters: [...new Set(rows.map(m => m.meter))].sort(),
    };
  });
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9а-яё.+-]+/i)
    .filter((t) => t.length >= 2);
}

function scoreMeter(meter: CatalogMeter, tokens: string[]): number {
  if (!tokens.length) return 1;
  const hay = [
    meter.name,
    meter.sku,
    meter.meter,
    meter.providerName,
    String(meter.dimensions.gpuModel || ''),
    meter.categoryKey,
  ]
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 4 ? 3 : 2;
  }
  return score;
}

function applyFilters(meters: CatalogMeter[], query: Omit<CursorPayload, 'v' | 'offset' | 'order'>): CatalogMeter[] {
  let rows = meters;
  if (query.providers?.length) {
    const set = new Set(query.providers);
    rows = rows.filter((m) => set.has(m.provider));
  }
  if (query.categories?.length) {
    const set = new Set(query.categories);
    rows = rows.filter((m) => set.has(m.categoryKey));
  }
  const fields = {
    services: (m: CatalogMeter) => m.service,
    meters: (m: CatalogMeter) => m.meter,
    units: (m: CatalogMeter) => resolveUnit(m).unit,
    serviceProducts: (m: CatalogMeter) => serviceAttributes(m).serviceProduct,
    modelIds: (m: CatalogMeter) => serviceAttributes(m).modelId,
    tokenDirections: (m: CatalogMeter) => serviceAttributes(m).tokenDirection,
    inferenceModes: (m: CatalogMeter) => serviceAttributes(m).inferenceMode,
  };
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    if (!query[key].length) continue;
    const values = new Set(query[key]);
    rows = rows.filter(m => {
      const value = fields[key](m);
      return value !== null && values.has(value);
    });
  }
  if (query.regions?.length) {
    const regions = query.regions;
    rows = rows.filter(m => regions.some(region => matchesRegion(m.region, region)));
  }
  if (query.status) {
    rows = rows.filter((m) => m.status === query.status);
  }
  return rows;
}

export function listProducts(
  query: ProductListQuery,
  data: CatalogData = catalog,
): {items: PublicProduct[]; nextCursor: string | null; limit: number} {
  const checked = productQuerySchema.safeParse(query);
  if (!checked.success) throw invalidParameter(checked.error.issues[0].message, '/' + checked.error.issues[0].path.join('/'));
  query = checked.data;
  const limit = query.limit ?? parseLimit(null);
  let offset = 0;
  let filters: Omit<CursorPayload, 'v' | 'offset' | 'order'> = {
    q: query.q ?? '', status: query.status ?? '',
    providers: query.providers ?? [], categories: query.categories ?? [], regions: query.regions ?? [],
    services: query.services ?? [], serviceProducts: query.serviceProducts ?? [],
    meters: query.meters ?? [], units: query.units ?? [], modelIds: query.modelIds ?? [],
    tokenDirections: query.tokenDirections ?? [], inferenceModes: query.inferenceModes ?? [],
  };

  if (query.cursor) {
    const cur = decodeCursor(query.cursor, catalogVersion(data));
    for (const key of ['q', ...PRODUCT_ARRAY_FILTERS, 'status'] as const) {
      const supplied = query[key];
      const normalized = Array.isArray(supplied) ? [...new Set(supplied)].sort() : supplied?.trim();
      const stored = Array.isArray(cur[key]) ? [...new Set(cur[key])].sort() : cur[key];
      if (supplied !== undefined && JSON.stringify(normalized) !== JSON.stringify(stored)) {
        throw invalidParameter('cursor filters do not match this request', '/' + key);
      }
    }
    offset = cur.offset;
    const {v: _version, offset: _offset, order: _order, ...storedFilters} = cur;
    filters = storedFilters;
  }

  const {q} = filters;
  const tokens = tokenize(q);
  let rows = applyFilters(metersOf(data), filters);
  if (tokens.length) {
    rows = rows
      .map((m) => ({m, s: scoreMeter(m, tokens)}))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.m.id.localeCompare(b.m.id))
      .map((x) => x.m);
  } else {
    rows = [...rows].sort((a, b) => a.provider.localeCompare(b.provider) || a.sku.localeCompare(b.sku));
  }

  const slice = rows.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const payload: CursorPayload = {
    v: catalogVersion(data),
    order: q ? 'lexical-v1' : 'provider-sku-v1',
    offset: nextOffset,
    ...filters,
  };
  return {
    items: slice.map(meterToProduct),
    nextCursor: nextOffset < rows.length ? encodeCursor(payload) : null,
    limit,
  };
}
