/**
 * Shared deep links between Self-host calculator UI and chat recommender.
 * Keep free of React / browser APIs so chat/fast-path can import it.
 */

import {findInferenceModel, type InferenceDtype} from '@/data/inference-models';
import {
  formatVramUsage,
  loadBandLabel,
  type VramLoadBand,
} from '@/lib/calculator/vram-breakdown';

/** Minimal VRAM fields needed for chat/calculator table cells. */
export type InferenceVramSummary = {
  totalGiB: number;
  capacityGiB: number | null;
  loadBand: VramLoadBand | null;
};

export type SelfHostQuantParam = InferenceDtype | 'auto';

export function parseSelfHostQuant(raw: string | null | undefined): SelfHostQuantParam {
  const q = (raw ?? 'auto').trim().toLowerCase();
  if (q === 'bf16' || q === 'fp8' || q === 'int4' || q === 'int8' || q === 'auto') {
    return q;
  }
  return 'auto';
}

/** Resolve URL/query text to a catalog displayName, or null. */
export function resolveSelfHostModelDisplayName(
  query: string | null | undefined,
): string | null {
  if (!query?.trim()) return null;
  return findInferenceModel(query.trim())?.displayName ?? null;
}

export function selfHostCalculatorUrl(args: {
  model: string;
  quant?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set('model', args.model);
  const quant = args.quant?.trim().toLowerCase();
  if (quant && quant !== 'auto') params.set('quant', quant);
  return `/calculator/self-host?${params.toString()}`;
}

/** Prompt that re-triggers recommend_inference_infra for the selected build. */
export function selfHostChatPrompt(args: {
  model: string;
  quant?: string | null;
  gpuFamily?: string | null;
  gpuCount?: number | null;
}): string {
  const parts = [
    `Какая GPU-инфраструктура нужна, чтобы развернуть «${args.model}» self-host в РФ-облаках?`,
  ];
  if (args.gpuCount && args.gpuFamily) {
    parts.push(`Ориентир: ${args.gpuCount}×${args.gpuFamily}.`);
  }
  if (args.quant && args.quant !== 'auto') {
    parts.push(`Формат весов: ${args.quant.toUpperCase()}.`);
  }
  parts.push('Сравни цены узлов и запас VRAM по провайдерам.');
  return parts.join(' ');
}

export function formatInferenceVramCell(
  breakdown: InferenceVramSummary | null | undefined,
  estimatedVramGiB?: number | null,
): string {
  if (breakdown) {
    return formatVramUsage(breakdown.totalGiB, breakdown.capacityGiB);
  }
  if (estimatedVramGiB != null && Number.isFinite(estimatedVramGiB)) {
    return `~${estimatedVramGiB} GiB`;
  }
  return '—';
}

export function formatInferenceLoadBandCell(
  breakdown: InferenceVramSummary | null | undefined,
): string {
  if (!breakdown?.loadBand) return '—';
  return loadBandLabel(breakdown.loadBand).text;
}

export function selfHostCalculatorCtaMarkdown(args: {
  model: string;
  quant?: string | null;
}): string {
  const href = selfHostCalculatorUrl(args);
  return `[Открыть в калькуляторе](${href}) — batch, контекст и разбивка VRAM.`;
}
