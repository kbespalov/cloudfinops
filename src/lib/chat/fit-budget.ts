/**
 * Fit a monthly RUB budget to whole VM (or GPU) packs via the calculator engine.
 * Deterministic: no LLM math — floor(budget / unitMonth) per provider × shape.
 */

import type {PeriodMode} from '@/lib/catalog';
import {quotePreset} from '@/lib/calculator/quote';
import type {ComputePreset, GpuPreset} from '@/lib/calculator/presets';

export type FitBudgetProfile = 'general' | 'high-cpu' | 'gpu-l4' | 'gpu-h100';

type Shape = {
  id: string;
  label: string;
  kind: 'compute' | 'gpu';
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  gpuModel?: string;
  gpuCount?: number;
  family?: ComputePreset['family'];
};

const GENERAL_SHAPES: Shape[] = [
  {id: '2-8', label: '2 vCPU / 8 GiB / 100 GiB SSD', kind: 'compute', vcpu: 2, ramGiB: 8, diskGiB: 100, family: 'general'},
  {id: '4-16', label: '4 vCPU / 16 GiB / 100 GiB SSD', kind: 'compute', vcpu: 4, ramGiB: 16, diskGiB: 100, family: 'general'},
  {id: '8-32', label: '8 vCPU / 32 GiB / 100 GiB SSD', kind: 'compute', vcpu: 8, ramGiB: 32, diskGiB: 100, family: 'general'},
  {id: '16-64', label: '16 vCPU / 64 GiB / 100 GiB SSD', kind: 'compute', vcpu: 16, ramGiB: 64, diskGiB: 100, family: 'general'},
  {id: '32-64', label: '32 vCPU / 64 GiB / 100 GiB SSD', kind: 'compute', vcpu: 32, ramGiB: 64, diskGiB: 100, family: 'high-cpu'},
];

const HIGH_CPU_SHAPES: Shape[] = [
  {id: '4-8', label: '4 vCPU / 8 GiB / 100 GiB SSD', kind: 'compute', vcpu: 4, ramGiB: 8, diskGiB: 100, family: 'high-cpu'},
  {id: '8-16', label: '8 vCPU / 16 GiB / 100 GiB SSD', kind: 'compute', vcpu: 8, ramGiB: 16, diskGiB: 100, family: 'high-cpu'},
  {id: '16-32', label: '16 vCPU / 32 GiB / 100 GiB SSD', kind: 'compute', vcpu: 16, ramGiB: 32, diskGiB: 100, family: 'high-cpu'},
  {id: '32-64', label: '32 vCPU / 64 GiB / 100 GiB SSD', kind: 'compute', vcpu: 32, ramGiB: 64, diskGiB: 100, family: 'high-cpu'},
];

function shapesForProfile(profile: FitBudgetProfile): Shape[] {
  if (profile === 'high-cpu') return HIGH_CPU_SHAPES;
  if (profile === 'gpu-l4') {
    return [
      {
        id: 'l4-1',
        label: '1× L4 + типовой хост / 100 GiB SSD',
        kind: 'gpu',
        vcpu: 0,
        ramGiB: 0,
        diskGiB: 100,
        gpuModel: 'L4',
        gpuCount: 1,
      },
    ];
  }
  if (profile === 'gpu-h100') {
    return [
      {
        id: 'h100-1',
        label: '1× H100 + типовой хост / 100 GiB SSD',
        kind: 'gpu',
        vcpu: 0,
        ramGiB: 0,
        diskGiB: 100,
        gpuModel: 'H100',
        gpuCount: 1,
      },
    ];
  }
  return GENERAL_SHAPES;
}

