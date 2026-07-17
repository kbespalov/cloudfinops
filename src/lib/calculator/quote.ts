import {
  amountNumber,
  catalog,
  formatRub,
  type CatalogMeter,
  type PeriodMode,
} from '@/lib/catalog';
import type {CalculatorPreset, ComputePreset, GpuPreset} from '@/lib/calculator/presets';

export type CostPartId = 'vcpu' | 'ram' | 'disk' | 'gpu' | 'bundle';

export type CostPart = {
  id: CostPartId;
  label: string;
  amount: number;
};

/** What a quote's price actually includes, so mixed offers stay comparable. */
export type QuoteScope = 'compute' | 'gpu-only' | 'bundle';

export type ProviderQuote = {
  provider: string;
  providerName: string;
  total: number;
  scope: QuoteScope;
  parts: CostPart[];
  /** Short caveat shown under the quote. */
  note: string | null;
  meters: CatalogMeter[];
};

export function scopeLabel(scope: QuoteScope): string {
  if (scope === 'bundle') return 'vCPU + RAM + GPU';
  if (scope === 'gpu-only') return 'только GPU';
  return 'vCPU + RAM + диск';
}

export type PresetQuoteResult = {
  preset: CalculatorPreset;
  period: PeriodMode;
  quotes: ProviderQuote[];
  best: ProviderQuote | null;
};

function isOnDemand(meter: CatalogMeter): boolean {
  const pm = String(meter.purchaseModel || meter.dimensions.purchaseModel || 'on-demand');
  return !/preempt/i.test(pm);
}

/**
 * Skip SKUs that are priced in the tariff but whose real availability is not
 * confirmed (e.g. T1 "b4" series) — quoting them would advertise a price the
 * user may not actually be able to order.
 */
function isConfirmedAvailable(meter: CatalogMeter): boolean {
  const note = String(meter.notes ?? '');
  if (!note) return true;
  return !/не\s+подтвержд|not\s+confirmed|недоступ|снят[аоы]?\s+с/i.test(note);
}

/**
 * Detects oversubscribed / burstable / fractional vCPU that must not be compared
 * head-to-head with a guaranteed 100% core. Some providers (e.g. T1) express the
 * ratio only in the SKU name ("1:3 vCPU") and leave guaranteedVcpuShare empty.
 */
function isSharedVcpu(meter: CatalogMeter): boolean {
  const share = String(meter.dimensions.guaranteedVcpuShare ?? '');
  const pct = share.match(/(\d+)\s*%/);
  if (pct && Number(pct[1]) < 100) return true;
  const name = String(meter.name || '');
  if (/\b1\s*:\s*[2-9]\d*\b/.test(name)) return true; // oversubscription 1:N (N>1)
  if (/shared|burst|переподписк/i.test(name)) return true;
  return false;
}

function isDedicatedVcpu(meter: CatalogMeter): boolean {
  if (isSharedVcpu(meter)) return false;
  const share = String(meter.dimensions.guaranteedVcpuShare ?? '100%');
  return share === '100%' || share === '1' || share === 'dedicated' || share === '';
}

/**
 * A core with a fractional performance guarantee below 100% (e.g. Yandex 5%/20%/50%
 * burstable). These do not deliver N full vCPUs and carry hard limits on core/RAM
 * counts, so quoting "8 vCPU" on a 5% core would be misleading — excluded even from
 * the low-cost tier, which still relies on 100% preemptible / oversubscribed cores.
 */
function isFractionalGuarantee(meter: CatalogMeter): boolean {
  const share = String(meter.dimensions.guaranteedVcpuShare ?? '');
  const pct = share.match(/(\d+)\s*%/);
  return Boolean(pct) && Number(pct![1]) < 100;
}

function meterHourlyOrPeriodAmount(meter: CatalogMeter, period: PeriodMode): number | null {
  return amountNumber(meter, period);
}

function regionKey(meter: CatalogMeter): string {
  return String(meter.region ?? '');
}

function platformKey(meter: CatalogMeter): string {
  return String(meter.dimensions.cpuPlatformFamily ?? '');
}

/**
 * RAM must be orderable together with the chosen vCPU: same region and, when both
 * expose a CPU platform, the same platform (providers price RAM per platform, so a
 * cross-platform mix is not a real SKU). RAM with no platform (billed uniformly)
 * is compatible with anything in the region.
 */
function ramCompatible(vcpu: CatalogMeter, ram: CatalogMeter): boolean {
  if (regionKey(vcpu) !== regionKey(ram)) return false;
  const vp = platformKey(vcpu);
  const rp = platformKey(ram);
  if (vp && rp && vp !== rp) return false;
  return true;
}

