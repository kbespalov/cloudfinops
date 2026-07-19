/**
 * Cross-provider unit-price analytics for the AI assistant.
 *
 * Answers "средняя цена ядра/памяти/диска по провайдерам, кто дешевле и на
 * сколько %" on a COMPARABLE basis — never mixing preemptible / fractional /
 * shared cores with a guaranteed 100% on-demand core (that was the bug in the
 * naive search+average approach). Reuses the calculator engine's SKU
 * classification so numbers match the catalog and calculator.
 */

import {
  amountNumber,
  catalog,
  extractDiskMedia,
  isRamMeter,
  isVcpuMeter,
  type CatalogMeter,
} from '@/lib/catalog';
import {
  isConfirmedAvailable,
  isDedicatedVcpu,
  isFractionalGuarantee,
  isOnDemand,
  isSharedVcpu,
} from '@/lib/calculator/quote';

export type UnitComponent = 'vcpu' | 'ram' | 'ssd';

type ProviderPrice = {
  provider: string;
  providerName: string;
  hour: number | null;
  month: number | null;
  platform: string | null;
  region: string | null;
  note: string | null;
};

type FloorPrice = {
  provider: string;
  providerName: string;
  hour: number | null;
  month: number | null;
  type: string;
};

function round(n: number | null | undefined, digits = 4): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

function meterForComponent(component: UnitComponent, m: CatalogMeter): boolean {
  if (m.status !== 'available' || !isConfirmedAvailable(m)) return false;
  // Derived / synthetic unit rates (Cloud.ru lattice *) stay out of the
  // like-for-like average — they surface via derivedFromFlavors instead.
  if (m.synthetic) return false;
  if (component === 'vcpu') return m.meter === 'compute.vcpu' || isVcpuMeter(m);
  if (component === 'ram') return m.meter === 'compute.ram' || isRamMeter(m);
  // ssd: block storage capacity, SSD/NVMe media (exclude HDD)
  if (m.meter !== 'storage.block.capacity') return false;
  const media = extractDiskMedia(m);
  return media === 'SSD' || media === 'NVMe';
}

/** Synthetic unit SKUs published as catalog estimates (not orderable tariff rows). */
function syntheticUnitForComponent(component: UnitComponent, m: CatalogMeter): boolean {
  if (!m.synthetic || m.status !== 'available' || !isConfirmedAvailable(m)) return false;
  if (!isOnDemand(m)) return false;
  if (component === 'vcpu') {
    return (m.meter === 'compute.vcpu' || isVcpuMeter(m)) && isDedicatedVcpu(m) && !isFractionalGuarantee(m);
  }
  if (component === 'ram') return m.meter === 'compute.ram' || isRamMeter(m);
  return false;
}

/** Is this meter the comparable, like-for-like basis for the component? */
function isComparable(component: UnitComponent, m: CatalogMeter): boolean {
  if (!isOnDemand(m)) return false;
  if (component === 'vcpu') {
    return isDedicatedVcpu(m) && !isFractionalGuarantee(m) && !isSharedVcpu(m);
  }
  return true;
}

function coreType(m: CatalogMeter): string {
  const share = String(m.dimensions.guaranteedVcpuShare ?? '');
  if (!isOnDemand(m)) {
    return share && share !== '100%' ? `preemptible, доля ${share}` : 'preemptible';
  }
  if (isSharedVcpu(m)) return 'shared / переподписка';
  if (isFractionalGuarantee(m)) return `долевое ядро ${share}`;
  return share && share !== '100%' ? `доля ${share}` : 'on-demand, 100% ядро';
}

const COMPONENT_LABEL: Record<UnitComponent, string> = {
  vcpu: '1 vCPU',
  ram: '1 GiB RAM',
  ssd: '1 GiB SSD-диска',
};

const COMPONENT_BASIS: Record<UnitComponent, string> = {
  vcpu: 'on-demand, 100% гарантированное выделенное ядро (preemptible и долевые ядра исключены)',
  ram: 'on-demand цена за 1 GiB RAM',
  ssd: 'on-demand цена за 1 GiB SSD-диска (месяц)',
};

type Decomposition = {vcpuHour: number; ramGiBHour: number; n: number; r2: number};

/**
 * Least-squares decomposition of a provider's whole-VM flavors into an implied
 * per-vCPU + per-GiB-RAM hourly rate: price ≈ a·vCPU + b·GiB. Lets flavor-only
 * providers (e.g. Cloud.ru, which publishes no standalone core price) still get
 * a comparable *estimated* per-core rate instead of being dropped entirely.
 * Returns null if the fit is weak or coefficients are implausible.
 */
