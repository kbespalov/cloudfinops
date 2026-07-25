/**
 * Alias dictionaries + traced normalization for catalog search / compose.
 */

import type {CatalogEntityType, NormalizationResult, NormalizationRule} from './types';

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

const REGION_ALIASES: Record<string, string> = {
  москва: 'ru-central',
  moscow: 'ru-central',
  'ru-central': 'ru-central',
  питер: 'ru-nw',
  спб: 'ru-nw',
  'санкт-петербург': 'ru-nw',
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

export function normalizeGpuModelTraced(
  raw: string | undefined | null,
): NormalizationResult<string | undefined> {
  const original = raw?.trim() || undefined;
  if (!original) return {original: undefined, normalized: undefined, appliedRules: []};
  const key = original.toLowerCase().replace(/\s+/g, ' ');
  if (GPU_ALIASES[key]) {
    return {
      original,
      normalized: GPU_ALIASES[key],
      appliedRules: [
        {field: 'gpu.model', from: original, to: GPU_ALIASES[key]!, ruleId: 'gpu-alias-exact'},
      ],
    };
  }
  for (const [alias, model] of Object.entries(GPU_ALIASES)) {
    if (key.includes(alias)) {
      return {
        original,
        normalized: model,
        appliedRules: [
          {field: 'gpu.model', from: original, to: model, ruleId: 'gpu-alias-contains'},
        ],
      };
    }
  }
  return {original, normalized: original, appliedRules: []};
}

export function normalizeGpuModel(raw: string | undefined | null): string | undefined {
  return normalizeGpuModelTraced(raw).normalized;
}

/**
 * «быстрый диск» → soft preference nvme+ssd (not a hard NVMe constraint).
 */
export function detectDiskMediaPreference(text: string | undefined): {
  media?: 'ssd' | 'nvme' | 'hdd';
  mediaPreference?: Array<'hdd' | 'ssd' | 'nvme'>;
  hardConstraint: boolean;
  rules: NormalizationRule[];
} {
  if (!text) return {hardConstraint: false, rules: []};
  if (/\bnvme\b|нвме/i.test(text)) {
    return {
      media: 'nvme',
      hardConstraint: true,
      rules: [{field: 'storage.media', from: text, to: 'nvme', ruleId: 'disk-nvme-hard'}],
    };
  }
  if (/быстр[а-яёa-z]*\s+диск/i.test(text)) {
    return {
      mediaPreference: ['nvme', 'ssd'],
      hardConstraint: false,
      rules: [
        {
          field: 'storage.mediaPreference',
          from: 'быстрый диск',
          to: 'nvme|ssd',
          ruleId: 'disk-fast-soft',
        },
      ],
    };
  }
  if (/\bssd\b|ссд/i.test(text)) {
    return {
      media: 'ssd',
      hardConstraint: true,
      rules: [{field: 'storage.media', from: text, to: 'ssd', ruleId: 'disk-ssd-hard'}],
    };
  }
  if (/\bhdd\b|хдд/i.test(text)) {
    return {
      media: 'hdd',
      hardConstraint: true,
      rules: [{field: 'storage.media', from: text, to: 'hdd', ruleId: 'disk-hdd-hard'}],
    };
  }
  return {hardConstraint: false, rules: []};
}

export function detectDiskMedia(text: string | undefined): 'ssd' | 'nvme' | 'hdd' | undefined {
  return detectDiskMediaPreference(text).media;
}

export function detectStorageClassAlias(
  text: string | undefined,
): 'standard' | 'warm' | 'cold' | 'ice' | undefined {
  if (!text) return undefined;
  if (/холодн\w*\s*s3|cold\s*box|coldbox|\bcold\b/i.test(text)) return 'cold';
  if (/ледян|icebox|\bice\b(?!\s*lake)/i.test(text)) return 'ice';
  if (/\bwarm\b|тепл/i.test(text)) return 'warm';
  if (/hotbox|стандарт|\bstandard\b/i.test(text)) return 'standard';
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

export function expandQueryText(text: string | undefined): string {
  if (!text?.trim()) return '';
  let q = text.trim();
  const gpu = normalizeGpuModelTraced(q);
  if (gpu.normalized && gpu.appliedRules.length) q = `${q} ${gpu.normalized}`;
  const disk = detectDiskMediaPreference(q);
  if (disk.media === 'nvme' && !/\bnvme\b/i.test(q)) q = `${q} nvme`;
  const storage = detectStorageClassAlias(q);
  if (storage && !new RegExp(storage, 'i').test(q)) q = `${q} ${storage}`;
  return q;
}
