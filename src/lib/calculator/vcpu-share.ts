import type {ComputeFamily} from '@/lib/calculator/presets';

/** Guaranteed vCPU performance share (Yandex / Cloud.ru style). */
export type VcpuShare = '100%' | '50%' | '30%' | '20%' | '10%' | '5%';

export const VCPU_SHARE_OPTIONS: VcpuShare[] = ['100%', '50%', '30%', '20%', '10%', '5%'];

export function parseVcpuShare(value: unknown): VcpuShare | null {
  if (typeof value !== 'string') return null;
  return (VCPU_SHARE_OPTIONS as string[]).includes(value) ? (value as VcpuShare) : null;
}

export function vcpuSharePercent(share: VcpuShare): number {
  return Number(share.replace('%', ''));
}

/** Cloud.ru published fractional flavors (exact orderable shapes). */
const CLOUDRU_FLAVORS: Record<'10%' | '30%', Array<{vcpu: number; ramGiB: number}>> = {
  '10%': [
    {vcpu: 1, ramGiB: 1},
    {vcpu: 1, ramGiB: 2},
    {vcpu: 2, ramGiB: 4},
    {vcpu: 4, ramGiB: 8},
    {vcpu: 4, ramGiB: 16},
    {vcpu: 4, ramGiB: 32},
    {vcpu: 8, ramGiB: 16},
    {vcpu: 8, ramGiB: 32},
  ],
  '30%': [
    {vcpu: 1, ramGiB: 1},
    {vcpu: 1, ramGiB: 2},
    {vcpu: 2, ramGiB: 4},
    {vcpu: 4, ramGiB: 8},
    {vcpu: 4, ramGiB: 16},
    {vcpu: 4, ramGiB: 32},
    {vcpu: 4, ramGiB: 64},
    {vcpu: 8, ramGiB: 16},
    {vcpu: 8, ramGiB: 32},
    {vcpu: 8, ramGiB: 64},
    {vcpu: 16, ramGiB: 32},
    {vcpu: 16, ramGiB: 64},
    {vcpu: 24, ramGiB: 48},
    {vcpu: 32, ramGiB: 64},
  ],
};

/**
 * Yandex Compute: for share &lt; 100% only 2 or 4 cores are allowed;
 * RAM ≤ 4 GiB/core (≤ 2 GiB/core for 5%). Max practical shape: 4 vCPU / 16 GiB.
 */
function yandexMaxRamPerVcpu(share: VcpuShare): number {
  return share === '5%' ? 2 : 4;
}

const FAMILY_VCPU_STEPS: Record<ComputeFamily, number[]> = {
  'low-cost': [1, 2, 4, 8, 16, 32],
  general: [2, 4, 8, 16, 32, 64, 96, 128],
  'high-cpu': [2, 4, 8, 16, 32, 64, 96, 128],
  'high-memory': [2, 4, 8, 16, 32, 64, 96, 128],
};

const FAMILY_RAM_PER_VCPU: Record<ComputeFamily, number> = {
  general: 4,
  'high-cpu': 2,
  'high-memory': 8,
  'low-cost': 2,
};

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function isFractionalShare(share: VcpuShare): boolean {
  return share !== '100%';
}

/** vCPU slider steps allowed for the selected share. */
export function vcpuStepsForShare(share: VcpuShare, family: ComputeFamily): number[] {
  if (share === '100%') return FAMILY_VCPU_STEPS[family];
  if (share === '10%' || share === '30%') {
    return uniqueSorted(CLOUDRU_FLAVORS[share].map((f) => f.vcpu));
  }
  // Yandex 5% / 20% / 50%
  return [2, 4];
}

