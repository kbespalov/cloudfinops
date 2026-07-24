/**
 * GPU calculator rows = Cloud.ru flavors (primary) + unique shapes from VK / Selectel / others.
 * Selectel GPU Line hosts are curated from the public calculator (unit meters in YAML only).
 */

import {catalog, type CatalogMeter} from '@/lib/catalog';
import type {GpuPreset} from '@/lib/calculator/presets';
import {buildSelectelGpuFlavorPresets} from '@/lib/calculator/selectel-gpu-flavors';

const SHAPE_SOURCE_PRIORITY: Record<string, number> = {
  'cloud-ru': 0,
  'vk-cloud': 1,
  selectel: 2,
  'yandex-cloud': 3,
  't1-cloud': 4,
  'mws-cloud': 5,
};

/** Short family token used for matching and row titles (H100, L4, B300…). */
export function gpuFamilyToken(model: string): string | null {
  const m = model || '';
  if (/B300/i.test(m)) return 'B300';
  if (/H200/i.test(m)) return 'H200';
  if (/H100/i.test(m)) return 'H100';
  if (/L40S/i.test(m)) return 'L40S';
  if (/\bL40\b/i.test(m)) return 'L40';
  if (/\bL4\b/i.test(m) && !/L40/i.test(m)) return 'L4';
  if (/A100/i.test(m)) return 'A100';
  if (/\bA30\b/i.test(m)) return 'A30';
  if (/A5000/i.test(m)) return 'A5000';
  if (/A2000/i.test(m)) return 'A2000';
  if (/\bA2\b/i.test(m)) return 'A2';
  if (/V100S/i.test(m)) return 'V100S';
  if (/V100/i.test(m)) return 'V100';
  if (/RTX\s*6000\s*Pro/i.test(m)) return 'RTX 6000 Pro';
  if (/RTX\s*6000/i.test(m)) return 'RTX 6000 Ada';
  if (/RTX\s*4090/i.test(m)) return 'RTX 4090';
  if (/RTX\s*2080/i.test(m)) return 'RTX 2080 Ti';
  if (/\bT4\b/i.test(m) || /Tesla T4/i.test(m)) return 'T4';
  if (/GTX\s*1080/i.test(m)) return 'GTX 1080';
  return null;
}

function isGpuBundle(meter: CatalogMeter): boolean {
  return meter.pricingMode === 'bundle' || meter.unitQuantity === 'flavor';
}

function isVgpu(meter: CatalogMeter): boolean {
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  return Boolean(meter.dimensions.virtualGpu) || /vGPU/i.test(model);
}

function interconnectOf(meter: CatalogMeter): string {
  const raw = meter.dimensions.gpuInterconnect ?? meter.dimensions.nvlink;
  if (raw === true || raw === 'true') return 'NVLink';
  if (typeof raw === 'string' && raw.trim()) {
    if (/nvlink/i.test(raw)) return 'NVLink';
    if (/pcie/i.test(raw)) return 'PCIe';
    return raw.trim();
  }
  const model = String(meter.dimensions.gpuModel || '');
  if (/NVLink/i.test(model)) return 'NVLink';
  if (/PCI/i.test(model)) return 'PCIe';
  return '';
}

function finiteDim(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Per-GPU memory (GB).
 * 1) Model name (A100 80GB) — most reliable for Cloud.ru
 * 2) dimensions.gpuMemoryGb — per-card on Selectel / dedicated (B300=288)
 * 3) dimensions.vramGb on multi-GPU flavors — usually total → divide by count
 */
