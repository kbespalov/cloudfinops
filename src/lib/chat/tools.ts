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
import {compareUnitPrice, type UnitComponent} from './analytics';
import type {ComputePreset, GpuPreset, CalculatorPreset} from '@/lib/calculator/presets';

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

/** OpenAI-compatible tool schema array sent with every completion request. */
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_prices',
      description:
        'Найти позиции прайс-листа российских облаков (Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud, Selectel, MWS) по ключевым словам и фильтрам. Hybrid-поиск (lexical + embeddings). Возвращает список SKU с ценами (₽ с НДС) за час/месяц/год. Используй для вопросов о ценах конкретных услуг, GPU, AI-моделей, дисков, трафика, S3 и т.п.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Поисковый запрос на русском или английском: название услуги, модель GPU/AI, класс диска и т.д. Например: «H100», «GLM 5.2», «объектное хранилище», «egress трафик».',
          },
          category: {
            type: 'string',
            enum: CATEGORIES,
            description: 'Ограничить категорией: compute, gpu, storage, network, kubernetes, ai.',
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
              'Объём данных в GiB (двоичные: 1 ТиБ = 1024 GiB). Если задан — вернётся volumeEstimates: ставка × объём за месяц по каждому провайдеру. Для «50 ТБ» передай 51200.',
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
        'Рассчитать и сравнить стоимость конфигурации ВМ или GPU-инстанса по провайдерам через движок калькулятора «конфигурация целиком». Для GPU это ПРАВИЛЬНЫЙ инструмент сравнения «по провайдерам с паритетом по конфигурации»: у каждого провайдера возвращается полная конфигурация (GPU + хост vCPU/RAM/диск), card-only тарифы дополняются хостом. Если не задать vcpu/ramGiB для GPU — подберётся типовой хост для этого класса GPU (это будет отражено в assumedHost). Возвращает цену у каждого провайдера и самый дешёвый вариант.',
      parameters: {
        type: 'object',
        properties: {
          vcpu: {type: 'integer', description: 'Количество vCPU (для GPU можно опустить).'},
          ramGiB: {type: 'integer', description: 'Объём RAM в GiB (для GPU можно опустить).'},
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
        'Кросс-провайдерная аналитика цены за единицу базового ресурса на СОПОСТАВИМОЙ базе. Используй для вопросов «средняя цена ядра/памяти/диска по провайдерам», «в среднем по больнице», «кто дешевле в среднем и на сколько %», «какой разброс цен между провайдерами». Возвращает по каждому провайдеру сопоставимую цену (₽/час и ₽/мес) и агрегаты: минимум, максимум, среднее, медиану, самого дешёвого/дорогого, разброс max/min и отклонение каждого провайдера от среднего в %. ВАЖНО: не смешивает типы — для vCPU берётся строго on-demand 100% выделенное ядро; preemptible/долевые ядра вынесены отдельно (preemptibleFloor) как контекст. Провайдеры, которые продают только флейворы (напр. Cloud.ru), попадают в derivedFromFlavors с ОЦЕНОЧНОЙ ценой за единицу (декомпозиция флейворов) — показывай их с пометкой «оценка» и не включай в среднее. Среднее/медиану/разброс считай только по providers[].',
      parameters: {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            enum: ['vcpu', 'ram', 'ssd'],
            description:
              'Ресурс для сравнения: vcpu — цена 1 ядра (on-demand, 100%); ram — цена 1 GiB RAM; ssd — цена 1 GiB SSD-диска в месяц.',
          },
        },
        required: ['component'],
      },
    },
  },
] as const;

/** Distinguish a whole-VM/GPU flavor price from a GPU-only accelerator rate. */
function priceKind(r: PriceRow): string {
  if (r.unit.includes('flavor') || /vCPU/i.test(r.config)) {
    return 'конфигурация целиком (vCPU+RAM+GPU в цене)';
  }
  if (r.category === 'gpu') return 'только GPU (vCPU/RAM/диск оплачиваются отдельно)';
  return r.unit;
}

function serializeRow(r: PriceRow) {
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
    year: round(r.year),
    sku: r.sku,
    note: r.note,
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
    applied,
    note: 'Цены с НДС; месяц = 720 ч. Бери провайдеров только из providersMatched с их ценой. cheapest часто preemptible/долевое — для сравнения vCPU бери on-demand 100%. S3: один storageClass за раз; хранение = capacity, не requests/0 ₽. volumeGiB → volumeEstimates. Kubernetes: для Managed K8s / мастера search режет выдачу до сопоставимых master (basic=zonal, ha=regional); synthetic-bundle VK/Yandex = расчёт 2 vCPU/4 GiB; native-fixed без размера сравнивай только по сумме; worker-ноды отдельно. applied.retrieval = lexical|hybrid; applied.k8sTier = basic|ha.',
    // Точный список провайдеров, у которых реально есть совпадение, с их СОБСТВЕННОЙ минимальной ценой.
    providersMatched: providers.map((p) => ({
      provider: p.providerName,
      offerings: p.count,
      cheapest: serializeRow(p.cheapest),
    })),
    rows: rows.map(serializeRow),
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

  const preset: ComputePreset = {
    id: `chat-compute-${vcpu ?? 0}-${ramGiB ?? 0}`,
    kind: 'compute',
    family: 'general',
    title: `${vcpu ?? 0} / ${ramGiB ?? 0}`,
    subtitle: 'AI-ассистент',
    vcpu: vcpu ?? 1,
    ramGiB: ramGiB ?? 1,
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
    periodNote: period === 'month' ? 'месяц = 720 ч' : period === 'year' ? 'год = 8640 ч' : 'цена за час',
    providerCount,
    note:
      'Каждая строка quotes — реальная цена конкретного провайдера. Показывай только этих провайдеров, не добавляй отсутствующих и не копируй цену между провайдерами. Учитывай scope.' +
      gpuNote,
    best: result.best
      ? {provider: result.best.providerName, total: round(result.best.total)}
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
    raw === 'ram' ? 'ram' : raw === 'ssd' || raw === 'disk' ? 'ssd' : 'vcpu';
  return compareUnitPrice(component);
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
        providersMatched: providers.map((p) => ({
          provider: p.providerName,
          offerings: p.count,
          cheapest: serializeRow(p.cheapest),
        })),
        rows: rows.map(serializeRow),
        ...(volumeEstimates && volumeEstimates.length ? {volumeEstimates} : {}),
      });
    }
    if (name === 'get_quote') return JSON.stringify(runQuote(args));
    if (name === 'compare_unit_price') return JSON.stringify(runCompareUnitPrice(args));
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
    return JSON.stringify({error: `Неизвестный инструмент: ${name}`});
  } catch (err) {
    return toolError(err);
  }
}
