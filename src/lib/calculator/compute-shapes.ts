/**
 * Is this vCPU/RAM shape orderable for a provider?
 *
 * One API for all clouds. Catalog meters publish the rules in dimensions:
 * - minVcpu / minRamGiB / maxVcpu / maxRamGiB + shapeMode: envelope
 * - availableVmTypes + shapeMode: exact-vm-types (MWS)
 * - per-flavor vcpu/ramGiB + shapeMode: exact-flavors (Cloud.ru)
 *
 * Fractional-share lattices (Yandex 5/20/50%, Cloud.ru 10/30%) stay in
 * vcpu-share.ts and are applied by the calculator before this check.
 *
 * See docs/flavors.md.
 */

import {catalog, type CatalogMeter} from '@/lib/catalog';

export type ComputeEnvelope = {
  minVcpu: number;
  minRamGiB: number;
  maxVcpu: number;
  maxRamGiB: number;
  /** Yandex: RAM ≤ N GiB per vCPU (platform/share dependent). */
  maxRamGiBPerVcpu?: number;
};

export type VmTypeShape = {id?: string; vcpu: number; ramGiB: number};

export type ShapeMode = 'envelope' | 'exact-vm-types' | 'exact-flavors';

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteNonNeg(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse envelope fields from a single meter (partial OK). */
export function envelopeFieldsOf(meter: CatalogMeter): Partial<ComputeEnvelope> {
  const out: Partial<ComputeEnvelope> = {};
  const minVcpu = finitePositive(meter.dimensions.minVcpu);
  const minRam = finiteNonNeg(meter.dimensions.minRamGiB ?? meter.dimensions.minRamGb);
  const maxVcpu = finitePositive(meter.dimensions.maxVcpu);
  const maxRam = finitePositive(meter.dimensions.maxRamGiB ?? meter.dimensions.maxRamGb);
  const maxRamPer = finitePositive(
    meter.dimensions.maxRamGiBPerVcpu ?? meter.dimensions.maxRamGbPerVcpu,
  );
  if (minVcpu != null) out.minVcpu = minVcpu;
  if (minRam != null) out.minRamGiB = minRam;
  if (maxVcpu != null) out.maxVcpu = maxVcpu;
  if (maxRam != null) out.maxRamGiB = maxRam;
  if (maxRamPer != null) out.maxRamGiBPerVcpu = maxRamPer;
  return out;
}

export function availableVmTypesOf(meter: CatalogMeter): VmTypeShape[] {
  const raw = meter.dimensions.availableVmTypes;
  if (!Array.isArray(raw)) return [];
  const out: VmTypeShape[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const vcpu = finitePositive(o.vcpu);
    const ramGiB = finitePositive(o.ramGiB ?? o.ramGb);
    if (vcpu == null || ramGiB == null) continue;
    out.push({
      id: typeof o.id === 'string' ? o.id : undefined,
      vcpu,
      ramGiB,
    });
  }
  return out;
}

function generalComputeMeters(provider: string): CatalogMeter[] {
  return catalog.meters.filter(
    (m) =>
      m.provider === provider &&
      m.status === 'available' &&
      !m.synthetic &&
      (m.meter === 'compute.vcpu' ||
        m.meter === 'compute.ram' ||
        (m.meter === 'compute.flavor' && m.categoryKey === 'compute')),
  );
}

/**
 * Per-meter envelopes (platform / share rows). A shape is orderable if it fits
 * at least one complete envelope — important for Yandex Ice Lake vs Cascade Lake.
 */
export function providerEnvelopes(provider: string): ComputeEnvelope[] {
  const out: ComputeEnvelope[] = [];
  const seen = new Set<string>();
  for (const m of generalComputeMeters(provider)) {
    // Unit meters and flavor books both may carry min/max (Cloud.ru is flavor-only).
    const f = envelopeFieldsOf(m);
    if (f.maxVcpu == null || f.maxRamGiB == null) continue;
    const env: ComputeEnvelope = {
      minVcpu: f.minVcpu ?? 1,
      minRamGiB: f.minRamGiB ?? 0.5,
      maxVcpu: f.maxVcpu,
      maxRamGiB: f.maxRamGiB,
      ...(f.maxRamGiBPerVcpu != null ? {maxRamGiBPerVcpu: f.maxRamGiBPerVcpu} : {}),
    };
    const key = `${env.minVcpu}:${env.minRamGiB}:${env.maxVcpu}:${env.maxRamGiB}:${env.maxRamGiBPerVcpu ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(env);
  }
  return out;
}

/** Widest published envelope (for miss-reason copy). */
export function providerEnvelope(provider: string): ComputeEnvelope | null {
  const envs = providerEnvelopes(provider);
  if (!envs.length) return null;
  return envs.reduce(
    (acc, e) => ({
      minVcpu: Math.min(acc.minVcpu, e.minVcpu),
      minRamGiB: Math.min(acc.minRamGiB, e.minRamGiB),
      maxVcpu: Math.max(acc.maxVcpu, e.maxVcpu),
      maxRamGiB: Math.max(acc.maxRamGiB, e.maxRamGiB),
    }),
    {...envs[0]!},
  );
}

export function providerVmTypes(provider: string): VmTypeShape[] {
  const out: VmTypeShape[] = [];
  const seen = new Set<string>();
  for (const m of generalComputeMeters(provider)) {
    for (const t of availableVmTypesOf(m)) {
      const key = `${t.vcpu}x${t.ramGiB}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

export function shapeModeOf(provider: string): ShapeMode | null {
  for (const m of generalComputeMeters(provider)) {
    const mode = m.dimensions.shapeMode;
    if (mode === 'exact-vm-types' || mode === 'exact-flavors' || mode === 'envelope') {
      return mode;
    }
  }
  if (providerVmTypes(provider).length) return 'exact-vm-types';
  if (provider === 'cloud-ru') return 'exact-flavors';
  if (providerEnvelope(provider)) return 'envelope';
  return null;
}

function flavorShapes(provider: string): VmTypeShape[] {
  const out: VmTypeShape[] = [];
  const seen = new Set<string>();
  for (const m of generalComputeMeters(provider)) {
    if (m.meter !== 'compute.flavor') continue;
    const vcpu = finitePositive(m.dimensions.vcpu);
    const ramGiB = finitePositive(m.dimensions.ramGiB ?? m.dimensions.ramGb);
    if (vcpu == null || ramGiB == null) continue;
    const key = `${vcpu}x${ramGiB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({vcpu, ramGiB});
  }
  return out;
}

function inEnvelope(env: ComputeEnvelope, vcpu: number, ramGiB: number): boolean {
  if (
    vcpu < env.minVcpu ||
    vcpu > env.maxVcpu ||
    ramGiB < env.minRamGiB ||
    ramGiB > env.maxRamGiB
  ) {
    return false;
  }
  if (env.maxRamGiBPerVcpu != null && ramGiB > vcpu * env.maxRamGiBPerVcpu + 1e-9) {
    return false;
  }
  return true;
}

/**
 * Yes/no: can this provider order this vCPU/RAM shape from the public catalog?
 *
 * Data-driven from YAML dimensions — same path for VK, Yandex, Selectel, T1, MWS, Cloud.ru.
 */
export function shapeAllowedForProvider(
  provider: string,
  vcpu: number,
  ramGiB: number,
): boolean {
  if (!Number.isFinite(vcpu) || !Number.isFinite(ramGiB) || vcpu <= 0 || ramGiB <= 0) {
    return false;
  }

  const mode = shapeModeOf(provider);
  // Self-serve envelope (maxVcpu/maxRamGiB) caps even exact lattices when set —
  // e.g. Cloud.ru price book lists 64/320, console often tops out at 32/128.
  const envs = providerEnvelopes(provider);
  if (envs.length && !envs.some((env) => inEnvelope(env, vcpu, ramGiB))) {
    return false;
  }

  if (mode === 'exact-vm-types') {
    const types = providerVmTypes(provider);
    if (!types.length) return true;
    return types.some((t) => t.vcpu === vcpu && t.ramGiB === ramGiB);
  }

  if (mode === 'exact-flavors') {
    const flavors = flavorShapes(provider);
    if (!flavors.length) return true;
    return flavors.some((t) => t.vcpu === vcpu && t.ramGiB === ramGiB);
  }

  if (!envs.length) return true; // no markup yet — do not invent a deny
  return true; // already passed envelope check above
}

/** Alias — “is this shape allowed for the provider?” */
export const isComputeShapeAllowed = shapeAllowedForProvider;

export type ShapePoint = {vcpu: number; ramGiB: number};

export type ProviderShapeLimits = {
  providerId: string;
  shapeMode: ShapeMode | null;
  /** Smallest orderable compute shape (by vCPU, then RAM) — not cheapest ₽. */
  min: ShapePoint | null;
  /** Largest orderable general-compute shape (no GPU). */
  max: ShapePoint | null;
  /** Hard platform caps when published (may require support / custom flavor). */
  platformMax: ShapePoint | null;
  /** Per-platform / per-share envelopes (Yandex Ice vs Cascade, …). */
  envelopes: ComputeEnvelope[];
  /** Count of exact published shapes when shapeMode is a lattice. */
  publishedShapes: number | null;
  note?: string;
};

function pickMinShape(shapes: ShapePoint[]): ShapePoint | null {
  if (!shapes.length) return null;
  return shapes.reduce((best, s) => {
    if (s.vcpu < best.vcpu) return s;
    if (s.vcpu === best.vcpu && s.ramGiB < best.ramGiB) return s;
    return best;
  });
}

function pickMaxShape(shapes: ShapePoint[]): ShapePoint | null {
  if (!shapes.length) return null;
  return shapes.reduce((best, s) => {
    if (s.vcpu > best.vcpu) return s;
    if (s.vcpu === best.vcpu && s.ramGiB > best.ramGiB) return s;
    return best;
  });
}

function platformMaxOf(provider: string): ShapePoint | null {
  let maxVcpu = 0;
  let maxRamGiB = 0;
  for (const m of generalComputeMeters(provider)) {
    const v = finitePositive(m.dimensions.platformMaxVcpu);
    const r = finitePositive(m.dimensions.platformMaxRamGiB ?? m.dimensions.platformMaxRamGb);
    if (v != null) maxVcpu = Math.max(maxVcpu, v);
    if (r != null) maxRamGiB = Math.max(maxRamGiB, r);
  }
  if (maxVcpu <= 0 && maxRamGiB <= 0) return null;
  return {
    vcpu: maxVcpu || 0,
    ramGiB: maxRamGiB || 0,
  };
}

/**
 * When max is a union across platforms/shares, list the distinct full-size
 * ceilings that contribute to maxVcpu or maxRamGiB (skip tiny share envelopes).
 */
function unionMaxNote(envelopes: ComputeEnvelope[], max: ShapePoint): string {
  const full = envelopes.filter(
    (e) => e.maxVcpu === max.vcpu || e.maxRamGiB === max.ramGiB,
  );
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const e of full) {
    const key = `${e.maxVcpu}/${e.maxRamGiB}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${e.maxVcpu} vCPU / ${e.maxRamGiB} GiB`);
  }
  const ceilings = parts.length ? parts.join('; ') : `${max.vcpu} vCPU / ${max.ramGiB} GiB`;
  return (
    `Несколько платформ/долей: max в таблице — объединение потолков, не одна orderable форма. ` +
    `Реальные потолки: ${ceilings}. Пара ${max.vcpu}×${max.ramGiB} недоступна сразу.`
  );
}

/**
 * Min/max general-compute (CPU+RAM, no GPU) shapes for a provider.
 * Min = smallest compute footprint; Max = largest public catalog shape.
 */
export function providerShapeLimits(provider: string): ProviderShapeLimits {
  const mode = shapeModeOf(provider);
  const envelopes = providerEnvelopes(provider);
  const platformMax = platformMaxOf(provider);

  if (mode === 'exact-vm-types' || mode === 'exact-flavors') {
    const lattice =
      mode === 'exact-vm-types'
        ? providerVmTypes(provider).map((t) => ({vcpu: t.vcpu, ramGiB: t.ramGiB}))
        : flavorShapes(provider);
    const orderable =
      envelopes.length > 0
        ? lattice.filter((s) => envelopes.some((env) => inEnvelope(env, s.vcpu, s.ramGiB)))
        : lattice;
    const shapes = orderable.length ? orderable : lattice;
    return {
      providerId: provider,
      shapeMode: mode,
      min: pickMinShape(shapes),
      max: pickMaxShape(shapes),
      platformMax,
      envelopes,
      publishedShapes: shapes.length,
      note:
        mode === 'exact-vm-types'
          ? 'Только опубликованные vmTypes (свободная сборка недоступна).'
          : 'Только фиксированные flavors в self-serve конверте; в min могут входить эконом-доли vCPU (10%/30%). В прайсе бывают крупные формы вне консоли.',
    };
  }

  const env = providerEnvelope(provider);
  const max = env ? {vcpu: env.maxVcpu, ramGiB: env.maxRamGiB} : null;
  return {
    providerId: provider,
    shapeMode: mode,
    min: env ? {vcpu: env.minVcpu, ramGiB: env.minRamGiB} : null,
    max,
    platformMax,
    envelopes,
    publishedShapes: null,
    note:
      envelopes.length > 1 && max
        ? unionMaxNote(envelopes, max)
        : undefined,
  };
}

/** Short RU reason when shape is outside provider catalog. */
export function explainShapeMiss(provider: string, vcpu: number, ramGiB: number): string | null {
  if (shapeAllowedForProvider(provider, vcpu, ramGiB)) return null;

  const mode = shapeModeOf(provider);
  if (mode === 'exact-vm-types') {
    return `нет vmType ${vcpu} vCPU / ${ramGiB} GiB`;
  }
  if (mode === 'exact-flavors') {
    return `нет flavor ${vcpu} vCPU / ${ramGiB} GiB`;
  }

  const env = providerEnvelope(provider);
  if (env) {
    // VK STD self-serve: keep a recognizable hint when envelope is the tight 16/64.
    if (provider === 'vk-cloud' && env.maxVcpu <= 16 && env.maxRamGiB <= 64) {
      return `нет STD-формы ≤${env.maxVcpu} vCPU / ≤${env.maxRamGiB} GiB (self-serve)`;
    }
    return `вне каталога ${env.minVcpu}–${env.maxVcpu} vCPU / ${env.minRamGiB}–${env.maxRamGiB} GiB`;
  }
  return `нет формы ${vcpu} vCPU / ${ramGiB} GiB`;
}
