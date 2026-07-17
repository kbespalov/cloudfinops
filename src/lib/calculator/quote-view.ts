/** Client-safe quote view helpers — no catalog JSON import. */

export type PeriodMode = 'unit' | 'month' | 'year';

export type CostPartId = 'vcpu' | 'ram' | 'disk' | 'gpu' | 'bundle';

export type QuoteScope = 'compute' | 'gpu-only' | 'bundle';

export type ViewCostPart = {
  id: CostPartId;
  label: string;
  amount: number;
};

export type ViewProviderQuote = {
  provider: string;
  providerName: string;
  total: number;
  scope: QuoteScope;
  parts: ViewCostPart[];
  note: string | null;
};

export type ViewPresetQuote = {
  presetId: string;
  quotes: ViewProviderQuote[];
  alternateQuotes: ViewProviderQuote[];
  best: ViewProviderQuote | null;
};

export type QuotesByPeriod = Record<PeriodMode, Record<string, ViewPresetQuote>>;

export function scopeLabel(scope: QuoteScope): string {
  if (scope === 'bundle') return 'vCPU + RAM + GPU';
  if (scope === 'gpu-only') return 'только GPU';
  return 'vCPU + RAM + диск';
}

export function periodShortLabel(period: PeriodMode): string {
  if (period === 'month') return 'мес';
  if (period === 'year') return 'год';
  return 'час';
}

export function formatQuoteAmount(amount: number, period: PeriodMode): string {
  const fractionDigits = period === 'unit' ? 2 : 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function partTone(id: CostPartId): string {
  if (id === 'vcpu') return 'info';
  if (id === 'ram') return 'utility';
  if (id === 'disk') return 'success';
  if (id === 'gpu' || id === 'bundle') return 'warning';
  return 'unknown';
}
