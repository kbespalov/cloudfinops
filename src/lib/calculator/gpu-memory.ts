/** Per-card VRAM defaults when the catalog host omits gpuMemoryGb. */
export function defaultGpuMemoryGiB(family: string): number | null {
  const f = family.trim().toUpperCase();
  if (f === 'H200') return 141;
  if (f === 'H100') return 80;
  if (f === 'A100') return 80;
  if (f === 'A10') return 24;
  if (f === 'L40S') return 48;
  if (f === 'L40') return 48;
  if (f === 'L4') return 24;
  if (f === 'B300') return 288;
  if (f === 'B200') return 192;
  if (f.includes('6000')) return 96;
  if (f.includes('4090')) return 24;
  return null;
}
