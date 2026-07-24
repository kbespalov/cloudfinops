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

export type SidebarConfigTool = 'get_quote' | 'get_lakehouse_quote';

export type SidebarConfigPayload =
  | {kind: 'adhoc'; request: AdhocQuoteRequest; summary: {line: string}}
  | {kind: 'lakehouse'; request: LakehouseQuoteRequest; summary: {line: string}};

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function mapGetQuote(
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
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
  };
  return {
    kind: 'adhoc',
    request,
    summary: {
      line: `${vcpu} vCPU · ${ramGiB} GiB · SSD ${diskGiB} GiB`,
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

/** Build a sidebar quote payload from a chat tool call (+ page period). */
export function sidebarConfigFromTool(
  tool: string,
  args: Record<string, unknown>,
  period: PeriodMode,
): SidebarConfigPayload | null {
  if (tool === 'get_quote') return mapGetQuote(args, period);
  if (tool === 'get_lakehouse_quote') return mapLakehouse(args, period);
  return null;
}