export function perGpuMemoryGb(meter: CatalogMeter): number | null {
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  const named = model.match(/(\d+)\s*G(?:B|iB)/i);
  if (named) return Number(named[1]);

  const count = finiteDim(meter.dimensions.gpuCount) ?? 1;
  const explicit = Number(meter.dimensions.gpuMemoryGb ?? NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const vram = Number(meter.dimensions.vramGb ?? NaN);
  if (!Number.isFinite(vram) || vram <= 0) return null;
  if (count > 1 && vram % count === 0) return vram / count;
  return vram;
}

export function shapeKeyFromMeter(meter: CatalogMeter): string | null {
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  const family = gpuFamilyToken(model);
  if (!family) return null;
  const count = finiteDim(meter.dimensions.gpuCount) ?? 1;
  const dedicated =
    /dedicated/i.test(meter.sku) ||
    /выделен/i.test(meter.name) ||
    Boolean(meter.dimensions.dedicated) ||
    meter.dimensions.deployment === 'dedicated';

  if (dedicated || (isGpuBundle(meter) && finiteDim(meter.dimensions.vcpu) == null)) {
    return `dedicated|${family}|${count}`;
  }

  if (isGpuBundle(meter)) {
    const vcpu = finiteDim(meter.dimensions.vcpu);
    const ram = finiteDim(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
    if (vcpu == null || ram == null) return null;
    const mem = perGpuMemoryGb(meter);
    const link = interconnectOf(meter);
    return `flavor|${family}|${mem ?? ''}|${link}|${count}|${vcpu}|${ram}`;
  }

  // Unit GPU — unique model rows (1×) when no flavor shape covers this family.
  return `unit|${family}|${perGpuMemoryGb(meter) ?? ''}|${count}`;
}

function titleFor(family: string, count: number, interconnect: string, mem: number | null): string {
  const memPart = mem ? ` ${mem}GB` : '';
  const linkPart = interconnect ? ` ${interconnect}` : '';
  return `${count}× ${family}${memPart}${linkPart}`.replace(/\s+/g, ' ').trim();
}

function presetFromMeter(meter: CatalogMeter, shapeSource: string): GpuPreset | null {
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  const family = gpuFamilyToken(model);
  if (!family) return null;

  const count = finiteDim(meter.dimensions.gpuCount) ?? 1;
  const vcpu = finiteDim(meter.dimensions.vcpu) ?? undefined;
  const ramGiB = finiteDim(meter.dimensions.ramGiB ?? meter.dimensions.ramGb) ?? undefined;
  const mem = perGpuMemoryGb(meter);
  const interconnect = interconnectOf(meter);
  const dedicated =
    /dedicated/i.test(meter.sku) ||
    /выделен/i.test(meter.name) ||
    Boolean(meter.dimensions.dedicated) ||
    meter.dimensions.deployment === 'dedicated' ||
    (isGpuBundle(meter) && vcpu == null);

  const key = shapeKeyFromMeter(meter);
  if (!key) return null;

  const highlight = family === 'B300' || dedicated;
  const subtitle = dedicated
    ? `Выделенный узел · ${shapeSource}`
    : vcpu != null && ramGiB != null
      ? `Flavor · ${vcpu} vCPU · ${ramGiB} GiB · источник ${shapeSource}`
      : `GPU unit · источник ${shapeSource}`;

  return {
    id: `gpu-shape-${key.replace(/\|/g, '-')}`,
    kind: 'gpu',
    title: titleFor(family, count, interconnect, mem),
    subtitle,
    gpuModelMatch: family,
    gpuCount: count,
    vcpu,
    ramGiB,
    diskGiB: dedicated ? undefined : 100,
    shapeSource,
    shapeKey: key,
    highlight,
    dedicated: dedicated || undefined,
    gpuInterconnect: interconnect || null,
    gpuMemoryGb: mem,
  };
}

function providerRank(id: string): number {
  return SHAPE_SOURCE_PRIORITY[id] ?? 99;
}

let cachedFlavorPresets: GpuPreset[] | null = null;

/**
 * Cloud.ru flavors first, then unique VK flavors, curated Selectel GPU Line hosts,
 * then Selectel B300 / remaining unit models. Skips vGPU. Dedupes by shapeKey.
 */
export function buildGpuFlavorPresets(): GpuPreset[] {
  if (cachedFlavorPresets) return cachedFlavorPresets;

  const byKey = new Map<string, GpuPreset>();

  const meters = catalog.meters.filter(
    (m) =>
      m.categoryKey === 'gpu' &&
      m.status === 'available' &&
      !isVgpu(m) &&
      // skip preemptible unit rows when building shapes — on-demand defines the catalog
      (isGpuBundle(m) || String(m.dimensions.purchaseModel || 'on-demand') === 'on-demand'),
  );

  // Pass 1: Cloud.ru bundles
  for (const m of meters.filter((x) => x.provider === 'cloud-ru' && isGpuBundle(x))) {
    const preset = presetFromMeter(m, m.provider);
    const key = preset?.shapeKey;
    if (!preset || !key) continue;
    byKey.set(key, preset);
  }

  // Pass 2: Selectel GPU Line hosts (curated) — before unit fallbacks so A2/L4/… aren't unit-only.
  for (const preset of buildSelectelGpuFlavorPresets()) {
    const key = preset.shapeKey;
    if (!key || byKey.has(key)) continue;
    byKey.set(key, preset);
  }

  // Pass 3: other catalog meters — unique keys only; skip unit rows when a flavor exists.
  const rest = meters
    .filter((m) => m.provider !== 'cloud-ru')
    .sort((a, b) => providerRank(a.provider) - providerRank(b.provider));

  for (const m of rest) {
    const key = shapeKeyFromMeter(m);
    if (!key) continue;

    // Unit rows only if this GPU family has no flavor/dedicated shape yet.
    if (!isGpuBundle(m)) {
      const family = gpuFamilyToken(String(m.dimensions.gpuModel || m.name || ''));
      if (!family) continue;
      const covered = [...byKey.keys()].some(
        (k) => k.startsWith(`flavor|${family}|`) || k.startsWith(`dedicated|${family}|`),
      );
      if (covered) continue;
    }

    if (byKey.has(key)) continue;
    const preset = presetFromMeter(m, m.provider);
    if (preset?.shapeKey) byKey.set(preset.shapeKey, preset);
  }

  const all = [...byKey.values()];
  all.sort((a, b) => {
    // Highlighted (B300) near top of their family; else by family / count / vcpu
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1;
    const fa = a.gpuModelMatch.localeCompare(b.gpuModelMatch);
    if (fa !== 0) return fa;
    if (a.gpuCount !== b.gpuCount) return a.gpuCount - b.gpuCount;
    const va = a.vcpu ?? 0;
    const vb = b.vcpu ?? 0;
    if (va !== vb) return va - vb;
    return (a.ramGiB ?? 0) - (b.ramGiB ?? 0);
  });

  cachedFlavorPresets = all;
  return all;
}

/**
 * Pick a representative 1× (or N×) shape for the card shelf.
 * Prefer hosts that keep Cloud.ru (and peers) in the comparison when they publish
 * that flavor — Selectel 12/128 drops Cloud.ru; Cloud.ru 20/110 keeps Selectel+T1+Cloud.ru.
 * H200: no Cloud.ru SKU → VK 44/256 for Selectel/T1/VK parity.
 */
function pickFeaturedGpuShape(candidates: GpuPreset[], family: string): GpuPreset | undefined {
  if (candidates.length === 0) return undefined;

  const selectel = candidates.filter((p) => p.shapeSource === 'selectel' && p.vcpu != null);
  const cloudRu = candidates.filter((p) => p.shapeSource === 'cloud-ru' && p.vcpu != null);

  if (family === 'H100') {
    // Cloud.ru 80GB PCIe 20/110 — Selectel/T1 compose; Cloud.ru is a real flavor.
    return (
      cloudRu.find((p) => p.gpuMemoryGb === 80 && p.gpuInterconnect === 'PCIe' && p.vcpu === 20 && p.ramGiB === 110) ??
      cloudRu.find((p) => p.gpuMemoryGb === 80 && p.gpuInterconnect === 'PCIe') ??
      candidates.find((p) => p.gpuMemoryGb === 80 && p.gpuInterconnect === 'PCIe') ??
      candidates.find((p) => p.gpuMemoryGb === 80) ??
      candidates.find((p) => p.vcpu != null) ??
      candidates[0]
    );
  }

  if (family === 'H200') {
    // No Cloud.ru H200 — VK host keeps Selectel/T1/VK on one shape.
    return (
      candidates.find((p) => p.shapeSource === 'vk-cloud' && p.vcpu === 44 && p.ramGiB === 256) ??
      candidates.find((p) => p.vcpu === 44 && p.ramGiB === 256) ??
      selectel.find((p) => p.vcpu === 24 && p.ramGiB === 180) ??
      selectel[0] ??
      candidates.find((p) => p.vcpu != null) ??
      candidates[0]
    );
  }

  if (family === 'A100') {
    // Cloud.ru 80GB PCIe 20/125 — Selectel/Yandex compose; Cloud.ru is a real flavor.
    return (
      cloudRu.find((p) => p.gpuMemoryGb === 80 && p.vcpu === 20 && p.ramGiB === 125) ??
      cloudRu.find((p) => p.gpuMemoryGb === 80) ??
      candidates.find((p) => p.gpuMemoryGb === 80 && p.shapeSource === 'cloud-ru') ??
      candidates.find((p) => p.gpuMemoryGb === 80) ??
      candidates.find((p) => p.vcpu != null) ??
      candidates[0]
    );
  }

  if (family === 'L4') {
    // No Cloud.ru L4. VK 16/72 keeps Selectel+VK; Selectel-only 16/64 is single-provider.
    return (
      candidates.find((p) => p.shapeSource === 'vk-cloud' && p.vcpu === 16 && p.ramGiB === 72) ??
      candidates.find((p) => p.shapeSource === 'vk-cloud') ??
      selectel.find((p) => p.vcpu === 16 && p.ramGiB === 64) ??
      selectel[0] ??
      candidates.find((p) => p.vcpu != null) ??
      candidates[0]
    );
  }

  if (family === 'L40S') {
    // Catalog: T1 unit + VK flavor only (no Selectel / Cloud.ru / bare L40).
    return (
      candidates.find((p) => p.shapeSource === 'vk-cloud' && p.vcpu === 16 && p.ramGiB === 112) ??
      candidates.find((p) => p.shapeSource === 'vk-cloud') ??
      candidates.find((p) => p.vcpu != null) ??
      candidates[0]
    );
  }

  return (
    candidates.find((p) => p.shapeSource === 'cloud-ru') ??
    candidates.find((p) => p.vcpu != null) ??
    candidates[0]
  );
}

/** Compact card shelf: B300 + one representative per popular family. */
export function buildGpuCardPresets(all: GpuPreset[] = buildGpuFlavorPresets()): GpuPreset[] {
  const featured: GpuPreset[] = [];
  const b300 = all.find((p) => p.gpuModelMatch === 'B300');
  if (b300) featured.push(b300);

  const want = ['L4', 'L40S', 'A100', 'H100', 'H200', 'V100'] as const;
  for (const family of want) {
    const candidates = all.filter((p) => p.gpuModelMatch === family && p.gpuCount === 1);
    const pick = pickFeaturedGpuShape(candidates, family);
    if (pick) featured.push(pick);
  }

  // Full node: VK 8× H200 240/2048 (Selectel/T1 assemble to the same host in quotes).
  const h200x8 =
    all.find(
      (p) =>
        p.gpuModelMatch === 'H200' &&
        p.gpuCount === 8 &&
        p.shapeSource === 'vk-cloud' &&
        p.vcpu === 240 &&
        p.ramGiB === 2048,
    ) ??
    all.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 8 && p.vcpu === 240) ??
    all.find((p) => p.gpuModelMatch === 'H200' && p.gpuCount === 8);
  if (h200x8) featured.push(h200x8);

  // Full-node Cloud.ru PCIe lattices — Selectel/T1 (H100) or Selectel/Yandex (A100) compose.
  const h100x8 = pickFeaturedGpuShape(
    all.filter((p) => p.gpuModelMatch === 'H100' && p.gpuCount === 8),
    'H100',
  );
  if (h100x8 && !featured.includes(h100x8)) featured.push(h100x8);

  const a100x8 = pickFeaturedGpuShape(
    all.filter((p) => p.gpuModelMatch === 'A100' && p.gpuCount === 8),
    'A100',
  );
  if (a100x8 && !featured.includes(a100x8)) featured.push(a100x8);

  return featured;
}
