import {
  CATEGORY_TITLE,
  displayAmount,
  displayMeterName,
  extractAiModelKey,
  extractDiskIopsLimits,
  formatParameterCount,
  formatPlatform,
  isAiTokenMeter,
  isOpenWeightAiMeter,
  meterPriceLabel,
  paramsLabel,
  type CatalogMeter,
  type PeriodMode,
} from '@/lib/catalog';

/**
 * Second CTA «Развернуть» only for open-weight AI *model token* SKUs.
 * Alice / YandexGPT / GigaChat stay compare-only; FMC/ML-infra stubs excluded.
 */
export function canSelfHostAiMeter(meter: CatalogMeter): boolean {
  if (!isOpenWeightAiMeter(meter) || !isAiTokenMeter(meter)) return false;
  if (!extractAiModelKey(meter)) return false;
  const cap = meter.dimensions.modelCapability;
  // Embeddings / speech / image — not LLM self-host recipes.
  if (typeof cap === 'string' && cap !== 'text-generation') return false;
  return true;
}

/** Human model label for chat prompts (strip input/output token direction). */
export function aiModelLabelForPrompt(meter: CatalogMeter): string {
  const dims = meter.dimensions;
  const family = typeof dims.modelFamily === 'string' ? dims.modelFamily.trim() : '';
  if (family) return family;
  const modelId = typeof dims.modelId === 'string' ? dims.modelId.trim() : '';
  if (modelId) return modelId;
  return displayMeterName(meter)
    .replace(/\s*[·•|]\s*(input|output|вход|выход)\b.*$/i, '')
    .trim();
}

/**
 * Chat prompt: pick dedicated/self-host GPU config for this AI model
 * (recommend_inference_infra path).
 */
export function buildSkuSelfHostPrompt(meter: CatalogMeter): string {
  const model = aiModelLabelForPrompt(meter);
  const size = formatParameterCount(meter);
  const sizeBit = size ? ` (${size})` : '';
  return [
    `Какая GPU-инфраструктура нужна, чтобы развернуть «${model}»${sizeBit} self-host / dedicated в РФ-облаках?`,
    'Подбери число карт, квант и сравни цены узлов по провайдерам.',
    'Если модель есть как hosted API — коротко сравни TCO с токенами.',
  ].join(' ');
}

/** Build a chat prompt that asks the assistant to find nearest analogs and compare prices. */
export function buildSkuComparePrompt(meter: CatalogMeter, period: PeriodMode): string {
  const name = displayMeterName(meter);
  const lines = [
    `Сравни с другими провайдерами: «${name}» (${meter.sku}) у ${meter.providerName}.`,
    `Категория: ${CATEGORY_TITLE[meter.categoryKey]}.`,
  ];

  const params = paramsLabel(meter);
  if (params && params !== '—') {
    lines.push(`Конфигурация: ${params}.`);
  }

  const platform = formatPlatform(meter.cpuPlatformFamily);
  if (platform && platform !== 'Платформа не указана') {
    lines.push(`Платформа: ${platform}.`);
  }

  const iops = extractDiskIopsLimits(meter);
  if (iops.included != null || iops.maximum != null) {
    const base = iops.included != null ? iops.included.toLocaleString('ru-RU') : '—';
    const max = iops.maximum != null ? iops.maximum.toLocaleString('ru-RU') : '—';
    if (iops.chargedSeparately === false) {
      lines.push(
        `IOPS диска: фиксировано до ${max} (входят в цену объёма, отдельной ставки за IOPS нет).`,
      );
    } else {
      lines.push(
        `IOPS диска: база ${base} (в цене объёма), макс. ${max}. Ставка ₽/IOPS — только сверх базы; сравнивай с аналогами того же класса производительности.`,
      );
    }
  }

  const amount = displayAmount(meter, period);
  const pricePart = amount
    ? `${amount} ${meterPriceLabel(meter, period)}`
    : `цена в каталоге не указана · ориентир: ${meterPriceLabel(meter, period)}`;
  lines.push(`Цена сейчас: ${pricePart}.`);

  lines.push(
    'Найди ближайшие аналоги у других провайдеров (если точного SKU нет — ближайшее по смыслу: тот же тип ресурса, платформа и доля ядра где применимо) и сравни цены в одной таблице. Отметь отличия, если аналоги неполные.',
  );

  return lines.join(' ');
}
