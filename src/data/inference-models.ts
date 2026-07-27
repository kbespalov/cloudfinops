/**
 * Curated open-weight model → self-host GPU sizing knowledge base.
 * Used only by the gated inference recommender (not injected into every chat turn).
 *
 * Weight memory prefers checkpoint profiles (see weight-formats.ts).
 * MoE VRAM always uses total resident parameters — never active experts.
 */

import type {AttentionProfile} from '@/lib/calculator/inference-sizing';
import type {
  WeightConfidence,
  WeightFormatId,
} from '@/lib/calculator/weight-formats';

export type InferenceArch = 'dense' | 'moe';

export type InferenceDtype = 'bf16' | 'fp8' | 'int4' | 'int8';

export type InferenceWeightVariant = {
  /** UI / API quant key (int4 may map to nvfp4 / awq-int4 via weightFormat). */
  dtype: InferenceDtype;
  /**
   * Production resident weights in VRAM (GiB).
   * For MoE must reflect ALL experts, not active_parameters.
   */
  weightsVramGiB: number;
  /** Concrete checkpoint format (preferred over abstract dtype). */
  weightFormat?: WeightFormatId;
  checkpointSizeGiB?: number;
  /** Naive params×bits/8 — theoretical lower bound only. */
  theoreticalLowerBoundGiB?: number;
  effectiveBitsPerWeight?: number;
  quantizedComponents?: string;
  unquantizedComponents?: string;
  compatibleRuntimes?: string[];
  supportedGpuArch?: string[];
  qualityImpact?: string;
  source?: string;
  confidence?: WeightConfidence;
};

export type InferenceGpuRec = {
  /** Family token matched by calculator quote (H100, H200, A100, L40S, L4…). */
  gpuFamily: string;
  gpuCount: number;
  quant: InferenceDtype;
  interconnect?: 'PCIe' | 'NVLink' | 'SXM';
  /** Rough total VRAM needed for this recipe (GiB). */
  estimatedVramGiB: number;
  notes?: string;
};

export type InferenceDeployment = 'self-host' | 'api-only' | 'weights-pending';

/** Workload class — drives picker chips; default is chat LLM. */
export type InferenceModality = 'llm' | 'speech' | 'search' | 'embed' | 'rerank';

export type InferenceModelProfile = {
  id: string;
  displayName: string;
  aliases: string[];
  arch: InferenceArch;
  /** Total params in billions; omit/undefined if vendor did not disclose. */
  parameterCountB?: number;
  activeParameterCountB?: number;
  /** Extra human note when params are estimated or undisclosed. */
  parameterCountNote?: string;
  /**
   * self-host — open weights + recipes;
   * weights-pending — announced open weights, not shipped yet;
   * api-only — no public checkpoint (hosted only).
   */
  deployment?: InferenceDeployment;
  /** Default `llm` when omitted. */
  modality?: InferenceModality;
  weights: InferenceWeightVariant[];
  /** Attention / KV architecture — drives bytes-per-token when present. */
  attention?: AttentionProfile;
  contextDefault: number;
  /** Soft floor: configs below this total VRAM are rejected. */
  minGpuMemoryGiB: number;
  recommended: InferenceGpuRec[];
  /** Keys for search_prices aiModel / catalog facets. */
  hostedCatalogKeys?: string[];
  sources: string[];
  checkedAt: string;
  caveats: string[];
  confidence: 'high' | 'medium' | 'low';
};

