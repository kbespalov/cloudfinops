/**
 * Map chat tool calls/results → calculator quote basket for the AI-config sidebar.
 * Period always comes from the calculator page toggle (not the tool args).
 *
 * Model: normalize aliases → optional patch/merge → quote request.
 * Follow-ups («докинь CDN», «150 TiB») merge into the previous basket instead of wiping it.
 */

import {resolveLakehouseInput, type LakehouseSize} from '@/lib/calculator/lakehouse-presets';
import type {DiskMedia} from '@/lib/calculator/presets';
import type {
  AdhocComputeQuoteRequest,
  AdhocGpuQuoteRequest,
  AdhocQuoteRequest,
} from '@/lib/calculator/useAdhocQuote';
import type {LakehouseQuoteRequest} from '@/lib/calculator/useLakehouseQuote';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import {formatGiBCapacity} from '@/lib/calculator/quote-view';

export type SidebarConfigTool =
  | 'get_quote'
  | 'get_lakehouse_quote'
  | 'search_prices'
  | 'compose_solution';

export type ComputeBasketPatch = {
  cdnEgressGiB?: number;
  objectStorageGiB?: number;
  internetEgressGiB?: number;
  publicIpCount?: number;
  vcpu?: number;
  ramGiB?: number;
  diskGiB?: number;
  diskMedia?: DiskMedia | 'nvme';
  preferNvme?: boolean;
};

/** Parse ssd|hdd|nvme (and RU aliases) for the AI basket / quote API. */
export function parseSidebarDiskMedia(raw: unknown): {
  diskMedia?: DiskMedia;
  preferNvme?: boolean;
  explicit: boolean;
} {
  if (typeof raw !== 'string' || !raw.trim()) return {explicit: false};
  const s = raw.trim().toLowerCase();
  if (s === 'hdd' || s === 'network-hdd' || /^(хдд|жестк)/i.test(s) || s.includes('hdd')) {
    return {diskMedia: 'hdd', explicit: true};
  }
  if (s === 'nvme' || s.includes('nvme') || s.includes('нвме')) {
    return {diskMedia: 'ssd', preferNvme: true, explicit: true};
  }
  if (s === 'ssd' || s === 'network-ssd' || s.includes('ssd') || s.includes('ссд')) {
    return {diskMedia: 'ssd', preferNvme: false, explicit: true};
  }
  return {explicit: false};
}

export type SidebarConfigPayload =
  | {
      kind: 'adhoc';
      request: AdhocQuoteRequest;
      summary: {line: string};
      /** Merge additive extras (CDN/S3/egress) from the previous basket when omitted. */
      merge?: boolean;
    }
  | {
      kind: 'lakehouse';
      request: LakehouseQuoteRequest;
      summary: {line: string};
      merge?: boolean;
    }
  /** Merge into the current compute basket (e.g. «докинь CDN»). */
  | {
      kind: 'adhoc-patch';
      patch: ComputeBasketPatch;
      /** add = accumulate volumes; set = replace listed fields. */
      mode?: 'set' | 'add';
      summary: {line: string};
    };

/** Payload that can drive a quote (patches are applied via applySidebarConfig). */
export type AppliedSidebarPayload = Exclude<SidebarConfigPayload, {kind: 'adhoc-patch'}>;

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function cdnSummaryLine(volumeGiB: number): string {
  return `CDN egress ${formatGiBCapacity(volumeGiB)}`;
}

export function appendCdnToSummaryLine(line: string, volumeGiB: number): string {
  const suffix = cdnSummaryLine(volumeGiB);
  if (!line.trim()) return suffix;
  if (/CDN egress/i.test(line)) {
    return line.replace(/CDN egress[^·]*/i, suffix).replace(/\s·\s·/g, ' · ').trim();
  }
  return `${line} · ${suffix}`;
}

function appendPart(line: string, pattern: RegExp, suffix: string): string {
  if (!line.trim()) return suffix;
  if (pattern.test(line)) {
    return line.replace(pattern, suffix).replace(/\s·\s·/g, ' · ').trim();
  }
  return `${line} · ${suffix}`;
}

