/** Ready-made VM / GPU scenarios for the calculator (not a free-form builder). */

import type {VcpuShare} from '@/lib/calculator/vcpu-share';

export type ComputeFamily = 'low-cost' | 'general' | 'high-cpu' | 'high-memory';

export type DiskMedia = 'ssd' | 'hdd';

/** Regular on-demand VM vs preemptible (interruptible) purchase model. */
export type PurchaseModel = 'on-demand' | 'preemptible';

export type {VcpuShare};

export type ComputePreset = {
  id: string;
  kind: 'compute';
  family: ComputeFamily;
  title: string;
  subtitle: string;
  vcpu: number;
  ramGiB: number;
  /** Assumed system disk for composition bar (GiB). */
  diskGiB: number;
  /** Block storage media — default SSD. */
  diskMedia?: DiskMedia;
  /** Prefer NVMe block storage when composing the disk line. */
  preferNvme?: boolean;
  /** VM purchase model — default on-demand (обычная). */
  purchaseModel?: PurchaseModel;
  /** Guaranteed vCPU share — default 100%. */
  vcpuShare?: VcpuShare;
};

export type GpuPreset = {
  id: string;
  kind: 'gpu';
  title: string;
  subtitle: string;
  /** Family token for matching (H100, L4, B300…). */
  gpuModelMatch: string;
  gpuCount: number;
  /** Flavor host — when set, quotes match/compose this vCPU+RAM. */
  vcpu?: number;
  ramGiB?: number;
  /** Boot disk for composed (non-bundle) quotes, GiB. */
  diskGiB?: number;
  /** Provider that defined this shape (cloud-ru, vk-cloud, selectel…). */
  shapeSource?: string;
  /** Stable dedupe key from catalog meter. */
  shapeKey?: string;
  /** Emphasize in UI (e.g. Selectel B300). */
  highlight?: boolean;
  /** Dedicated / non-cloud node — no host composition. */
  dedicated?: boolean;
  gpuInterconnect?: string | null;
  gpuMemoryGb?: number | null;
};

export type CalculatorPreset = ComputePreset | GpuPreset;

export const COMPUTE_FAMILY_TITLE: Record<ComputeFamily, string> = {
  'low-cost': 'Экономичные',
  general: 'Универсальные',
  'high-cpu': 'Больше CPU',
  'high-memory': 'Больше памяти',
};

export const COMPUTE_FAMILY_HINT: Record<ComputeFamily, string> = {
  'low-cost': 'Бюджетный класс — shared / долевые ядра; прерываемые включаются отдельно типом ВМ',
  general: 'Универсальные ВМ — 1 vCPU : 4 GiB RAM',
  'high-cpu': 'CPU-оптимизированные — 1 vCPU : 2 GiB RAM',
  'high-memory': 'Memory-оптимизированные — 1 vCPU : 8 GiB RAM',
};

export const PURCHASE_MODEL_TITLE: Record<PurchaseModel, string> = {
  'on-demand': 'Обычная',
  preemptible: 'Прерываемая',
};

function computePreset(
  family: ComputeFamily,
  vcpu: number,
  ramGiB: number,
  diskGiB = 10,
): ComputePreset {
  const prefix =
    family === 'low-cost'
      ? 'low'
      : family === 'general'
        ? 'gen'
        : family === 'high-cpu'
          ? 'cpu'
          : 'mem';
  return {
    id: `${prefix}-${vcpu}-${ramGiB}`,
    kind: 'compute',
    family,
    title: `${vcpu} / ${ramGiB}`,
    subtitle: `${vcpu} vCPU · ${ramGiB} GiB RAM · ${diskGiB} GiB SSD`,
    vcpu,
    ramGiB,
    diskGiB,
  };
}

/**
 * Five examples per compute family.
 * Ratios aligned with MWS Cloud VM types:
 *   CPU optimized  → 1 : 2
 *   Balanced       → 1 : 4  (our General)
 *   Memory optimized → 1 : 8
 */
export const COMPUTE_PRESETS: ComputePreset[] = [
  // Low-cost — preemptible + shared vCPU, cheapest hosting (10 GiB system disk)
  computePreset('low-cost', 1, 1, 10),
  computePreset('low-cost', 2, 2, 10),
  computePreset('low-cost', 2, 4, 10),
  computePreset('low-cost', 4, 8, 10),
  computePreset('low-cost', 8, 16, 10),
  // General / Balanced — ratio 1 : 4
  computePreset('general', 2, 8),
  computePreset('general', 4, 16),
  computePreset('general', 8, 32),
  computePreset('general', 16, 64),
  computePreset('general', 32, 128),
  // High CPU / CPU optimized — ratio 1 : 2 (MWS Cloud presets)
  computePreset('high-cpu', 2, 4),
  computePreset('high-cpu', 4, 8),
  computePreset('high-cpu', 8, 16),
  computePreset('high-cpu', 16, 32),
  computePreset('high-cpu', 32, 64),
  // High Memory / Memory optimized — ratio 1 : 8
  computePreset('high-memory', 2, 16),
  computePreset('high-memory', 4, 32),
  computePreset('high-memory', 8, 64),
  computePreset('high-memory', 16, 128),
  computePreset('high-memory', 32, 256),
];

export function computePresetsByFamily(family: ComputeFamily): ComputePreset[] {
  return COMPUTE_PRESETS.filter((p) => p.family === family);
}