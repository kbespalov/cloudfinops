import {extractAiTokenDirection, type CatalogMeter} from '@/lib/catalog';

/** Public enum stays input | output | null. Cached and reasoning stay on the meter id. */
function publicTokenDirection(meter: CatalogMeter): 'input' | 'output' | null {
  const direction = extractAiTokenDirection(meter);
  return direction === 'input' || direction === 'output' ? direction : null;
}

export function serviceAttributes(meter: CatalogMeter) {
  const text = (key: string): string | null => {
    const value = meter.dimensions[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  return {
    serviceProduct: text('serviceProduct'),
    modelId: text('modelId'),
    modelFamily: text('modelFamily'),
    tokenDirection: publicTokenDirection(meter),
    inferenceMode: text('inferenceMode'),
  };
}