/** Collapse tool/compose aliases into canonical basket fields. */
export function normalizeSidebarFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {...raw};

  const vcpu = num(raw.vcpu) ?? num(raw.vcpuMin) ?? num(raw.workerVcpu);
  if (vcpu != null) out.vcpu = vcpu;

  const ramGiB = num(raw.ramGiB) ?? num(raw.ramGiBMin) ?? num(raw.workerRamGiB);
  if (ramGiB != null) out.ramGiB = ramGiB;

  const diskGiB = num(raw.diskGiB) ?? num(raw.blockStorageGiB) ?? num(raw.workerDiskGiB);
  if (diskGiB != null) out.diskGiB = diskGiB;

  const media = parseSidebarDiskMedia(raw.diskMedia);
  if (media.explicit) {
    out.diskMedia = media.preferNvme ? 'nvme' : media.diskMedia;
    out.preferNvme = media.preferNvme === true;
  } else if (raw.preferNvme === true) {
    out.diskMedia = 'nvme';
    out.preferNvme = true;
  }

  const publicIpCount = num(raw.publicIpCount) ?? num(raw.publicIp);
  if (publicIpCount != null) out.publicIpCount = publicIpCount;

  const lakeTiB = num(raw.lakeTiB);
  const storageGiB =
    num(raw.storageGiB) ?? num(raw.objectStorageGiB) ?? num(raw.objectStorage);
  if (lakeTiB != null && lakeTiB > 0) {
    out.lakeTiB = lakeTiB;
  } else if (storageGiB != null && storageGiB > 0) {
    // composeLakehouse uses GiB; get_lakehouse_quote uses TiB — keep both.
    out.objectStorageGiB = storageGiB;
    out.lakeTiB = storageGiB / 1024;
    out.storageGiB = storageGiB;
  }

  const cdn =
    num(raw.cdnEgressGiB) ??
    (raw.cdnRequested === true ? 1024 : undefined);
  if (cdn != null && cdn > 0) out.cdnEgressGiB = cdn;

  const egress = num(raw.internetEgressGiB) ?? num(raw.egressGiB);
  if (egress != null && egress > 0) out.internetEgressGiB = egress;

  if (typeof raw.presetId !== 'string' && typeof raw.workload === 'string') {
    out.presetId = raw.workload;
  }

  return out;
}

function diskLabelForSummary(request: AdhocComputeQuoteRequest): string {
  if (request.preferNvme) return 'NVMe';
  return (request.diskMedia ?? 'ssd').toUpperCase();
}