function isSsd(meter: CatalogMeter): boolean {
  const hay = `${meter.dimensions.performanceTier || ''} ${meter.dimensions.storageMedia || ''} ${meter.name}`.toLowerCase();
  return /ssd|nvme/.test(hay) && !/hdd/.test(hay);
}

type PricedMeter = {m: CatalogMeter; unit: number};

function pricedList(
  provider: string,
  meter: string,
  period: PeriodMode,
  predicate: (m: CatalogMeter) => boolean,
): PricedMeter[] {
  return catalog.meters
    .filter(
      (m) =>
        m.provider === provider &&
        m.meter === meter &&
        m.status === 'available' &&
        isConfirmedAvailable(m) &&
        predicate(m),
    )
    .map((m) => ({m, unit: meterHourlyOrPeriodAmount(m, period) ?? NaN}))
    .filter((x) => Number.isFinite(x.unit) && x.unit > 0)
    .sort((a, b) => a.unit - b.unit);
}

type ComputeCombo = {vcpu: PricedMeter; ram: PricedMeter; disk: PricedMeter | null; total: number};

/**
 * Picks the cheapest *orderable* vCPU + RAM (+ SSD disk) combination for a provider:
 * every component shares one region and vCPU/RAM share a CPU platform, so the
 * quoted price is something a client can actually provision.
 */
function pickComputeCombo(
  provider: string,
  preset: ComputePreset,
  period: PeriodMode,
  lowCost: boolean,
): ComputeCombo | null {
  const vcpuPred = lowCost
    ? (m: CatalogMeter) => !isFractionalGuarantee(m)
    : (m: CatalogMeter) => isOnDemand(m);
  const componentPred = lowCost ? () => true : (m: CatalogMeter) => isOnDemand(m);

  let vcpus = pricedList(provider, 'compute.vcpu', period, vcpuPred);
  // For on-demand tiers prefer guaranteed (dedicated) cores; fall back to any.
  if (!lowCost) {
    const dedicated = vcpus.filter((x) => isDedicatedVcpu(x.m));
    if (dedicated.length) vcpus = dedicated;
  }
  if (!vcpus.length) return null;

  const rams = pricedList(provider, 'compute.ram', period, componentPred);
  const disks = pricedList(provider, 'storage.block.capacity', period, componentPred);
  const providerHasDisks = disks.length > 0;

  let best: ComputeCombo | null = null;
  for (const vcpu of vcpus) {
    const ram = rams.find((r) => ramCompatible(vcpu.m, r.m));
    if (!ram) continue;
    const sameRegionDisks = disks.filter((disk) => regionKey(disk.m) === regionKey(vcpu.m));
    const disk =
      sameRegionDisks.find((disk) => isSsd(disk.m)) ?? sameRegionDisks[0] ?? null;
    // A real VM needs a boot disk: if the provider sells block storage but none is
    // available in this vCPU's region, the combo is not orderable — skip it.
    if (providerHasDisks && !disk) continue;
    const total =
      vcpu.unit * preset.vcpu +
      ram.unit * preset.ramGiB +
      (disk ? disk.unit * preset.diskGiB : 0);
    if (!best || total < best.total) best = {vcpu, ram, disk, total};
  }
  return best;
}

/** Note describing what the chosen vCPU actually is, so the price is not oversold. */
function computeNote(vcpu: CatalogMeter, lowCost: boolean): string {
  const preemptible = /preempt/i.test(String(vcpu.dimensions.purchaseModel ?? '')) ||
    /preempt/i.test(vcpu.name);
  if (preemptible) {
    return 'Preemptible: цена ниже, но инстанс может быть вытеснен провайдером. Диск — SSD.';
  }
  if (isSharedVcpu(vcpu)) {
    return 'Shared vCPU (переподписка ядра) — бюджетный вариант. Диск — SSD.';
  }
  if (lowCost) {
    return 'On-demand, выделенные ядра — отдельного preemptible-тарифа у провайдера нет. Диск — SSD.';
  }
  return 'On-demand, выделенные (100%) ядра. Диск — оценка SSD.';
}

