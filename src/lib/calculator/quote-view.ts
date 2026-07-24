/** Client-safe quote view helpers — no catalog JSON import. */

export type PeriodMode = 'unit' | 'month' | 'year';

export type CostPartId = 'vcpu' | 'ram' | 'disk' | 'gpu' | 'bundle' | 'ip';

export type QuoteScope = 'compute' | 'gpu-only' | 'bundle' | 'gpu-synthetic';

export type ViewCostPart = {
  id: CostPartId;
  label: string;
  amount: number;
};

/** Host / flavor summary extracted from quote meters (GPU bundles, flavors). */
export type ViewHostConfig = {
  vcpu?: number;
  ramGiB?: number;
  diskGiB?: number;
  diskLabel?: string | null;
  platformLabel?: string | null;
  scope: QuoteScope;
};

export type ViewProviderQuote = {
  provider: string;
  providerName: string;
  total: number;
  scope: QuoteScope;
  parts: ViewCostPart[];
  note: string | null;
  hostConfig?: ViewHostConfig;
};

export type ViewPresetQuote = {
  presetId: string;
  quotes: ViewProviderQuote[];
  alternateQuotes: ViewProviderQuote[];
  best: ViewProviderQuote | null;
};

/**
 * List/table payload — totals only (no cost parts). Full breakdown loads in the drawer.
 * Cuts RSC hydration from ~500KB+ to ~130KB.
 */
export type ViewProviderQuoteSlim = {
  provider: string;
  providerName: string;
  total: number;
  scope: QuoteScope;
};

export type ViewPresetQuoteSlim = {
  presetId: string;
  quotes: ViewProviderQuoteSlim[];
  best: ViewProviderQuoteSlim | null;
  quoteCount: number;
};

export type QuotesByPeriod = Record<PeriodMode, Record<string, ViewPresetQuote>>;
export type QuotesByPeriodSlim = Record<PeriodMode, Record<string, ViewPresetQuoteSlim>>;

export function toSlimPresetQuote(view: ViewPresetQuote): ViewPresetQuoteSlim {
  const slim = (q: ViewProviderQuote): ViewProviderQuoteSlim => ({
    provider: q.provider,
    providerName: q.providerName,
    total: q.total,
    scope: q.scope,
  });
  return {
    presetId: view.presetId,
    quotes: view.quotes.map(slim),
    best: view.best ? slim(view.best) : null,
    quoteCount: view.quotes.length,
  };
}

export function toSlimQuotesByPeriod(full: QuotesByPeriod): QuotesByPeriodSlim {
  const out = {} as QuotesByPeriodSlim;
  for (const period of ['unit', 'month', 'year'] as const) {
    const record: Record<string, ViewPresetQuoteSlim> = {};
    for (const [id, view] of Object.entries(full[period])) {
      record[id] = toSlimPresetQuote(view);
    }
    out[period] = record;
  }
  return out;
}

/** Scale a one-node quote to N identical replica nodes. */
export function scalePresetQuote(
  view: ViewPresetQuote,
  nodeCount: number,
): ViewPresetQuote {
  const n = Math.max(1, Math.round(nodeCount));
  if (n === 1) return view;
  const scaleQ = (q: ViewProviderQuote): ViewProviderQuote => ({
    ...q,
    total: q.total * n,
    parts: q.parts.map((p) => ({...p, amount: p.amount * n})),
  });
  const quotes = view.quotes.map(scaleQ).sort((a, b) => a.total - b.total);
  const alternateQuotes = view.alternateQuotes
    .map(scaleQ)
    .sort((a, b) => a.total - b.total);
  return {
    presetId: view.presetId,
    quotes,
    alternateQuotes,
    best: quotes[0] ?? null,
  };
}

/** Stable provider column order (matches prices/index.yaml). */
export const CALCULATOR_PROVIDER_IDS = [
  'yandex-cloud',
  'vk-cloud',
  'cloud-ru',
  't1-cloud',
  'selectel',
  'mws-cloud',
] as const;

export type CalculatorProviderId = (typeof CALCULATOR_PROVIDER_IDS)[number];

