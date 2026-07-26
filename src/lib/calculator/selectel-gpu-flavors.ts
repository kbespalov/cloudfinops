/**
 * Selectel GPU Line fixed flavors from the public calculator
 * (https://selectel.ru/services/cloud/servers/gpu/).
 *
 * Catalog stores Selectel as unit GPU + vCPU/RAM meters; the site calculator
 * publishes these host shapes so quotes match orderable configs (not Cloud.ru/VK hosts).
 */

import type {GpuPreset} from '@/lib/calculator/presets';

export type SelectelGpuFlavorSpec = {
  family: string;
  gpuCount: number;
  gpuMemoryGb: number;
  vcpu: number;
  ramGiB: number;
  interconnect?: string;
};

/** Deduped GPU Line matrix (on-demand). Pool availability varies (e.g. H100 often not in ru-7a). */
const PCIE = 'PCIe';
const NVLINK = 'NVLink';

export const SELECTEL_GPU_LINE_FLAVORS: SelectelGpuFlavorSpec[] = [
  // L4 24GB — PCIe cards
  {family: 'L4', gpuCount: 1, gpuMemoryGb: 24, vcpu: 8, ramGiB: 32, interconnect: PCIE},
  {family: 'L4', gpuCount: 1, gpuMemoryGb: 24, vcpu: 16, ramGiB: 64, interconnect: PCIE},
  {family: 'L4', gpuCount: 2, gpuMemoryGb: 24, vcpu: 16, ramGiB: 64, interconnect: PCIE},
  {family: 'L4', gpuCount: 2, gpuMemoryGb: 24, vcpu: 32, ramGiB: 128, interconnect: PCIE},
  {family: 'L4', gpuCount: 4, gpuMemoryGb: 24, vcpu: 32, ramGiB: 128, interconnect: PCIE},
  {family: 'L4', gpuCount: 4, gpuMemoryGb: 24, vcpu: 64, ramGiB: 256, interconnect: PCIE},
  {family: 'L4', gpuCount: 8, gpuMemoryGb: 24, vcpu: 64, ramGiB: 256, interconnect: PCIE},
  {family: 'L4', gpuCount: 8, gpuMemoryGb: 24, vcpu: 128, ramGiB: 512, interconnect: PCIE},

  // A30 24GB — PCIe
  {family: 'A30', gpuCount: 1, gpuMemoryGb: 24, vcpu: 16, ramGiB: 64, interconnect: PCIE},
  {family: 'A30', gpuCount: 1, gpuMemoryGb: 24, vcpu: 16, ramGiB: 80, interconnect: PCIE},
  {family: 'A30', gpuCount: 1, gpuMemoryGb: 24, vcpu: 24, ramGiB: 192, interconnect: PCIE},
  {family: 'A30', gpuCount: 2, gpuMemoryGb: 24, vcpu: 32, ramGiB: 180, interconnect: PCIE},
  {family: 'A30', gpuCount: 2, gpuMemoryGb: 24, vcpu: 48, ramGiB: 320, interconnect: PCIE},

  // A100 — topology not published per flavor; leave interconnect unset
  {family: 'A100', gpuCount: 1, gpuMemoryGb: 40, vcpu: 6, ramGiB: 87},
  {family: 'A100', gpuCount: 2, gpuMemoryGb: 40, vcpu: 12, ramGiB: 176},
  {family: 'A100', gpuCount: 4, gpuMemoryGb: 40, vcpu: 24, ramGiB: 352},
  {family: 'A100', gpuCount: 8, gpuMemoryGb: 40, vcpu: 48, ramGiB: 704},

  {family: 'A100', gpuCount: 1, gpuMemoryGb: 80, vcpu: 12, ramGiB: 128},
  {family: 'A100', gpuCount: 1, gpuMemoryGb: 80, vcpu: 24, ramGiB: 128},
  {family: 'A100', gpuCount: 2, gpuMemoryGb: 80, vcpu: 24, ramGiB: 256},
  {family: 'A100', gpuCount: 2, gpuMemoryGb: 80, vcpu: 48, ramGiB: 256},
  {family: 'A100', gpuCount: 4, gpuMemoryGb: 80, vcpu: 48, ramGiB: 512},
  {family: 'A100', gpuCount: 4, gpuMemoryGb: 80, vcpu: 96, ramGiB: 512},
  {family: 'A100', gpuCount: 8, gpuMemoryGb: 80, vcpu: 96, ramGiB: 1000},
  {family: 'A100', gpuCount: 8, gpuMemoryGb: 80, vcpu: 192, ramGiB: 1000},

  // H100 / H200 — Selectel GPU Line dense hosts (NVLink-class / SXM fabric)
  {family: 'H100', gpuCount: 1, gpuMemoryGb: 80, vcpu: 12, ramGiB: 128, interconnect: NVLINK},
  {family: 'H100', gpuCount: 1, gpuMemoryGb: 80, vcpu: 24, ramGiB: 128, interconnect: NVLINK},
  {family: 'H100', gpuCount: 2, gpuMemoryGb: 80, vcpu: 24, ramGiB: 256, interconnect: NVLINK},
  {family: 'H100', gpuCount: 2, gpuMemoryGb: 80, vcpu: 48, ramGiB: 256, interconnect: NVLINK},

  {family: 'H200', gpuCount: 1, gpuMemoryGb: 141, vcpu: 12, ramGiB: 120, interconnect: NVLINK},
  {family: 'H200', gpuCount: 1, gpuMemoryGb: 141, vcpu: 24, ramGiB: 180, interconnect: NVLINK},
  {family: 'H200', gpuCount: 2, gpuMemoryGb: 141, vcpu: 24, ramGiB: 240, interconnect: NVLINK},
  {family: 'H200', gpuCount: 2, gpuMemoryGb: 141, vcpu: 48, ramGiB: 360, interconnect: NVLINK},
  {family: 'H200', gpuCount: 4, gpuMemoryGb: 141, vcpu: 48, ramGiB: 480, interconnect: NVLINK},
  {family: 'H200', gpuCount: 4, gpuMemoryGb: 141, vcpu: 96, ramGiB: 720, interconnect: NVLINK},
  {family: 'H200', gpuCount: 8, gpuMemoryGb: 141, vcpu: 96, ramGiB: 960, interconnect: NVLINK},
  {family: 'H200', gpuCount: 8, gpuMemoryGb: 141, vcpu: 192, ramGiB: 1000, interconnect: NVLINK},

  // RTX 6000 Pro 96GB — PCIe
  {family: 'RTX 6000 Pro', gpuCount: 1, gpuMemoryGb: 96, vcpu: 16, ramGiB: 120, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 1, gpuMemoryGb: 96, vcpu: 32, ramGiB: 180, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 2, gpuMemoryGb: 96, vcpu: 32, ramGiB: 240, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 2, gpuMemoryGb: 96, vcpu: 64, ramGiB: 360, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 4, gpuMemoryGb: 96, vcpu: 64, ramGiB: 480, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 4, gpuMemoryGb: 96, vcpu: 128, ramGiB: 720, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 8, gpuMemoryGb: 96, vcpu: 128, ramGiB: 960, interconnect: PCIE},
  {family: 'RTX 6000 Pro', gpuCount: 8, gpuMemoryGb: 96, vcpu: 256, ramGiB: 1000, interconnect: PCIE},

  // T4 / A2 / A5000 — PCIe entry SKUs
  {family: 'T4', gpuCount: 1, gpuMemoryGb: 16, vcpu: 4, ramGiB: 32, interconnect: PCIE},
  {family: 'T4', gpuCount: 1, gpuMemoryGb: 16, vcpu: 8, ramGiB: 32, interconnect: PCIE},
  {family: 'T4', gpuCount: 2, gpuMemoryGb: 16, vcpu: 8, ramGiB: 64, interconnect: PCIE},
  {family: 'T4', gpuCount: 4, gpuMemoryGb: 16, vcpu: 16, ramGiB: 128, interconnect: PCIE},
  {family: 'A2', gpuCount: 1, gpuMemoryGb: 16, vcpu: 12, ramGiB: 32, interconnect: PCIE},
  {family: 'A2', gpuCount: 1, gpuMemoryGb: 16, vcpu: 12, ramGiB: 48, interconnect: PCIE},
  {family: 'A2', gpuCount: 1, gpuMemoryGb: 16, vcpu: 12, ramGiB: 96, interconnect: PCIE},
  {family: 'A2', gpuCount: 2, gpuMemoryGb: 16, vcpu: 24, ramGiB: 64, interconnect: PCIE},
  {family: 'A2', gpuCount: 2, gpuMemoryGb: 16, vcpu: 24, ramGiB: 192, interconnect: PCIE},
  {family: 'A2', gpuCount: 4, gpuMemoryGb: 16, vcpu: 48, ramGiB: 320, interconnect: PCIE},
  {family: 'A5000', gpuCount: 1, gpuMemoryGb: 24, vcpu: 8, ramGiB: 32, interconnect: PCIE},
  {family: 'A5000', gpuCount: 1, gpuMemoryGb: 24, vcpu: 16, ramGiB: 64, interconnect: PCIE},
  {family: 'A5000', gpuCount: 1, gpuMemoryGb: 24, vcpu: 24, ramGiB: 192, interconnect: PCIE},
  {family: 'A5000', gpuCount: 2, gpuMemoryGb: 24, vcpu: 24, ramGiB: 128, interconnect: PCIE},
  {family: 'A5000', gpuCount: 2, gpuMemoryGb: 24, vcpu: 48, ramGiB: 320, interconnect: PCIE},
];

