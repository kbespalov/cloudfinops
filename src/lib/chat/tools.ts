/**
 * Function-calling tools exposed to GigaChat: `search_prices` (lexical catalog
 * search) and `get_quote` (calculator engine). JSON-schema definitions plus a
 * async dispatcher that runs the tool and returns a compact JSON string for the model.
 */

import type {CategoryKey, PeriodMode} from '@/lib/catalog';
import {
  searchPricesDetailed,
  searchPricesDetailedAsync,
  type PriceRow,
  type SearchParams,
} from './search';
import {quotePreset, listGpuPresets} from '@/lib/calculator/quote';
import {compareUnitPrice, type DiskMediaFilter, type UnitComponent} from './analytics';
import {catalogAsOfIso} from '@/lib/catalog/compare-disclaimer';
import {fitBudget, type FitBudgetProfile} from './fit-budget';
import {recommendInferenceInfra} from './inference-recommend';
import type {ComputePreset, GpuPreset, CalculatorPreset} from '@/lib/calculator/presets';
import {
  resolveLakehouseInput,
  type LakehouseSize,
} from '@/lib/calculator/lakehouse-presets';
import {quoteLakehouse} from '@/lib/calculator/lakehouse-quote';
import type {InferenceDtype} from '@/data/inference-models';

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: string;
};

const CATEGORIES: CategoryKey[] = [
  'compute',
  'gpu',
  'storage',
  'network',
  'cdn',
  'kubernetes',
  'ai',
  'other',
];

const PROVIDER_IDS = [
  'yandex-cloud',
  'vk-cloud',
  'cloud-ru',
  't1-cloud',
  'selectel',
  'mws-cloud',
];

/** Gated tool — attach only when inference-intent matches (not on every turn). */
export const RECOMMEND_INFERENCE_INFRA_TOOL = {
  type: 'function' as const,
  function: {
    name: 'recommend_inference_infra',
    description:
      'Подобрать self-host GPU-инфраструктуру для open-weight модели (VRAM/число карт/квант) и сравнить цены узлов в РФ-облаках. Также вернёт hosted API альтернативу из каталога токенов, если модель там есть. Используй когда спрашивают «как запустить GLM/Qwen/Kimi на своих GPU», инфраструктуру для инференса, сколько H100 нужно — НЕ для цены ₽/1M токенов.',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Название модели: «GLM 5.2», «Qwen3 32B», «Kimi K2.6», «Llama 3.3 70B»…',
        },
        quant: {
          type: 'string',
          enum: ['auto', 'bf16', 'fp8', 'int4', 'int8'],
          description: 'Предпочтительная квантизация (по умолчанию auto — рецепты из базы).',
        },
        maxConfigs: {
          type: 'integer',
          description: 'Сколько альтернативных GPU-конфигов вернуть (1–5, по умолчанию 3).',
        },
      },
      required: ['model'],
    },
  },
};