export const CALCULATOR_PROVIDER_NAMES: Record<CalculatorProviderId, string> = {
  'yandex-cloud': 'Yandex Cloud',
  'vk-cloud': 'VK Cloud',
  'cloud-ru': 'Cloud.ru',
  't1-cloud': 'T1 Cloud',
  selectel: 'Selectel',
  'mws-cloud': 'MWS Cloud Platform',
};

const PLATFORM_LABELS: Record<string, string> = {
  'amd-zen4': 'AMD Zen 4',
  'intel-ice-lake': 'Intel Ice Lake',
  'intel-cascade-lake': 'Intel Cascade Lake',
  'intel-sapphire-rapids': 'Intel Sapphire Rapids',
  'intel-broadwell': 'Intel Broadwell',
  'intel-cascade-or-ice': 'Cascade / Ice Lake',
  unknown: 'Платформа не указана',
};

export function scopeLabel(scope: QuoteScope): string {
  if (scope === 'bundle') return 'vCPU + RAM + GPU';
  if (scope === 'gpu-only') return 'только GPU';
  if (scope === 'gpu-synthetic') return 'GPU + сборка хоста';
  return 'vCPU + RAM + диск';
}

export function periodShortLabel(period: PeriodMode): string {
  if (period === 'month') return 'мес';
  if (period === 'year') return 'год';
  return 'час';
}

/** Full total label for the result card. */
export function periodTotalLabel(period: PeriodMode): string {
  if (period === 'month') return 'Итого в месяц';
  if (period === 'year') return 'Итого в год';
  return 'Итого в час';
}

/** Russian decimal / grouping for UI quantities (GiB, shares, etc.). */
export function formatRuNumber(value: number, maxFractionDigits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : undefined,
  }).format(value);
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

/** Cool steps for cost bars — brand accent stays for selection, not data. */
export function partTone(id: CostPartId): string {
  if (id === 'gpu' || id === 'bundle') return 'info';
  if (id === 'vcpu') return 'utility';
  if (id === 'ram') return 'warning';
  /** Disk uses positive (not success*) — success-* tokens are absent in Gravity themes. */
  if (id === 'disk') return 'positive';
  return 'unknown';
}

/** Format capacity in GiB: 2048 → "2 TiB", 72 → "72 GiB". */
export function formatGiBCapacity(gib: number): string {
  if (!Number.isFinite(gib) || gib <= 0) return '—';
  if (gib >= 1024) {
    const tib = gib / 1024;
    return `${formatRuNumber(tib, 1)} TiB`;
  }
  return `${formatRuNumber(gib, 1)} GiB`;
}

/** @deprecated use formatGiBCapacity */
export function formatRamGiB(ramGiB: number): string {
  return formatGiBCapacity(ramGiB);
}

/**
 * Prefer native platform string from SKU; else map cpuPlatformFamily
 * (intel-ice-lake → Intel Ice Lake).
 */
export function formatPlatformLabel(
  family: string | null | undefined,
  native?: string | null,
): string | null {
  if (native && native.trim() && native.trim().toLowerCase() !== 'unknown') {
    return native.trim();
  }
  if (!family || family === 'unknown') return null;
  if (PLATFORM_LABELS[family]) return PLATFORM_LABELS[family];
  return family
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Human-readable host line for GPU table config column. */
export function formatHostConfigLabel(host: ViewHostConfig): string {
  const bits: string[] = [];
  if (host.vcpu != null && Number.isFinite(host.vcpu)) {
    bits.push(`${host.vcpu} vCPU`);
  }
  if (host.ramGiB != null && Number.isFinite(host.ramGiB)) {
    bits.push(formatGiBCapacity(host.ramGiB));
  }
  if (host.diskGiB != null && Number.isFinite(host.diskGiB)) {
    const media = host.diskLabel ?? 'SSD';
    bits.push(`${formatGiBCapacity(host.diskGiB)} ${media}`);
  }
  if (host.platformLabel) {
    bits.push(host.platformLabel);
  }
  if (bits.length === 0) {
    return scopeLabel(host.scope);
  }
  if (host.scope === 'gpu-only') {
    return `${bits.join(' · ')} · ${scopeLabel('gpu-only')}`;
  }
  return bits.join(' · ');
}
