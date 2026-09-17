import {createHash} from 'node:crypto';

export function opaqueId(kind: 'prod' | 'price', ...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 20);
  return `${kind}_${h}`;
}

export function productId(provider: string, sku: string): string {
  return opaqueId('prod', provider, sku);
}

/** A price version includes the complete billing rule; source rechecks do not change it. */
export function priceId(m: import('@/lib/catalog').CatalogMeter): string {
  return opaqueId('price', m.provider, m.sku, JSON.stringify({
    effectiveFrom: m.effectiveFrom, pricingMode: m.pricingMode,
    nativeAmount: m.nativeAmount, nativeVat: m.nativeVat, currency: m.currency,
    unitQuantity: m.unitQuantity, unitPeriod: m.unitPeriod,
    normalizedAmount: m.normalizedAmount, normalizedVat: m.normalizedVat,
    normalizedPeriod: m.normalizedPeriod, normalizedQuantity: m.normalizedQuantity ?? null,
    normalizedCurrency: m.normalizedCurrency ?? null,
    tiers: m.rateTiers ?? null,
  }));
}

export function snapshotVersion(asOf: string, generatedAt: string, taxonomyVersion: string): string {
  const h = createHash('sha256')
    .update(`${asOf}\0${generatedAt}\0${taxonomyVersion}`)
    .digest('hex')
    .slice(0, 10);
  return `cat_${asOf.replace(/-/g, '')}_${h}`;
}
