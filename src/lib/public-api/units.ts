import type {CatalogMeter} from '@/lib/catalog';
import type {PublicUnit} from './constants';
import type {VatMode} from './types';

export function vatMode(raw: string | null | undefined): VatMode {
  return raw === 'included' || raw === 'excluded' ? raw : 'unknown';
}
export function effectiveRate(m: CatalogMeter) {
  const normalized = m.normalizedAmount != null && !m.rateTiers?.length;
  return {
    amount: normalized ? m.normalizedAmount : m.nativeAmount,
    quantity: normalized ? m.normalizedQuantity ?? m.unitQuantity : m.unitQuantity,
    period: normalized ? m.normalizedPeriod ?? m.unitPeriod : m.unitPeriod,
    currency: (normalized ? m.normalizedCurrency ?? m.currency : m.currency) || null,
    vat: vatMode(normalized ? m.normalizedVat : m.nativeVat),
  };
}
export function resolveRawUnit(quantity: string | null, period: string | null) {
  const q = (quantity || '').toLowerCase(), p = (period || '').toLowerCase();
  const pack = q.match(/^(\d+)(k|m)?[- ]?(?:requests?|tokens?)$/);
  const denominator = pack ? String(Number(pack[1]) * (pack[2] === 'm' ? 1e6 : pack[2] === 'k' ? 1000 : 1)) : '1';
  let base = q.includes('request') ? 'operation' : q.includes('token') ? 'token' :
    ({vcpu: 'vcpu', 'gib-ram': 'memory_gib', gpu: 'gpu', accelerator: 'gpu',
      flavor: 'flavor', address: 'ip', ip: 'ip', gib: 'gib', gb: 'gib',
      'gb-gpu': 'gpu_memory_gib', resource: 'resource', master: 'master', gateway: 'gateway',
      iops: 'iops', account: 'account'} as Record<string, string>)[q];
  if (!base) base = 'other';
  const name = (p === 'usage' || !p) ? base : `${base}_${p}`;
  const unit = (PUBLIC_UNIT_SET.has(name) ? name : 'other') as PublicUnit;
  return {unit, unitQuantity: denominator, unitLabel: `${denominator} ${unit === 'other' ? [quantity, period].filter(Boolean).join('/') : unit}`};
}
import {PUBLIC_UNITS} from './constants';
const PUBLIC_UNIT_SET = new Set<string>(PUBLIC_UNITS);
export function resolveUnit(m: CatalogMeter) {
  const r = effectiveRate(m);
  return resolveRawUnit(r.quantity, r.period);
}
export function billableVat(m: CatalogMeter): VatMode { return effectiveRate(m).vat; }
export function hasBillableIncludedRate(m: CatalogMeter): boolean {
  const r = effectiveRate(m);
  return r.vat === 'included' && r.currency === 'RUB' && r.amount != null;
}
