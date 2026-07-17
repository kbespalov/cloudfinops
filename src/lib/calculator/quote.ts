import {
  amountNumber,
  catalog,
  type CatalogMeter,
  type PeriodMode,
} from '@/lib/catalog';
import {
  COMPUTE_PRESETS,
  GPU_PRESETS,
  type CalculatorPreset,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  formatQuoteAmount,
  periodShortLabel,
  partTone,
  scopeLabel,
  type CostPartId,
  type QuoteScope,
  type QuotesByPeriod,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';

export type {CostPartId, QuoteScope};
export {formatQuoteAmount, periodShortLabel, partTone, scopeLabel};

export type CostPart = {
  id: CostPartId;
  label: string;
  amount: number;
};

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

export type PresetQuoteResult = {
  preset: CalculatorPreset;
  period: PeriodMode;
  /**
   * Primary ranking used for Best offer — always one comparable scope.
   * For GPU: either gpu-only or bundle (never mixed).
   */
  quotes: ProviderQuote[];
  /**
   * GPU only: offers of the other scope (bundle vs unit), kept out of the
   * primary sort so we never crown a gpu-only SKU as "cheaper" than a full VM.
   */
  alternateQuotes: ProviderQuote[];
  best: ProviderQuote | null;
};

type MeterIndex = {
  /** `${providerId}|${meter}` → meters */
  byKey: Map<string, CatalogMeter[]>;
  /** providerId → GPU category meters */
  gpuByProvider: Map<string, CatalogMeter[]>;
};

let meterIndex: MeterIndex | null = null;

function getMeterIndex(): MeterIndex {
  if (meterIndex) return meterIndex;
  const byKey = new Map<string, CatalogMeter[]>();
  const gpuByProvider = new Map<string, CatalogMeter[]>();
  for (const m of catalog.meters) {
    const key = `${m.provider}|${m.meter}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(m);
    else byKey.set(key, [m]);
    if (m.categoryKey === 'gpu') {
      const gpuBucket = gpuByProvider.get(m.provider);
      if (gpuBucket) gpuBucket.push(m);
      else gpuByProvider.set(m.provider, [m]);
    }
  }
  meterIndex = {byKey, gpuByProvider};
  return meterIndex;
}

/** Test / hot-reload helper. */
export function resetMeterIndexForTests(): void {
  meterIndex = null;
}

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
  const rows = getMeterIndex().byKey.get(`${provider}|${meter}`) ?? [];
  return rows
    .filter((m) => m.status === 'available' && isConfirmedAvailable(m) && predicate(m))
    .map((m) => ({m, unit: meterHourlyOrPeriodAmount(m, period) ?? NaN}))
    .filter((x) => Number.isFinite(x.unit) && x.unit > 0)
    .sort((a, b) => a.unit - b.unit);
}

type UnitComputeCombo = {
  kind: 'unit';
  vcpu: PricedMeter;
  ram: PricedMeter;
  disk: PricedMeter | null;
  total: number;
};

type FlavorComputeCombo = {
  kind: 'flavor';
  flavor: PricedMeter;
  disk: PricedMeter | null;
  total: number;
};

type ComputeCombo = UnitComputeCombo | FlavorComputeCombo;

function flavorVcpu(meter: CatalogMeter): number {
  return Number(meter.dimensions.vcpu ?? NaN);
}

function flavorRamGiB(meter: CatalogMeter): number {
  return Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb ?? NaN);
}

function pickDiskForRegion(
  provider: string,
  period: PeriodMode,
  lowCost: boolean,
  region: string,
): PricedMeter | null {
  const componentPred = lowCost ? () => true : (m: CatalogMeter) => isOnDemand(m);
  const disks = pricedList(provider, 'storage.block.capacity', period, componentPred);
  const sameRegion = disks.filter((disk) => regionKey(disk.m) === region);
  return sameRegion.find((disk) => isSsd(disk.m)) ?? sameRegion[0] ?? null;
}

/**
 * Picks the cheapest *orderable* vCPU + RAM (+ SSD disk) combination for a provider:
 * every component shares one region and vCPU/RAM share a CPU platform, so the
 * quoted price is something a client can actually provision.
 */
function pickUnitComputeCombo(
  provider: string,
  preset: ComputePreset,
  period: PeriodMode,
  lowCost: boolean,
): UnitComputeCombo | null {
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

  let best: UnitComputeCombo | null = null;
  for (const vcpu of vcpus) {
    const ram = rams.find((r) => ramCompatible(vcpu.m, r.m));
    if (!ram) continue;
    const disk = pickDiskForRegion(provider, period, lowCost, regionKey(vcpu.m));
    // A real VM needs a boot disk: if the provider sells block storage but none is
    // available in this vCPU's region, the combo is not orderable — skip it.
    if (providerHasDisks && !disk) continue;
    const total =
      vcpu.unit * preset.vcpu +
      ram.unit * preset.ramGiB +
      (disk ? disk.unit * preset.diskGiB : 0);
    if (!best || total < best.total) best = {kind: 'unit', vcpu, ram, disk, total};
  }
  return best;
}

/**
 * Providers like Cloud.ru publish fixed VM flavors (vCPU+RAM bundle) instead of
 * unit vCPU/RAM rates. Match an exact flavor for the preset, then add SSD.
 */
function pickFlavorComputeCombo(
  provider: string,
  preset: ComputePreset,
  period: PeriodMode,
  lowCost: boolean,
): FlavorComputeCombo | null {
  const flavors = pricedList(provider, 'compute.flavor', period, (m) => {
    if (m.categoryKey !== 'compute') return false;
    if (flavorVcpu(m) !== preset.vcpu || flavorRamGiB(m) !== preset.ramGiB) return false;
    if (!lowCost) {
      if (!isOnDemand(m)) return false;
      // General / High CPU / High Memory: only dedicated 100% flavors.
      if (isFractionalGuarantee(m) || isSharedVcpu(m)) return false;
      return true;
    }
    // Low-cost: fractional flavors (10%/30%) are allowed — that is the cheap tier.
    return true;
  });
  const flavor = flavors[0];
  if (!flavor) return null;

  const disks = pricedList(
    provider,
    'storage.block.capacity',
    period,
    lowCost ? () => true : (m) => isOnDemand(m),
  );
  const disk = pickDiskForRegion(provider, period, lowCost, regionKey(flavor.m));
  if (disks.length > 0 && !disk) return null;

  const total = flavor.unit + (disk ? disk.unit * preset.diskGiB : 0);
  return {kind: 'flavor', flavor, disk, total};
}

function pickComputeCombo(
  provider: string,
  preset: ComputePreset,
  period: PeriodMode,
  lowCost: boolean,
): ComputeCombo | null {
  const unit = pickUnitComputeCombo(provider, preset, period, lowCost);
  const flavor = pickFlavorComputeCombo(provider, preset, period, lowCost);
  if (unit && flavor) return flavor.total < unit.total ? flavor : unit;
  return unit ?? flavor;
}

/** Note describing what the chosen vCPU / flavor actually is, so the price is not oversold. */
function computeNote(meter: CatalogMeter, lowCost: boolean, flavor: boolean): string {
  if (flavor) {
    if (isFractionalGuarantee(meter) || isSharedVcpu(meter)) {
      return 'Flavor с долей vCPU <100% — бюджетный вариант. Диск SSD отдельно.';
    }
    return 'Flavor целиком (vCPU+RAM одним SKU). Диск SSD отдельно.';
  }
  const preemptible =
    /preempt/i.test(String(meter.dimensions.purchaseModel ?? '')) ||
    /preempt/i.test(meter.name);
  if (preemptible) {
    return 'Preemptible: цена ниже, но инстанс может быть вытеснен провайдером. Диск — SSD.';
  }
  if (isSharedVcpu(meter)) {
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

    let parts: CostPart[];
    let meters: CatalogMeter[];
    let noteMeter: CatalogMeter;

    if (combo.kind === 'flavor') {
      noteMeter = combo.flavor.m;
      parts = [
        {
          id: 'bundle',
          label: `${preset.vcpu} vCPU + ${preset.ramGiB} GiB RAM`,
          amount: combo.flavor.unit,
        },
      ];
      meters = [combo.flavor.m];
      if (combo.disk) {
        parts.push({
          id: 'disk',
          label: `${preset.diskGiB} GiB SSD`,
          amount: combo.disk.unit * preset.diskGiB,
        });
        meters.push(combo.disk.m);
      }
    } else {
      noteMeter = combo.vcpu.m;
      parts = [
        {id: 'vcpu', label: `${preset.vcpu} vCPU`, amount: combo.vcpu.unit * preset.vcpu},
        {id: 'ram', label: `${preset.ramGiB} GiB RAM`, amount: combo.ram.unit * preset.ramGiB},
      ];
      meters = [combo.vcpu.m, combo.ram.m];
      if (combo.disk) {
        parts.push({
          id: 'disk',
          label: `${preset.diskGiB} GiB SSD`,
          amount: combo.disk.unit * preset.diskGiB,
        });
        meters.push(combo.disk.m);
      }
    }

    const total = parts.reduce((s, p) => s + p.amount, 0);
    quotes.push({
      provider: provider.id,
      providerName: provider.name,
      total,
      scope: 'compute',
      parts,
      note: computeNote(noteMeter, lowCost, combo.kind === 'flavor'),
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

function isGpuBundle(meter: CatalogMeter): boolean {
  return meter.pricingMode === 'bundle' || meter.unitQuantity === 'flavor';
}

function buildGpuQuote(
  provider: {id: string; name: string},
  preset: GpuPreset,
  meter: CatalogMeter,
  amount: number,
  bundle: boolean,
): ProviderQuote {
  return {
    provider: provider.id,
    providerName: provider.name,
    total: amount,
    scope: bundle ? 'bundle' : 'gpu-only',
    parts: bundle
      ? [{id: 'bundle', label: 'Конфигурация (vCPU+RAM+GPU)', amount}]
      : [{id: 'gpu', label: `${preset.title} GPU`, amount}],
    note: bundle
      ? 'Цена flavor целиком (ядра и память включены).'
      : 'Только GPU; vCPU и RAM у провайдера обычно отдельно.',
    meters: [meter],
  };
}

/**
 * GPU quotes are split by scope: primary list never mixes gpu-only with bundle,
 * so Best offer compares like with like. The other scope lands in alternateQuotes.
 */
function quoteGpu(
  preset: GpuPreset,
  period: PeriodMode,
): {primary: ProviderQuote[]; alternate: ProviderQuote[]} {
  const unitQuotes: ProviderQuote[] = [];
  const bundleQuotes: ProviderQuote[] = [];
  const index = getMeterIndex();

  for (const provider of catalog.providers) {
    const candidates = (index.gpuByProvider.get(provider.id) ?? []).filter((m) => {
      if (m.status !== 'available') return false;
      if (!isConfirmedAvailable(m)) return false;
      if (!isOnDemand(m)) return false;
      if (!gpuModelMatches(m, preset.gpuModelMatch)) return false;
      const count =
        typeof m.dimensions.gpuCount === 'number' ? m.dimensions.gpuCount : preset.gpuCount;
      return count === preset.gpuCount;
    });

    let bestUnit: {m: CatalogMeter; amount: number} | null = null;
    let bestBundle: {m: CatalogMeter; amount: number} | null = null;

    for (const m of candidates) {
      const amount = meterHourlyOrPeriodAmount(m, period);
      if (amount == null || amount <= 0) continue;
      if (isGpuBundle(m)) {
        if (!bestBundle || amount < bestBundle.amount) bestBundle = {m, amount};
      } else if (!bestUnit || amount < bestUnit.amount) {
        bestUnit = {m, amount};
      }
    }

    if (bestUnit) {
      unitQuotes.push(buildGpuQuote(provider, preset, bestUnit.m, bestUnit.amount, false));
    }
    if (bestBundle) {
      bundleQuotes.push(buildGpuQuote(provider, preset, bestBundle.m, bestBundle.amount, true));
    }
  }

  unitQuotes.sort((a, b) => a.total - b.total);
  bundleQuotes.sort((a, b) => a.total - b.total);

  if (preset.preferBundle) {
    return {primary: bundleQuotes, alternate: unitQuotes};
  }
  // Default GPU cards: rank unit rates; keep flavors as a separate shelf.
  return {primary: unitQuotes, alternate: bundleQuotes};
}

export function quotePreset(
  preset: CalculatorPreset,
  period: PeriodMode = 'month',
): PresetQuoteResult {
  if (preset.kind === 'compute') {
    const quotes = quoteCompute(preset, period);
    return {
      preset,
      period,
      quotes,
      alternateQuotes: [],
      best: quotes[0] ?? null,
    };
  }

  const {primary, alternate} = quoteGpu(preset, period);
  // If the preferred scope is empty, fall back so the card is not blank.
  const quotes = primary.length ? primary : alternate;
  const alternateQuotes = primary.length ? alternate : [];
  return {
    preset,
    period,
    quotes,
    alternateQuotes,
    best: quotes[0] ?? null,
  };
}

/** Quote every calculator preset once for a period (page-level batch). */
export function quoteAllPresets(period: PeriodMode = 'month'): Map<string, PresetQuoteResult> {
  getMeterIndex();
  const map = new Map<string, PresetQuoteResult>();
  for (const preset of COMPUTE_PRESETS) {
    map.set(preset.id, quotePreset(preset, period));
  }
  for (const preset of GPU_PRESETS) {
    map.set(preset.id, quotePreset(preset, period));
  }
  return map;
}

function stripMeters(q: ProviderQuote): ViewProviderQuote {
  return {
    provider: q.provider,
    providerName: q.providerName,
    total: q.total,
    scope: q.scope,
    parts: q.parts,
    note: q.note,
  };
}

export function toViewQuote(result: PresetQuoteResult): ViewPresetQuote {
  return {
    presetId: result.preset.id,
    quotes: result.quotes.map(stripMeters),
    alternateQuotes: result.alternateQuotes.map(stripMeters),
    best: result.best ? stripMeters(result.best) : null,
  };
}

/** Precompute all periods on the server so the client never loads the catalog. */
export function buildQuotesByPeriod(): QuotesByPeriod {
  const periods: PeriodMode[] = ['unit', 'month', 'year'];
  const out = {} as QuotesByPeriod;
  for (const period of periods) {
    const map = quoteAllPresets(period);
    const record: Record<string, ViewPresetQuote> = {};
    for (const [id, result] of map) {
      record[id] = toViewQuote(result);
    }
    out[period] = record;
  }
  return out;
}
