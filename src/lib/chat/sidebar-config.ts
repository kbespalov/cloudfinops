/**
 * Map chat tool calls → calculator quote requests for the AI-config sidebar.
 * Period always comes from the calculator page toggle (not the tool args).
 */

import {resolveLakehouseInput, type LakehouseSize} from '@/lib/calculator/lakehouse-presets';
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

export type SidebarConfigPayload =
  | {kind: 'adhoc'; request: AdhocQuoteRequest; summary: {line: string}}
  | {kind: 'lakehouse'; request: LakehouseQuoteRequest; summary: {line: string}}
  /** Merge into the current compute basket (e.g. «докинь CDN»). */
  | {
      kind: 'adhoc-patch';
      patch: {cdnEgressGiB: number};
      summary: {line: string};
    };

/** Payload that can drive a quote (patches are applied via mergeSidebarPatch). */
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

function mapGetQuote(
  args: Record<string, unknown>,
  period: PeriodMode,
): Extract<AppliedSidebarPayload, {kind: 'adhoc'}> | null {
  const gpuModel = typeof args.gpuModel === 'string' ? args.gpuModel.trim() : '';
  const diskGiB = num(args.diskGiB) ?? 100;

  if (gpuModel) {
    const gpuCount = Math.max(1, Math.round(num(args.gpuCount) ?? 1));
    const request: AdhocGpuQuoteRequest = {
      kind: 'gpu',
      period,
      gpuModelMatch: gpuModel,
      gpuCount,
      vcpu: num(args.vcpu),
      ramGiB: num(args.ramGiB),
      diskGiB,
    };
    const hostBits = [
      request.vcpu != null ? `${request.vcpu} vCPU` : null,
      request.ramGiB != null ? `${request.ramGiB} GiB` : null,
    ].filter(Boolean);
    return {
      kind: 'adhoc',
      request,
      summary: {
        line: [`${gpuCount}× ${gpuModel}`, ...hostBits].join(' · '),
      },
    };
  }

  const vcpu = Math.max(1, Math.round(num(args.vcpu) ?? 4));
  const ramGiB = Math.max(1, Math.round(num(args.ramGiB) ?? vcpu * 4));
  const cdnEgressGiB = num(args.cdnEgressGiB);
  const request: AdhocComputeQuoteRequest = {
    kind: 'compute',
    period,
    vcpu,
    ramGiB,
    diskGiB,
    diskMedia: 'ssd',
    family: 'general',
    vmCount: 1,
    publicIpCount: 1,
    purchaseModel: 'on-demand',
    vcpuShare: '100%',
    ...(cdnEgressGiB != null && cdnEgressGiB > 0
      ? {cdnEgressGiB: Math.round(cdnEgressGiB)}
      : {}),
  };
  const baseLine = `${vcpu} vCPU · ${ramGiB} GiB · SSD ${diskGiB} GiB`;
  return {
    kind: 'adhoc',
    request,
    summary: {
      line:
        request.cdnEgressGiB != null
          ? appendCdnToSummaryLine(baseLine, request.cdnEgressGiB)
          : baseLine,
    },
  };
}

function mapLakehouse(
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  const presetRaw = typeof args.presetId === 'string' ? args.presetId.trim().toLowerCase() : '';
  const presetId: LakehouseSize =
    presetRaw === 'small' || presetRaw === 'medium' || presetRaw === 'large'
      ? presetRaw
      : 'medium';
  const input = resolveLakehouseInput(presetId, {
    lakeTiB: num(args.lakeTiB),
    hotPercent: num(args.hotPercent),
    k8sTier: args.k8sTier === 'basic' || args.k8sTier === 'ha' ? args.k8sTier : undefined,
    etlHoursPerDay: num(args.etlHoursPerDay),
    queryHoursPerDay: num(args.queryHoursPerDay),
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
    summary: {
      line: `Lakehouse ${presetId} · ${input.lakeTiB} TiB · K8s ${k8sLabel}`,
    },
  };
}

/** CDN volume from search_prices → patch for the existing compute basket. */
function mapSearchPricesCdn(
  args: Record<string, unknown>,
): SidebarConfigPayload | null {
  const category = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
  const query = typeof args.query === 'string' ? args.query : '';
  const looksCdn = category === 'cdn' || /\bcdn\b/i.test(query);
  if (!looksCdn) return null;

  let volumeGiB = num(args.volumeGiB);
  if (volumeGiB == null || volumeGiB <= 0) {
    // Follow-ups like «докинь CDN» without volume → 1 ТиБ.
    volumeGiB = 1024;
  }
  volumeGiB = Math.min(Math.round(volumeGiB), 512 * 1024);
  return {
    kind: 'adhoc-patch',
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
    );
  }
  if (solutionType !== 'virtual_machine' && solutionType !== 'web_application') {
    return null;
  }
  const req =
    typeof args.requirements === 'object' && args.requirements && !Array.isArray(args.requirements)
      ? (args.requirements as Record<string, unknown>)
      : {};
  return mapGetQuote(
    {
      vcpu: req.vcpu ?? req.vcpuMin,
      ramGiB: req.ramGiB ?? req.ramGiBMin,
      diskGiB: req.diskGiB,
      gpuModel: req.gpuModel,
      gpuCount: req.gpuCount,
      cdnEgressGiB: req.cdnEgressGiB,
    },
    period,
  );
}

/** Build a sidebar quote payload from a chat tool call (+ page period). */
export function sidebarConfigFromTool(
  tool: string,
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  if (tool === 'get_quote') return mapGetQuote(args, period);
  if (tool === 'get_lakehouse_quote') return mapLakehouse(args, period);
  if (tool === 'search_prices') return mapSearchPricesCdn(args);
  if (tool === 'compose_solution') return mapComposeSolution(args, period);
  return null;
}

/** Merge a CDN (or similar) patch into the last adhoc compute basket. */
export function mergeSidebarPatch(
  previous: AppliedSidebarPayload | null,
  patch: Extract<SidebarConfigPayload, {kind: 'adhoc-patch'}>,
  period: PeriodMode,
): AppliedSidebarPayload | null {
  // No prior compute basket (CDN-first turn) — seed a small general VM so the
  // sidebar still shows the CDN line instead of silently dropping the patch.
  if (!previous || previous.kind !== 'adhoc' || previous.request.kind !== 'compute') {
    return mapGetQuote(
      {
        vcpu: 8,
        ramGiB: 32,
        diskGiB: 100,
        cdnEgressGiB: patch.patch.cdnEgressGiB,
      },
      period,
    );
  }
  const prevCdn =
    previous.request.kind === 'compute' ? (previous.request.cdnEgressGiB ?? 0) : 0;
  // «докинь ещё 1 ТБ» adds to the basket; absolute volume from the tool is the delta.
  const cdnEgressGiB = Math.min(
    Math.round(prevCdn + patch.patch.cdnEgressGiB),
    512 * 1024,
  );
  const request: AdhocComputeQuoteRequest = {
    ...previous.request,
    period,
    cdnEgressGiB,
  };
  return {
    kind: 'adhoc',
    request,
    summary: {
      line: appendCdnToSummaryLine(previous.summary.line, cdnEgressGiB),
    },
  };
}