function toPreset(shape: Shape): ComputePreset | GpuPreset {
  if (shape.kind === 'gpu' && shape.gpuModel) {
    return {
      id: `fit-${shape.id}`,
      kind: 'gpu',
      title: shape.label,
      subtitle: 'fit-budget',
      gpuModelMatch: shape.gpuModel,
      gpuCount: shape.gpuCount ?? 1,
      diskGiB: shape.diskGiB,
    };
  }
  return {
    id: `fit-${shape.id}`,
    kind: 'compute',
    family: shape.family ?? 'general',
    title: shape.label,
    subtitle: 'fit-budget',
    vcpu: shape.vcpu,
    ramGiB: shape.ramGiB,
    diskGiB: shape.diskGiB,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FitPack = {
  provider: string;
  unitMonth: number;
  count: number;
  spendMonth: number;
  leftoverMonth: number;
  utilPct: number;
  totalVcpu: number | null;
  totalRamGiB: number | null;
};

export type FitScenario = {
  shapeId: string;
  shape: string;
  kind: 'compute' | 'gpu';
  /** Best pack for this shape (affordable only). */
  best: FitPack | null;
  /** Next 2 packs for the same shape (other providers), if any. */
  also: FitPack[];
};

export type FitBudgetResult = {
  budgetMonthRub: number;
  profile: FitBudgetProfile;
  currency: 'RUB';
  vatIncluded: true;
  periodNote: string;
  assumption: string;
  scenarios: FitScenario[];
  /** Top packs across shapes: most vCPU (or GPU count) within budget, then util. */
  highlights: Array<FitPack & {shape: string; shapeId: string}>;
  note: string;
};

export function fitBudget(options: {
  budgetMonthRub: number;
  profile?: FitBudgetProfile;
}): FitBudgetResult {
  const budget = options.budgetMonthRub;
  const profile: FitBudgetProfile = options.profile ?? 'general';
  const period: PeriodMode = 'month';
  const shapes = shapesForProfile(profile);

  const scenarios: FitScenario[] = [];
  const flat: Array<FitPack & {shape: string; shapeId: string}> = [];

  for (const shape of shapes) {
    const preset = toPreset(shape);
    const quoted = quotePreset(preset, period);
    const packs: FitPack[] = [];

    for (const q of quoted.quotes) {
      const unit = q.total;
      if (!(unit > 0) || !Number.isFinite(unit)) continue;
      const count = Math.floor(budget / unit);
      if (count < 1) {
        packs.push({
          provider: q.providerName,
          unitMonth: round2(unit),
          count: 0,
          spendMonth: 0,
          leftoverMonth: round2(budget),
          utilPct: 0,
          totalVcpu: shape.kind === 'compute' ? 0 : null,
          totalRamGiB: shape.kind === 'compute' ? 0 : null,
        });
        continue;
      }
      const spend = count * unit;
      const pack: FitPack = {
        provider: q.providerName,
        unitMonth: round2(unit),
        count,
        spendMonth: round2(spend),
        leftoverMonth: round2(budget - spend),
        utilPct: round2((spend / budget) * 100),
        totalVcpu: shape.kind === 'compute' ? count * shape.vcpu : null,
        totalRamGiB: shape.kind === 'compute' ? count * shape.ramGiB : null,
      };
      packs.push(pack);
      flat.push({...pack, shape: shape.label, shapeId: shape.id});
    }

    const affordable = packs
      .filter((p) => p.count >= 1)
      .sort((a, b) => {
        if (b.utilPct !== a.utilPct) return b.utilPct - a.utilPct;
        return (b.totalVcpu ?? b.count) - (a.totalVcpu ?? a.count);
      });
    const best = affordable[0] ?? null;

    scenarios.push({
      shapeId: shape.id,
      shape: shape.label,
      kind: shape.kind,
      best,
      also: affordable.slice(1, 3),
    });
  }

  const highlights = flat
    .filter((p) => p.count >= 1)
    .sort((a, b) => {
      const av = a.totalVcpu ?? a.count;
      const bv = b.totalVcpu ?? b.count;
      if (bv !== av) return bv - av;
      return b.utilPct - a.utilPct;
    })
    .slice(0, 6);

  return {
    budgetMonthRub: budget,
    profile,
    currency: 'RUB',
    vatIncluded: true,
    periodNote: 'месяц = 720 ч',
    assumption:
      profile === 'general' || profile === 'high-cpu'
        ? 'Он‑деманд ВМ + системный диск 100 GiB SSD/NVMe. Без публичного IP, S3, Kubernetes, GPU и трафика — их можно добавить отдельно.'
        : 'GPU‑конфигурация целиком (карта + типовой хост + диск) из калькулятора. Без IP/S3/K8s/трафика.',
    scenarios,
    highlights,
    note:
      'Ответь сразу таблицей по highlights (или 2–4 сценария из scenarios.best): Провайдер | Конфиг ×N | Итого ₽/мес | Утилизация % | к best offer. Не устраивай опрос. count=число целых машин; utilPct=доля бюджета. Формы только из ответа инструмента.',
  };
}
