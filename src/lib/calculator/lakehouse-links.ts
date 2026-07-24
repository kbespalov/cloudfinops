import type {LakehouseSize} from '@/lib/calculator/lakehouse-presets';

/** Prompt for Lakehouse calculator → chat deep-link (triggers lakehouse intent + tool). */
export function lakehouseChatPrompt(args: {
  presetId: LakehouseSize;
  lakeTiB: number;
  hotPercent: number;
  k8sTier: 'basic' | 'ha';
  etlHoursPerDay: number;
  queryHoursPerDay: number;
  period: string;
  providerName?: string | null;
  totalRub?: number | null;
}): string {
  const parts = [
    'Оцени стоимость open lakehouse (DIY: Object Storage + Managed Kubernetes + worker ВМ) в облаках РФ.',
    `Пресет ${args.presetId}: озеро ${args.lakeTiB} TiB, активные данные (hot) ${args.hotPercent}%, K8s ${args.k8sTier}, ETL ${args.etlHoursPerDay} ч/день, SQL ${args.queryHoursPerDay} ч/день.`,
    `Период: ${args.period}.`,
  ];
  if (args.providerName && args.totalRub != null) {
    parts.push(`В калькуляторе сейчас лучший: ${args.providerName} ≈ ${Math.round(args.totalRub)} ₽.`);
  }
  parts.push(
    'Вызови get_lakehouse_quote с этими параметрами. Объясни допущения, постоянные и переменные расходы, 2–4 драйвера цены и 1–2 альтернативы (serverless SQL или managed warehouse), если DIY избыточен для сценария.',
  );
  return parts.join(' ');
}
