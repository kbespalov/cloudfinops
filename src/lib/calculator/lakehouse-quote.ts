import {amountNumber, catalog, type CatalogMeter, type PeriodMode} from '@/lib/catalog';
import {isK8sComparableMaster} from '@/lib/chat/search';
import {
  lakeGiBFromTiB,
  type LakehouseNodePool,
  type LakehouseQuoteInput,
} from '@/lib/calculator/lakehouse-presets';
import type {ComputePreset} from '@/lib/calculator/presets';
import {quotePreset, toViewQuote} from '@/lib/calculator/quote';
import {
  formatGiBCapacity,
  type CostPartId,
  type ViewCostPart,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';

function clampHotPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return 24;
  return Math.min(24, Math.max(0, value));
}

function dutyFactor(hoursPerDay: number): number {
  return clampHours(hoursPerDay) / 24;
}

/** Durable multi-AZ standard when available; never pick Cloud.ru/T1 single-zone as default. */
export function pickObjectStorageCapacity(
  provider: string,
  storageClass: 'standard' | 'cold',
): CatalogMeter | null {
  const meters = catalog.meters.filter(
    (m) =>
      m.provider === provider &&
      m.meter === 'storage.object.capacity' &&
      m.status !== 'unavailable',
  );
  if (storageClass === 'cold') {
    return (
      meters.find((m) => String(m.dimensions.storageClass || '').toLowerCase() === 'cold') ?? null
    );
  }

  const standard = meters.filter(
    (m) => String(m.dimensions.storageClass || '').toLowerCase() === 'standard',
  );
  if (standard.length === 0) return null;

  const scored = standard.map((m) => {
    const hay = `${m.sku} ${m.name} ${JSON.stringify(m.dimensions)}`.toLowerCase();
    let score = 0;
    if (hay.includes('multi-zone') || m.dimensions.redundancy === 'multi-zone') score += 4;
    if (hay.includes('single-zone') || m.dimensions.redundancy === 'single-copy') score -= 4;
    if (hay.includes('hotbox')) score += 1;
    return {m, score};
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (amountNumber(a.m, 'month') ?? Number.POSITIVE_INFINITY) -
        (amountNumber(b.m, 'month') ?? Number.POSITIVE_INFINITY),
  );
  return scored[0]?.m ?? null;
}

function periodAmount(meter: CatalogMeter, period: PeriodMode): number | null {
  return amountNumber(meter, period);
}

/**
 * Comparable master for the requested tier only.
 * - No basic→HA fallback: missing HA master ⇒ provider drops out of ranking.
 * - Synthetic HA (e.g. Cloud.ru 3× zonal) is allowed when marked comparableTier=ha
 *   and must be disclosed in the quote (label + note).
 */
export function pickK8sMasterMeter(
  provider: string,
  tier: 'basic' | 'ha',
): {meter: CatalogMeter; effectiveTier: 'basic' | 'ha'; synthetic: boolean} | null {
  const wanted = catalog.meters.find(
    (m) => m.provider === provider && isK8sComparableMaster(m, tier),
  );
  if (!wanted) return null;
  return {
    meter: wanted,
    effectiveTier: tier,
    synthetic: Boolean(wanted.synthetic) || wanted.sku.includes('.synthetic'),
  };
}

function k8sMasterLabel(tier: 'basic' | 'ha', synthetic: boolean): string {
  const base =
    tier === 'ha' ? 'Managed Kubernetes · HA master' : 'Managed Kubernetes · basic master';
  return synthetic ? `${base} *` : base;
}

function k8sSyntheticNote(meter: CatalogMeter, tier: 'basic' | 'ha'): string {
  const masters = Number(meter.dimensions.masterCount);
  const vcpu = Number(meter.dimensions.vcpu);
  const ram = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
  const shape =
    Number.isFinite(vcpu) && Number.isFinite(ram)
      ? tier === 'ha' && Number.isFinite(masters) && masters > 1
        ? `${masters}×(${vcpu} vCPU / ${ram} GiB)`
        : `${vcpu} vCPU / ${ram} GiB`
      : tier === 'ha'
        ? 'несколько мастер-узлов'
        : 'типовой мастер';
  // Short UI disclosure; full explanation lives in catalog SKU notes («Пояснение»).
  if (tier === 'ha') {
    return `* Оценка: в прайсе нет готовой строки «HA-мастер» — считаем как ${shape}. Подробности — в карточке SKU.`;
  }
  return `* Оценка: мастер собран из ставок vCPU/RAM как ${shape}, чтобы сравнивать облака. Подробности — в карточке SKU.`;
}

function poolLabel(kind: 'platform' | 'etl' | 'query', pool: LakehouseNodePool): string {
  const hours = clampHours(pool.hoursPerDay);
  const duty =
    hours >= 24 ? 'always-on' : `${hours.toLocaleString('ru-RU')} ч/день`;
  const role =
    kind === 'platform' ? 'Platform' : kind === 'etl' ? 'ETL / Spark' : 'Query / Trino';
  return `${role}: ${pool.count}× ${pool.vcpu} vCPU / ${pool.ramGiB} GiB · ${duty}`;
}

function quoteNodePoolTotal(
  provider: string,
  pool: LakehouseNodePool,
  period: PeriodMode,
): number | null {
  if (pool.count <= 0 || pool.vcpu <= 0) return 0;
  const preset: ComputePreset = {
    id: `lakehouse-${pool.vcpu}-${pool.ramGiB}-${pool.diskGiB}`,
    kind: 'compute',
    family: 'general',
    title: `${pool.vcpu}/${pool.ramGiB}`,
    subtitle: `${pool.vcpu} vCPU · ${pool.ramGiB} GiB`,
    vcpu: pool.vcpu,
    ramGiB: pool.ramGiB,
    diskGiB: pool.diskGiB,
    diskMedia: 'ssd',
    purchaseModel: 'on-demand',
    vcpuShare: '100%',
  };
  const view = toViewQuote(quotePreset(preset, period));
  const q = view.quotes.find((x) => x.provider === provider);
  if (!q) return null;
  return q.total * pool.count * dutyFactor(pool.hoursPerDay);
}

function storageParts(
  provider: string,
  lakeTiB: number,
  hotPercent: number,
  period: PeriodMode,
): {parts: ViewCostPart[]; note: string | null} | null {
  const totalGiB = lakeGiBFromTiB(lakeTiB);
  if (totalGiB <= 0) return {parts: [], note: null};

  const hot = clampHotPercent(hotPercent);
  const wantColdGiB = Math.round((totalGiB * (100 - hot)) / 100);
  const standardMeter = pickObjectStorageCapacity(provider, 'standard');
  if (!standardMeter) return null;

  const coldMeter = wantColdGiB > 0 ? pickObjectStorageCapacity(provider, 'cold') : null;
  const coldGiB = coldMeter ? wantColdGiB : 0;
  const hotGiB = totalGiB - coldGiB;

  const hotUnit = periodAmount(standardMeter, period);
  if (hotUnit == null) return null;
  const coldUnit = coldMeter ? periodAmount(coldMeter, period) : null;
  const hotAmount = hotGiB > 0 ? hotUnit * hotGiB : 0;
  const coldAmount = coldGiB > 0 && coldUnit != null ? coldUnit * coldGiB : 0;
  const label =
    coldGiB > 0 && coldMeter
      ? `Object Storage · ${formatGiBCapacity(hotGiB)} hot + ${formatGiBCapacity(coldGiB)} cold`
      : `Object Storage standard · ${formatGiBCapacity(hotGiB)}`;

  const parts: ViewCostPart[] = [
    {
      id: 'storage' satisfies CostPartId,
      label,
      amount: hotAmount + coldAmount,
    },
  ];

  let note: string | null = null;
  if (wantColdGiB > 0 && !coldMeter) {
    note =
      'У провайдера нет cold-класса объектного хранилища — весь объём посчитан по тарифу standard (активные данные).';
  }
  return {parts, note};
}

export function quoteLakehouse(
  input: LakehouseQuoteInput,
  period: PeriodMode,
): ViewPresetQuote {
  const quotes: ViewProviderQuote[] = [];

  for (const provider of catalog.providers) {
    const parts: ViewCostPart[] = [];
    const notes: string[] = [];

    const storage = storageParts(provider.id, input.lakeTiB, input.hotPercent, period);
    if (!storage) continue;
    parts.push(...storage.parts);
    if (storage.note) notes.push(storage.note);

    const k8s = pickK8sMasterMeter(provider.id, input.k8sTier);
    if (!k8s) continue;
    const k8sAmount = periodAmount(k8s.meter, period);
    if (k8sAmount == null) continue;
    parts.push({
      id: 'k8s',
      label: k8sMasterLabel(k8s.effectiveTier, k8s.synthetic),
      amount: k8sAmount,
    });
    if (k8s.synthetic) notes.push(k8sSyntheticNote(k8s.meter, k8s.effectiveTier));

    const platformTotal = quoteNodePoolTotal(provider.id, input.platform, period);
    const etlTotal = quoteNodePoolTotal(provider.id, input.etl, period);
    const queryTotal = quoteNodePoolTotal(provider.id, input.query, period);
    if (platformTotal == null || etlTotal == null || queryTotal == null) continue;

    if (platformTotal > 0) {
      parts.push({
        id: 'platform',
        label: poolLabel('platform', input.platform),
        amount: platformTotal,
      });
    }
    if (etlTotal > 0) {
      parts.push({
        id: 'etl',
        label: poolLabel('etl', input.etl),
        amount: etlTotal,
      });
    }
    if (queryTotal > 0) {
      parts.push({
        id: 'query',
        label: poolLabel('query', input.query),
        amount: queryTotal,
      });
    }

    const total = parts.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) continue;

    quotes.push({
      provider: provider.id,
      providerName: provider.name,
      total,
      scope: 'compute',
      parts,
      // Only surface disclosures that change how to read the number (synthetic, cold fallback).
      // Methodology lives in the form HelpMark — don't repeat it on every provider.
      note: notes.length > 0 ? notes.join(' ') : null,
    });
  }

  quotes.sort((a, b) => a.total - b.total);
  return {
    presetId: 'lakehouse',
    quotes,
    alternateQuotes: [],
    best: quotes[0] ?? null,
  };
}
