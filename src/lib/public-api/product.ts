import type {CatalogMeter} from '@/lib/catalog';
import {catalog, extractGpuCount, extractGpuModel, extractRamGiB, extractStorageClass, extractVcpu} from '@/lib/catalog';
import {priceId, productId} from './ids';
import {decimalString, parseDecimal, linearAmount, type Money} from './money';
import {effectiveRate, resolveUnit, resolveRawUnit, vatMode} from './units';
import type {PriceTier, PublicPrice, PublicProduct} from './types';

const CANON_KEYS = new Set([
  'vcpu',
  'ramGiB',
  'ramGb',
  'gpuModel',
  'gpuCount',
  'purchaseModel',
  'storageClass',
  'pricingMode',
]);

export function meterToProduct(meter: CatalogMeter): PublicProduct {
  const price = meterToPrice(meter);

  const source = meter.sourceRefs[0]
    ? catalog.sources[meter.sourceRefs[0]]
    : undefined;

  const dims = meter.dimensions;
  const providerAttributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dims)) {
    if (!CANON_KEYS.has(k)) providerAttributes[k] = v;
  }

  return {
    id: productId(meter.provider, meter.sku),
    providerSku: meter.sku,
    name: meter.name,
    status: meter.status,
    provider: {id: meter.provider, name: meter.providerName},
    category: meter.categoryKey,
    meter: meter.meter,
    region: meter.region,
    regionCode: regionCode(meter.region),
    derived: Boolean(meter.synthetic),
    attributes: {
      vcpu: extractVcpu(meter),
      memoryGiB: extractRamGiB(meter),
      gpuModel: extractGpuModel(meter),
      gpuCount: extractGpuCount(meter),
      purchaseModel: meter.purchaseModel,
      pricingMode: meter.pricingMode,
      storageClass: extractStorageClass(meter),
      region: meter.region,
    },
    providerAttributes,
    prices: [price],
    source: {
      id: source?.id ?? meter.sourceRefs[0] ?? null,
      title: source?.title ?? null,
      url: source?.url ?? null,
      checkedAt: meter.checkedAt,
    },
  };
}

export function meterToPrice(meter: CatalogMeter): PublicPrice {
  const rate = effectiveRate(meter);
  const unit = resolveUnit(meter);
  const rawTiers = meter.rateTiers ?? [];
  const tiers = rawTiers.map((t): PriceTier => {
    const tierUnit = resolveRawUnit(t.unitQuantity ?? rate.quantity, t.unitPeriod ?? rate.period);
    if (tierUnit.unit !== unit.unit) throw new Error(`Inconsistent tier unit: ${meter.id}`);
    return {
      from: t.from, to: t.to,
      unitPrice: {amount: decimalString(linearAmount(t.amount, unit.unitQuantity, tierUnit.unitQuantity)), currency: t.currency ?? rate.currency},
    };
  });
  const vats = new Set(rawTiers.map(t => vatMode(t.vat ?? meter.nativeVat)));
  const currencies = new Set(tiers.map(t => t.unitPrice.currency));
  return {
    id: priceId(meter),
    model: tiers.length ? 'tiered' : meter.pricingMode === 'bundle' ? 'fixed' : 'per_unit',
    ...unit,
    unitPrice: tiers.length || rate.amount == null ? null : {amount: decimalString(parseDecimal(rate.amount)), currency: rate.currency},
    tiers: tiers.length ? tiers : null,
    vat: tiers.length ? vats.size === 1 ? [...vats][0] : 'unknown' : rate.vat,
    currency: tiers.length ? currencies.size === 1 ? [...currencies][0] : null : rate.currency,
    effectiveFrom: meter.effectiveFrom, checkedAt: meter.checkedAt,
  };
}

export function regionCode(label: string | null): string | null {
  if (!label) return null;
  const m = label.match(/\b(ru-\d+[a-z]?|ru-central\d*(?:-[a-z])?|kz-\d+[a-z]?)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export function findMeterByProductId(
  id: string,
  meters: readonly CatalogMeter[] = catalog.meters,
): CatalogMeter | undefined {
  if (!/^prod_[a-f0-9]{20}$/.test(id)) return undefined;
  return meters.find(m => productId(m.provider, m.sku) === id);
}
