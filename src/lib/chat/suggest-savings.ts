/**
 * Ranked FinOps savings levers for a VM/GPU shape.
 * Re-quotes alternatives via the calculator engine — never invents ₽.
 */

import {addPublicIpParts, quotePreset, toViewQuote} from '@/lib/calculator/quote';
import type {ComputePreset, GpuPreset} from '@/lib/calculator/presets';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {buildPresetFromRequirements} from './solution/compose';

export type SuggestSavingsArgs = {
  vcpu?: number;
  ramGiB?: number;
  diskGiB?: number;
  diskMedia?: 'ssd' | 'hdd' | 'nvme';
  publicIpCount?: number;
  gpuModel?: string;
  gpuCount?: number;
  /** Optional focus provider display name or id. */
  provider?: string;
};

export type SavingsLever = {
  id: string;
  title: string;
  risk: 'safe' | 'caution' | 'breaking';
  riskNote: string;
  baselineMonthlyRub: number;
  newMonthlyRub: number;
  saveMonthlyRub: number;
  savePct: number;
  provider: string;
  assumption: string;
};

export type SuggestSavingsResult = {
  ok: boolean;
  baseline: {
    provider: string;
    monthlyRub: number;
    shape: string;
    publicIpCount: number;
    diskMedia: string | null;
    purchaseModel: 'on-demand' | 'preemptible' | 'unknown';
  } | null;
  levers: SavingsLever[];
  currency: 'RUB';
  vatIncluded: true;
  catalogAsOf: string;
  note: string;
  error?: string;
};

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pct(save: number, baseline: number): number {
  if (!(baseline > 0)) return 0;
  return Math.round((save / baseline) * 1000) / 10;
}

function normalizeProviderNeedle(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

function providerMatches(quoteProvider: string, needle: string | null): boolean {
  if (!needle) return true;
  const p = quoteProvider.toLowerCase().replace(/\s+/g, '');
  return p.includes(needle) || needle.includes(p);
}

function quoteShape(
  preset: ComputePreset | GpuPreset,
  publicIpCount: number,
): Array<{provider: string; total: number; note?: string | null}> {
  const base = quotePreset(preset, 'month');
  const view =
    publicIpCount > 0
      ? addPublicIpParts(toViewQuote(base), publicIpCount, 'month')
      : toViewQuote(base);
  return [...view.quotes, ...view.alternateQuotes]
    .filter((q) => q.total != null && q.total > 0)
    .map((q) => ({
      provider: q.providerName,
      total: q.total,
      note: q.note,
    }));
}

function pickBaseline(
  quotes: Array<{provider: string; total: number}>,
  providerNeedle: string | null,
): {provider: string; total: number} | null {
  const focused = providerNeedle
    ? quotes.filter((q) => providerMatches(q.provider, providerNeedle))
    : quotes;
  const pool = focused.length ? focused : quotes;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => a.total - b.total)[0]!;
}

function makeLever(args: {
  id: string;
  title: string;
  risk: SavingsLever['risk'];
  riskNote: string;
  baseline: {provider: string; total: number};
  candidate: {provider: string; total: number} | null;
  assumption: string;
}): SavingsLever | null {
  if (!args.candidate) return null;
  const save = round2(args.baseline.total - args.candidate.total);
  if (save == null || save < 50) return null; // ignore noise < 50 ₽
  return {
    id: args.id,
    title: args.title,
    risk: args.risk,
    riskNote: args.riskNote,
    baselineMonthlyRub: round2(args.baseline.total)!,
    newMonthlyRub: round2(args.candidate.total)!,
    saveMonthlyRub: save,
    savePct: pct(save, args.baseline.total),
    provider: args.candidate.provider,
    assumption: args.assumption,
  };
}

