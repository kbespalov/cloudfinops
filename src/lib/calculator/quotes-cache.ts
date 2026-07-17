/**
 * Server helpers for calculator page / API — reuse process-level quote cache.
 */

import {buildGpuCardPresets, buildGpuFlavorPresets} from '@/lib/calculator/gpu-shapes';
import {buildQuotesByPeriod} from '@/lib/calculator/quote';
import {
  toSlimQuotesByPeriod,
  type PeriodMode,
  type QuotesByPeriodSlim,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';
import type {GpuPreset} from '@/lib/calculator/presets';

export function getQuotesByPeriod() {
  return buildQuotesByPeriod();
}

export function getQuotesByPeriodSlim(): QuotesByPeriodSlim {
  return toSlimQuotesByPeriod(getQuotesByPeriod());
}

export function getGpuFlavorPresets(): GpuPreset[] {
  return buildGpuFlavorPresets();
}

export function getGpuCardPresets(): GpuPreset[] {
  return buildGpuCardPresets(getGpuFlavorPresets());
}

export function getPresetQuote(
  presetId: string,
  period: PeriodMode,
): ViewPresetQuote | null {
  return getQuotesByPeriod()[period]?.[presetId] ?? null;
}
