/** Ready-made VM / GPU scenarios for the calculator (not a free-form builder). */

export type ComputeFamily = 'low-cost' | 'general' | 'high-cpu' | 'high-memory';

export type ComputePreset = {
  id: string;
  kind: 'compute';
  family: ComputeFamily;
  title: string;
  subtitle: string;
  vcpu: number;
  ramGiB: number;
  /** Assumed system disk for composition bar (GiB SSD). */
  diskGiB: number;
};

export type GpuPreset = {
  id: string;
  kind: 'gpu';
  title: string;
  subtitle: string;
  /** Substring match against dimensions.gpuModel (case-insensitive). */
  gpuModelMatch: string;
  gpuCount: number;
  /** Prefer bundle flavors (VK / Cloud.ru) when true. */
  preferBundle?: boolean;
};

export type CalculatorPreset = ComputePreset | GpuPreset;

export const COMPUTE_FAMILY_TITLE: Record<ComputeFamily, string> = {
  'low-cost': 'Low-cost',
  general: 'General',
  'high-cpu': 'High CPU',
  'high-memory': 'High Memory',
};

export const COMPUTE_FAMILY_HINT: Record<ComputeFamily, string> = {
  'low-cost': 'Preemptible + shared vCPU — дешевле всего, но с прерываниями и без гарантий',
  general: 'Balanced — 1 vCPU : 4 GiB RAM',
  'high-cpu': 'CPU optimized — 1 vCPU : 2 GiB RAM (как у MWS Cloud)',
  'high-memory': 'Memory optimized — 1 vCPU : 8 GiB RAM',
};

function computePreset(
  family: ComputeFamily,
  vcpu: number,
  ramGiB: number,
  diskGiB = 100,
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
  // Low-cost — preemptible + shared vCPU, cheapest hosting
  computePreset('low-cost', 1, 1),
  computePreset('low-cost', 2, 2),
  computePreset('low-cost', 2, 4),
  computePreset('low-cost', 4, 8),
  computePreset('low-cost', 8, 16),
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

/** GPU shelf — card configurations (physical GPUs). */
export const GPU_PRESETS: GpuPreset[] = [
  {
    id: 'gpu-l4-1',
    kind: 'gpu',
    title: '1× L4',
    subtitle: 'Inference · mid-range',
    gpuModelMatch: 'L4',
    gpuCount: 1,
  },
  {
    id: 'gpu-a100-1',
    kind: 'gpu',
    title: '1× A100',
    subtitle: 'Training / heavy inference',
    gpuModelMatch: 'A100',
    gpuCount: 1,
  },
  {
    id: 'gpu-h100-1',
    kind: 'gpu',
    title: '1× H100',
    subtitle: 'Top training',
    gpuModelMatch: 'H100',
    gpuCount: 1,
  },
  {
    id: 'gpu-h200-1',
    kind: 'gpu',
    title: '1× H200',
    subtitle: 'Long-context / large models',
    gpuModelMatch: 'H200',
    gpuCount: 1,
  },
  {
    id: 'gpu-h200-8',
    kind: 'gpu',
    title: '8× H200',
    subtitle: 'Full GPU node',
    gpuModelMatch: 'H200',
    gpuCount: 8,
    preferBundle: true,
  },
];

export function computePresetsByFamily(family: ComputeFamily): ComputePreset[] {
  return COMPUTE_PRESETS.filter((p) => p.family === family);
}