export function suggestSavings(args: SuggestSavingsArgs): SuggestSavingsResult {
  const gpuModel = args.gpuModel?.trim();
  const vcpu = args.vcpu;
  const ramGiB = args.ramGiB;
  if (!gpuModel && !(vcpu && ramGiB)) {
    return {
      ok: false,
      baseline: null,
      levers: [],
      currency: 'RUB',
      vatIncluded: true,
      catalogAsOf: catalogAsOfIso(),
      note: '',
      error:
        'Укажи конфигурацию: vcpu+ramGiB (ВМ) или gpuModel (±gpuCount). Можно добавить diskGiB/diskMedia/publicIpCount.',
    };
  }

  const diskGiB = args.diskGiB && args.diskGiB > 0 ? args.diskGiB : 100;
  const diskMedia =
    args.diskMedia === 'hdd' || args.diskMedia === 'nvme' || args.diskMedia === 'ssd'
      ? args.diskMedia
      : 'ssd';
  const publicIpCount = Math.max(0, Math.round(args.publicIpCount ?? 0));
  const gpuCount = args.gpuCount && args.gpuCount > 0 ? Math.round(args.gpuCount) : 1;
  const providerNeedle = normalizeProviderNeedle(args.provider);

  const req: Record<string, unknown> = {
    vcpu,
    ramGiB,
    diskGiB,
    diskMedia,
    gpuModel: gpuModel || undefined,
    gpuCount: gpuModel ? gpuCount : undefined,
  };
  const {preset} = buildPresetFromRequirements(req);
  // Force on-demand baseline for fair lever comparison.
  const baselinePreset =
    preset.kind === 'compute'
      ? ({...preset, purchaseModel: 'on-demand', diskGiB, diskMedia: diskMedia === 'nvme' ? undefined : diskMedia === 'hdd' ? 'hdd' : 'ssd', preferNvme: diskMedia === 'nvme'} satisfies ComputePreset)
      : ({...preset, purchaseModel: 'on-demand', diskGiB} satisfies GpuPreset);

  const baselineQuotes = quoteShape(baselinePreset, publicIpCount);
  const baseline = pickBaseline(baselineQuotes, providerNeedle);
  if (!baseline) {
    return {
      ok: false,
      baseline: null,
      levers: [],
      currency: 'RUB',
      vatIncluded: true,
      catalogAsOf: catalogAsOfIso(),
      note: '',
      error: 'Не удалось оценить базовую конфигурацию в каталоге.',
    };
  }

  const shapeLabel = gpuModel
    ? `${gpuCount}×${gpuModel}` +
      (baselinePreset.kind === 'gpu' && baselinePreset.vcpu && baselinePreset.ramGiB
        ? ` + ${baselinePreset.vcpu}/${baselinePreset.ramGiB}`
        : '')
    : `${vcpu} vCPU / ${ramGiB} GiB / ${diskGiB} GiB ${diskMedia.toUpperCase()}`;

  const levers: SavingsLever[] = [];

  // 1) Drop public IP
  if (publicIpCount > 0) {
    const withoutIp = pickBaseline(quoteShape(baselinePreset, 0), providerNeedle);
    const lever = makeLever({
      id: 'drop-public-ip',
      title: `Убрать публичный IP ×${publicIpCount}`,
      risk: 'caution',
      riskNote: 'Нужен NAT/LB/egress иначе сервис может стать недоступен из интернета.',
      baseline,
      candidate: withoutIp,
      assumption: 'IP не требуется или уже есть у LB.',
    });
    if (lever) levers.push(lever);
  }

  // 2) NVMe → SSD
  if (!gpuModel && diskMedia === 'nvme' && baselinePreset.kind === 'compute') {
    const ssdPreset: ComputePreset = {
      ...baselinePreset,
      preferNvme: false,
      diskMedia: 'ssd',
    };
    const cand = pickBaseline(quoteShape(ssdPreset, publicIpCount), providerNeedle);
    const lever = makeLever({
      id: 'nvme-to-ssd',
      title: 'Заменить системный NVMe → SSD',
      risk: 'caution',
      riskNote: 'Ниже IOPS/latency — плохо для тяжёлой БД на boot-диске.',
      baseline,
      candidate: cand,
      assumption: 'Для boot/OS достаточно обычного SSD.',
    });
    if (lever) levers.push(lever);
  }

  // 3) SSD → HDD
  if (!gpuModel && diskMedia === 'ssd' && baselinePreset.kind === 'compute') {
    const hddPreset: ComputePreset = {
      ...baselinePreset,
      preferNvme: false,
      diskMedia: 'hdd',
    };
    const cand = pickBaseline(quoteShape(hddPreset, publicIpCount), providerNeedle);
    const lever = makeLever({
      id: 'ssd-to-hdd',
      title: 'Заменить системный SSD → HDD',
      risk: 'breaking',
      riskNote: 'Сильный регресс IO; для OS/БД обычно неприемлемо.',
      baseline,
      candidate: cand,
      assumption: 'Допустимы медленные диски (архив/батч).',
    });
    if (lever) levers.push(lever);
  }

  // 4) Preemptible / spot
  {
    const prePreset =
      baselinePreset.kind === 'compute'
        ? ({...baselinePreset, purchaseModel: 'preemptible'} satisfies ComputePreset)
        : ({...baselinePreset, purchaseModel: 'preemptible'} satisfies GpuPreset);
    const cand = pickBaseline(quoteShape(prePreset, publicIpCount), providerNeedle);
    const lever = makeLever({
      id: 'preemptible',
      title: 'Перейти на preemptible / прерываемую ВМ',
      risk: 'breaking',
      riskNote: 'Могут забрать ноду; нужен checkpoint/HA/queue.',
      baseline,
      candidate: cand,
      assumption: 'Workload терпим к прерываниям.',
    });
    if (lever) levers.push(lever);
  }

  // 5) Cheaper provider same shape (only when not already on cheapest / no focus)
  {
    const cheapestAny = pickBaseline(baselineQuotes, null);
    if (
      cheapestAny &&
      cheapestAny.provider !== baseline.provider &&
      cheapestAny.total < baseline.total - 50
    ) {
      const lever = makeLever({
        id: 'switch-provider',
        title: `Сменить провайдера → ${cheapestAny.provider}`,
        risk: 'caution',
        riskNote: 'Миграция, сеть, квоты, отличия SLA/региона.',
        baseline,
        candidate: cheapestAny,
        assumption: 'Та же форма ресурсов приемлема у другого провайдера.',
      });
      if (lever) levers.push(lever);
    }
  }

  // 6) Smaller disk if oversized default
  if (!gpuModel && diskGiB >= 100 && baselinePreset.kind === 'compute') {
    const smallDisk: ComputePreset = {...baselinePreset, diskGiB: 40};
    const cand = pickBaseline(quoteShape(smallDisk, publicIpCount), providerNeedle);
    const lever = makeLever({
      id: 'shrink-boot-disk',
      title: 'Уменьшить системный диск до 40 GiB',
      risk: 'safe',
      riskNote: 'Ок для тонкого OS-образа; мало для локальных данных.',
      baseline,
      candidate: cand,
      assumption: 'Данные живут на object storage / отдельном volume.',
    });
    if (lever) levers.push(lever);
  }

  levers.sort((a, b) => b.saveMonthlyRub - a.saveMonthlyRub);

  return {
    ok: true,
    baseline: {
      provider: baseline.provider,
      monthlyRub: round2(baseline.total)!,
      shape: shapeLabel,
      publicIpCount,
      diskMedia: gpuModel ? null : diskMedia,
      purchaseModel: 'on-demand',
    },
    levers: levers.slice(0, 8),
    currency: 'RUB',
    vatIncluded: true,
    catalogAsOf: catalogAsOfIso(),
    note: 'Рычаги посчитаны повторным quotePreset из каталога. Пиши risk явно. Не складывай все levers — они взаимоисключающие. Authoritative total после применения — новый get_quote/price_solution.',
  };
}