/** Baseline tools for every planning turn (do not add gated tools here). */
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_prices',
      description:
        'Найти позиции прайс-листа российских облаков (Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud, Selectel, MWS) по ключевым словам и фильтрам. Hybrid-поиск (lexical + embeddings). Возвращает список SKU с ценами (₽ с НДС) за час/месяц/год. Используй для вопросов о ценах конкретных услуг, GPU, AI-моделей, дисков, трафика, CDN, S3 и т.п.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Поисковый запрос на русском или английском: название услуги, модель GPU/AI, класс диска и т.д. Например: «H100», «GLM 5.2», «объектное хранилище», «исходящий трафик CDN», «публичный IP».',
          },
          category: {
            type: 'string',
            enum: CATEGORIES,
            description:
              'Ограничить категорией: compute, gpu, storage, network, kubernetes, ai, cdn. Для CDN-трафика всегда category=cdn (не network).',
          },
          provider: {
            type: 'string',
            enum: PROVIDER_IDS,
            description: 'Ограничить провайдером по id.',
          },
          gpuModel: {
            type: 'string',
            description: 'Фильтр по модели GPU, например H100, A100, B300, L40S, V100.',
          },
          aiModel: {
            type: 'string',
            description:
              'Фильтр по AI-модели с версией, если известна: «Qwen 3.6», «GLM 5.2», «GigaChat». Допускаются варианты написания (Qwen3.6-35B-A3B). Без версии («Qwen») — шире, могут попасть соседние модели.',
          },
          storageClass: {
            type: 'string',
            enum: ['standard', 'warm', 'cold', 'ice'],
            description:
              'Жёсткий фильтр по SKU-dimension storageClass (не по названию строки). Для сравнения Standard/Cold/Ice/Warm передавай явно — так отсекаются несопоставимые классы.',
          },
          meterKind: {
            type: 'string',
            enum: ['capacity', 'requests'],
            description:
              'Для S3: capacity — хранение ₽/GiB·мес; requests — операции PUT/GET. По умолчанию для объектного хранилища берётся capacity.',
          },
          volumeGiB: {
            type: 'number',
            description:
              'Объём в GiB (двоичные: 1 ТиБ = 1024 GiB). Если задан — вернётся volumeEstimates: ставка × объём за месяц по каждому провайдеру (S3 capacity и CDN egress). Для «50 ТБ» → 51200, для «100 ТБ» → 102400.',
          },
          limit: {
            type: 'integer',
            description: 'Максимум строк в ответе (1–40, по умолчанию 12).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description:
        'Стоимость конфигурации ВМ или GPU целиком (vCPU+RAM+диск / GPU+хост). Только если просят полную машину: «N vCPU / M GiB», «собери ВМ», сайт с ядрами и памятью, GPU-хост с паритетом. НЕ для одного компонента («начнём с CPU/RAM/диска», «цена ядра», «1 GiB RAM», «SSD/NVMe GiB», IP, CDN, S3) — там compare_unit_price или search_prices. Для GPU без vcpu/ramGiB подставится типовой хост (assumedHost).',
      parameters: {
        type: 'object',
        properties: {
          vcpu: {
            type: 'integer',
            description: 'Количество vCPU (для GPU можно опустить).',
          },
          ramGiB: {
            type: 'integer',
            description:
              'Объём RAM в GiB. Для обычной ВМ, если не задан — 4×vCPU (general). Для GPU можно опустить (подставится типовой хост).',
          },
          diskGiB: {type: 'integer', description: 'Системный диск в GiB (по умолчанию 100).'},
          gpuModel: {
            type: 'string',
            description: 'Модель GPU для GPU-инстанса, например H100, A100, L40S. Опустить для обычной ВМ.',
          },
          gpuCount: {type: 'integer', description: 'Число GPU (по умолчанию 1).'},
          period: {
            type: 'string',
            enum: ['unit', 'month', 'year'],
            description: 'Период расчёта: unit (час), month, year. По умолчанию month.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_unit_price',
      description:
        'Цена за единицу на сопоставимой базе: component=vcpu|ram|ssd. Для пошаговой сборки и «начнём с CPU/RAM/диска», «1 vCPU», «1 GiB RAM», «1 GiB SSD/NVMe», среднее/разброс. НЕ get_quote и НЕ выдумывай соседние ресурсы. vCPU = on-demand 100%; preemptible — в preemptibleFloor. В имени vCPU часто платформа (Ice Lake/Sapphire/EPYC). diskMedia=nvme|ssd|any для ssd (HDD сюда не клади — search_prices). derivedFromFlavors — «оценка», не в среднее.',
      parameters: {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            enum: ['vcpu', 'ram', 'ssd'],
            description:
              'Ресурс для сравнения: vcpu — цена 1 ядра (on-demand, 100%); ram — цена 1 GiB RAM; ssd — цена 1 GiB блочного диска в месяц (уточняй media через diskMedia).',
          },
          diskMedia: {
            type: 'string',
            enum: ['ssd', 'nvme', 'any'],
            description:
              'Только для component=ssd. nvme — только NVMe-тир (не подставляй Basic SSD); ssd — обычный SSD без NVMe-тира; any — самый дешёвый SSD или NVMe у провайдера. Если пользователь сказал NVMe — обязательно nvme.',
          },
        },
        required: ['component'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fit_budget',
      description:
        'Подобрать инфраструктуру под месячный бюджет (₽ с НДС): сколько целых ВМ (или GPU) каждого типового размера укладывается у каждого провайдера и какая утилизация бюджета. Используй для «бюджет 100 тысяч», «что можно позволить за N ₽/мес», «максимально утилизировать бюджет» — НЕ устраивай длинный опросник. По умолчанию profile=general (типовые ВМ).',
      parameters: {
        type: 'object',
        properties: {
          budgetMonthRub: {
            type: 'number',
            description: 'Бюджет в ₽ за месяц (с НДС), например 100000.',
          },
          profile: {
            type: 'string',
            enum: ['general', 'high-cpu', 'gpu-l4', 'gpu-h100'],
            description:
              'general — balanced ВМ (по умолчанию); high-cpu — плотнее по ядрам; gpu-l4 / gpu-h100 — сколько целых GPU-конфигов влезает.',
          },
        },
        required: ['budgetMonthRub'],
      },
    },
  },
] as const;

/** Baseline + gated inference recommender (attach only on matching intents). */
export const CHAT_TOOLS_WITH_INFERENCE = [...CHAT_TOOLS, RECOMMEND_INFERENCE_INFRA_TOOL];

/** Gated tool — attach only when lakehouse / data-platform intent matches. */
export const GET_LAKEHOUSE_QUOTE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_lakehouse_quote',
    description:
      'Оценить месячную (или час/год) стоимость DIY open lakehouse в РФ-облаках: Object Storage + Managed Kubernetes master + worker ВМ (platform 24/7, ETL/Spark и Query/Trino с duty-cycle). Используй для lakehouse / платформы данных / Iceberg+Trino+Airflow на K8s. НЕ для обычных ВМ (get_quote) и НЕ для цены managed Spark/Trino PaaS, которых нет в каталоге.',
    parameters: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          enum: ['small', 'medium', 'large'],
          description:
            'Типовой размер: small ~10 TiB пилот, medium ~75 TiB команда, large ~500 TiB enterprise. По умолчанию medium.',
        },
        lakeTiB: {
          type: 'number',
          description: 'Объём озера в tebibytes (1 TiB = 1024 GiB). Перекрывает пресет.',
        },
        hotPercent: {
          type: 'integer',
          description:
            'Доля горячих (hot/standard) данных 0–100; остальное — cold (raw-слой, история), если есть у провайдера.',
        },
        k8sTier: {
          type: 'string',
          enum: ['basic', 'ha'],
          description: 'Тир control plane Managed Kubernetes.',
        },
        etlHoursPerDay: {
          type: 'number',
          description: 'Часы работы ETL/Spark пула в сутки (0–24).',
        },
        queryHoursPerDay: {
          type: 'number',
          description: 'Часы работы SQL/Trino пула в сутки (0–24).',
        },
        period: {
          type: 'string',
          enum: ['unit', 'month', 'year'],
          description: 'Период: unit (час), month, year. По умолчанию month.',
        },
      },
      required: [],
    },
  },
};