export const INFERENCE_MODELS: InferenceModelProfile[] = [
  {
    id: 'glm-5.2',
    displayName: 'GLM 5.2',
    aliases: ['glm 5.2', 'glm5.2', 'glm-5.2', 'злм 5.2', 'jlm 5.2', 'jlm5.2', 'jlm-5.2'],
    arch: 'moe',
    parameterCountB: 744,
    activeParameterCountB: 40,
    // MoE: all 744B experts resident. active≈40B is compute-only — never for weights.
    weights: [
      {
        dtype: 'fp8',
        weightFormat: 'fp8',
        checkpointSizeGiB: 756,
        weightsVramGiB: 743,
        theoreticalLowerBoundGiB: 693, // 744B × 1 byte
        effectiveBitsPerWeight: 8,
        quantizedComponents: 'experts + most dense projections',
        unquantizedComponents: 'selected norms / lm_head (typical)',
        compatibleRuntimes: ['vLLM', 'SGLang', 'TensorRT-LLM'],
        supportedGpuArch: ['Hopper', 'Blackwell'],
        qualityImpact: 'near-BF16 for most chat workloads',
        source: 'Z.AI / community FP8 checkpoint size ≈756 GB; runtime ~743 GiB',
        confidence: 'estimated',
      },
      {
        dtype: 'int4',
        weightFormat: 'nvfp4',
        checkpointSizeGiB: 465,
        weightsVramGiB: 450,
        theoreticalLowerBoundGiB: 372, // naive 744B × 0.5 byte — NOT production
        effectiveBitsPerWeight: 4,
        quantizedComponents: 'NVFP4 expert weights',
        unquantizedComponents: 'scales + residual BF16/FP8 layers',
        compatibleRuntimes: ['TensorRT-LLM', 'vLLM (NVFP4)'],
        supportedGpuArch: ['Blackwell', 'Hopper (limited)'],
        qualityImpact: 'higher than theoretical INT4; prefer over naive INT4 bound',
        source: 'NVFP4 checkpoint ≈465 GB; production memory ~450 GiB (not 700 GiB)',
        confidence: 'estimated',
      },
    ],
    attention: {
      type: 'mla',
      numLayers: 80,
      latentDim: 512,
      // Measured-class estimate for MLA-style KV; independent of weight format.
      kvBytesPerTokenEstimated: 120,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 450,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 520,
        notes: 'Стартовый вариант в 4-битном формате (NVFP4): веса около 450 ГиБ, на четырёх H200 как раз влезают. В FP8 на таком же узле модель уже не поместится.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 820,
        notes: 'Основной рабочий вариант в FP8: веса около 743 ГиБ, восьми H200 хватает с запасом под кэш.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 600,
        notes: 'Тот же 4-битный формат, но уже на восьми H200 — если нужен длинный контекст и много параллельных запросов.',
      },
    ],
    hostedCatalogKeys: ['GLM 5.2', 'glm-5.2', 'glm'],
    sources: [
      'https://mws.ru/news/mws-cloud-pervoj-v-rossii-razvernula-glm-5-2-v-sobstvennom-oblake/',
      'Z.AI / GLM public model cards (MoE ~744B / ~40B active)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Активных около 40B — это про скорость токена. Память занимает вся MoE-модель (~744B экспертов), не только active.',
      'В интерфейсе «INT4» для GLM 5.2 — это NVFP4-чекпойнт (~450 ГиБ), а не наивные 372 ГиБ и не FP8 на 743 ГиБ.',
      'Восьми H100 по 80 ГиБ (640 ГиБ суммарно) для FP8-весов GLM 5.2 недостаточно.',
      'Скорость токенов и SLA с узла «из каталога» не угадать — нужен свой бенчмарк.',
    ],
    confidence: 'medium',
  },
  {
    id: 'glm-4.6-357b',
    displayName: 'GLM 4.6 357B',
    aliases: ['glm 4.6', 'glm-4.6', 'glm4.6', 'glm 4.6 357b', 'glm-4.6-357b'],
    arch: 'moe',
    parameterCountB: 357,
    activeParameterCountB: 32,
    parameterCountNote:
      'MoE около 357B, активных ~32B. Официальный FP8 — примерно 330 ГиБ; не путайте с AWQ (~176 ГиБ).',
    weights: [
      {dtype: 'fp8', weightsVramGiB: 330},
      {dtype: 'int4', weightsVramGiB: 180},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 200,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
        notes: 'Удобный FP8-вариант: веса около 330 ГиБ. На двух H200 (282 ГиБ) уже не влезет — нужны четыре.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
      },
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 240,
        notes: 'Экономный 4-битный путь: веса около 180 ГиБ, можно уложиться в четыре H100.',
      },
    ],
    hostedCatalogKeys: ['GLM 4.6', 'glm-4.6', 'glm'],
    sources: ['vLLM GLM-4.6 recipe (4–8×H200 FP8)', 'Z.AI GLM-4.6 model card'],
    checkedAt: '2026-07-27',
    caveats: [
      'FP8 около 330 ГиБ: четырёх H100 по 80 ГиБ (320 суммарно) уже впритык, под кэш почти ничего не остаётся.',
      'Параметры MoE могут отличаться по ревизии чекпойнта.',
    ],
    confidence: 'medium',
  },
  {
    id: 'qwen3-32b',
    displayName: 'Qwen3 32B',
    aliases: ['qwen3 32b', 'qwen3-32b', 'qwen 3 32b', 'qwen3.0 32b'],
    arch: 'dense',
    parameterCountB: 32,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 64},
      {dtype: 'fp8', weightsVramGiB: 34},
      {dtype: 'int4', weightsVramGiB: 18},
    ],
    attention: {
      type: 'gqa',
      numLayers: 64,
      numKvHeads: 8,
      headDim: 128,
    },
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'Самый бюджетный старт: 4-битная квантизация на одной L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
        notes: 'Комфортнее на L40S в FP8: больше запаса под контекст и параллельные запросы.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'Полный BF16 на A100 80 ГиБ — когда важнее качество, чем экономия на квантизации.',
      },
    ],
    hostedCatalogKeys: ['Qwen3 32B', 'qwen3-32b', 'qwen'],
    sources: ['Qwen3 model card', 'MWS inference catalog'],
    checkedAt: '2026-07-27',
    caveats: [],
    confidence: 'high',
  },
  {
    id: 'qwen3-8b',
    displayName: 'Qwen3 8B',
    aliases: ['qwen3 8b', 'qwen3-8b', 'qwen 3 8b', 'qwen3:8b'],
    arch: 'dense',
    parameterCountB: 8,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 16},
      {dtype: 'fp8', weightsVramGiB: 9},
      {dtype: 'int4', weightsVramGiB: 5},
    ],
    attention: {
      type: 'gqa',
      numLayers: 36,
      numKvHeads: 8,
      headDim: 128,
    },
    contextDefault: 32_768,
    minGpuMemoryGiB: 8,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'Самый популярный single-GPU / laptop tier Qwen3; BF16 комфортно на L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'Запас под длинный контекст / высокий batch.',
      },
    ],
    hostedCatalogKeys: ['Qwen3 8B', 'qwen3-8b', 'qwen'],
    sources: ['Qwen3-8B model card', 'Hugging Face download charts (local default)'],
    checkedAt: '2026-07-20',
    caveats: ['Для production coding чаще берут 32B; 8B — дешёвый / edge путь.'],
    confidence: 'high',
  },
  {
    id: 'qwen3.6-35b-a3b',
    displayName: 'Qwen3.6 35B-A3B',
    aliases: [
      'qwen 3.6',
      'qwen3.6',
      'qwen3.6-35b-a3b',
      'qwen 3.6 35b',
      'qwen3.6 35b-a3b',
    ],
    arch: 'moe',
    parameterCountB: 35,
    activeParameterCountB: 3,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 70},
      {dtype: 'fp8', weightsVramGiB: 38},
      {dtype: 'int4', weightsVramGiB: 20},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 23,
        notes: 'Минимум по деньгам: 4 бита на одной L4 (24 ГиБ).',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 43,
        notes: 'Практичный вариант в FP8 на L40S: остаётся место под кэш и несколько запросов сразу.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        // Need ≈ weights+runtime; 80 is host capacity of 1×A100, not usage.
        estimatedVramGiB: 76,
        notes: 'BF16 на A100 80 ГиБ запускается, но запаса мало: веса уже около 70 ГиБ, под кэш остаётся немного.',
      },
    ],
    hostedCatalogKeys: ['Qwen 3.6', 'qwen3.6', 'qwen3.6-35b-a3b', 'qwen'],
    sources: ['Qwen3.6 MoE card', 'Cloud.ru / MWS catalogs'],
    checkedAt: '2026-07-27',
    caveats: [
      'У MoE в память грузятся все эксперты; «active» влияет на скорость, а не на размер весов.',
      'Одна A100 в BF16 — тесновато для нагруженного API; для сервиса обычно лучше L40S в FP8.',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3.5-122b-a10b',
    displayName: 'Qwen3.5 122B-A10B',
    aliases: [
      'qwen 3.5',
      'qwen3.5',
      'qwen3.5-122b-a10b',
      'qwen 3.5 122b',
      'qwen3.5 122b-a10b',
      'qwen3.5-122b',
    ],
    arch: 'moe',
    parameterCountB: 122,
    activeParameterCountB: 10,
    parameterCountNote:
      'MoE 122B всего / около 10B активных (256 экспертов). Мультимодальная, нативный контекст 262K (можно тянуть дальше, до ~1M).',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 245},
      {dtype: 'fp8', weightsVramGiB: 125},
      {dtype: 'int8', weightsVramGiB: 122},
      {dtype: 'int4', weightsVramGiB: 65},
    ],
    contextDefault: 262_144,
    minGpuMemoryGiB: 80,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes: 'Самый компактный серверный вариант: GPTQ INT4 на одной H100. Под длинный контекст и много сессий места почти не останется.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'Основной вариант: официальный FP8 на двух H100 — здесь тензорные ядра FP8 работают как задумано.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 2,
        quant: 'int8',
        interconnect: 'NVLink',
        estimatedVramGiB: 150,
        notes: 'На двух A100 можно держать INT8: модель влезет, но будет заметно медленнее, чем на H100.',
      },
    ],
    hostedCatalogKeys: ['Qwen 3.5', 'qwen3.5', 'qwen3.5-122b-a10b', 'qwen'],
    sources: [
      'https://huggingface.co/Qwen/Qwen3.5-122B-A10B',
      'Qwen3.5 MoE card — 122B / 10B active, Apache 2.0',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'В видеопамяти лежат все эксперты; активные ~10B влияют на скорость, не на объём весов.',
      'BF16 (около 245 ГиБ) на двух A100/H100 не предлагаем — берите FP8, INT8 или INT4.',
      'Есть vision-энкодер: к чисто текстовому размеру добавится ещё немного памяти.',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3-235b',
    displayName: 'Qwen3 235B',
    aliases: [
      'qwen3 235b',
      'qwen3-235b',
      'qwen 3 235b',
      'qwen3-235b-instruct',
      'qwen3 235b instruct',
    ],
    arch: 'moe',
    parameterCountB: 235,
    activeParameterCountB: 22,
    parameterCountNote: '235B всего / около 22B активных. FP8 — примерно 235 ГиБ весов (все эксперты).',
    weights: [
      {dtype: 'fp8', weightsVramGiB: 235},
      {dtype: 'int4', weightsVramGiB: 120},
    ],
    attention: {
      type: 'gqa',
      numLayers: 94,
      numKvHeads: 4,
      headDim: 128,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'Экономный старт: INT4 около 120 ГиБ на двух H100.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 275,
        notes: 'Экономичный FP8 на двух H200: веса около 235 ГиБ, под кэш остаётся немного.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 300,
        notes: 'Более спокойный FP8 на четырёх H100 (как в типичном vLLM с tensor parallel 4) — уже с нормальным запасом.',
      },
    ],
    hostedCatalogKeys: ['Qwen3 235B', 'qwen3-235b', 'qwen'],
    sources: [
      'Qwen3-235B-A22B-Instruct-FP8 model card (vLLM --tensor-parallel-size 4)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Не занижайте FP8 до ~140 ГиБ — такие цифры ближе к INT4/5, а не к полному FP8.',
      'Для длинного контекста предпочтительнее 4×H100/H200.',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3-coder-next',
    displayName: 'Qwen3-Coder-Next',
    aliases: [
      'qwen3 coder next',
      'qwen3-coder-next',
      'qwen3-coder next',
      'coder next',
      'coder-next',
    ],
    arch: 'moe',
    parameterCountB: 80,
    activeParameterCountB: 3,
    parameterCountNote:
      '80B total / 3B active (512 experts, 10 active + shared). Память ≈ класс 80B (все эксперты в VRAM); FLOPS/токен ≈ маленькой dense. Контекст нативно 262144, не 1M.',
    deployment: 'self-host',
    weights: [
      // FP8 ≈ 80B×1B + overhead ≈ 85–105 GiB; INT4/AWQ ≈ 45–60 GiB
      {dtype: 'int4', weightsVramGiB: 52},
      {dtype: 'fp8', weightsVramGiB: 95},
      {dtype: 'bf16', weightsVramGiB: 170},
    ],
    contextDefault: 262_144,
    minGpuMemoryGiB: 48,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 1,
        quant: 'int4',
        interconnect: 'PCIe',
        estimatedVramGiB: 80,
        notes:
          'PoC / лёгкий internal agent: веса INT4 ~45–60 GiB. Не минимум для FP8 и не путать с Coder-480B (35B active).',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 1,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 141,
        notes:
          'Минимум без агрессивного 4-bit: FP8-веса ~85–105 GiB + запас под KV/batch на одной карте.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes:
          'Production baseline: TP=2, ~160 GiB суммарно под FP8 + batch/длинный контекст. Желателен NVLink, не две изолированные PCIe.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 282,
        notes:
          'Long context / высокий batch или BF16 (~170 GiB весов). 4–8×GPU — только concurrency/реплики, не «чтобы влезло».',
      },
      {
        gpuFamily: 'RTX 6000 Pro',
        gpuCount: 1,
        quant: 'int4',
        interconnect: 'PCIe',
        estimatedVramGiB: 96,
        notes: 'Бюджетный 96 GB: INT4 комфортно; FP8 — впритык при аккуратной настройке runtime.',
      },
    ],
    hostedCatalogKeys: ['Qwen3-Coder-Next', 'qwen3-coder-next', 'Qwen3 Coder Next'],
    sources: [
      'https://huggingface.co/Qwen/Qwen3-Coder-Next',
      'Cloud.ru Foundation Models (context 262144)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Не путать с Qwen3-Coder-480B-A35B (480B/35B active) — у MWS часто именно 480B, не Next.',
      '8×H100 не нужны, чтобы модель поместилась; это пул реплик / высокая concurrency.',
      'Hosted TCO считай input+output (+cache), не одной ставкой «₽/1M».',
      'Selectel FMC = те же GPU/vCPU/RAM, не token SaaS.',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3-coder-480b',
    displayName: 'Qwen3 Coder 480B',
    aliases: [
      'qwen3 coder 480b',
      'qwen3-coder-480b',
      'qwen3-coder-480b-a35b',
      'qwen3 coder 480b a35b',
      'coder 480b',
    ],
    arch: 'moe',
    parameterCountB: 480,
    activeParameterCountB: 35,
    parameterCountNote: '480B всего / около 35B активных. FP8 — примерно 480 ГиБ весов.',
    weights: [
      {dtype: 'fp8', weightsVramGiB: 480},
      {dtype: 'int4', weightsVramGiB: 250},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 320,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 540,
        notes: 'Минимальный FP8: веса около 480 ГиБ на четырёх H200. Влезает, но плотно — без большого запаса.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 560,
        notes: 'Тот же FP8, но на восьми H100 — если удобнее Hopper-полка, а не H200.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 700,
        notes: 'Восемь H200 — уже не «чтобы влезло», а запас под длинный контекст и высокую нагрузку.',
      },
    ],
    hostedCatalogKeys: ['qwen3-coder-480b-a35b', 'Qwen3 Coder 480B', 'qwen3-coder-480b'],
    sources: ['Qwen3-Coder-480B-A35B card', 'MWS catalog'],
    checkedAt: '2026-07-27',
    caveats: [
      'Крупный coding MoE — self-host дорогой; смотрите hosted API.',
      'Не путать с Qwen3-Coder-Next (80B/3B active).',
    ],
    confidence: 'medium',
  },
  {
    id: 'kimi-k2.6',
    displayName: 'Kimi K2.6',
    aliases: ['kimi k2.6', 'kimi-k2.6', 'kimi k2', 'kimi-k2', 'kimi k2 instruct'],
    arch: 'moe',
    parameterCountB: 1000,
    activeParameterCountB: 32,
    parameterCountNote:
      'Около 1T параметров, активных ~32B. Официальный FP8 — примерно 550–1000 ГиБ в зависимости от сборки; INT4 — около 300 ГиБ.',
    weights: [
      {dtype: 'fp8', weightsVramGiB: 550},
      {dtype: 'int4', weightsVramGiB: 300},
    ],
    attention: {
      type: 'mla',
      numLayers: 61,
      latentDim: 512,
      kvBytesPerTokenEstimated: 200,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 320,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 380,
        notes: 'Стартовый 4-битный вариант: веса около 300 ГиБ на четырёх H200, с умеренным запасом.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 400,
        notes: 'Тот же INT4 на восьми H100 — альтернатива, если H200 недоступны.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 700,
        notes:
          'FP8 на восьми H200: веса около 550 ГиБ из 1128 ГиБ — запускается, но запас небольшой. Для полного 128K контекста Moonshot часто рекомендует уже 16 GPU.',
      },
    ],
    hostedCatalogKeys: ['Kimi', 'kimi-k2.6', 'kimi', 'Kimi K2.6'],
    sources: [
      'Moonshot Kimi-K2 deploy guidance (16× H200/H800 FP8 official floor)',
      'Community 8×H200 FP8 ~549 GB weights deployments',
      'https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models',
      'Cloud.ru tariff 7.EVO.11.2 «БЯМ Kimi-K2.6»',
      'MWS GPT Model Hub',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Восемь H200 в FP8 — почти впритык; для плотного потока запросов это не самый спокойный вариант.',
      'По документации Moonshot для FP8 и контекста 128K часто нужен уже кластер из 16 GPU.',
      'Очень крупный MoE; self-host имеет смысл только при жёстких требованиях к контуру.',
    ],
    confidence: 'medium',
  },
  {
    id: 'kimi-k3',
    displayName: 'Kimi K3',
    aliases: [
      'kimi k3',
      'kimi-k3',
      'kimi k3.0',
      'кими к3',
      'кимика 3',
      'кими k3',
      // Speech-to-text: «Kimi K3» → «химика три» / «химика 3»
      'химика 3',
      'химика три',
      'химик а 3',
      'химик а три',
    ],
    arch: 'moe',
    parameterCountB: 2800,
    activeParameterCountB: 55,
    parameterCountNote:
      '2,8T total MoE; ~50–60B active (16 из 896 experts). Память задаёт total, не active.',
    deployment: 'weights-pending',
    weights: [
      // MXFP4 QAT ≈ 0.5 byte/param → ~1.4 TiB weights alone
      {dtype: 'int4', weightsVramGiB: 1400},
      {dtype: 'fp8', weightsVramGiB: 2800},
    ],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 1400,
    recommended: [
      {
        gpuFamily: 'B300',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        // Need ≈ weights+runtime (~1.67 TiB); 2304 is 8×B300 host capacity, not usage.
        estimatedVramGiB: 1680,
        notes:
          'Ближе всего к одному плотному узлу под MXFP4 (~1,4 TiB веса). Официально Moonshot всё равно рекомендует supernode ≥64 accelerators.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 1128,
        notes:
          '8×H200 (~1,1 TiB) — мало для полных MXFP4-весов; цена «одной полки» в РФ, не готовый production recipe.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: '8×H100 — только TCO одной полки; для K3 нужен multi-node / 64+ GPU.',
      },
    ],
    hostedCatalogKeys: ['Kimi', 'kimi-k3', 'kimi'],
    sources: [
      'https://www.kimi.com/en/blog/kimi-k3',
      'Moonshot: Stable LatentMoE 16/896, MXFP4 weights, supernode ≥64 accelerators; weights by 2026-07-27',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Официально: deploy на supernode с 64+ accelerators (не 1×8 GPU).',
      'Веса open-weight обещаны к 27.07.2026 — до релиза self-host recipe предварительный.',
      'Для большинства команд рациональнее Kimi API / hosted, а не свой кластер.',
    ],
    confidence: 'medium',
  },
  {
    id: 'qwen-3.8',
    displayName: 'Qwen3.8',
    aliases: [
      'qwen 3.8',
      'qwen3.8',
      'qwen3.8-max',
      'qwen 3.8 max',
      'квен 3.8',
      'квэн 3.8',
    ],
    arch: 'moe',
    parameterCountB: 2400,
    parameterCountNote:
      '2,4T по заявлению Alibaba (Jul 2026). Active experts / sparsity публично не раскрыты — VRAM считаем по total MoE.',
    deployment: 'weights-pending',
    weights: [
      {dtype: 'int4', weightsVramGiB: 1200},
      {dtype: 'fp8', weightsVramGiB: 2400},
    ],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 1200,
    recommended: [
      {
        gpuFamily: 'B300',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        // Need ≈ weights+runtime; 2304 = 8×B300 capacity marker, not model use.
        estimatedVramGiB: 1450,
        notes: 'Ориентир одного плотного узла под INT4 (~1,2 TiB веса), когда веса выйдут; long-context всё равно multi-node.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 1128,
        notes: '8×H200 на грани / мало для 2,4T INT4 — смотрите как цену полки, не как готовый recipe.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: '8×H100 недостаточно для полных весов; только TCO одной полки в каталоге РФ.',
      },
    ],
    // Do not use bare «Qwen» — search would match Coder-Next / 3.6 and invent a false API analog.
    hostedCatalogKeys: ['qwen3.8', 'Qwen3.8', 'qwen 3.8'],
    sources: [
      'Alibaba / Qwen announcement 2026-07-19 (2.4T, open-weight soon)',
      'SCMP / MLQ coverage of Qwen3.8-Max-Preview',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Open-weight «скоро», но checkpoint/лицензия на момент профиля ещё не выложены.',
      'В каталоге РФ token API для 3.8 пока может отсутствовать — не подставляй цены соседних Qwen.',
      'Без опубликованной sparsity active params неизвестны — оценки VRAM консервативные (по total).',
      'Пока preview — Token Plan / Qoder; self-host только после выхода весов.',
    ],
    confidence: 'low',
  },
  {
    id: 'qwen-3.7',
    displayName: 'Qwen3.7 Max',
    aliases: [
      'qwen 3.7',
      'qwen3.7',
      'qwen3.7-max',
      'qwen 3.7 max',
      'квен 3.7',
      'квэн 3.7',
    ],
    arch: 'moe',
    parameterCountNote:
      'Параметры официально не раскрыты (закрытая Max-линейка, API-only, май 2026).',
    deployment: 'api-only',
    weights: [],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 0,
    recommended: [],
    // No bare «Qwen» — search would match Coder-Next / 3.6 and invent a false API analog.
    hostedCatalogKeys: ['qwen3.7', 'Qwen3.7 Max', 'qwen3.7-max'],
    sources: [
      'https://www.qwencloud.com/models/qwen3.7-max',
      'Alibaba Cloud Summit / Qwen3.7-Max (API-only, params undisclosed)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Self-host невозможен: нет публичного checkpoint.',
      'В каталоге РФ token API для 3.7 Max может отсутствовать — не подставляй цены соседних Qwen.',
      'Для своей инфры смотрите open-weight линейку (Qwen3.6 / ожидаемый Qwen3.8) или hosted API.',
    ],
    confidence: 'high',
  },
  {
    id: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash',
    aliases: [
      'deepseek v4 flash',
      'deepseek-v4-flash',
      'deepseek v4',
      'deepseek-v4',
      'deepseekv4',
      'deepseek',
      'дипсик v4',
      'дипсик',
    ],
    arch: 'moe',
    parameterCountB: 284,
    activeParameterCountB: 13,
    parameterCountNote:
      'V4 Flash: 284B всего / 13B активных, контекст до 1M. Память считают все эксперты, не только active. Родной FP4+FP8 — около 158 ГиБ; лицензия MIT.',
    weights: [
      {
        dtype: 'int4',
        weightFormat: 'nvfp4',
        checkpointSizeGiB: 158,
        weightsVramGiB: 158,
        theoreticalLowerBoundGiB: 142,
        effectiveBitsPerWeight: 4.5,
        quantizedComponents: 'MoE experts (FP4); most other params FP8',
        compatibleRuntimes: ['vLLM', 'SGLang'],
        supportedGpuArch: ['Hopper', 'Blackwell'],
        source: 'deepseek-ai/DeepSeek-V4-Flash — FP4+FP8 Mixed ~158 GB',
        confidence: 'measured',
      },
      {
        dtype: 'int8',
        weightFormat: 'int8',
        weightsVramGiB: 160,
        theoreticalLowerBoundGiB: 142,
        source: 'Community INT8 / W8A8 serving estimate for 284B MoE',
        confidence: 'estimated',
      },
      {
        dtype: 'fp8',
        weightFormat: 'fp8',
        checkpointSizeGiB: 284,
        weightsVramGiB: 284,
        theoreticalLowerBoundGiB: 264,
        source: 'FP8 ≈ 284B × 1 byte до KV/runtime; 2×H200 (282 GB) без offload недостаточно',
        confidence: 'estimated',
      },
    ],
    attention: {
      type: 'mla',
      numLayers: 60,
      latentDim: 512,
      kvBytesPerTokenEstimated: 140,
    },
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 220,
        notes:
          'Старт с официального смешанного FP4+FP8 (или INT4) чекпойнта. Не считайте «284B × 1 байт» — реальный размер смотрите в карточке модели.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
        notes:
          'Рабочий FP8: именно Flash-Base / FP8 Mixed (около 284 ГиБ) на четырёх H100. «Любой FP8 из интернета» сюда не подставляйте.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 240,
        notes: 'На четырёх A100 разумно только INT8 или INT4. Полный BF16 и «толстый» FP8 сюда не влезут.',
      },
    ],
    hostedCatalogKeys: ['DeepSeek V4', 'deepseek-v4-flash', 'deepseek-v4', 'deepseek'],
    sources: [
      'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
      'DeepSeek-V4 series (MIT) — Flash 284B/13B active, 1M context',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'В память идут все 284B параметров; 13B active — только про вычисления на токен.',
      'Две H200 — это около 282 ГиБ: хватит для INT4/FP4 или с выгрузкой. Для FP8 берите от четырёх H100/H200 и конкретный чекпойнт.',
      'Для Think Max reasoning держите окно ≥384K — KV растёт заметно.',
      'Не путать с V4-Pro (1.6T) — другой класс железа.',
    ],
    confidence: 'high',
  },
  {
    id: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    aliases: [
      'deepseek v4 pro',
      'deepseek-v4-pro',
      'deepseek v4 1.6t',
      'deepseek-v4-pro-1.6t',
    ],
    arch: 'moe',
    parameterCountB: 1600,
    activeParameterCountB: 49,
    parameterCountNote:
      'V4 Pro: 1.6T total / 49B active, 1M ctx. Native FP4+FP8 mixed ~862 GB; MIT.',
    weights: [
      {
        dtype: 'int4',
        weightFormat: 'nvfp4',
        checkpointSizeGiB: 862,
        weightsVramGiB: 862,
        theoreticalLowerBoundGiB: 800,
        quantizedComponents: 'MoE experts (FP4); dense / attn mostly FP8',
        compatibleRuntimes: ['vLLM', 'SGLang'],
        supportedGpuArch: ['Hopper', 'Blackwell'],
        source: 'deepseek-ai/DeepSeek-V4-Pro — FP4+FP8 Mixed ~862 GB',
        confidence: 'measured',
      },
      {
        dtype: 'fp8',
        weightFormat: 'fp8',
        checkpointSizeGiB: 1200,
        weightsVramGiB: 1100,
        source: 'DeepSeek-V4-Pro-Base FP8 Mixed / multi-node serving estimates',
        confidence: 'estimated',
      },
    ],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 800,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 1000,
        notes: 'Single-node floor под native FP4+FP8 Pro; длинный ctx → multi-node.',
      },
      {
        gpuFamily: 'B300',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 1100,
        notes: 'Blackwell HGX — запас по bandwidth и KV под 1M.',
      },
    ],
    hostedCatalogKeys: ['DeepSeek V4 Pro', 'deepseek-v4-pro', 'deepseek'],
    sources: [
      'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro',
      'DeepSeek-V4 series (MIT) — Pro 1.6T / 49B active',
    ],
    checkedAt: '2026-07-26',
    caveats: [
      'Production FP8 / длинный Think Max почти всегда multi-node.',
      'Для большинства команд достаточно V4-Flash.',
    ],
    confidence: 'high',
  },
  {
    id: 'deepseek-v3',
    displayName: 'DeepSeek V3',
    aliases: ['deepseek v3', 'deepseek-v3', 'deepseek v3.2', 'deepseek-v3.2'],
    arch: 'moe',
    parameterCountB: 671,
    activeParameterCountB: 37,
    parameterCountNote:
      'Основная модель 671B плюс ~14B MTP — на диске около 685B. FP8-веса ≈685 ГиБ; цифра ~350 — это уже класс AWQ/INT4.',
    weights: [
      {
        dtype: 'fp8',
        weightFormat: 'fp8',
        checkpointSizeGiB: 685,
        weightsVramGiB: 685,
        theoreticalLowerBoundGiB: 625,
        source: 'DeepSeek-V3 FP8 (671B+MTP); 8×H100 80GB = 640 GB — недостаточно',
        confidence: 'measured',
      },
      {
        dtype: 'int4',
        weightFormat: 'awq-int4',
        weightsVramGiB: 350,
        source: 'AWQ W4A16 / community INT4 ≈335–350 GiB',
        confidence: 'estimated',
      },
    ],
    attention: {
      type: 'mla',
      numLayers: 61,
      latentDim: 512,
      kvBytesPerTokenEstimated: 156,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 350,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 850,
        notes: 'Основной FP8: веса около 685 ГиБ. На четырёх H200 или восьми H100 по 80 ГиБ FP8 уже не предлагаем — не влезет комфортно.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
        notes: 'INT4 на четырёх H200: другая топология и характер нагрузки, чем у восьми H100.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
        notes: 'INT4 / AWQ около 350 ГиБ — можно держать на восьми H100.',
      },
    ],
    hostedCatalogKeys: ['DeepSeek', 'deepseek-v3', 'deepseek'],
    sources: [
      'https://github.com/deepseek-ai/DeepSeek-V3',
      'DeepSeek-V3 technical report (FP8 native, 671B+MTP)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'FP8 около 685 ГиБ: восьми H100 по 80 ГиБ (640 суммарно) для комфортного FP8 не хватает.',
      'Официальные рецепты для длинного контекста часто предполагают уже несколько узлов.',
    ],
    confidence: 'high',
  },
  {
    id: 'deepseek-r1',
    displayName: 'DeepSeek R1',
    aliases: [
      'deepseek r1',
      'deepseek-r1',
      'deepseek r1 671b',
      'deepseek-r1-671b',
      'дипсик r1',
    ],
    arch: 'moe',
    parameterCountB: 671,
    activeParameterCountB: 37,
    parameterCountNote:
      'Reasoning MoE на базе V3-класса (671B / ~37B active). VRAM как у V3 (~685 GiB FP8); compute выше из‑за CoT.',
    weights: [
      {
        dtype: 'fp8',
        weightFormat: 'fp8',
        checkpointSizeGiB: 685,
        weightsVramGiB: 685,
        source: 'Same weight class as DeepSeek-V3 FP8',
        confidence: 'measured',
      },
      {
        dtype: 'int4',
        weightFormat: 'awq-int4',
        weightsVramGiB: 350,
        source: 'AWQ/INT4 ≈335–350 GiB',
        confidence: 'estimated',
      },
    ],
    attention: {
      type: 'mla',
      numLayers: 61,
      latentDim: 512,
      kvBytesPerTokenEstimated: 156,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 350,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 900,
        notes: 'Основной FP8 для полного R1. Если много длинных цепочек рассуждений — запас под кэш особенно важен.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
        notes: 'INT4 на четырёх H200 — более компактный узел.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 420,
        notes: 'Тот же INT4 на восьми H100, если удобнее классическая Hopper-полка.',
      },
    ],
    hostedCatalogKeys: ['DeepSeek R1', 'deepseek-r1', 'deepseek'],
    sources: [
      'https://github.com/deepseek-ai/DeepSeek-R1',
      'DeepSeek-R1 model card (MIT, same weight class as V3)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Полный R1 — класс дата-центра. Если нужны одна-две карты — смотрите Distill 32B.',
      'Не путать с distill-вариантами (8B/14B/32B/70B) — у них другой footprint.',
      'FP8 около 685 ГиБ: четырёх H200 (564) или восьми H100 по 80 ГиБ (640) для FP8 недостаточно.',
    ],
    confidence: 'high',
  },
  {
    id: 'deepseek-r1-distill-32b',
    displayName: 'DeepSeek R1 Distill 32B',
    aliases: [
      'deepseek r1 distill 32b',
      'deepseek-r1-distill-32b',
      'deepseek r1 32b',
      'deepseek-r1-32b',
      'r1 distill 32b',
      'r1 32b',
    ],
    arch: 'dense',
    parameterCountB: 32,
    parameterCountNote:
      'Dense distill от R1 на базе Qwen2.5-32B — то, что чаще всего self-hostят локально / на 1×GPU.',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 64},
      {dtype: 'fp8', weightsVramGiB: 34},
      {dtype: 'int4', weightsVramGiB: 18},
    ],
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: '1×A100 80GB — комфортный BF16 путь для самого популярного R1-distill.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
      },
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'INT4 на L4 — бюджетный single-GPU reasoning.',
      },
    ],
    // Distill-only keys — never «DeepSeek R1» (full MoE) or bare «deepseek».
    hostedCatalogKeys: [
      'deepseek-r1-distill-32b',
      'DeepSeek R1 Distill 32B',
      'DeepSeek-R1-Distill-Qwen-32B',
    ],
    sources: [
      'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
      'DeepSeek-R1 distill release notes',
    ],
    checkedAt: '2026-07-20',
    caveats: ['Не путать с full DeepSeek R1 671B — VRAM и цена узла на порядок меньше.'],
    confidence: 'high',
  },
  {
    id: 'gpt-oss-120b',
    displayName: 'gpt-oss-120b',
    aliases: [
      'gpt-oss-120b',
      'gpt oss 120b',
      'gpt-oss 120b',
      'gpt oss 120',
      'gpt-oss',
      'gpt oss',
      'gpt усс',
      'gpt-усс',
      'gptuss',
      'gpt vss',
      'gpt-vss',
      'gpt усс 120',
      'gptuss 120',
    ],
    arch: 'moe',
    parameterCountB: 117,
    activeParameterCountB: 5.1,
    parameterCountNote:
      'MoE 116.8B всего / 5.1B активных. Родные MXFP4-веса — чекпойнт около 61 ГиБ.',
    weights: [
      {
        dtype: 'int4',
        weightFormat: 'int4',
        checkpointSizeGiB: 61,
        weightsVramGiB: 65,
        source: 'OpenAI gpt-oss-120b MXFP4 (OCP) checkpoint 60.8 GiB; runtime ~65 GiB — не NVIDIA NVFP4',
        confidence: 'measured',
      },
      {dtype: 'fp8', weightsVramGiB: 120},
      {dtype: 'bf16', weightsVramGiB: 234},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 70,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes:
          'Официальный путь OpenAI: MXFP4 на одной H100 80 ГиБ. Восемь GPU здесь не нужны «на всякий случай».',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 100,
        notes: 'Тот же официальный MXFP4, но на H200 — больше места под длинный контекст и пакетную обработку.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes:
          'На A100 модель можно запустить через совместимый runtime или стороннюю 4-битную сборку: родных MXFP4-ядер у A100 нет.',
      },
    ],
    hostedCatalogKeys: ['gpt-oss-120b', 'gpt-oss'],
    sources: [
      'OpenAI gpt-oss model card (MXFP4 MoE, single 80GB GPU)',
      'Yandex / MWS / Cloud.ru catalogs',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Не берите восемь H100 «на всякий случай»: при MXFP4 это лишнее железо.',
      'FP8 — не основной официальный формат; берите его только если есть проверенная конверсия.',
      'BF16 всех экспертов — около 234 ГиБ; на одну карту не влезет.',
    ],
    confidence: 'high',
  },
  {
    id: 'gpt-oss-20b',
    displayName: 'gpt-oss-20b',
    aliases: [
      'gpt-oss-20b',
      'gpt oss 20b',
      'gpt-oss 20b',
      'gpt oss 20',
      'gpt-oss20b',
    ],
    arch: 'moe',
    parameterCountB: 21,
    activeParameterCountB: 3.6,
    parameterCountNote: 'MoE 20.9B всего / 3.6B активных. Родной MXFP4 — около 13 ГиБ.',
    weights: [
      {
        dtype: 'int4',
        weightFormat: 'int4',
        checkpointSizeGiB: 13,
        weightsVramGiB: 14,
        source: 'OpenAI gpt-oss-20b MXFP4 ~12.8 GiB — не NVIDIA NVFP4',
        confidence: 'measured',
      },
      {dtype: 'fp8', weightsVramGiB: 22},
      {dtype: 'bf16', weightsVramGiB: 42},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes:
          'Официальные MXFP4-веса влезают в 24 ГиБ L4, но у карты нет родных MXFP4-ядер — скорость зависит от того, как runtime разворачивает веса.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 40,
        notes: 'Вариант через FP8-конверсию на L40S — это уже не родной MXFP4-путь OpenAI.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'BF16 на A100 — когда нужен запас под контекст без агрессивной квантизации.',
      },
    ],
    hostedCatalogKeys: ['gpt-oss-20b', 'gpt-oss'],
    sources: [
      'OpenAI gpt-oss model card (20B fits ~16GB with MXFP4)',
      'Apache 2.0 open-weight reasoning twin of gpt-oss-120b',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Не путать с gpt-oss-120b — другой класс VRAM и цены узла.',
      'На L4 модель по объёму памяти влезает, но это не то же самое, что аппаратно ускоренный MXFP4 на Hopper/Blackwell.',
    ],
    confidence: 'high',
  },
  {
    id: 'gemma-3-27b',
    displayName: 'Gemma 3 27B',
    aliases: ['gemma 3 27b', 'gemma-3-27b', 'gemma3 27b', 'gemma 3', 'gemma-3'],
    arch: 'dense',
    parameterCountB: 27,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 54},
      {dtype: 'fp8', weightsVramGiB: 30},
      {dtype: 'int4', weightsVramGiB: 16},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'Бюджетный старт: 4 бита на L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
        notes: 'Удобнее в FP8 на L40S.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'Полный BF16 на A100 80 ГиБ.',
      },
    ],
    hostedCatalogKeys: ['Gemma', 'gemma-3-27b', 'gemma'],
    sources: ['Google Gemma 3 model card', 'MWS catalog'],
    checkedAt: '2026-07-27',
    caveats: [],
    confidence: 'high',
  },
  {
    id: 'gemma-4-31b',
    displayName: 'Gemma 4 31B',
    aliases: [
      'gemma 4 31b',
      'gemma-4-31b',
      'gemma4 31b',
      'gemma 4',
      'gemma-4',
      'gemma4',
    ],
    arch: 'dense',
    parameterCountB: 31,
    parameterCountNote:
      'Плотная мультимодальная модель (~30.7B; на Hugging Face иногда пишут ~33B). Лицензия Apache 2.0. В семье ещё есть MoE 26B-A4B.',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 62},
      {dtype: 'fp8', weightsVramGiB: 35},
      {dtype: 'int8', weightsVramGiB: 32},
      {dtype: 'int4', weightsVramGiB: 18},
    ],
    contextDefault: 256_000,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 23,
        notes: 'Минимум: 4-битная версия (GPTQ, AWQ или GGUF) на одной L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 43,
        notes: 'Комфортный вариант в FP8 или INT8 на L40S.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'BF16 на A100: веса около 62 ГиБ, остаётся место под кэш.',
      },
    ],
    hostedCatalogKeys: ['Gemma 4', 'gemma-4-31b', 'gemma-4', 'gemma'],
    sources: [
      'https://huggingface.co/google/gemma-4-31B',
      'https://ai.google.dev/gemma/docs/core/model_card_4',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Важно не смешивать форматы: на L4 — INT4, на L40S — FP8/INT8, на A100 — BF16.',
      'Полный 256K ctx заметно раздувает KV — для edge держите окно короче.',
      'Не путать с Gemma 4 26B-A4B (MoE) — другой VRAM-профиль.',
    ],
    confidence: 'high',
  },
  {
    id: 'llama-4-scout',
    displayName: 'Llama 4 Scout',
    aliases: [
      'llama 4 scout',
      'llama4 scout',
      'llama-4-scout',
      'llama 4',
      'llama4',
    ],
    arch: 'moe',
    parameterCountB: 109,
    activeParameterCountB: 17,
    parameterCountNote:
      '17B active × 16 experts (109B total). Все эксперты в VRAM; INT4 on-the-fly на 1×H100 (рецепт из model card). Контекст до 10M.',
    weights: [
      {dtype: 'int4', weightsVramGiB: 62},
      {dtype: 'fp8', weightsVramGiB: 110},
      {dtype: 'bf16', weightsVramGiB: 218},
    ],
    contextDefault: 10_000_000,
    minGpuMemoryGiB: 48,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes:
          'Официальный путь Meta: INT4 «на лету» на одной H100 (веса примерно 55–65 ГиБ). Самый частый self-host для Llama 4.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
      },
      {
        gpuFamily: 'H200',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 141,
        notes: 'Одна H200 в FP8 — без жёсткой 4-битной квантизации и с запасом под длинный контекст.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'Две H100 в FP8 — если нужен больший поток запросов без INT4.',
      },
    ],
    hostedCatalogKeys: ['Llama 4', 'llama-4-scout', 'llama4', 'llama'],
    sources: [
      'https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md',
      'Llama 4 Scout (17B×16E, 109B total, 10M context)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'MoE: active 17B ≠ VRAM 17B — нужны все 109B весов.',
      'Лицензия Llama 4 Community (не Apache); для большинства команд ок, юридический review желателен.',
    ],
    confidence: 'high',
  },
  {
    id: 'llama-4-maverick',
    displayName: 'Llama 4 Maverick',
    aliases: [
      'llama 4 maverick',
      'llama4 maverick',
      'llama-4-maverick',
    ],
    arch: 'moe',
    parameterCountB: 400,
    activeParameterCountB: 17,
    parameterCountNote:
      '17B active × 128 experts (400B total). FP8 на одном HGX H100 host (8×; рецепт из model card); INT4 ~200+ GiB.',
    weights: [
      {dtype: 'int4', weightsVramGiB: 220},
      {dtype: 'fp8', weightsVramGiB: 420},
      {dtype: 'bf16', weightsVramGiB: 800},
    ],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
        notes: 'Стартовый INT4: веса примерно 200–240 ГиБ на четырёх H100. Влезает плотно — многое зависит от конкретной 4-битной сборки.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 282,
        notes: 'INT4 на двух H200 ещё плотнее: хватит для небольшой нагрузки, не для плотного API.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: 'Рекомендуемый FP8 по model card: целый узел из восьми H100.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
        notes: 'Тот же FP8 на четырёх H200.',
      },
    ],
    hostedCatalogKeys: ['Llama 4', 'llama-4-maverick', 'llama4', 'llama'],
    sources: [
      'https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md',
      'Llama 4 Maverick (17B×128E, 400B total)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Существенно дороже Scout; для long-context RAG чаще хватает Scout.',
      'Лицензия Llama 4 Community.',
    ],
    confidence: 'high',
  },
  {
    id: 'llama-3.3-70b',
    displayName: 'Llama 3.3 70B',
    aliases: [
      'llama 3.3 70b',
      'llama-3.3-70b',
      'llama3.3 70b',
      'llama 3.1 70b',
      'llama-3.1-70b',
      'llama 70b',
    ],
    arch: 'dense',
    parameterCountB: 70,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 140},
      {dtype: 'fp8', weightsVramGiB: 75},
      {dtype: 'int4', weightsVramGiB: 40},
    ],
    attention: {
      type: 'gqa',
      numLayers: 80,
      numKvHeads: 8,
      headDim: 128,
    },
    contextDefault: 128_000,
    minGpuMemoryGiB: 48,
    recommended: [
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes: 'Самый компактный вариант: INT4 на одной A100.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'bf16',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'BF16 около 140 ГиБ на двух H100 — нормально для умеренного контекста и нагрузки.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 2,
        quant: 'bf16',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'BF16 на двух A100 — похожий запас, чуть другой ценовой профиль.',
      },
    ],
    hostedCatalogKeys: ['Llama', 'llama-3.3', 'llama'],
    sources: ['Llama 3.3 model card'],
    checkedAt: '2026-07-27',
    caveats: ['Llama 3.1 70B и 3.3 70B по VRAM близки — один профиль.'],
    confidence: 'high',
  },
  {
    id: 'mixtral-8x22b',
    displayName: 'Mixtral 8x22B',
    aliases: ['mixtral 8x22b', 'mixtral-8x22b', 'mixtral 8×22b', 'mixtral'],
    arch: 'moe',
    parameterCountB: 141,
    activeParameterCountB: 39,
    parameterCountNote: '8×22B MoE ≈141B total / ~39B active. FP8 ≈141 GiB весов.',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 280},
      {dtype: 'fp8', weightsVramGiB: 145},
      {dtype: 'int4', weightsVramGiB: 75},
    ],
    attention: {
      type: 'gqa',
      numLayers: 56,
      numKvHeads: 8,
      headDim: 128,
    },
    contextDefault: 65_536,
    minGpuMemoryGiB: 80,
    recommended: [
      {
        gpuFamily: 'A100',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 120,
        notes: 'Практичный старт для сервиса: INT4 на двух A100.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'FP8 на двух H100: веса около 145 ГиБ, под кэш почти ничего не остаётся — только лёгкая нагрузка.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes: 'Эксперимент: одна A100 в INT4. Для короткого контекста и одного запроса — да; как стабильный API — слабо.',
      },
    ],
    hostedCatalogKeys: ['Mixtral', 'mixtral'],
    sources: ['Mistral Mixtral 8x22B model card'],
    checkedAt: '2026-07-27',
    caveats: [
      'BF16 около 280 ГиБ — это уже от четырёх A100/H100; в коротких рецептах ниже не предлагаем.',
      'Одна A100 в INT4 — скорее эксперимент, не пол для стабильного API.',
    ],
    confidence: 'high',
  },
  {
    id: 'mistral-small-24b',
    displayName: 'Mistral Small 24B',
    aliases: ['mistral small', 'mistral-small', 'mistral small 24b', 'mistral-small-24b'],
    arch: 'dense',
    parameterCountB: 24,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 48},
      {dtype: 'fp8', weightsVramGiB: 26},
      {dtype: 'int4', weightsVramGiB: 14},
    ],
    attention: {
      type: 'gqa',
      numLayers: 40,
      numKvHeads: 8,
      headDim: 128,
    },
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'Бюджетный старт на L4 в 4 битах.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 40,
        notes: 'Удобнее на L40S в FP8.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'Полный BF16 на A100, если нужен запас по качеству и контексту.',
      },
    ],
    hostedCatalogKeys: ['Mistral', 'mistral'],
    sources: ['Mistral Small model card'],
    checkedAt: '2026-07-27',
    caveats: [],
    confidence: 'high',
  },
  {
    id: 'devstral-small-24b',
    displayName: 'Devstral Small 24B',
    aliases: [
      'devstral small',
      'devstral-small',
      'devstral small 24b',
      'devstral-small-24b',
      'devstral small 2',
      'devstral',
    ],
    arch: 'dense',
    parameterCountB: 24,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 48},
      {dtype: 'fp8', weightsVramGiB: 26},
      {dtype: 'int4', weightsVramGiB: 14},
    ],
    contextDefault: 256_000,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'Бюджетный локальный агент: INT4 на одной L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 40,
        notes: 'Для агентного кодинга удобнее FP8 на L40S.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'BF16 на A100 — когда агенту нужен длинный контекст.',
      },
    ],
    hostedCatalogKeys: ['Devstral', 'devstral-small', 'mistral'],
    sources: [
      'https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512',
      'Mistral Devstral Small 2 (24B, agentic coding, Apache-friendly)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Не путать с Devstral 2 123B — другой класс железа.',
      'Заточен под agent scaffolds (SWE-bench), не общий chat.',
    ],
    confidence: 'high',
  },
  {
    id: 'devstral-2-123b',
    displayName: 'Devstral 2 123B',
    aliases: [
      'devstral 2',
      'devstral-2',
      'devstral 2 123b',
      'devstral-2-123b',
      'devstral 123b',
    ],
    arch: 'dense',
    parameterCountB: 123,
    weights: [
      {dtype: 'int4', weightsVramGiB: 70},
      {dtype: 'fp8', weightsVramGiB: 130},
      {dtype: 'bf16', weightsVramGiB: 246},
    ],
    contextDefault: 256_000,
    minGpuMemoryGiB: 70,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes: 'INT4 на 1×H100 — production floor для large Devstral.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 141,
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'FP8 / длинный agent-контекст без агрессивной 4-bit.',
      },
    ],
    hostedCatalogKeys: ['Devstral', 'devstral-2', 'mistral'],
    sources: [
      'Mistral Devstral 2 (123B) release / model card',
      'SWE-bench open-weight coding agent leaderboard coverage',
    ],
    checkedAt: '2026-07-20',
    caveats: ['Для большинства команд Small 24B дешевле и достаточен; 123B — когда нужен max SWE-bench.'],
    confidence: 'medium',
  },
  {
    id: 'phi-4',
    displayName: 'Phi-4 14B',
    aliases: [
      'phi-4',
      'phi 4',
      'phi4',
      'phi-4 14b',
      'phi 4 14b',
      'phi-4-14b',
      'microsoft phi-4',
    ],
    arch: 'dense',
    parameterCountB: 14,
    weights: [
      {dtype: 'bf16', weightsVramGiB: 28},
      {dtype: 'fp8', weightsVramGiB: 16},
      {dtype: 'int4', weightsVramGiB: 8},
    ],
    contextDefault: 16_000,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 24,
        notes: 'Популярный small / edge модель; FP8 комфортно на L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
      },
    ],
    hostedCatalogKeys: ['Phi-4', 'phi-4', 'phi'],
    sources: [
      'https://huggingface.co/microsoft/phi-4',
      'Microsoft Phi-4 14B (MIT) — local / low-VRAM tier',
    ],
    checkedAt: '2026-07-20',
    caveats: ['Сильнее на reasoning/math в своём размере, чем на длинном agentic coding.'],
    confidence: 'high',
  },
  {
    id: 'granite-4.1-8b',
    displayName: 'IBM Granite 4.1 8B',
    aliases: [
      'granite 4.1',
      'granite-4.1',
      'granite 4.1 8b',
      'granite-4.1-8b',
      'ibm granite 4.1',
      'ibm granite',
      'granite 8b',
    ],
    arch: 'dense',
    parameterCountB: 8,
    parameterCountNote: 'Плотная instruct-модель под корпоративные сценарии (tool calling, RAG), Apache 2.0, контекст около 131K.',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 16},
      {dtype: 'fp8', weightsVramGiB: 9},
      {dtype: 'int8', weightsVramGiB: 9},
      {dtype: 'int4', weightsVramGiB: 5},
    ],
    contextDefault: 131_072,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'На L4 модель в BF16 спокойно влезает (веса около 16 ГиБ). Если контекст длинный или запросов много — лучше FP8/INT8 или карта покрупнее.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'L40S — когда нужны параллельные сессии или длинный контекст.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 40,
        notes: 'A100 — запас под пакетную обработку и контекст за 128K.',
      },
    ],
    hostedCatalogKeys: ['Granite', 'granite-4.1-8b', 'ibm-granite'],
    sources: [
      'https://huggingface.co/ibm-granite/granite-4.1-8b',
      'IBM Granite 4.1 language models (Apache 2.0)',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Это скорее корпоративный compact-модель, не «самый умный чат». Зато self-host дешёвый, лицензия свободная.',
      'На L4 при полном 131K и высоком batch лучше FP8/INT8 или шаг на L40S/A100.',
    ],
    confidence: 'high',
  },
  {
    id: 'minimax-m3',
    displayName: 'MiniMax M3',
    aliases: [
      'minimax m3',
      'minimax-m3',
      'minimax m3 428b',
      'minimax-m3-428b',
      'minimax',
    ],
    arch: 'moe',
    parameterCountB: 428,
    activeParameterCountB: 23,
    parameterCountNote:
      'Около 428B всего / 23B активных, сразу текст+картинка+видео, контекст до 1M (MSA). FP8 — примерно 428 ГиБ весов.',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 856},
      {dtype: 'fp8', weightsVramGiB: 430},
      {
        dtype: 'int4',
        weightFormat: 'nvfp4',
        weightsVramGiB: 256,
        checkpointSizeGiB: 256,
        supportedGpuArch: ['Blackwell'],
        source: 'Official NVFP4 ~256 GB — ориентир B200, не H100',
        confidence: 'estimated',
      },
    ],
    contextDefault: 1_000_000,
    minGpuMemoryGiB: 480,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 520,
        notes: 'Минимальный FP8: веса около 430 ГиБ на четырёх H200.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 520,
        notes: 'Тот же FP8 на восьми H100. В BF16 (около 856 ГиБ) на такой полке модель уже не поместится.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 600,
        notes: 'Восемь H200 — под миллионный контекст и плотную нагрузку, а не как «просто запас».',
      },
    ],
    hostedCatalogKeys: ['MiniMax', 'minimax-m3', 'MiniMax-M3'],
    sources: [
      'https://huggingface.co/MiniMaxAI/MiniMax-M3',
      'MiniMax-M3 technical report / vLLM & SGLang recipes',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'Ниже только FP8. В BF16 одни веса уже около 856 ГиБ.',
      'NVFP4 (около 256 ГиБ) — для Blackwell (B200); с рецептами на H100 его не смешиваем.',
      'Лицензия MiniMax Community — проверьте коммерческие условия отдельно от Apache/MIT.',
      'Нужны свежие vLLM или SGLang с поддержкой MSA и trust_remote_code.',
    ],
    confidence: 'medium',
  },
  {
    id: 'nemotron-3-super',
    displayName: 'Nemotron 3 Super 120B-A12B',
    aliases: [
      'nemotron 3 super',
      'nemotron-3-super',
      'nemotron 3',
      'nemotron-3',
      'nemotron 120b',
      'nemotron-3-super-120b-a12b',
      'nvidia nemotron 3 super',
    ],
    arch: 'moe',
    parameterCountB: 120,
    activeParameterCountB: 12,
    parameterCountNote:
      'Гибрид LatentMoE (Mamba-2 + MoE + внимание), 120B / 12B активных, контекст до 1M. NVFP4 — родной формат Blackwell.',
    weights: [
      {dtype: 'fp8', weightFormat: 'fp8', weightsVramGiB: 120},
      {dtype: 'bf16', weightsVramGiB: 240},
      {
        dtype: 'int4',
        weightFormat: 'nvfp4',
        weightsVramGiB: 65,
        checkpointSizeGiB: 65,
        compatibleRuntimes: ['TensorRT-LLM', 'vLLM', 'NIM'],
        supportedGpuArch: ['Blackwell'],
        source: 'NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 — Blackwell (B200/GB200), не H100',
        confidence: 'estimated',
      },
    ],
    contextDefault: 262_144,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'На Hopper начинаем с FP8: веса около 120 ГиБ на двух H100. NVFP4 для H100 не предлагаем — это формат Blackwell.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'bf16',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
        notes: 'BF16 со всеми экспертами — уже четыре H100.',
      },
      {
        gpuFamily: 'B200',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'NVFP4 рассчитан на Blackwell: две B200. В российском каталоге публичной цены на B200 может не быть.',
      },
    ],
    hostedCatalogKeys: ['Nemotron', 'nemotron-3-super', 'nvidia-nemotron'],
    sources: [
      'https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b',
      'TensorRT-LLM Nemotron v3 Super deployment guide',
    ],
    checkedAt: '2026-07-27',
    caveats: [
      'NVFP4 — формат Blackwell (B200/GB200), не H100 и не H200.',
      'NVIDIA Open Model License — проверьте коммерческие условия.',
      'Из‑за гибрида Mamba/MoE важны runtime и shared memory — не каждый обычный билд vLLM подойдёт.',
    ],
    confidence: 'medium',
  },

  // ── Speech / ASR (RU-first open weights) ─────────────────────────────
  {
    id: 'gigaam-v3',
    displayName: 'GigaAM-v3',
    aliases: [
      'gigaam',
      'gigaam v3',
      'gigaam-v3',
      'giga am',
      'гигаам',
      'сбер asr',
      'sber asr',
    ],
    arch: 'dense',
    parameterCountB: 0.24,
    parameterCountNote: '~220–240M Conformer (e2e_rnnt / CTC)',
    modality: 'speech',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 1.2},
      {dtype: 'fp8', weightsVramGiB: 0.7},
      {dtype: 'int8', weightsVramGiB: 0.4},
    ],
    contextDefault: 4_096,
    minGpuMemoryGiB: 8,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'SOTA RU ASR; e2e_rnnt с пунктуацией. Легко на L4 / даже CPU ONNX.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'Запас под batch / длинные файлы и параллельные сессии.',
      },
    ],
    sources: [
      'https://huggingface.co/ai-sage/GigaAM-v3',
      'https://github.com/salute-developers/GigaAM',
      'SberDevices — MIT open weights',
    ],
    checkedAt: '2026-07-21',
    caveats: [
      'VRAM почти только веса + аудио-буферы (не KV LLM). Полоса «запас» в калькуляторе ориентировочная.',
      'Лучший выбор для чистого русского; mixed RU+EN слабее Whisper.',
    ],
    confidence: 'high',
  },
  {
    id: 'gigaam-multilingual',
    displayName: 'GigaAM Multilingual',
    aliases: [
      'gigaam multilingual',
      'gigaam-multilingual',
      'gigaam large',
      'gigaam 600m',
    ],
    arch: 'dense',
    parameterCountB: 0.6,
    parameterCountNote: '220M / 600M (large_ctc) encoders, 70+ languages',
    modality: 'speech',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 2.4},
      {dtype: 'fp8', weightsVramGiB: 1.3},
      {dtype: 'int8', weightsVramGiB: 0.8},
    ],
    contextDefault: 4_096,
    minGpuMemoryGiB: 8,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'large_ctc ~600M; RU + KK/KY/UZ и др. CIS.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
      },
    ],
    sources: [
      'https://huggingface.co/ai-sage/GigaAM-Multilingual',
      'arXiv:2607.10371 InterSpeech 2026',
    ],
    checkedAt: '2026-07-21',
    caveats: ['English умеренный; для RU-only предпочтительнее GigaAM-v3.'],
    confidence: 'high',
  },
  {
    id: 'whisper-large-v3-turbo',
    displayName: 'Whisper large-v3-turbo',
    aliases: [
      'whisper',
      'whisper turbo',
      'whisper large v3 turbo',
      'whisper-large-v3-turbo',
      'openai whisper',
    ],
    arch: 'dense',
    parameterCountB: 0.81,
    modality: 'speech',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 1.6},
      {dtype: 'fp8', weightsVramGiB: 0.9},
      {dtype: 'int8', weightsVramGiB: 0.6},
    ],
    contextDefault: 4_096,
    minGpuMemoryGiB: 8,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'Multilingual MIT; strong on mixed RU+EN. faster-whisper / CTranslate2.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'Высокий throughput batch transcription.',
      },
    ],
    sources: [
      'https://huggingface.co/openai/whisper-large-v3-turbo',
      'OpenAI Whisper — MIT',
    ],
    checkedAt: '2026-07-21',
    caveats: [
      'На чистом русском обычно слабее GigaAM-v3; выигрывает на multilingual / voice-prompting.',
    ],
    confidence: 'high',
  },
  {
    id: 'gigachat-3.1-audio-10b',
    displayName: 'GigaChat3.1-Audio-10B',
    aliases: [
      'gigachat audio',
      'gigachat 3.1 audio',
      'gigachat3.1-audio',
      'gigachat3.1-audio-10b',
      'giga chat audio',
    ],
    arch: 'moe',
    parameterCountB: 10,
    activeParameterCountB: 1.8,
    modality: 'speech',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 22},
      {dtype: 'fp8', weightsVramGiB: 12},
    ],
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
        notes: 'Audio-native LLM: транскрипт + саммаризация / timestamps до ~120 мин.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
      },
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 24,
        notes: 'Впритык на FP8; для длинного аудио лучше L40S+.',
      },
    ],
    sources: [
      'https://huggingface.co/ai-sage/GigaChat3.1-Audio-10B-A1.8B',
      'Sber — open audio LLM (InterSpeech 2026)',
    ],
    checkedAt: '2026-07-21',
    caveats: [
      'Это не чистый ASR-энкодер: тяжелее GigaAM, зато понимает длинное аудио и отвечает по смыслу.',
    ],
    confidence: 'medium',
  },

  // ── Search / retrieval (T-Tech + Qwen stack) ─────────────────────────
  {
    id: 't-search',
    displayName: 'T-Search',
    aliases: [
      't-search',
      't search',
      'tsearch',
      'т-search',
      'т search',
      'tbank search',
      't-tech search',
    ],
    arch: 'moe',
    parameterCountB: 35,
    activeParameterCountB: 3,
    parameterCountNote: 'Finetune of Qwen3.6-35B-A3B; agentic retriever',
    modality: 'search',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 70},
      {dtype: 'fp8', weightsVramGiB: 38},
      {dtype: 'int4', weightsVramGiB: 20},
    ],
    contextDefault: 65_536,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 76,
        notes: 'Офиц. serve ~65k ctx; нужен T-Search harness + corpus search backend.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 43,
        notes: 't-tech/T-Search-FP8 — практичный single-GPU деплой.',
      },
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 23,
        notes: 'NVFP4/INT4 — минимум; проверьте harness + quality.',
      },
    ],
    sources: [
      'https://huggingface.co/t-tech/T-Search',
      'https://huggingface.co/t-tech/T-Search-FP8',
      'https://habr.com/ru/companies/tbank/articles/1060262/',
    ],
    checkedAt: '2026-07-21',
    caveats: [
      'Не пишет ответ — отдаёт ranked chunks; генерацию делает отдельная LLM.',
      'В бенчмарках T-Tech лучший avg с Qwen3-Embedding-8B (+ опциональный LLM rerank).',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3-embedding-8b',
    displayName: 'Qwen3-Embedding-8B',
    aliases: [
      'qwen3 embedding',
      'qwen3-embedding-8b',
      'qwen embedding 8b',
      'embedding 8b',
    ],
    arch: 'dense',
    parameterCountB: 8,
    modality: 'embed',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 16},
      {dtype: 'fp8', weightsVramGiB: 9},
      {dtype: 'int4', weightsVramGiB: 5},
    ],
    contextDefault: 32_768,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'Dense retriever из бенчмарков T-Search (Recall@10).',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
      },
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 24,
      },
    ],
    sources: [
      'https://huggingface.co/Qwen/Qwen3-Embedding-8B',
      'Apache-2.0; paired with T-Search eval tables',
    ],
    checkedAt: '2026-07-21',
    caveats: ['Embedding throughput ≫ chat LLM; batch size важнее KV.'],
    confidence: 'high',
  },
  {
    id: 'qwen3-reranker-0.6b',
    displayName: 'Qwen3-Reranker-0.6B',
    aliases: [
      'qwen3 reranker',
      'qwen3-reranker',
      'qwen3-reranker-0.6b',
      'reranker 0.6b',
      'реранкер',
    ],
    arch: 'dense',
    parameterCountB: 0.6,
    modality: 'rerank',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 1.3},
      {dtype: 'fp8', weightsVramGiB: 0.8},
      {dtype: 'int4', weightsVramGiB: 0.5},
    ],
    contextDefault: 32_768,
    minGpuMemoryGiB: 8,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 24,
        notes: 'Лёгкий cross-encoder после dense retrieve / рядом с T-Search.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'Высокий QPS rerank top-k.',
      },
    ],
    sources: [
      'https://huggingface.co/Qwen/Qwen3-Reranker-0.6B',
      'Qwen3 Embedding blog — open Apache-2.0',
    ],
    checkedAt: '2026-07-21',
    caveats: [
      'Для максимального качества в таблицах T-Tech иногда LLM-rerank; 0.6B — дешёвый baseline.',
    ],
    confidence: 'high',
  },
  {
    id: 'qwen3-reranker-4b',
    displayName: 'Qwen3-Reranker-4B',
    aliases: ['qwen3-reranker-4b', 'reranker 4b', 'qwen reranker 4b'],
    arch: 'dense',
    parameterCountB: 4,
    modality: 'rerank',
    deployment: 'self-host',
    weights: [
      {dtype: 'bf16', weightsVramGiB: 8},
      {dtype: 'fp8', weightsVramGiB: 4.5},
      {dtype: 'int4', weightsVramGiB: 2.5},
    ],
    contextDefault: 32_768,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 24,
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
      },
    ],
    sources: ['https://huggingface.co/Qwen/Qwen3-Reranker-4B'],
    checkedAt: '2026-07-21',
    caveats: ['Сильнее 0.6B на MTEB-R / MLDR; дороже в latency.'],
    confidence: 'high',
  },
];