function shapeKey(spec: SelectelGpuFlavorSpec): string {
  const link = spec.interconnect ?? '';
  return `flavor|${spec.family}|${spec.gpuMemoryGb}|${link}|${spec.gpuCount}|${spec.vcpu}|${spec.ramGiB}`;
}

function titleFor(spec: SelectelGpuFlavorSpec): string {
  const link = spec.interconnect ? ` ${spec.interconnect}` : '';
  return `${spec.gpuCount}× ${spec.family} ${spec.gpuMemoryGb}GB${link}`.replace(/\s+/g, ' ').trim();
}

/** Curated Selectel GPU Line presets (not in YAML — unit meters only). */
export function buildSelectelGpuFlavorPresets(): GpuPreset[] {
  return SELECTEL_GPU_LINE_FLAVORS.map((spec) => {
    const key = shapeKey(spec);
    return {
      id: `gpu-shape-${key.replace(/\|/g, '-')}`,
      kind: 'gpu' as const,
      title: titleFor(spec),
      subtitle: `Flavor · ${spec.vcpu} vCPU · ${spec.ramGiB} GiB · источник selectel`,
      gpuModelMatch: spec.family,
      gpuCount: spec.gpuCount,
      vcpu: spec.vcpu,
      ramGiB: spec.ramGiB,
      diskGiB: 100,
      shapeSource: 'selectel',
      shapeKey: key,
      gpuInterconnect: spec.interconnect ?? null,
      gpuMemoryGb: spec.gpuMemoryGb,
    };
  });
}
