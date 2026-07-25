/**
 * Alias dictionaries for catalog search / compose normalization.
 * Used inside engines — not exposed as a separate resolve_requirements tool.
 */

import type {CatalogEntityType} from './types';

/** Free-text GPU nicknames → catalog model tokens. */
const GPU_ALIASES: Record<string, string> = {
  ашка: 'H100',
  ашка100: 'H100',
  h100: 'H100',
  'h 100': 'H100',
  a100: 'A100',
  'a 100': 'A100',
  l40s: 'L40S',
  l40: 'L40',
  l4: 'L4',
  v100: 'V100',
  t4: 'T4',
  b200: 'B200',
  b300: 'B300',
  h200: 'H200',
};

/** Disk media phrases → ssd | nvme | hdd. */
const DISK_ALIASES: Array<{re: RegExp; media: 'ssd' | 'nvme' | 'hdd'}> = [
  {re: /быстр\w*\s+диск|nvme|нвме/i, media: 'nvme'},
  {re: /\bssd\b|ссд/i, media: 'ssd'},
  {re: /\bhdd\b|хдд|медленн\w*\s+диск/i, media: 'hdd'},
];

/** Object-storage class phrases. */
const STORAGE_CLASS_ALIASES: Array<{
  re: RegExp;
  cls: 'standard' | 'warm' | 'cold' | 'ice';
}> = [
  {re: /холодн\w*\s*s3|cold\s*box|coldbox|\bcold\b/i, cls: 'cold'},
  {re: /ледян|icebox|\bice\b(?!\s*lake)/i, cls: 'ice'},
  {re: /\bwarm\b|тепл/i, cls: 'warm'},
  {re: /hotbox|стандарт|\bstandard\b/i, cls: 'standard'},
];

/** Region phrases → soft region token (catalog regions vary by provider). */
const REGION_ALIASES: Record<string, string> = {
  москва: 'ru-central',
  moscow: 'ru-central',
  'ru-central': 'ru-central',
  питер: 'ru-nw',
  спб: 'ru-nw',
  'санкт-петербург': 'ru-nw',
};

/** Provider free-text → catalog provider id. */
export const PROVIDER_ALIASES: Record<string, string> = {
  яндекс: 'yandex-cloud',
  yandex: 'yandex-cloud',
  ycloud: 'yandex-cloud',
  вк: 'vk-cloud',
  vk: 'vk-cloud',
  селектел: 'selectel',
  selectel: 'selectel',
  'cloud.ru': 'cloud-ru',
  cloudru: 'cloud-ru',
  сбер: 'cloud-ru',
  мвс: 'mws-cloud',
  mws: 'mws-cloud',
  мтс: 'mws-cloud',
  т1: 't1-cloud',
  t1: 't1-cloud',
};

const ENTITY_TO_CATEGORY: Partial<Record<CatalogEntityType, string>> = {
  instance_type: 'compute',
  gpu_node: 'gpu',
  storage: 'storage',
  managed_service: 'kubernetes',
  sku: 'compute',
  product: 'compute',
  service: 'compute',
};

export function normalizeGpuModel(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (GPU_ALIASES[key]) return GPU_ALIASES[key];
  for (const [alias, model] of Object.entries(GPU_ALIASES)) {
    if (key.includes(alias)) return model;
  }
  return raw.trim();
}

export function detectDiskMedia(text: string | undefined): 'ssd' | 'nvme' | 'hdd' | undefined {
  if (!text) return undefined;
  for (const {re, media} of DISK_ALIASES) {
    if (re.test(text)) return media;
  }
  return undefined;
}

export function detectStorageClassAlias(
  text: string | undefined,
): 'standard' | 'warm' | 'cold' | 'ice' | undefined {
  if (!text) return undefined;
  for (const {re, cls} of STORAGE_CLASS_ALIASES) {
    if (re.test(text)) return cls;
  }
  return undefined;
}

export function normalizeRegion(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  return REGION_ALIASES[key] ?? raw.trim();
}

export function normalizeProviderIds(raw: string[] | undefined): string[] | undefined {
  if (!raw?.length) return undefined;
  const out: string[] = [];
  for (const p of raw) {
    const key = p.trim().toLowerCase();
    const id = PROVIDER_ALIASES[key] ?? (key.includes('-') || key === 'selectel' ? key : undefined);
    if (id && !out.includes(id)) out.push(id);
  }
  return out.length ? out : undefined;
}

/** Expand entityTypes into a primary catalog category when unambiguous. */
export function categoryFromEntityTypes(
  entityTypes: CatalogEntityType[] | undefined,
): string | undefined {
  if (!entityTypes?.length) return undefined;
  const cats = new Set(
    entityTypes.map((t) => ENTITY_TO_CATEGORY[t]).filter((c): c is string => Boolean(c)),
  );
  if (cats.size === 1) return [...cats][0];
  if (entityTypes.includes('gpu_node')) return 'gpu';
  if (entityTypes.includes('managed_service')) return 'kubernetes';
  if (entityTypes.includes('storage')) return 'storage';
  return undefined;
}

/** Rewrite free-text query tokens through GPU / disk / storage aliases. */
export function expandQueryText(text: string | undefined): string {
  if (!text?.trim()) return '';
  let q = text.trim();
  const gpu = normalizeGpuModel(q);
  if (gpu && gpu !== q && /ашка|а100|h100|l40|l4\b|v100|t4\b/i.test(q)) {
    q = `${q} ${gpu}`;
  }
  const disk = detectDiskMedia(q);
  if (disk === 'nvme' && !/\bnvme\b/i.test(q)) q = `${q} nvme`;
  const storage = detectStorageClassAlias(q);
  if (storage && !new RegExp(storage, 'i').test(q)) q = `${q} ${storage}`;
  return q;
}
