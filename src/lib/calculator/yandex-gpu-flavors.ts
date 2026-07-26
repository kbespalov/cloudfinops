/**
 * Yandex Compute GPU host lattices from the public console / docs
 * (https://yandex.cloud/en/docs/compute/concepts/gpus).
 *
 * Catalog stores unit GPU meters; hostConfigs on those meters define orderable
 * (GPU × vCPU × RAM) shapes. We publish them as calculator flavor presets so
 * Gen2 / Platform V4 / T4i / A100 / V100 / T4 can be quoted as GPU + host.
 */

import {catalog, gpuDisplayIdentity, type CatalogMeter} from '@/lib/catalog';
import type {GpuPreset} from '@/lib/calculator/presets';

export type YandexGpuHostConfig = {
  gpuCount: number;
  vcpu: number;
  ramGiB: number;
};

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse dimensions.hostConfigs from a Yandex GPU unit meter. */
export function hostConfigsOf(meter: CatalogMeter): YandexGpuHostConfig[] {
  const raw = meter.dimensions.hostConfigs;
  if (!Array.isArray(raw)) return [];
  const out: YandexGpuHostConfig[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const gpuCount = finitePositive(o.gpuCount);
    const vcpu = finitePositive(o.vcpu);
    const ramGiB = finitePositive(o.ramGiB ?? o.ramGb);
    if (gpuCount == null || vcpu == null || ramGiB == null) continue;
    out.push({gpuCount, vcpu, ramGiB});
  }
  return out;
}

function familyOf(meter: CatalogMeter): string | null {
  const id = gpuDisplayIdentity(meter);
  if (id?.card) return id.card;
  const model = String(meter.dimensions.gpuModel || meter.name || '');
  if (/A100/i.test(model)) return 'A100';
  if (/V100/i.test(model)) return 'V100';
  if (!/T4i/i.test(model) && (/\bT4\b/i.test(model) || /Tesla T4/i.test(model))) return 'T4';
  return null;
}

function interconnectOf(meter: CatalogMeter): string | null {
  const raw = meter.dimensions.gpuInterconnect;
  if (typeof raw === 'string' && raw.trim()) {
    if (/pcie|pci\b/i.test(raw)) return 'PCIe';
    if (/nvlink|\bnvl\b/i.test(raw)) return 'NVLink';
    return raw.trim();
  }
  const family = familyOf(meter);
  if (family === 'T4' || family === 'T4i') return 'PCIe';
  return null;
}

function shapeKey(family: string, mem: number | null, link: string | null, cfg: YandexGpuHostConfig): string {
  return `flavor|${family}|${mem ?? ''}|${link ?? ''}|${cfg.gpuCount}|${cfg.vcpu}|${cfg.ramGiB}`;
}

function titleFor(family: string, mem: number | null, link: string | null, cfg: YandexGpuHostConfig): string {
  const memPart = mem != null ? ` ${mem}GB` : '';
  const linkPart = link ? ` ${link}` : '';
  return `${cfg.gpuCount}× ${family}${memPart}${linkPart}`.replace(/\s+/g, ' ').trim();
}

/**
 * Curated Yandex GPU host presets from catalog hostConfigs (on-demand unit meters).
 * Keeps unnamed platforms as Gen2 / Platform V4 / T4i — never aliases to H200/A100.
 */
export function buildYandexGpuFlavorPresets(): GpuPreset[] {
  const meters = catalog.meters.filter(
    (m) =>
      m.provider === 'yandex-cloud' &&
      m.categoryKey === 'gpu' &&
      m.status === 'available' &&
      !m.synthetic &&
      String(m.dimensions.purchaseModel || 'on-demand') === 'on-demand' &&
      hostConfigsOf(m).length > 0,
  );

  const byKey = new Map<string, GpuPreset>();

  for (const m of meters) {
    const family = familyOf(m);
    if (!family) continue;
    const mem = finitePositive(m.dimensions.gpuMemoryGb);
    const link = interconnectOf(m);
    for (const cfg of hostConfigsOf(m)) {
      const key = shapeKey(family, mem, link, cfg);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        id: `gpu-shape-${key.replace(/\|/g, '-')}`,
        kind: 'gpu',
        title: titleFor(family, mem, link, cfg),
        subtitle: `Flavor · ${cfg.vcpu} vCPU · ${cfg.ramGiB} GiB · источник yandex-cloud`,
        gpuModelMatch: family,
        gpuCount: cfg.gpuCount,
        vcpu: cfg.vcpu,
        ramGiB: cfg.ramGiB,
        diskGiB: 100,
        shapeSource: 'yandex-cloud',
        shapeKey: key,
        gpuInterconnect: link,
        gpuMemoryGb: mem ?? undefined,
      });
    }
  }

  return [...byKey.values()];
}