function quoteCompute(preset: ComputePreset, period: PeriodMode): ProviderQuote[] {
  const quotes: ProviderQuote[] = [];
  const lowCost = preset.family === 'low-cost';

  for (const provider of catalog.providers) {
    const combo = pickComputeCombo(provider.id, preset, period, lowCost);
    if (!combo) continue;

    const parts: CostPart[] = [
      {id: 'vcpu', label: `${preset.vcpu} vCPU`, amount: combo.vcpu.unit * preset.vcpu},
      {id: 'ram', label: `${preset.ramGiB} GiB RAM`, amount: combo.ram.unit * preset.ramGiB},
    ];
    const meters: CatalogMeter[] = [combo.vcpu.m, combo.ram.m];

    if (combo.disk) {
      parts.push({
        id: 'disk',
        label: `${preset.diskGiB} GiB SSD`,
        amount: combo.disk.unit * preset.diskGiB,
      });
      meters.push(combo.disk.m);
    }

    const total = parts.reduce((s, p) => s + p.amount, 0);
    quotes.push({
      provider: provider.id,
      providerName: provider.name,
      total,
      scope: 'compute',
      parts,
      note: computeNote(combo.vcpu.m, lowCost),
      meters,
    });
  }

  return quotes.sort((a, b) => a.total - b.total);
}

function gpuModelMatches(meter: CatalogMeter, match: string): boolean {
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  if (match.toUpperCase() === 'L4') {
    // Avoid L40 / L40S
    return /\bL4\b/i.test(model) && !/L40/i.test(model) && !/vGPU/i.test(model);
  }
  if (match.toUpperCase() === 'H100') {
    return /H100/i.test(model) && !/H200/i.test(model);
  }
  return new RegExp(match, 'i').test(model);
}

function quoteGpu(preset: GpuPreset, period: PeriodMode): ProviderQuote[] {
  const quotes: ProviderQuote[] = [];

  for (const provider of catalog.providers) {
    const candidates = catalog.meters.filter((m) => {
      if (m.provider !== provider.id || m.categoryKey !== 'gpu') return false;
      if (m.status !== 'available') return false;
      if (!isConfirmedAvailable(m)) return false;
      if (!isOnDemand(m)) return false;
      if (!gpuModelMatches(m, preset.gpuModelMatch)) return false;
      const count =
        typeof m.dimensions.gpuCount === 'number' ? m.dimensions.gpuCount : preset.gpuCount;
      return count === preset.gpuCount;
    });

    const priced = candidates
      .map((m) => ({m, amount: meterHourlyOrPeriodAmount(m, period)}))
      .filter((x): x is {m: CatalogMeter; amount: number} => x.amount != null && x.amount > 0)
      .sort((a, b) => {
        // Prefer bundles when requested (full node), else prefer unit GPU rates
        const aBundle = a.m.pricingMode === 'bundle' ? 0 : 1;
        const bBundle = b.m.pricingMode === 'bundle' ? 0 : 1;
        if (preset.preferBundle && aBundle !== bBundle) return aBundle - bBundle;
        if (!preset.preferBundle && aBundle !== bBundle) return bBundle - aBundle;
        return a.amount - b.amount;
      });

    const best = priced[0];
    if (!best) continue;

    const isBundle = best.m.pricingMode === 'bundle' || best.m.unitQuantity === 'flavor';
    const parts: CostPart[] = isBundle
      ? [{id: 'bundle', label: 'Конфигурация (vCPU+RAM+GPU)', amount: best.amount}]
      : [{id: 'gpu', label: `${preset.title} GPU`, amount: best.amount}];

    quotes.push({
      provider: provider.id,
      providerName: provider.name,
      total: best.amount,
      scope: isBundle ? 'bundle' : 'gpu-only',
      parts,
      note: isBundle
        ? 'Цена flavor целиком (ядра и память включены).'
        : 'Только GPU; vCPU и RAM у провайдера обычно отдельно.',
      meters: [best.m],
    });
  }

  return quotes.sort((a, b) => a.total - b.total);
}

export function quotePreset(
  preset: CalculatorPreset,
  period: PeriodMode = 'month',
): PresetQuoteResult {
  const quotes = preset.kind === 'compute' ? quoteCompute(preset, period) : quoteGpu(preset, period);
  return {
    preset,
    period,
    quotes,
    best: quotes[0] ?? null,
  };
}

export function formatQuoteAmount(amount: number, period: PeriodMode): string {
  return formatRub(amount, period === 'unit' ? 2 : 0);
}

export function periodShortLabel(period: PeriodMode): string {
  if (period === 'month') return 'мес';
  if (period === 'year') return 'год';
  return 'час';
}

export function partTone(id: CostPartId): string {
  if (id === 'vcpu') return 'info';
  if (id === 'ram') return 'utility';
  if (id === 'disk') return 'success';
  if (id === 'gpu' || id === 'bundle') return 'warning';
  return 'unknown';
}
