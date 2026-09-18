export const API_VERSION = 'v1' as const;
export const CALCULATION_VERSION = 'calc_v1';
export const MONTH_HOURS = 720;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const PRODUCT_ARRAY_FILTERS = ['providers', 'categories', 'regions', 'services', 'serviceProducts', 'meters', 'units', 'modelIds', 'tokenDirections', 'inferenceModes'] as const;
export const DISCLAIMER =
  'Публичные прайсы, НДС указан у каждой ставки. Месяц в estimate = 720 часов. Не оферта.';

export const PROVIDER_IDS = [
  'yandex-cloud',
  'vk-cloud',
  'cloud-ru',
  't1-cloud',
  'selectel',
  'mws-cloud',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const CATEGORY_IDS = [
  'compute',
  'gpu',
  'storage',
  'network',
  'cdn',
  'kubernetes',
  'ai',
] as const;

export const PUBLIC_UNITS = [
  'vcpu_hour', 'vcpu_minute', 'memory_gib_hour', 'memory_gib_minute',
  'gib_hour', 'gib_minute', 'gib_month', 'gib', 'gpu_hour', 'gpu_minute',
  'flavor_hour', 'flavor_minute', 'flavor_month', 'ip_hour', 'ip_minute', 'ip_month',
  'operation', 'operation_month', 'token', 'resource_month', 'account_month',
  'master_hour', 'master_minute', 'gateway_hour', 'iops_hour', 'gpu_memory_gib_hour', 'other',
] as const;
export type PublicUnit = (typeof PUBLIC_UNITS)[number];
