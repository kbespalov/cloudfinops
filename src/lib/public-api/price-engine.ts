import {addAmounts, compareAmounts, decimalString, linearAmount, parseDecimal, toMoney, type Decimal, type Money} from './money';
import type {CatalogMeter, CatalogRateTier} from '@/lib/catalog';
import {MONTH_HOURS} from './constants';
import {meterToPrice} from './product';
import {resolveRawUnit, resolveUnit} from './units';

export function consumedForMonth(meter: CatalogMeter, quantity: number): string {
  const unit = resolveUnit(meter).unit;
  const multiplier = unit.endsWith('_minute') ? MONTH_HOURS * 60 : unit.endsWith('_hour') ? MONTH_HOURS : 1;
  return decimalString(linearAmount(String(quantity), String(multiplier), '1'));
}
export function priceLine(meter: CatalogMeter, quantity: number): {amount: Money; quantity: string} | {error: 'vat' | 'rate' | 'currency' | 'unit'} {
  try {
    const price = meterToPrice(meter);
    if (price.vat !== 'included') return {error: 'vat'};
    if (price.currency !== 'RUB') return {error: 'currency'};
    if (price.unit === 'other') return {error: 'unit'};
    const consumed = consumedForMonth(meter, quantity);
    let amount: Decimal;
    if (price.tiers?.length) {
      amount = applyTiers(meter.rateTiers!, consumed, meter.unitQuantity, meter.unitPeriod);
    } else {
      if (!price.unitPrice) return {error: 'rate'};
      amount = linearAmount(price.unitPrice.amount, consumed, price.unitQuantity);
    }
    if (amount.n < 0n) return {error: 'rate'};
    return {amount: toMoney(amount), quantity: consumed};
  } catch { return {error: 'rate'}; }
}
/** Graduated tiers must cover the entire consumed interval without gaps/overlap. */
export function applyTiers(tiers: CatalogRateTier[], volume: number | string, fallbackQuantity: string | null = null, fallbackPeriod: string | null = null): Decimal {
  const sorted = [...tiers].sort((a,b) => compareAmounts(parseDecimal(a.from), parseDecimal(b.from)));
  const consumed = parseDecimal(volume);
  let end = parseDecimal('0'), total = parseDecimal('0');
  for (const [i, tier] of sorted.entries()) {
    const from = parseDecimal(tier.from);
    if (compareAmounts(from, end) !== 0) throw new Error('tier gap/overlap');
    const to = tier.to == null ? consumed : parseDecimal(tier.to);
    if (tier.to == null && i !== sorted.length - 1) throw new Error('open tier must be last');
    if (tier.to != null && compareAmounts(to, from) <= 0) throw new Error('invalid tier bounds');
    const hi = compareAmounts(to, consumed) < 0 ? to : consumed;
    if (compareAmounts(hi, from) > 0) {
      const span = addAmounts(hi, {n: -from.n, d: from.d});
      const unit = resolveRawUnit(tier.unitQuantity ?? fallbackQuantity, tier.unitPeriod ?? fallbackPeriod);
      const amount = linearAmount(tier.amount, decimalString(span), unit.unitQuantity);
      if (amount.n < 0n) throw new Error('negative rate');
      total = addAmounts(total, amount);
    }
    end = to;
    if (compareAmounts(end, consumed) >= 0) return total;
  }
  throw new Error('uncovered tier volume');
}
