/** DIY lakehouse composition: Object Storage + Managed K8s + worker VMs. */

export type LakehouseSize = 'small' | 'medium' | 'large';

export type LakehouseNodePool = {
  /** Always-on or duty-cycled identical worker VMs. */
  count: number;
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  /** Hours per day the pool is running (24 = always-on). */
  hoursPerDay: number;
};

export type LakehousePreset = {
  id: LakehouseSize;
  title: string;
  shortTitle: string;
  subtitle: string;
  audience: string;
  /** Lake capacity in tebibytes (1024³). */
  lakeTiB: number;
  /** Share of lake in standard/hot class (0–100). Rest → cold when available. */
  hotPercent: number;
  k8sTier: 'basic' | 'ha';
  /**
   * Always-on platform plane: Airflow + Iceberg catalog + light control services.
   * Hours forced to 24 in quote.
   */
  platform: LakehouseNodePool;
  /** Batch ETL / Spark workers — typically duty-cycled. */
  etl: LakehouseNodePool;
  /** Interactive SQL (Trino/Spark SQL) pool. */
  query: LakehouseNodePool;
};

export const LAKEHOUSE_PRESETS: LakehousePreset[] = [
  {
    id: 'small',
    title: 'Small',
    shortTitle: 'S',
    subtitle: '10 TiB · пилот / один домен',
    audience: 'Старт lakehouse, nightly ETL, 1–5 аналитиков',
    lakeTiB: 10,
    hotPercent: 100,
    k8sTier: 'basic',
    platform: {count: 2, vcpu: 4, ramGiB: 16, diskGiB: 100, hoursPerDay: 24},
    etl: {count: 2, vcpu: 8, ramGiB: 32, diskGiB: 200, hoursPerDay: 4},
    query: {count: 1, vcpu: 4, ramGiB: 16, diskGiB: 100, hoursPerDay: 8},
  },
  {
    id: 'medium',
    title: 'Medium',
    shortTitle: 'M',
    subtitle: '75 TiB · production-команда',
    audience: 'Несколько команд, hourly/nightly batch, 5–20 аналитиков',
    lakeTiB: 75,
    hotPercent: 80,
    k8sTier: 'ha',
    platform: {count: 3, vcpu: 8, ramGiB: 32, diskGiB: 100, hoursPerDay: 24},
    etl: {count: 4, vcpu: 16, ramGiB: 64, diskGiB: 200, hoursPerDay: 8},
    query: {count: 2, vcpu: 8, ramGiB: 32, diskGiB: 100, hoursPerDay: 12},
  },
  {
    id: 'large',
    title: 'Large',
    shortTitle: 'L',
    subtitle: '500 TiB · enterprise lake',
    audience: 'Мультидомен, отдельные ETL/SQL pools, 20–100+ concurrency',
    lakeTiB: 500,
    hotPercent: 60,
    k8sTier: 'ha',
    platform: {count: 3, vcpu: 8, ramGiB: 32, diskGiB: 200, hoursPerDay: 24},
    etl: {count: 8, vcpu: 16, ramGiB: 64, diskGiB: 400, hoursPerDay: 12},
    query: {count: 4, vcpu: 16, ramGiB: 64, diskGiB: 200, hoursPerDay: 16},
  },
];

export function lakehousePresetById(id: LakehouseSize): LakehousePreset {
  return LAKEHOUSE_PRESETS.find((p) => p.id === id) ?? LAKEHOUSE_PRESETS[1]!;
}

export type LakehouseQuoteInput = {
  lakeTiB: number;
  hotPercent: number;
  k8sTier: 'basic' | 'ha';
  platform: LakehouseNodePool;
  etl: LakehouseNodePool;
  query: LakehouseNodePool;
};

/** Apply preset, then overlay user overrides (sliders). */
export function resolveLakehouseInput(
  presetId: LakehouseSize,
  overrides?: Partial<{
    lakeTiB: number;
    hotPercent: number;
    k8sTier: 'basic' | 'ha';
    etlHoursPerDay: number;
    queryHoursPerDay: number;
  }>,
): LakehouseQuoteInput {
  const base = lakehousePresetById(presetId);
  return {
    lakeTiB: overrides?.lakeTiB ?? base.lakeTiB,
    hotPercent: overrides?.hotPercent ?? base.hotPercent,
    k8sTier: overrides?.k8sTier ?? base.k8sTier,
    platform: {...base.platform, hoursPerDay: 24},
    etl: {
      ...base.etl,
      hoursPerDay: overrides?.etlHoursPerDay ?? base.etl.hoursPerDay,
    },
    query: {
      ...base.query,
      hoursPerDay: overrides?.queryHoursPerDay ?? base.query.hoursPerDay,
    },
  };
}

export function lakeGiBFromTiB(lakeTiB: number): number {
  return Math.max(0, Math.round(lakeTiB * 1024));
}
