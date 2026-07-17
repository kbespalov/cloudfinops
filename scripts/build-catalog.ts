import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export type CatalogMeter = {
  id: string;
  sku: string;
  name: string;
  meter: string;
  status: string;
  pricingMode: string;
  provider: string;
  providerName: string;
  layer: string;
  service: string;
  category: string;
  categoryKey: CategoryKey;
  region: string | null;
  effectiveFrom: string | null;
  checkedAt: string | null;
  sourceRefs: string[];
  dimensions: Record<string, unknown>;
  notes: string | null;
  priceProvenance: string | null;
  unitQuantity: string | null;
  unitPeriod: string | null;
  nativeAmount: string | null;
  nativeVat: string | null;
  normalizedAmount: string | null;
  normalizedPeriod: string | null;
  normalizedVat: string | null;
  currency: string;
  cpuPlatformFamily: string | null;
  purchaseModel: string | null;
  comparableTier: string | null;
  synthetic: boolean;
};

export type CategoryKey =
  | 'compute'
  | 'gpu'
  | 'storage'
  | 'network'
  | 'kubernetes'
  | 'ai'
  | 'other';

export type CatalogSource = {
  id: string;
  title: string;
  url: string;
  provider: string;
};

export type CatalogData = {
  asOf: string;
  taxonomyVersion: string;
  generatedAt: string;
  meters: CatalogMeter[];
  providers: {id: string; name: string; count: number}[];
  categories: {key: CategoryKey; title: string; count: number}[];
  /** Source id → public pricing/docs link from provider.yaml */
  sources: Record<string, CatalogSource>;
};

const ROOT = path.resolve(__dirname, '..');
const PRICES = path.join(ROOT, 'prices');
const OUT = path.join(ROOT, 'src/data/catalog.generated.json');

const PROVIDER_NAMES: Record<string, string> = {
  'yandex-cloud': 'Yandex Cloud',
  'vk-cloud': 'VK Cloud',
  'cloud-ru': 'Cloud.ru',
  't1-cloud': 'T1 Cloud',
  selectel: 'Selectel',
  'mws-cloud': 'MWS Cloud',
};

function categoryKey(category: string, meter: string, service: string): CategoryKey {
  if (category.includes('gpu') || meter.includes('gpu') || service === 'compute' && meter.includes('gpu')) {
    if (category.includes('.gpu') || meter === 'compute.gpu' || meter === 'compute.flavor' && category.includes('gpu')) {
      return 'gpu';
    }
  }
  if (category.includes('.gpu') || /\/gpu\.yaml$/.test(category)) return 'gpu';
  if (service === 'compute' && (meter.startsWith('compute.gpu') || category.endsWith('.gpu'))) return 'gpu';
  if (category.includes('kubernetes') || meter.includes('kubernetes')) return 'kubernetes';
  if (service === 'ai' || category.includes('.ai.') || meter.startsWith('ai.')) return 'ai';
  // Block disks, VM images and disk snapshots live with Compute; object storage stays Storage
  if (
    meter.startsWith('storage.block') ||
    meter.startsWith('storage.image') ||
    meter.startsWith('storage.snapshot')
  ) {
    return 'compute';
  }
  if (service === 'storage' || category.includes('storage')) return 'storage';
  if (service === 'network' || category.includes('network')) return 'network';
  if (service === 'compute' || category.includes('compute')) return 'compute';
  return 'other';
}

function categoryFromFile(filePath: string, meta: Record<string, string>, meter: string): CategoryKey {
  if (filePath.includes('/compute/gpu.yaml') || meta.category?.includes('.gpu')) return 'gpu';
  if (filePath.includes('managed-kubernetes') || meta.category?.includes('kubernetes')) {
    return 'kubernetes';
  }
  if (filePath.includes('/ai/') || meta.service === 'ai' || meta.category?.includes('.ai.')) {
    return 'ai';
  }
  if (filePath.includes('/storage/') || meta.service === 'storage') {
    if (
      meter.startsWith('storage.block') ||
      meter.startsWith('storage.image') ||
      meter.startsWith('storage.snapshot')
    ) {
      return 'compute';
    }
    return 'storage';
  }
  if (filePath.includes('/network/') || meta.service === 'network') return 'network';
  if (filePath.includes('/compute/') || meta.service === 'compute') {
    if (meter.includes('gpu')) return 'gpu';
    return 'compute';
  }
  return categoryKey(meta.category || '', meter, meta.service || '');
}

function walkYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkYamlFiles(full));
    else if (entry.name.endsWith('.yaml') && entry.name !== 'provider.yaml' && entry.name !== 'index.yaml') {
      out.push(full);
    }
  }
  return out;
}