function normalizeAlias(text: string): string {
  return text
    .toLowerCase()
    // RU phonetic spellings of gpt-oss («усс» / «vss»)
    .replace(/gpt[\s\-]?усс/gi, 'gpt oss')
    .replace(/gpt[\s\-]?vss/gi, 'gpt oss')
    .replace(/gptuss/gi, 'gpt oss')
    .replace(/gptvss/gi, 'gpt oss')
    // Speech-to-text: «Kimi K3» → «химика три» / «химика 3» / «химик а3»
    .replace(/химик[аи]?(?:\s*а)?\s*(?:три|3(?:\.0)?)/gi, 'kimi k3')
    .replace(/кимика\s*(?:три|3(?:\.0)?)/gi, 'kimi k3')
    .replace(/×/g, 'x')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All aliases flattened for intent matching. */
export function listInferenceModelAliases(): string[] {
  const out: string[] = [];
  for (const m of INFERENCE_MODELS) {
    out.push(m.displayName, m.id, ...m.aliases);
  }
  return out;
}

function aliasMatchScore(query: string, alias: string): number | null {
  if (!alias) return null;
  if (query === alias) return 100_000 + alias.length;

  if (query.includes(alias)) {
    // Reject weak prefix hits when the query still has a distinguishing token
    // (e.g. «qwen3 coder next» must not win via alias «qwen3 coder»).
    const leftover = query
      .split(alias)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      leftover &&
      /\b(next|480b?|235b?|123b?|122b?|120b?|20b|14b|8b|32b|35b|70b|109b|397b|a3b|a4b|a10b|a12b|a17b|a22b|a35b|scout|maverick|r1|v4|distill|devstral|flash|lite|pro|max|super|ultra|\d)\b/i.test(
        leftover,
      )
    ) {
      return null;
    }
    return 10_000 + alias.length;
  }

  // Alias contains the whole query only when the leftover is not a more specific variant.
  if (alias.includes(query) && query.length >= 8) {
    const leftover = alias
      .split(query)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      leftover &&
      /\b(next|480b?|235b?|123b?|122b?|120b?|20b|14b|8b|32b|35b|70b|109b|397b|a3b|a4b|a10b|a12b|a17b|a22b|a35b|scout|maverick|r1|v4|distill|devstral|flash|lite|pro|max|super|ultra|\d)\b/i.test(
        leftover,
      )
    ) {
      return null;
    }
    return 1_000 + query.length;
  }
  return null;
}

export function findInferenceModel(query: string): InferenceModelProfile | null {
  const q = normalizeAlias(query);
  if (!q) return null;

  let best: {model: InferenceModelProfile; score: number} | null = null;
  for (const model of INFERENCE_MODELS) {
    const candidates = [model.id, model.displayName, ...model.aliases].map(normalizeAlias);
    for (const alias of candidates) {
      const score = aliasMatchScore(q, alias);
      if (score == null) continue;
      if (!best || score > best.score) best = {model, score};
    }
  }
  return best?.model ?? null;
}

export function listInferenceModelIds(): string[] {
  return INFERENCE_MODELS.map((m) => m.id);
}
