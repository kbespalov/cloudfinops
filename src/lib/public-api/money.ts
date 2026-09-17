/** Exact rational arithmetic. Round only at the line-item boundary. */
export type Decimal = {n: bigint; d: bigint};
export type Money = {amount: string; currency: string | null};
export class MoneyError extends Error {}

export function parseDecimal(value: string | number): Decimal {
  const input = String(value).trim();
  // JS serializes very small/large numeric quantities in exponent notation.
  if (typeof value === 'number' && /e/i.test(input)) {
    const [coefficient, exponent] = input.toLowerCase().split('e');
    const base = parseDecimal(coefficient), power = Number(exponent);
    return power >= 0 ? {n: base.n * 10n ** BigInt(power), d: base.d} : {n: base.n, d: base.d * 10n ** BigInt(-power)};
  }
  const raw = input;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new MoneyError(`invalid decimal: ${raw}`);
  const [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
  return {n: (raw.startsWith('-') ? -1n : 1n) * BigInt(whole + fraction), d: 10n ** BigInt(fraction.length)};
}
export function addAmounts(a: Decimal, b: Decimal): Decimal {
  return {n: a.n * b.d + b.n * a.d, d: a.d * b.d};
}
export function compareAmounts(a: Decimal, b: Decimal): number {
  const delta = a.n * b.d - b.n * a.d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
export function formatDecimal(value: Decimal, places = 2): string {
  if (!Number.isInteger(places) || places < 0 || places > 1000) throw new MoneyError('invalid precision');
  const factor = 10n ** BigInt(places);
  const abs = value.n < 0n ? -value.n : value.n;
  const scaled = abs * factor;
  const rounded = scaled / value.d + (2n * (scaled % value.d) >= value.d ? 1n : 0n);
  const sign = value.n < 0n && rounded !== 0n ? '-' : '';
  return `${sign}${rounded / factor}${places ? '.' + (rounded % factor).toString().padStart(places, '0') : ''}`;
}
/** Lossless serialization for terminating decimal rates. */
export function decimalString(value: Decimal): string {
  let d = value.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) throw new MoneyError('non-terminating rate');
  const result = formatDecimal(value, Math.max(twos, fives));
  return result.includes('.') ? result.replace(/0+$/, '').replace(/\.$/, '') : result;
}
export function linearAmount(unitPrice: string, consumedQuantity: string, unitQuantity: string): Decimal {
  const p = parseDecimal(unitPrice), q = parseDecimal(consumedQuantity), u = parseDecimal(unitQuantity);
  if (u.n <= 0n) throw new MoneyError('unitQuantity must be positive');
  return {n: p.n * q.n * u.d, d: p.d * q.d * u.n};
}
export function sumAmounts(values: Decimal[]): Decimal { return values.reduce(addAmounts, parseDecimal('0')); }
export function toMoney(value: Decimal, places = 2): Money { return {amount: formatDecimal(value, places), currency: 'RUB'}; }
export function moneyFromNumber(n: number, places = 2): Money { return toMoney(parseDecimal(n), places); }
