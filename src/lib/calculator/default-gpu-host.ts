/**
 * Representative host (vCPU/RAM/disk) for a GPU class from real flavor shapes.
 * Used by chat `get_quote` and the AI-calculator sidebar so card-only vs flavor
 * providers stay comparable at the same configuration.
 */

import {listGpuPresets} from '@/lib/calculator/quote';

export type DefaultGpuHost = {
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  source: string;
};

export function defaultGpuHost(
  gpuModel: string,
  gpuCount: number,
): DefaultGpuHost | null {
  const q = gpuModel.toLowerCase();
  const candidates = listGpuPresets().filter(
    (p) =>
      p.gpuCount === gpuCount &&
      p.vcpu != null &&
      p.ramGiB != null &&
      (q.includes(p.gpuModelMatch.toLowerCase()) ||
        p.gpuModelMatch.toLowerCase().includes(q)),
  );
  if (!candidates.length) return null;
  const chosen =
    candidates.find((p) => p.shapeSource === 'cloud-ru') ??
    candidates.slice().sort((a, b) => (a.vcpu ?? 0) - (b.vcpu ?? 0))[0];
  return {
    vcpu: chosen.vcpu as number,
    ramGiB: chosen.ramGiB as number,
    diskGiB: chosen.diskGiB ?? 100,
    source: chosen.shapeSource ?? 'catalog',
  };
}
