/**
 * Build a short, embedding-friendly document string per catalog meter.
 * Used at index-build time and (optionally) for debugging.
 */
import {
  CATEGORY_TITLE,
  displayMeterName,
  extractAiModelFamily,
  extractGpuModel,
  extractStorageClass,
  paramsLabel,
  type CatalogMeter,
} from '@/lib/catalog';

/** Extra RU/EN hints so paraphrases land near the right meters. */
const METER_ALIASES: Record<string, string[]> = {
  'storage.object.capacity': [
    'S3',
    'object storage',
    'объектное хранилище',
    'бакет',
    'bucket',
    'хранение данных',
  ],
  'storage.object.requests': [
    'S3 requests',
    'операции объектного хранилища',
    'PUT',
    'GET',
    'запросы к S3',
  ],
  'network.egress': ['egress', 'исходящий трафик', 'трафик наружу', 'internet egress'],
  'network.public_ip': ['публичный IP', 'public IPv4', 'белый IP'],
  'compute.gpu': ['GPU', 'видеокарта', 'ускоритель', 'графический процессор'],
  'compute.flavor': ['ВМ', 'виртуальная машина', 'flavor', 'инстанс'],
  'storage.block.capacity': ['блочный диск', 'volume', 'диск ВМ'],
};

const CLASS_ALIASES: Record<string, string[]> = {
  standard: ['Standard', 'стандартный класс', 'Hotbox', 'hot storage'],
  warm: ['Warm', 'тёплый класс', 'teplyi'],
  cold: ['Cold', 'холодный класс', 'Icebox', 'archive-ish cold'],
  ice: [
    'Ice',
    'ледяной класс',
    'глубокий архив',
    'glacier',
    'amazon glacier',
    'заморозить',
    'долгосрочное хранение',
  ],
};

export function meterToEmbedText(meter: CatalogMeter): string {
  const parts: string[] = [
    displayMeterName(meter),
    meter.name,
    meter.sku,
    meter.meter,
    CATEGORY_TITLE[meter.categoryKey] ?? meter.categoryKey,
    meter.providerName,
    paramsLabel(meter),
  ];

  const gpu = extractGpuModel(meter);
  if (gpu) parts.push(gpu, 'GPU', 'видеокарта');

  const ai = extractAiModelFamily(meter);
  if (ai) parts.push(ai, 'инференс', 'токены');

  const cls = extractStorageClass(meter);
  if (cls) {
    parts.push(cls, ...(CLASS_ALIASES[cls] ?? []));
  }

  for (const a of METER_ALIASES[meter.meter] ?? []) parts.push(a);

  const dimBits = Object.entries(meter.dimensions)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}:${v}`);
  if (dimBits.length) parts.push(dimBits.join(' '));

  if (meter.notes) parts.push(meter.notes);

  return parts
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}