/** Baseline + gated lakehouse quote (attach only on matching intents). */
export const CHAT_TOOLS_WITH_LAKEHOUSE = [...CHAT_TOOLS, GET_LAKEHOUSE_QUOTE_TOOL];

const FIT_PROFILES: FitBudgetProfile[] = ['general', 'high-cpu', 'gpu-l4', 'gpu-h100'];

const INFERENCE_QUANTS: InferenceDtype[] = ['bf16', 'fp8', 'int4', 'int8'];

function runRecommendInference(args: Record<string, unknown>): unknown {
  const model = typeof args.model === 'string' ? args.model : '';
  const quantRaw = typeof args.quant === 'string' ? args.quant : 'auto';
  const quant =
    quantRaw === 'auto' || INFERENCE_QUANTS.includes(quantRaw as InferenceDtype)
      ? (quantRaw as InferenceDtype | 'auto')
      : 'auto';
  const maxConfigs =
    typeof args.maxConfigs === 'number' && Number.isFinite(args.maxConfigs)
      ? args.maxConfigs
      : undefined;
  return recommendInferenceInfra({model, quant, maxConfigs});
}

function runFitBudget(args: Record<string, unknown>): unknown {
  const budget = num(args.budgetMonthRub);
  if (!budget || budget < 1000) {
    return {error: 'Укажи budgetMonthRub — месячный бюджет в ₽ (например 100000).'};
  }
  const profileRaw = typeof args.profile === 'string' ? args.profile : 'general';
  const profile = FIT_PROFILES.includes(profileRaw as FitBudgetProfile)
    ? (profileRaw as FitBudgetProfile)
    : 'general';
  return fitBudget({budgetMonthRub: budget, profile});
}

