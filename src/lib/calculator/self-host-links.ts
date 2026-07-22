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
  nodeCount?: number | null;
  vramLabel?: string | null;
  concurrentRequests?: number | null;
  avgContextTokens?: number | null;
  maxContextTokens?: number | null;
  monthlyRub?: number | null;
  providerName?: string | null;
}): string {
  const parts = [
    `Разбери конфигурацию self-hosted LLM «${args.model}» в облаках РФ.`,
  ];
  if (args.gpuCount && args.gpuFamily) {
    const nodes = args.nodeCount && args.nodeCount > 1 ? `, ${args.nodeCount} нод` : '';
    parts.push(`Конфиг: ${args.gpuCount}×${args.gpuFamily}${nodes}.`);
  }
  if (args.quant) {
    parts.push(`Формат весов: ${args.quant.toUpperCase()}.`);
  }
  if (args.vramLabel) parts.push(`VRAM: ${args.vramLabel}.`);
  if (args.concurrentRequests) {
    parts.push(`Параллельные запросы: ${args.concurrentRequests}.`);
  }
  if (args.avgContextTokens) {
    parts.push(`Средняя длина последовательности: ${args.avgContextTokens} токенов.`);
  }
  if (args.maxContextTokens) {
    parts.push(`Макс. контекст: ${args.maxContextTokens} токенов.`);
  }
  if (args.providerName && args.monthlyRub != null) {
    parts.push(`Лучшая цена: ${args.providerName}, ~${Math.round(args.monthlyRub)} ₽/мес.`);
  }
  parts.push('Сравни альтернативы и запас VRAM, укажи риски OOM и допущения расчёта.');
  return parts.join(' ');
}

/** Prompt for the VM calculator → chat deep-link. */
export function vmChatPrompt(args: {
  vmCount: number;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  diskMedia: string;
  publicIpCount: number;
  purchaseModel?: 'on-demand' | 'preemptible';
  vcpuShare?: string;
  period: string;
  providerName?: string | null;
  totalRub?: number | null;
}): string {
  const vmType = args.purchaseModel === 'preemptible' ? 'прерываемая' : 'обычная';
  const share = args.vcpuShare ?? '100%';
  const parts = [
    `Сравни конфигурацию ВМ в облаках РФ: ${args.vmCount}×(${args.vcpu} vCPU / ${args.ramGiB} GiB RAM / ${args.diskGiB} GiB ${args.diskMedia.toUpperCase()}), тип ВМ: ${vmType}, доля CPU: ${share}, публичных IP: ${args.publicIpCount}.`,
  ];
  parts.push(`Период: ${args.period}.`);
  if (args.providerName && args.totalRub != null) {
    parts.push(`Сейчас лучший: ${args.providerName} ≈ ${Math.round(args.totalRub)} ₽.`);
  }
  parts.push('Поясни разницу с альтернативами и из чего складывается цена.');
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
