import {catalog, type CatalogMeter, type CatalogData} from '@/lib/catalog';
import {CATEGORY_IDS} from './constants';
import {productQuerySchema} from './schemas';
import {catalogVersion} from './envelope';
import {decodeCursor, encodeCursor, parseLimit, invalidParameter, type CursorPayload} from './pagination';
import {meterToProduct, regionCode} from './product';
import type {PublicCategory, PublicProduct, PublicProvider, PublicRegion} from './types';

export type ProductListQuery = {
  q?: string;
  providers?: string[];
  categories?: string[];
  regions?: string[];
  status?: string;
  limit?: number;
  cursor?: string;
};

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
  const counts = new Map<string, {code: string | null; count: number}>();
  for (const m of metersOf(data)) {
    if (!m.region) continue;
    const cur = counts.get(m.region) ?? {code: regionCode(m.region), count: 0};
    cur.count += 1;
    counts.set(m.region, cur);
  }
  return [...counts.entries()]
    .map(([label, v]) => ({label, code: v.code, productCount: v.count}))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
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

function applyFilters(meters: CatalogMeter[], query: ProductListQuery): CatalogMeter[] {
  let rows = meters;
  if (query.providers?.length) {
    const set = new Set(query.providers);
    rows = rows.filter((m) => set.has(m.provider));
  }
  if (query.categories?.length) {
    const set = new Set(query.categories);
    rows = rows.filter((m) => set.has(m.categoryKey));
  }
  if (query.regions?.length) {
    const set = new Set(query.regions);
    rows = rows.filter((m) => {
      if (!m.region) return false;
      const code = regionCode(m.region);
      return set.has(m.region) || (code != null && set.has(code));
    });
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
  let q = (query.q || '').trim();
  let providers = query.providers ?? [];
  let categories = query.categories ?? [];
  let regions = query.regions ?? [];
  let status = query.status ?? '';

  if (query.cursor) {
    const cur = decodeCursor(query.cursor, catalogVersion(data));
    for (const key of ['q', 'providers', 'categories', 'regions', 'status'] as const) {
      const supplied = query[key];
      const normalized = Array.isArray(supplied) ? [...new Set(supplied)].sort() : supplied?.trim();
      const stored = Array.isArray(cur[key]) ? [...new Set(cur[key])].sort() : cur[key];
      if (supplied !== undefined && JSON.stringify(normalized) !== JSON.stringify(stored)) {
        throw invalidParameter('cursor filters do not match this request', '/' + key);
      }
    }
    offset = cur.offset;
    q = cur.q;
    providers = cur.providers;
    categories = cur.categories;
    regions = cur.regions;
    status = cur.status;
  }

  const tokens = tokenize(q);
  let rows = applyFilters(metersOf(data), {providers, categories, regions, status});
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
    q,
    providers,
    categories,
    regions,
    status,
  };
  return {
    items: slice.map(meterToProduct),
    nextCursor: nextOffset < rows.length ? encodeCursor(payload) : null,
    limit,
  };
}