/** Distinguish a whole-VM/GPU flavor price from a GPU-only accelerator rate. */
function priceKind(r: PriceRow): string {
  if (r.unit.includes('flavor') || /vCPU/i.test(r.config)) {
    return 'конфигурация целиком (vCPU+RAM+GPU в цене)';
  }
  if (r.category === 'gpu') return 'только GPU (vCPU/RAM/диск оплачиваются отдельно)';
  return r.unit;
}

function serializeRow(r: PriceRow) {
  // Keep chat tool payloads compact — large JSON after 3–4 tools often yields empty finals.
  return {
    provider: r.providerName,
    category: r.categoryTitle,
    name: r.name,
    config: r.config,
    unit: r.unit,
    priceKind: priceKind(r),
    meterKind: r.meterKind ?? null,
    storageClass: r.storageClass ?? null,
    k8sTier: r.k8sTier ?? null,
    k8sClass: r.k8sClass ?? null,
    synthetic: r.synthetic ?? false,
    hour: round(r.hour),
    month: round(r.month),
  };
}

const STORAGE_CLASSES = ['standard', 'warm', 'cold', 'ice'] as const;

async function runSearch(args: Record<string, unknown>): Promise<unknown> {
  const storageClassRaw =
    typeof args.storageClass === 'string' ? args.storageClass.trim().toLowerCase() : '';
  const meterKindRaw =
    typeof args.meterKind === 'string' ? args.meterKind.trim().toLowerCase() : '';
  const volumeGiB =
    typeof args.volumeGiB === 'number' && Number.isFinite(args.volumeGiB) && args.volumeGiB > 0
      ? args.volumeGiB
      : undefined;
  const params: SearchParams = {
    query: typeof args.query === 'string' ? args.query : undefined,
    category: CATEGORIES.includes(args.category as CategoryKey)
      ? (args.category as CategoryKey)
      : undefined,
    provider: typeof args.provider === 'string' ? args.provider : undefined,
    gpuModel: typeof args.gpuModel === 'string' ? args.gpuModel : undefined,
    aiModel: typeof args.aiModel === 'string' ? args.aiModel : undefined,
    storageClass: STORAGE_CLASSES.includes(storageClassRaw as (typeof STORAGE_CLASSES)[number])
      ? storageClassRaw
      : undefined,
    meterKind:
      meterKindRaw === 'capacity' || meterKindRaw === 'requests' ? meterKindRaw : undefined,
    volumeGiB,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  };
  const {rows, providers, totalMatches, volumeEstimates, applied} =
    await searchPricesDetailedAsync(params);
  return {
    count: rows.length,
    totalMatches,
    currency: 'RUB',
    vatIncluded: true,
    catalogAsOf: catalogAsOfIso(),
    applied,
    note:
      'НДС вкл., месяц=720ч. Цены только из providersMatched. Минимум формулируй как «в каталоге Cloud FinOps на catalogAsOf» среди публичных тарифов в выборке. S3: capacity одного storageClass. K8s master: basic/HA; synthetic=true → оценка Cloud FinOps, не строка прайса.',
    // Точный список провайдеров, у которых реально есть совпадение, с их СОБСТВЕННОЙ минимальной ценой.
    providersMatched: providers.map((p) => ({
      provider: p.providerName,
      offerings: p.count,
      cheapest: serializeRow(p.cheapest),
    })),
    // Cap rows for the model; providersMatched already has per-provider cheapest.
    rows: rows.slice(0, 10).map(serializeRow),
    ...(volumeEstimates && volumeEstimates.length
      ? {
          volumeEstimates,
          volumeNote:
            'Итог за месяц = ставка ₽/GiB·мес × volumeGiB (двоичные GiB). Сортировка по возрастанию totalMonth. Операции и egress сюда не входят.',
        }
      : {}),
  };
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export type AssumedHost = {vcpu: number; ramGiB: number; diskGiB: number; source: string};

export type BuiltPreset = {preset: CalculatorPreset; assumedHost: AssumedHost | null};

/**
 * Pick a representative host (vCPU/RAM/disk) for a GPU class from the site's real
 * GPU flavor shapes, so every provider can be compared at configuration parity.
 * Prefers a Cloud.ru flavor (bundle) so its bundle price matches exactly.
 */
function defaultGpuHost(gpuModel: string, gpuCount: number): AssumedHost | null {
  const q = gpuModel.toLowerCase();
  const candidates = listGpuPresets().filter(
    (p) =>
      p.gpuCount === gpuCount &&
      p.vcpu != null &&
      p.ramGiB != null &&
      (q.includes(p.gpuModelMatch.toLowerCase()) || p.gpuModelMatch.toLowerCase().includes(q)),
  );
  if (!candidates.length) return null;
  const chosen =
    candidates.find((p) => p.shapeSource === 'cloud-ru') ??
    candidates.slice().sort((a, b) => (a.vcpu ?? 0) - (b.vcpu ?? 0))[0];
  return {
    vcpu: chosen.vcpu as number,
    ramGiB: chosen.ramGiB as number,
    diskGiB: chosen.diskGiB ?? 100,
    source: chosen.shapeSource ?? 'catalog',
  };
}

function buildPreset(args: Record<string, unknown>): BuiltPreset {
  const vcpu = num(args.vcpu);
  const ramGiB = num(args.ramGiB);
  const diskGiB = num(args.diskGiB) ?? 100;
  const gpuModel = typeof args.gpuModel === 'string' ? args.gpuModel.trim() : '';

  if (gpuModel) {
    const gpuCount = num(args.gpuCount) ?? 1;

    // Configuration parity: if the caller gave a host, use it; otherwise apply a
    // sensible default host for the GPU class so card-only providers get a
    // composed host and every provider is a comparable whole-config.
    let hostVcpu = vcpu;
    let hostRam = ramGiB;
    let assumedHost: AssumedHost | null = null;
    if (!hostVcpu || !hostRam) {
      const def = defaultGpuHost(gpuModel, gpuCount);
      if (def) {
        hostVcpu = def.vcpu;
        hostRam = def.ramGiB;
        assumedHost = def;
      }
    }

    const useDisk = hostVcpu && hostRam ? (num(args.diskGiB) ?? assumedHost?.diskGiB ?? 100) : undefined;
    const preset: GpuPreset = {
      id: `chat-gpu-${gpuModel}-${gpuCount}`,
      kind: 'gpu',
      title: `${gpuModel} ×${gpuCount}`,
      subtitle: 'AI-ассистент',
      gpuModelMatch: gpuModel,
      gpuCount,
      vcpu: hostVcpu,
      ramGiB: hostRam,
      diskGiB: useDisk,
    };
    return {preset, assumedHost};
  }

  // Align with calculator sidebar: omitted RAM → 4×vCPU (general), not 1 GiB.
  const resolvedVcpu = vcpu ?? 1;
  const resolvedRam = ramGiB ?? resolvedVcpu * 4;
  const preset: ComputePreset = {
    id: `chat-compute-${resolvedVcpu}-${resolvedRam}`,
    kind: 'compute',
    family: 'general',
    title: `${resolvedVcpu} / ${resolvedRam}`,
    subtitle: 'AI-ассистент',
    vcpu: resolvedVcpu,
    ramGiB: resolvedRam,
    diskGiB,
  };
  return {preset, assumedHost: null};
}

function runQuote(args: Record<string, unknown>): unknown {
  const period: PeriodMode =
    args.period === 'unit' || args.period === 'year' ? args.period : 'month';
  const {preset, assumedHost} = buildPreset(args);
  const result = quotePreset(preset, period);

  const toQuote = (q: (typeof result.quotes)[number]) => ({
    provider: q.providerName,
    total: round(q.total),
    scope: q.scope,
    scopeNote:
      q.scope === 'gpu-only'
        ? 'только GPU (vCPU/RAM отдельно)'
        : q.scope === 'bundle'
          ? 'конфигурация целиком (vCPU+RAM+GPU)'
          : q.scope === 'gpu-synthetic'
            ? 'GPU + собранный хост'
            : 'vCPU+RAM+диск',
    parts: q.parts.map((p) => ({label: p.label, amount: round(p.amount)})),
    note: q.note,
  });

  // For GPU, primary quotes are one comparable scope; alternates are the other
  // scope (e.g. Cloud.ru bundles). Merge so the model sees every provider, but
  // keep them tagged by scope so it never treats bundle == gpu-only.
  const quotes = [...result.quotes, ...result.alternateQuotes].map(toQuote);
  const providerCount = new Set(quotes.map((q) => q.provider)).size;

  const hostVcpu = preset.kind === 'gpu' ? preset.vcpu ?? null : preset.vcpu;
  const hostRam = preset.kind === 'gpu' ? preset.ramGiB ?? null : preset.ramGiB;
  const parityHost =
    preset.kind === 'gpu' && hostVcpu && hostRam
      ? `${hostVcpu} vCPU + ${hostRam} GiB RAM + ${preset.diskGiB ?? 100} GiB диск`
      : null;

  const gpuNote =
    preset.kind !== 'gpu'
      ? ''
      : parityHost
        ? ` Все строки — конфигурация целиком (GPU + хост ${parityHost}); для card-only провайдеров хост добавлен (композиция), для флейворных — их бандл.${
            assumedHost
              ? ` Хост подобран по умолчанию (источник формы: ${assumedHost.source}) — обязательно укажи пользователю принятую конфигурацию хоста.`
              : ''
          } Провайдер, который продаёт этот GPU только флейвором иной формы, может отсутствовать — его родную цену смотри через search_prices (providersMatched).`
        : ' Внимание: хост не задан — строки могут быть «только GPU»; для сравнения по конфигурации задай vcpu и ramGiB.';

  return {
    request: {
      kind: preset.kind,
      vcpu: hostVcpu,
      ramGiB: hostRam,
      diskGiB: preset.diskGiB ?? null,
      gpuModel: preset.kind === 'gpu' ? preset.gpuModelMatch : null,
      gpuCount: preset.kind === 'gpu' ? preset.gpuCount : null,
      period,
    },
    ...(parityHost ? {assumedHost: parityHost, comparison: 'configuration-parity'} : {}),
    currency: 'RUB',
    vatIncluded: true,
    catalogAsOf: catalogAsOfIso(),
    periodNote: period === 'month' ? 'месяц = 720 ч' : period === 'year' ? 'год = 8640 ч' : 'цена за час',
    providerCount,
    note:
      'Каждая строка quotes — цена конкретного провайдера из каталога. Минимум формулируй как «в каталоге Cloud FinOps на catalogAsOf» среди публичных тарифов в выборке. scope=gpu-synthetic → составная цена из публичных unit-ставок (помечай как оценку сборки). Не добавляй отсутствующих провайдеров и не копируй цену между ними.' +
      gpuNote,
    best: result.best
      ? {
          provider: result.best.providerName,
          total: round(result.best.total),
          scope: result.best.scope,
        }
      : null,
    quotes,
    ...(quotes.length === 0
      ? {warning: 'Ни один провайдер не покрывает такую конфигурацию в каталоге.'}
      : {}),
  };
}

function round(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function runCompareUnitPrice(args: Record<string, unknown>): unknown {
  const raw = typeof args.component === 'string' ? args.component.toLowerCase() : '';
  const component: UnitComponent =
    raw === 'ram' ? 'ram' : raw === 'ssd' || raw === 'disk' || raw === 'nvme' ? 'ssd' : 'vcpu';
  const mediaRaw = typeof args.diskMedia === 'string' ? args.diskMedia.toLowerCase() : '';
  let diskMedia: DiskMediaFilter | undefined;
  if (mediaRaw === 'ssd' || mediaRaw === 'nvme' || mediaRaw === 'any') {
    diskMedia = mediaRaw;
  } else if (raw === 'nvme') {
    diskMedia = 'nvme';
  }
  return compareUnitPrice(component, diskMedia ? {diskMedia} : undefined);
}

function runLakehouseQuote(args: Record<string, unknown>): unknown {
  const presetRaw = typeof args.presetId === 'string' ? args.presetId.trim().toLowerCase() : '';
  const presetId: LakehouseSize =
    presetRaw === 'small' || presetRaw === 'medium' || presetRaw === 'large'
      ? presetRaw
      : 'medium';
  const period: PeriodMode =
    args.period === 'unit' || args.period === 'year' ? args.period : 'month';
  const input = resolveLakehouseInput(presetId, {
    lakeTiB:
      typeof args.lakeTiB === 'number' && Number.isFinite(args.lakeTiB) ? args.lakeTiB : undefined,
    hotPercent:
      typeof args.hotPercent === 'number' && Number.isFinite(args.hotPercent)
        ? args.hotPercent
        : undefined,
    k8sTier: args.k8sTier === 'basic' || args.k8sTier === 'ha' ? args.k8sTier : undefined,
    etlHoursPerDay:
      typeof args.etlHoursPerDay === 'number' && Number.isFinite(args.etlHoursPerDay)
        ? args.etlHoursPerDay
        : undefined,
    queryHoursPerDay:
      typeof args.queryHoursPerDay === 'number' && Number.isFinite(args.queryHoursPerDay)
        ? args.queryHoursPerDay
        : undefined,
  });
  const result = quoteLakehouse(input, period);
  const quotes = result.quotes.map((q) => ({
    provider: q.providerName,
    total: round(q.total),
    parts: q.parts.map((p) => ({id: p.id, label: p.label, amount: round(p.amount)})),
    note: q.note,
  }));

  let fixedApprox = 0;
  let variableApprox = 0;
  if (result.best) {
    for (const p of result.best.parts) {
      if (p.id === 'storage' || p.id === 'k8s' || p.id === 'platform') {
        fixedApprox += p.amount;
      } else {
        variableApprox += p.amount;
      }
    }
  }

  return {
    model: 'open-lakehouse-diy',
    stackLabel:
      'DIY open lakehouse: Object Storage + Managed Kubernetes master + worker ВМ (platform/Airflow+catalog 24/7, ETL/Spark, Query/Trino)',
    modelNote:
      'Это НЕ ClickHouse-кластер и НЕ managed warehouse. Цифры — estimate DIY open lakehouse (S3 + K8s + ВМ). Managed Spark/Trino/ClickHouse PaaS и egress/запросы S3 в сумму не входят — помечай «потенциально не включено». В заголовке ответа пиши «DIY open lakehouse» / «open lakehouse на K8s», не «ClickHouse».',
    request: {presetId, ...input, period},
    currency: 'RUB',
    vatIncluded: true,
    periodNote:
      period === 'month' ? 'месяц = 720 ч' : period === 'year' ? 'год = 8640 ч' : 'цена за час',
    providerCount: quotes.length,
    best: result.best
      ? {provider: result.best.providerName, total: round(result.best.total)}
      : null,
    costShape: result.best
      ? {
          fixedApprox: round(fixedApprox),
          variableApprox: round(variableApprox),
          fixedParts: 'storage + k8s master + platform (24/7)',
          variableParts: 'ETL/Spark + Query/Trino (по часам/день)',
        }
      : null,
    quotes,
    answerHint: {
      calculatorUrl: '/calculator/lakehouse',
      tip: 'В конце ответа дай ссылку на калькулятор. Сравнивай провайдеров только внутри этой DIY-модели; serverless/managed — качественно, без выдуманных тарифов.',
    },
    ...(quotes.length === 0
      ? {warning: 'Ни один провайдер не покрывает Object Storage + Managed K8s в каталоге для этой конфигурации.'}
      : {}),
  };
}

function parseToolArgs(
  rawArgs: string,
): {ok: true; args: Record<string, unknown>} | {ok: false; message: string} {
  try {
    return {ok: true, args: rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}};
  } catch {
    return {ok: false, message: 'Некорректный JSON в аргументах инструмента.'};
  }
}

function toolError(err: unknown): string {
  return JSON.stringify({
    error: 'Ошибка выполнения инструмента.',
    detail: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Sync tool runner for offline ground truth / eval.
 * `search_prices` uses lexical-only ranking (deterministic, no API).
 */
export function runToolSync(name: string, rawArgs: string): string {
  const parsed = parseToolArgs(rawArgs);
  if (!parsed.ok) return JSON.stringify({error: parsed.message});
  const args = parsed.args;
  try {
    if (name === 'search_prices') {
      const storageClassRaw =
        typeof args.storageClass === 'string' ? args.storageClass.trim().toLowerCase() : '';
      const params: SearchParams = {
        query: typeof args.query === 'string' ? args.query : undefined,
        category: CATEGORIES.includes(args.category as CategoryKey)
          ? (args.category as CategoryKey)
          : undefined,
        provider: typeof args.provider === 'string' ? args.provider : undefined,
        gpuModel: typeof args.gpuModel === 'string' ? args.gpuModel : undefined,
        aiModel: typeof args.aiModel === 'string' ? args.aiModel : undefined,
        storageClass: STORAGE_CLASSES.includes(storageClassRaw as (typeof STORAGE_CLASSES)[number])
          ? storageClassRaw
          : undefined,
        meterKind:
          args.meterKind === 'capacity' || args.meterKind === 'requests'
            ? args.meterKind
            : undefined,
        volumeGiB:
          typeof args.volumeGiB === 'number' && Number.isFinite(args.volumeGiB) && args.volumeGiB > 0
            ? args.volumeGiB
            : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      };
      const {rows, providers, totalMatches, volumeEstimates, applied} = searchPricesDetailed(params);
      return JSON.stringify({
        count: rows.length,
        totalMatches,
        currency: 'RUB',
        vatIncluded: true,
        applied,
        note:
          'НДС вкл., месяц=720ч. Цены только из providersMatched. S3: capacity одного storageClass. K8s master: basic/HA; synthetic VK/Yandex=2vCPU/4GiB.',
        providersMatched: providers.map((p) => ({
          provider: p.providerName,
          offerings: p.count,
          cheapest: serializeRow(p.cheapest),
        })),
        rows: rows.slice(0, 10).map(serializeRow),
        ...(volumeEstimates && volumeEstimates.length ? {volumeEstimates} : {}),
      });
    }
    if (name === 'get_quote') return JSON.stringify(runQuote(args));
    if (name === 'compare_unit_price') return JSON.stringify(runCompareUnitPrice(args));
    if (name === 'fit_budget') return JSON.stringify(runFitBudget(args));
    if (name === 'recommend_inference_infra') return JSON.stringify(runRecommendInference(args));
    if (name === 'get_lakehouse_quote') return JSON.stringify(runLakehouseQuote(args));
    return JSON.stringify({error: `Неизвестный инструмент: ${name}`});
  } catch (err) {
    return toolError(err);
  }
}

/** Execute a tool call by name; always returns a JSON string for the tool message. */
export async function runTool(name: string, rawArgs: string): Promise<string> {
  const parsed = parseToolArgs(rawArgs);
  if (!parsed.ok) return JSON.stringify({error: parsed.message});
  const args = parsed.args;
  try {
    if (name === 'search_prices') return JSON.stringify(await runSearch(args));
    if (name === 'get_quote') return JSON.stringify(runQuote(args));
    if (name === 'compare_unit_price') return JSON.stringify(runCompareUnitPrice(args));
    if (name === 'fit_budget') return JSON.stringify(runFitBudget(args));
    if (name === 'recommend_inference_infra') return JSON.stringify(runRecommendInference(args));
    if (name === 'get_lakehouse_quote') return JSON.stringify(runLakehouseQuote(args));
    return JSON.stringify({error: `Неизвестный инструмент: ${name}`});
  } catch (err) {
    return toolError(err);
  }
}