function decomposeFlavors(providerId: string): Decomposition | null {
  const flavors = catalog.meters.filter((m) => {
    if (m.provider !== providerId) return false;
    if (m.meter !== 'compute.flavor' && m.unitQuantity !== 'flavor') return false;
    if (m.categoryKey !== 'compute') return false;
    if (m.status !== 'available' || !isConfirmedAvailable(m)) return false;
    if (!isOnDemand(m)) return false;
    // Only 100% dedicated flavors — mixing 10%/30% shares would skew the rate.
    if (isFractionalGuarantee(m) || isSharedVcpu(m)) return false;
    const v = Number(m.dimensions.vcpu ?? NaN);
    const r = Number(m.dimensions.ramGiB ?? m.dimensions.ramGb ?? NaN);
    return Number.isFinite(v) && v > 0 && Number.isFinite(r) && r > 0;
  });

  const pts = flavors
    .map((m) => ({
      v: Number(m.dimensions.vcpu),
      r: Number(m.dimensions.ramGiB ?? m.dimensions.ramGb),
      p: amountNumber(m, 'unit'),
    }))
    .filter((x): x is {v: number; r: number; p: number} => x.p != null && x.p > 0);

  if (pts.length < 4) return null;

  // Normal equations for p = a·v + b·r (no intercept).
  let svv = 0, srr = 0, svr = 0, svp = 0, srp = 0;
  for (const {v, r, p} of pts) {
    svv += v * v;
    srr += r * r;
    svr += v * r;
    svp += v * p;
    srp += r * p;
  }
  const det = svv * srr - svr * svr;
  if (Math.abs(det) < 1e-9) return null;
  const a = (svp * srr - srp * svr) / det;
  const b = (svv * srp - svr * svp) / det;
  if (!(a > 0) || !(b >= 0)) return null;

  const meanP = pts.reduce((s, x) => s + x.p, 0) / pts.length;
  let ssTot = 0, ssRes = 0;
  for (const {v, r, p} of pts) {
    ssTot += (p - meanP) ** 2;
    ssRes += (p - (a * v + b * r)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  if (r2 < 0.9) return null;

  return {vcpuHour: a, ramGiBHour: b, n: pts.length, r2};
}

function computeStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const min = sorted[0];
  const max = sorted[n - 1];
  return {
    count: n,
    min: round(min),
    max: round(max),
    mean: round(mean),
    median: round(median),
    spreadMaxVsMinPct: pct(((max - min) / min) * 100),
  };
}

/**
 * Per-provider comparable unit price for a component, plus cross-provider
 * aggregates (min/max/mean/median, deviations, spread). Stats are computed on
 * the HOUR price for vcpu/ram and the MONTH price for ssd.
 */
export function compareUnitPrice(component: UnitComponent) {
  const comparable: ProviderPrice[] = [];
  const floor: FloorPrice[] = [];
  const noComparable: {provider: string; providerName: string; note: string}[] = [];
  const derived: {
    provider: string;
    providerName: string;
    hour: number | null;
    month: number | null;
    method: string;
    fitR2: number;
  }[] = [];

  const statPeriod: 'hour' | 'month' = component === 'ssd' ? 'month' : 'hour';

  for (const provider of catalog.providers) {
    const rows = catalog.meters.filter(
      (m) => m.provider === provider.id && meterForComponent(component, m),
    );
    if (rows.length === 0) {
      // Prefer curated synthetic unit SKUs (Cloud.ru lattice *) when present;
      // else OLS-decompose whole-VM flavors so the provider is not dropped.
      const synth = catalog.meters
        .filter((m) => m.provider === provider.id && syntheticUnitForComponent(component, m))
        .map((m) => ({m, hour: amountNumber(m, 'unit')}))
        .filter((x): x is {m: CatalogMeter; hour: number} => x.hour != null && x.hour > 0)
        .sort((a, b) => a.hour - b.hour)[0];
      if (synth) {
        derived.push({
          provider: provider.id,
          providerName: provider.name,
          hour: round(synth.hour),
          month: round(synth.hour * 720, 2),
          method:
            'синтетическая unit-ставка (*) по решётке flavor’ов; не тариф Cloud.ru, кроме выбросов (2vCPU≥8 GiB, 12vCPU)',
          fitR2: 1,
        });
      } else {
        const decomp = component !== 'ssd' ? decomposeFlavors(provider.id) : null;
        if (decomp) {
          const hour = component === 'vcpu' ? decomp.vcpuHour : decomp.ramGiBHour;
          derived.push({
            provider: provider.id,
            providerName: provider.name,
            hour: round(hour),
            month: round(hour * 720, 2),
            method: `оценка по декомпозиции ${decomp.n} флейворов (цена ≈ a·vCPU + b·GiB RAM)`,
            fitR2: round(decomp.r2, 3) ?? 0,
          });
        } else {
          noComparable.push({
            provider: provider.id,
            providerName: provider.name,
            note:
              component === 'vcpu' || component === 'ram'
                ? 'Нет отдельной unit-цены (тарифицирует ВМ целиком, флейвором), декомпозиция не удалась — сопоставимой цены за единицу нет.'
                : 'Нет отдельной цены за GiB диска.',
          });
        }
      }
      continue;
    }

    const priced = rows
      .map((m) => ({m, hour: amountNumber(m, 'unit'), month: amountNumber(m, 'month')}))
      .filter((x) => x.hour != null && x.hour > 0);

    // Comparable (like-for-like) cheapest.
    const comp = priced
      .filter((x) => isComparable(component, x.m))
      .sort((a, b) => (a.hour as number) - (b.hour as number))[0];

    // Absolute cheapest of ANY type (context floor; usually preemptible/fractional).
    const cheapestAny = priced
      .slice()
      .sort((a, b) => (a.hour as number) - (b.hour as number))[0];

    if (comp) {
      comparable.push({
        provider: provider.id,
        providerName: provider.name,
        hour: round(comp.hour),
        month: round(comp.month, 2),
        platform:
          typeof comp.m.dimensions.cpuPlatformFamily === 'string'
            ? comp.m.dimensions.cpuPlatformFamily
            : (comp.m.cpuPlatformFamily ?? null),
        region: comp.m.region ?? null,
        note: coreType(comp.m),
      });
    } else {
      noComparable.push({
        provider: provider.id,
        providerName: provider.name,
        note:
          'Есть только preemptible / долевые / shared позиции — сопоставимой (on-demand, 100%) цены нет.',
      });
    }

    // Add floor only when it differs from the comparable pick (context for vcpu).
    if (component === 'vcpu' && cheapestAny && (!comp || cheapestAny.m !== comp.m)) {
      floor.push({
        provider: provider.id,
        providerName: provider.name,
        hour: round(cheapestAny.hour),
        month: round(cheapestAny.month, 2),
        type: coreType(cheapestAny.m),
      });
    }
  }

  // Rank comparable providers by the stat-period price ascending.
  const priceOf = (p: ProviderPrice) => (statPeriod === 'month' ? p.month : p.hour) ?? Infinity;
  comparable.sort((a, b) => priceOf(a) - priceOf(b));

  const values = comparable
    .map((p) => (statPeriod === 'month' ? p.month : p.hour))
    .filter((v): v is number => v != null);
  const stats = computeStats(values);

  const perProvider = comparable.map((p) => {
    const price = priceOf(p);
    const cheapest = stats?.min ?? price;
    const mean = stats?.mean ?? price;
    return {
      provider: p.provider,
      providerName: p.providerName,
      priceHour: p.hour,
      priceMonth: p.month,
      coreType: p.note,
      platform: p.platform,
      vsMeanPct: mean ? pct(((price - mean) / mean) * 100) : 0,
      vsCheapestTimes: cheapest ? round(price / cheapest, 2) : 1,
    };
  });

  return {
    component,
    unit: COMPONENT_LABEL[component],
    basis: COMPONENT_BASIS[component],
    currency: 'RUB',
    vatIncluded: true,
    statBasis: statPeriod === 'month' ? 'цена за GiB в месяц' : 'цена за единицу в час',
    periodNote: 'месяц = 720 часов; hour × 720 = month',
    stats: stats
      ? {
          ...stats,
          cheapest: comparable[0]
            ? {provider: comparable[0].providerName, price: priceOf(comparable[0])}
            : null,
          dearest: comparable.length
            ? {
                provider: comparable[comparable.length - 1].providerName,
                price: priceOf(comparable[comparable.length - 1]),
              }
            : null,
        }
      : null,
    providers: perProvider,
    // Flavor-only providers with an IMPLIED per-unit rate recovered from their
    // flavor line (estimate). Present them, but keep out of the core stats.
    derivedFromFlavors: derived,
    // Context only — do NOT average these with the comparable prices.
    preemptibleFloor: floor,
    noComparableUnitPrice: noComparable,
    note:
      'providers[] — сопоставимая база (одинаковый тип у всех). Среднее/медиана/разброс в stats считаются ТОЛЬКО по providers[]. derivedFromFlavors — провайдеры, которые продают только флейворы (например Cloud.ru): их цена за единицу ОЦЕНЕНА декомпозицией флейворов (price ≈ a·vCPU + b·GiB RAM); обязательно показывай их с пометкой «оценка», можно упомянуть рядом с сопоставимыми, но НЕ включай в расчёт среднего/медианы. preemptibleFloor — самые дешёвые позиции иного типа (preemptible/долевые) как контекст, их НЕЛЬЗЯ усреднять. noComparableUnitPrice — провайдеры вообще без сопоставимой или оценочной цены.',
  };
}