function computeSummaryLine(request: AdhocComputeQuoteRequest): string {
  const cheapestMode = request.family === 'low-cost' && request.vcpuShare === '10%';
  const diskBit = `${diskLabelForSummary(request)} ${request.diskGiB} GiB`;
  const baseLine = cheapestMode
    ? ['Самая дешёвая ВМ / провайдер', `${request.vcpu}/${request.ramGiB}`, diskBit].join(' · ')
    : [
        `${request.vcpu} vCPU`,
        `${request.ramGiB} GiB`,
        diskBit,
        (request.publicIpCount ?? 0) > 0 ? `IP ×${request.publicIpCount}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  let line = baseLine;
  if (request.cdnEgressGiB != null && request.cdnEgressGiB > 0) {
    line = appendCdnToSummaryLine(line, request.cdnEgressGiB);
  }
  if (request.objectStorageGiB != null && request.objectStorageGiB > 0) {
    line = appendPart(
      line,
      /S3[^·]*/i,
      `S3 ${formatGiBCapacity(request.objectStorageGiB)}`,
    );
  }
  if (request.internetEgressGiB != null && request.internetEgressGiB > 0) {
    line = appendPart(
      line,
      /Internet egress[^·]*/i,
      `Internet egress ${formatGiBCapacity(request.internetEgressGiB)}`,
    );
  }
  return line;
}

function mapGetQuote(
  args: Record<string, unknown>,
  period: PeriodMode,
  opts?: {merge?: boolean},
): Extract<AppliedSidebarPayload, {kind: 'adhoc'}> | null {
  const n = normalizeSidebarFields(args);
  const gpuModel = typeof n.gpuModel === 'string' ? n.gpuModel.trim() : '';
  const diskGiB = num(n.diskGiB) ?? 100;

  if (gpuModel) {
    const gpuCount = Math.max(1, Math.round(num(n.gpuCount) ?? 1));
    const request: AdhocGpuQuoteRequest = {
      kind: 'gpu',
      period,
      gpuModelMatch: gpuModel,
      gpuCount,
      vcpu: num(n.vcpu),
      ramGiB: num(n.ramGiB),
      diskGiB,
    };
    const hostBits = [
      request.vcpu != null ? `${request.vcpu} vCPU` : null,
      request.ramGiB != null ? `${request.ramGiB} GiB` : null,
    ].filter(Boolean);
    return {
      kind: 'adhoc',
      request,
      merge: opts?.merge,
      summary: {
        line: [`${gpuCount}× ${gpuModel}`, ...hostBits].join(' · '),
      },
    };
  }

  const cheapestMode = n.mode === 'cheapest-per-provider';
  const vcpu = Math.max(1, Math.round(num(n.vcpu) ?? (cheapestMode ? 1 : 4)));
  const ramGiB = Math.max(
    1,
    Math.round(num(n.ramGiB) ?? (cheapestMode ? 1 : vcpu * 4)),
  );
  const bootDiskGiB = cheapestMode ? (num(n.diskGiB) ?? 10) : diskGiB;
  const cdnEgressGiB = num(n.cdnEgressGiB);
  const objectStorageGiB = num(n.objectStorageGiB);
  const internetEgressGiB = num(n.internetEgressGiB);
  const rawIp = num(n.publicIpCount);
  const publicIpCount =
    rawIp != null && Number.isFinite(rawIp) ? Math.max(0, Math.round(rawIp)) : 0;
  const media = parseSidebarDiskMedia(n.diskMedia);
  const preferNvme =
    !cheapestMode &&
    media.explicit &&
    (media.preferNvme === true || n.preferNvme === true) &&
    media.diskMedia !== 'hdd';
  const diskMediaFields: Pick<AdhocComputeQuoteRequest, 'diskMedia' | 'preferNvme'> = cheapestMode
    ? {diskMedia: 'hdd'}
    : media.explicit
      ? {
          diskMedia: media.diskMedia ?? 'ssd',
          // Only set preferNvme when true; omit false so JSON/request stays clean.
          // Merge still clears NVMe when diskMedia is explicitly ssd|hdd (see mergeComputeExtras).
          ...(preferNvme ? {preferNvme: true as const} : {}),
        }
      : // Omit media so merge keeps the previous HDD/NVMe when follow-up only changes RAM/vCPU.
        {};
  const request: AdhocComputeQuoteRequest = {
    kind: 'compute',
    period,
    vcpu,
    ramGiB,
    diskGiB: bootDiskGiB,
    ...diskMediaFields,
    family: cheapestMode ? 'low-cost' : 'general',
    vmCount: 1,
    publicIpCount,
    purchaseModel: 'on-demand',
    vcpuShare: cheapestMode ? '10%' : '100%',
    ...(cdnEgressGiB != null && cdnEgressGiB > 0
      ? {cdnEgressGiB: Math.round(cdnEgressGiB)}
      : {}),
    ...(objectStorageGiB != null && objectStorageGiB > 0
      ? {objectStorageGiB: Math.round(objectStorageGiB)}
      : {}),
    ...(internetEgressGiB != null && internetEgressGiB > 0
      ? {internetEgressGiB: Math.round(internetEgressGiB)}
      : {}),
  };
  return {
    kind: 'adhoc',
    request,
    merge: opts?.merge ?? true,
    summary: {
      line: computeSummaryLine({
        ...request,
        diskMedia: request.diskMedia ?? 'ssd',
      }),
    },
  };
}

function lakehousePresetFromArgs(args: Record<string, unknown>): LakehouseSize {
  const raw =
    typeof args.presetId === 'string'
      ? args.presetId.trim().toLowerCase()
      : typeof args.workload === 'string'
        ? args.workload.trim().toLowerCase()
        : '';
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw;
  return 'medium';
}

function mapLakehouse(
  args: Record<string, unknown>,
  period: PeriodMode,
  opts?: {merge?: boolean},
): SidebarConfigPayload | null {
  const n = normalizeSidebarFields(args);
  const presetId = lakehousePresetFromArgs(n);
  const input = resolveLakehouseInput(presetId, {
    lakeTiB: num(n.lakeTiB),
    hotPercent: num(n.hotPercent),
    k8sTier: n.k8sTier === 'basic' || n.k8sTier === 'ha' ? n.k8sTier : undefined,
    etlHoursPerDay: num(n.etlHoursPerDay),
    queryHoursPerDay: num(n.queryHoursPerDay),
  });
  const request: LakehouseQuoteRequest = {
    period,
    presetId,
    lakeTiB: input.lakeTiB,
    hotPercent: input.hotPercent,
    k8sTier: input.k8sTier,
    etlHoursPerDay: input.etl.hoursPerDay,
    queryHoursPerDay: input.query.hoursPerDay,
  };
  const k8sLabel = input.k8sTier === 'ha' ? 'отказоустойчивый' : 'базовый';
  return {
    kind: 'lakehouse',
    request,
    merge: opts?.merge ?? true,
    summary: {
      line: `Lakehouse ${presetId} · ${input.lakeTiB} TiB · K8s ${k8sLabel}`,
    },
  };
}

/** CDN (and similar) volume from search_prices → additive patch. */
function mapSearchPricesCdn(args: Record<string, unknown>): SidebarConfigPayload | null {
  const category = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
  const query = typeof args.query === 'string' ? args.query : '';
  const looksCdn = category === 'cdn' || /\bcdn\b/i.test(query);
  if (!looksCdn) return null;

  let volumeGiB = num(args.volumeGiB) ?? num(args.cdnEgressGiB);
  if (volumeGiB == null || volumeGiB <= 0) {
    volumeGiB = 1024;
  }
  volumeGiB = Math.min(Math.round(volumeGiB), 512 * 1024);
  return {
    kind: 'adhoc-patch',
    mode: 'add',
    patch: {cdnEgressGiB: volumeGiB},
    summary: {line: cdnSummaryLine(volumeGiB)},
  };
}

function mapComposeSolution(
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  const solutionType = typeof args.solutionType === 'string' ? args.solutionType : '';
  if (solutionType === 'lakehouse') {
    return mapLakehouse(
      {
        ...(typeof args.requirements === 'object' && args.requirements
          ? (args.requirements as Record<string, unknown>)
          : {}),
      },
      period,
      {merge: true},
    );
  }
  if (solutionType !== 'virtual_machine' && solutionType !== 'web_application') {
    return null;
  }
  const req =
    typeof args.requirements === 'object' && args.requirements && !Array.isArray(args.requirements)
      ? (args.requirements as Record<string, unknown>)
      : {};
  return mapGetQuote(req, period, {merge: true});
}

function mapFromRequirementSpec(
  spec: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  const solutionType = typeof spec.solutionType === 'string' ? spec.solutionType : '';
  const quantities =
    typeof spec.quantities === 'object' && spec.quantities && !Array.isArray(spec.quantities)
      ? (spec.quantities as Record<string, unknown>)
      : {};
  const extras =
    typeof spec.extras === 'object' && spec.extras && !Array.isArray(spec.extras)
      ? (spec.extras as Record<string, unknown>)
      : {};
  const constraints =
    typeof spec.constraints === 'object' && spec.constraints && !Array.isArray(spec.constraints)
      ? (spec.constraints as Record<string, unknown>)
      : {};

  if (solutionType === 'lakehouse') {
    return mapLakehouse(
      {
        workload: extras.workload,
        presetId: extras.workload,
        storageGiB: quantities.storageGiB,
        objectStorageGiB: quantities.storageGiB ?? quantities.objectStorageGiB,
        hotPercent: extras.hotPercent,
        k8sTier: constraints.k8sTier,
      },
      period,
      {merge: true},
    );
  }
  if (solutionType !== 'virtual_machine' && solutionType !== 'web_application') {
    return null;
  }
  const storageConstraint =
    typeof constraints.storage === 'object' && constraints.storage
      ? (constraints.storage as Record<string, unknown>)
      : {};
  return mapGetQuote(
    {
      vcpu: quantities.workerVcpu ?? quantities.vcpu ?? constraints.minVcpu,
      ramGiB: quantities.workerRamGiB ?? quantities.ramGiB ?? constraints.minRamGiB,
      diskGiB: quantities.diskGiB ?? quantities.workerDiskGiB ?? quantities.blockStorageGiB,
      diskMedia: quantities.diskMedia ?? storageConstraint.media,
      publicIpCount: quantities.publicIpCount,
      cdnEgressGiB: quantities.cdnEgressGiB,
      objectStorageGiB: quantities.storageGiB ?? quantities.objectStorageGiB,
      internetEgressGiB: quantities.egressGiB ?? quantities.internetEgressGiB,
      gpuModel: quantities.gpuModel ?? extras.gpuModel,
      gpuCount: quantities.gpuCount,
    },
    period,
    {merge: true},
  );
}

/** Build a sidebar quote payload from a chat tool call (+ page period). */
export function sidebarConfigFromTool(
  tool: string,
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  if (tool === 'get_quote') return mapGetQuote(args, period, {merge: true});
  if (tool === 'get_lakehouse_quote') return mapLakehouse(args, period, {merge: true});
  if (tool === 'search_prices') return mapSearchPricesCdn(args);
  if (tool === 'compose_solution') return mapComposeSolution(args, period);
  return null;
}

/**
 * Prefer tool *results* so the sidebar matches the numbers in the chat answer
 * (resolved request / normalized requirementSpec).
 */
export function sidebarConfigFromToolResult(
  tool: string,
  content: string,
  period: PeriodMode,
): SidebarConfigPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.error) return null;

  if (tool === 'get_lakehouse_quote' && d.request && typeof d.request === 'object') {
    return mapLakehouse(d.request as Record<string, unknown>, period, {merge: true});
  }
  if (tool === 'get_quote' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>;
    return mapGetQuote(
      {
        ...req,
        gpuModel: req.gpuModel ?? undefined,
        gpuCount: req.gpuCount ?? undefined,
      },
      period,
      {merge: true},
    );
  }
  if (tool === 'compose_solution' && d.requirementSpec && typeof d.requirementSpec === 'object') {
    return mapFromRequirementSpec(d.requirementSpec as Record<string, unknown>, period);
  }
  return null;
}

function mergeComputeExtras(
  base: AdhocComputeQuoteRequest,
  incoming: AdhocComputeQuoteRequest,
): AdhocComputeQuoteRequest {
  const diskMedia = incoming.diskMedia ?? base.diskMedia;
  const preferNvme =
    diskMedia === 'hdd'
      ? false
      : incoming.diskMedia != null || incoming.preferNvme != null
        ? incoming.preferNvme === true
        : base.preferNvme === true;
  return {
    ...incoming,
    diskMedia,
    preferNvme: preferNvme || undefined,
    cdnEgressGiB:
      incoming.cdnEgressGiB != null && incoming.cdnEgressGiB > 0
        ? incoming.cdnEgressGiB
        : base.cdnEgressGiB,
    objectStorageGiB:
      incoming.objectStorageGiB != null && incoming.objectStorageGiB > 0
        ? incoming.objectStorageGiB
        : base.objectStorageGiB,
    internetEgressGiB:
      incoming.internetEgressGiB != null && incoming.internetEgressGiB > 0
        ? incoming.internetEgressGiB
        : base.internetEgressGiB,
  };
}

function mergeLakehouseRequests(
  base: LakehouseQuoteRequest,
  incoming: LakehouseQuoteRequest,
): LakehouseQuoteRequest {
  // Incoming wins for every field it resolved; preserve nothing exotic beyond that.
  return {...base, ...incoming};
}

/** Merge a CDN (or similar) patch into the last adhoc compute basket. */
export function mergeSidebarPatch(
  previous: AppliedSidebarPayload | null,
  patch: Extract<SidebarConfigPayload, {kind: 'adhoc-patch'}>,
  period: PeriodMode,
): AppliedSidebarPayload | null {
  const mode = patch.mode ?? 'add';
  if (!previous || previous.kind !== 'adhoc' || previous.request.kind !== 'compute') {
    const seed = mapGetQuote(
      {
        vcpu: patch.patch.vcpu ?? 8,
        ramGiB: patch.patch.ramGiB ?? 32,
        diskGiB: patch.patch.diskGiB ?? 100,
        publicIpCount: patch.patch.publicIpCount ?? 0,
        cdnEgressGiB: patch.patch.cdnEgressGiB,
        objectStorageGiB: patch.patch.objectStorageGiB,
        internetEgressGiB: patch.patch.internetEgressGiB,
      },
      period,
      {merge: false},
    );
    return seed;
  }

  const prev = previous.request;
  const next: AdhocComputeQuoteRequest = {...prev, period};

  const applyVolume = (
    key: 'cdnEgressGiB' | 'objectStorageGiB' | 'internetEgressGiB',
    delta: number | undefined,
  ) => {
    if (delta == null || !Number.isFinite(delta)) return;
    const d = Math.max(0, Math.round(delta));
    if (mode === 'add') {
      next[key] = Math.min(Math.round((prev[key] ?? 0) + d), 512 * 1024);
    } else {
      next[key] = Math.min(d, 512 * 1024);
    }
  };

  applyVolume('cdnEgressGiB', patch.patch.cdnEgressGiB);
  applyVolume('objectStorageGiB', patch.patch.objectStorageGiB);
  applyVolume('internetEgressGiB', patch.patch.internetEgressGiB);

  if (patch.patch.publicIpCount != null) {
    next.publicIpCount = Math.max(0, Math.round(patch.patch.publicIpCount));
  }
  if (patch.patch.vcpu != null) next.vcpu = Math.max(1, Math.round(patch.patch.vcpu));
  if (patch.patch.ramGiB != null) next.ramGiB = Math.max(1, Math.round(patch.patch.ramGiB));
  if (patch.patch.diskGiB != null) next.diskGiB = Math.max(1, Math.round(patch.patch.diskGiB));
  if (patch.patch.diskMedia != null || patch.patch.preferNvme != null) {
    const media = parseSidebarDiskMedia(patch.patch.diskMedia ?? (patch.patch.preferNvme ? 'nvme' : ''));
    if (media.explicit) {
      next.diskMedia = media.diskMedia ?? 'ssd';
      next.preferNvme = media.preferNvme === true ? true : undefined;
    }
  }

  return {
    kind: 'adhoc',
    request: next,
    merge: true,
    summary: {line: computeSummaryLine({...next, diskMedia: next.diskMedia ?? 'ssd'})},
  };
}

/**
 * Apply a sidebar_config payload onto the previous basket (merge semantics).
 */
export function applySidebarConfig(
  previous: AppliedSidebarPayload | null,
  payload: SidebarConfigPayload,
  period: PeriodMode,
): AppliedSidebarPayload | null {
  if (payload.kind === 'adhoc-patch') {
    return mergeSidebarPatch(previous, payload, period);
  }

  if (payload.kind === 'lakehouse') {
    const incoming = {...payload, request: {...payload.request, period}};
    if (previous?.kind === 'lakehouse' && payload.merge !== false) {
      const request = mergeLakehouseRequests(previous.request, incoming.request);
      const k8sLabel = request.k8sTier === 'ha' ? 'отказоустойчивый' : 'базовый';
      return {
        kind: 'lakehouse',
        merge: true,
        request,
        summary: {
          line: `Lakehouse ${request.presetId} · ${request.lakeTiB} TiB · K8s ${k8sLabel}`,
        },
      };
    }
    return incoming;
  }

  // adhoc
  const incomingReq =
    payload.request.kind === 'compute'
      ? {...payload.request, period}
      : {...payload.request, period};

  if (
    previous?.kind === 'adhoc' &&
    previous.request.kind === 'compute' &&
    incomingReq.kind === 'compute' &&
    payload.merge !== false
  ) {
    const request = mergeComputeExtras(previous.request, incomingReq);
    return {
      kind: 'adhoc',
      merge: true,
      request,
      summary: {line: computeSummaryLine({...request, diskMedia: request.diskMedia ?? 'ssd'})},
    };
  }

  if (incomingReq.kind === 'compute') {
    const request: AdhocComputeQuoteRequest = {
      ...incomingReq,
      diskMedia: incomingReq.diskMedia ?? 'ssd',
    };
    return {
      kind: 'adhoc',
      request,
      summary: {line: computeSummaryLine(request)},
      merge: payload.merge,
    };
  }

  return {
    kind: 'adhoc',
    request: incomingReq,
    summary: payload.summary,
    merge: payload.merge,
  };
}