function loadProviderSources(): Record<string, CatalogSource> {
  const sources: Record<string, CatalogSource> = {};
  for (const entry of fs.readdirSync(PRICES, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const providerFile = path.join(PRICES, entry.name, 'provider.yaml');
    if (!fs.existsSync(providerFile)) continue;
    const data = yaml.load(fs.readFileSync(providerFile, 'utf8')) as {
      metadata?: {id?: string};
      spec?: {
        sources?: Array<{id?: string; title?: string; url?: string}>;
      };
    };
    const providerId = data.metadata?.id || entry.name;
    for (const src of data.spec?.sources || []) {
      if (!src?.id || !src.url) continue;
      sources[src.id] = {
        id: src.id,
        title: src.title || src.id,
        url: src.url,
        provider: providerId,
      };
    }
  }
  return sources;
}

function main() {
  const index = yaml.load(fs.readFileSync(path.join(PRICES, 'index.yaml'), 'utf8')) as {
    metadata: {asOf: string; taxonomyVersion: string};
  };

  const sources = loadProviderSources();
  const meters: CatalogMeter[] = [];

  for (const file of walkYamlFiles(PRICES)) {
    const data = yaml.load(fs.readFileSync(file, 'utf8')) as {
      metadata: {
        provider: string;
        layer: string;
        service: string;
        category: string;
        title?: string;
      };
      spec: {meters: Array<Record<string, unknown>>};
    };
    const meta = data.metadata;
    for (const raw of data.spec.meters || []) {
      const pricing = (raw.pricing as Record<string, unknown>) || {};
      const rate = (pricing.rate as Record<string, unknown>) || {};
      const unit = (rate.unit as Record<string, unknown>) || {};
      const normalized = {...((pricing.normalized as Record<string, unknown>) || {})};
      const nUnit = {...((normalized.unit as Record<string, unknown>) || {})};
      const dimensions = (raw.dimensions as Record<string, unknown>) || {};
      const meter = String(raw.meter || '');
      const unitQuantity = unit.quantity == null ? null : String(unit.quantity);
      const unitPeriod = unit.period == null ? null : String(unit.period);

      // Object API requests: AWS-style pack — price per 10_000 operations
      const REQUEST_PACK = 10_000;
      if (
        (meter === 'storage.object.requests' || unitQuantity === 'request') &&
        rate.amount != null &&
        normalized.amount == null
      ) {
        const perRequest = Number(rate.amount);
        if (Number.isFinite(perRequest)) {
          normalized.amount = String(Number((perRequest * REQUEST_PACK).toFixed(6)));
          normalized.vat = rate.vat ?? 'included';
          nUnit.quantity = '10000-requests';
          nUnit.period = 'usage';
          nUnit.currency = rate.currency || 'RUB';
          normalized.unit = nUnit;
        }
      }

      const cat = categoryFromFile(file, meta as unknown as Record<string, string>, meter);
      const sku = String(raw.sku || '');
      meters.push({
        id: `${meta.provider}:${sku}`,
        sku,
        name: String(raw.name || sku),
        meter,
        status: String(raw.status || 'available'),
        pricingMode: String(raw.pricingMode || 'unit'),
        provider: meta.provider,
        providerName: PROVIDER_NAMES[meta.provider] || meta.provider,
        layer: meta.layer,
        service: meta.service,
        category: meta.category,
        categoryKey: cat,
        region: raw.region == null ? null : String(raw.region),
        effectiveFrom: raw.effectiveFrom == null ? null : String(raw.effectiveFrom),
        checkedAt: raw.checkedAt == null ? null : String(raw.checkedAt),
        sourceRefs: Array.isArray(raw.sourceRefs) ? (raw.sourceRefs as string[]) : [],
        dimensions,
        notes: raw.notes == null ? null : String(raw.notes),
        priceProvenance: raw.priceProvenance == null ? null : String(raw.priceProvenance),
        unitQuantity,
        unitPeriod,
        nativeAmount: rate.amount == null ? null : String(rate.amount),
        nativeVat: rate.vat == null ? null : String(rate.vat),
        normalizedAmount: normalized.amount == null ? null : String(normalized.amount),
        normalizedPeriod: nUnit.period == null ? null : String(nUnit.period),
        normalizedVat: normalized.vat == null ? null : String(normalized.vat),
        currency: String(rate.currency || nUnit.currency || 'RUB'),
        cpuPlatformFamily:
          dimensions.cpuPlatformFamily == null ? null : String(dimensions.cpuPlatformFamily),
        purchaseModel: dimensions.purchaseModel == null ? null : String(dimensions.purchaseModel),
        comparableTier:
          dimensions.comparableTier == null ? null : String(dimensions.comparableTier),
        synthetic: Boolean(dimensions.synthetic) || String(sku).includes('.synthetic'),
      });
    }
  }

  const providerCounts = new Map<string, number>();
  const categoryCounts = new Map<CategoryKey, number>();
  for (const m of meters) {
    providerCounts.set(m.provider, (providerCounts.get(m.provider) || 0) + 1);
    categoryCounts.set(m.categoryKey, (categoryCounts.get(m.categoryKey) || 0) + 1);
  }

  const categoryTitles: Record<CategoryKey, string> = {
    compute: 'Compute',
    gpu: 'GPU',
    storage: 'Storage',
    network: 'Network',
    kubernetes: 'Kubernetes',
    ai: 'AI',
    other: 'Other',
  };

  const catalog: CatalogData = {
    asOf: index.metadata.asOf,
    taxonomyVersion: index.metadata.taxonomyVersion,
    generatedAt: new Date().toISOString(),
    meters,
    providers: [...providerCounts.entries()]
      .map(([id, count]) => ({id, name: PROVIDER_NAMES[id] || id, count}))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    categories: (
      ['compute', 'gpu', 'storage', 'network', 'kubernetes', 'ai', 'other'] as CategoryKey[]
    )
      .filter((key) => (categoryCounts.get(key) || 0) > 0)
      .map((key) => ({key, title: categoryTitles[key], count: categoryCounts.get(key) || 0})),
    sources,
  };

  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  // Compact JSON — faster parse/transfer for the client catalog bundle
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  console.log(`Wrote ${meters.length} meters → ${path.relative(ROOT, OUT)}`);
}

main();
