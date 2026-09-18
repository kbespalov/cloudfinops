import {extractAiTokenDirection, type CatalogMeter} from '@/lib/catalog';

export function serviceAttributes(meter: CatalogMeter) {
  const text = (key: string): string | null => {
    const value = meter.dimensions[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  return {
    serviceProduct: text('serviceProduct'),
    modelId: text('modelId'),
    modelFamily: text('modelFamily'),
    tokenDirection: extractAiTokenDirection(meter),
    inferenceMode: text('inferenceMode'),
  };
}
