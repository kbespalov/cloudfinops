import {
  CATEGORY_TITLE,
  displayAmount,
  displayMeterName,
  formatPlatform,
  meterPriceLabel,
  paramsLabel,
  type CatalogMeter,
  type PeriodMode,
} from '@/lib/catalog';

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