/** RAM slider options for the selected share + vCPU. */
export function ramOptionsForShare(
  share: VcpuShare,
  family: ComputeFamily,
  vcpu: number,
): number[] {
  if (share === '100%') {
    return uniqueSorted(FAMILY_VCPU_STEPS[family].map((v) => v * FAMILY_RAM_PER_VCPU[family]));
  }
  if (share === '10%' || share === '30%') {
    return uniqueSorted(
      CLOUDRU_FLAVORS[share].filter((f) => f.vcpu === vcpu).map((f) => f.ramGiB),
    );
  }
  const max = vcpu * yandexMaxRamPerVcpu(share);
  const steps: number[] = [];
  for (let r = Math.max(1, Math.floor(vcpu / 2)); r <= max; r += r < 4 ? 1 : 2) {
    steps.push(r);
  }
  // Always include common round sizes and the family default when in range.
  for (const r of [vcpu, vcpu * 2, vcpu * 4, FAMILY_RAM_PER_VCPU[family] * vcpu]) {
    if (r >= 1 && r <= max) steps.push(r);
  }
  return uniqueSorted(steps.filter((r) => r <= max));
}

export function defaultRamForShare(
  share: VcpuShare,
  family: ComputeFamily,
  vcpu: number,
): number {
  const options = ramOptionsForShare(share, family, vcpu);
  if (!options.length) return vcpu;
  const preferred =
    share === '100%'
      ? vcpu * FAMILY_RAM_PER_VCPU[family]
      : Math.min(vcpu * FAMILY_RAM_PER_VCPU[family], options[options.length - 1]!);
  let best = options[0]!;
  let bestDist = Math.abs(best - preferred);
  for (const opt of options) {
    const d = Math.abs(opt - preferred);
    if (d < bestDist) {
      best = opt;
      bestDist = d;
    }
  }
  return best;
}

export function clampShapeToShare(
  share: VcpuShare,
  family: ComputeFamily,
  vcpu: number,
  ramGiB: number,
): {vcpu: number; ramGiB: number} {
  const vcpuSteps = vcpuStepsForShare(share, family);
  let nextVcpu = vcpuSteps[0] ?? vcpu;
  let bestDist = Math.abs(nextVcpu - vcpu);
  for (const opt of vcpuSteps) {
    const d = Math.abs(opt - vcpu);
    if (d < bestDist) {
      nextVcpu = opt;
      bestDist = d;
    }
  }
  const ramSteps = ramOptionsForShare(share, family, nextVcpu);
  let nextRam = ramSteps[0] ?? ramGiB;
  let ramDist = Math.abs(nextRam - ramGiB);
  for (const opt of ramSteps) {
    const d = Math.abs(opt - ramGiB);
    if (d < ramDist) {
      nextRam = opt;
      ramDist = d;
    }
  }
  return {vcpu: nextVcpu, ramGiB: nextRam};
}

/** Short hint for HelpMark / sidebar. */
export function vcpuShareHint(share: VcpuShare): string {
  switch (share) {
    case '100%':
      return 'Выделенное ядро: полная производительность vCPU.';
    case '50%':
      return 'Yandex Cloud: гарантировано 50% ядра; до 4 vCPU и 16 GiB RAM.';
    case '30%':
      return 'Cloud.ru: эконом-флейворы 30%; до 32 vCPU / 64 GiB по каталогу.';
    case '20%':
      return 'Yandex Cloud: гарантировано 20% ядра; до 4 vCPU и 16 GiB RAM.';
    case '10%':
      return 'Cloud.ru: эконом-флейворы 10%; до 8 vCPU / 32 GiB по каталогу.';
    case '5%':
      return 'Yandex Cloud (Cascade Lake): гарантировано 5% ядра; до 4 vCPU и 8 GiB RAM.';
  }
}

export function shapeAllowedForShare(
  share: VcpuShare,
  vcpu: number,
  ramGiB: number,
): boolean {
  if (share === '100%') return true;
  if (share === '10%' || share === '30%') {
    return CLOUDRU_FLAVORS[share].some((f) => f.vcpu === vcpu && f.ramGiB === ramGiB);
  }
  if (vcpu !== 2 && vcpu !== 4) return false;
  return ramGiB <= vcpu * yandexMaxRamPerVcpu(share);
}
