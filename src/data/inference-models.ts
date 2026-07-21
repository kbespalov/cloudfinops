/**
 * Curated open-weight model → self-host GPU sizing knowledge base.
 * Used only by the gated inference recommender (not injected into every chat turn).
 *
 * VRAM figures are engineering estimates (weights + modest KV/activation headroom),
 * not lab benchmarks. Prefer fewer accurate profiles over speculative ones.
 */

export type InferenceArch = 'dense' | 'moe';

export type InferenceDtype = 'bf16' | 'fp8' | 'int4' | 'int8';

export type InferenceWeightVariant = {
  dtype: InferenceDtype;
  /** Approximate VRAM for weights alone (GiB), before KV/runtime overhead. */
  weightsVramGiB: number;
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
    aliases: ['glm 5.2', 'glm5.2', 'glm-5.2', 'злм 5.2'],
    arch: 'moe',
    parameterCountB: 744,
    activeParameterCountB: 40,
    weights: [
      {dtype: 'fp8', weightsVramGiB: 380},
      {dtype: 'int4', weightsVramGiB: 220},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 320,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
        notes: 'Практичный multi-GPU узел 4×H200 141GB; NVLink предпочтителен для TP.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: '8×H100 80GB NVLink / SXM — типичный HGX-класс для frontier MoE.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 1128,
        notes: 'Запас по контексту и батчу; если доступен цельный 8× узел.',
      },
    ],
    hostedCatalogKeys: ['GLM 5.2', 'glm-5.2', 'glm'],
    sources: [
      'https://mws.ru/news/mws-cloud-pervoj-v-rossii-razvernula-glm-5-2-v-sobstvennom-oblake/',
      'Z.AI / GLM public model cards (MoE ~744B / ~40B active)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Оценки VRAM приблизительные; официальный min-cluster может быть выше.',
      'Для длинного контекста и большого batch нужно больше памяти, чем на weights.',
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
    weights: [
      {dtype: 'fp8', weightsVramGiB: 200},
      {dtype: 'int4', weightsVramGiB: 110},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 282,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
        notes: 'INT4 на 4×A100 80GB — экономный вариант.',
      },
    ],
    hostedCatalogKeys: ['GLM 4.6', 'glm-4.6', 'glm'],
    sources: ['MWS / Z.AI GLM-4.6 catalog listings'],
    checkedAt: '2026-07-20',
    caveats: ['Параметры MoE могут отличаться по ревизии чекпойнта.'],
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
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: '1×A100 80GB комфортно для BF16 + умеренный контекст.',
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
        notes: 'INT4 на L4 — бюджетный single-GPU путь.',
      },
    ],
    hostedCatalogKeys: ['Qwen3 32B', 'qwen3-32b', 'qwen'],
    sources: ['Qwen3 model card', 'MWS inference catalog'],
    checkedAt: '2026-07-20',
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
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
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
      },
    ],
    hostedCatalogKeys: ['Qwen 3.6', 'qwen3.6', 'qwen3.6-35b-a3b', 'qwen'],
    sources: ['Qwen3.6 MoE card', 'Cloud.ru / MWS catalogs'],
    checkedAt: '2026-07-20',
    caveats: ['МоE: веса всех экспертов в VRAM, active params влияют на compute.'],
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
    weights: [
      {dtype: 'fp8', weightsVramGiB: 140},
      {dtype: 'int4', weightsVramGiB: 80},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 160,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 282,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 4,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 320,
      },
    ],
    hostedCatalogKeys: ['Qwen3 235B', 'qwen3-235b', 'qwen'],
    sources: ['Qwen3-235B-A22B model card'],
    checkedAt: '2026-07-20',
    caveats: ['Для длинного контекста предпочтительнее H200 / больше GPU.'],
    confidence: 'medium',
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
    weights: [
      {dtype: 'fp8', weightsVramGiB: 260},
      {dtype: 'int4', weightsVramGiB: 150},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 240,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
      },
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
      },
    ],
    hostedCatalogKeys: ['qwen3-coder-480b-a35b', 'Qwen3 Coder 480B', 'qwen3-coder-480b'],
    sources: ['Qwen3-Coder-480B-A35B card', 'MWS catalog'],
    checkedAt: '2026-07-20',
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
    weights: [
      {dtype: 'fp8', weightsVramGiB: 520},
      {dtype: 'int4', weightsVramGiB: 300},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 400,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 1128,
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: 'INT4 на 8×H100 — нижняя практическая полка.',
      },
    ],
    hostedCatalogKeys: ['Kimi', 'kimi-k2.6', 'kimi'],
    sources: ['Moonshot Kimi K2 docs', 'MWS Kimi K2.6 listing'],
    checkedAt: '2026-07-20',
    caveats: [
      'Очень крупный MoE; self-host имеет смысл только при жёстких требованиях к контуру.',
    ],
    confidence: 'medium',
  },
  {
    id: 'kimi-k3',
    displayName: 'Kimi K3',
    aliases: ['kimi k3', 'kimi-k3', 'kimi k3.0', 'кими к3', 'кимика 3', 'кими k3'],
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
        estimatedVramGiB: 2304,
        notes:
          'Ближе всего к одному плотному узлу под MXFP4 (~1,4 TiB). Официально Moonshot всё равно рекомендует supernode ≥64 accelerators.',
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
        estimatedVramGiB: 2304,
        notes: 'Ориентир одного плотного узла под INT4 (~1,2 TiB), когда веса выйдут; long-context всё равно multi-node.',
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
    id: 'deepseek-v3',
    displayName: 'DeepSeek V3',
    aliases: ['deepseek v3', 'deepseek-v3', 'deepseek v3.2', 'deepseek-v3.2', 'deepseek'],
    arch: 'moe',
    parameterCountB: 671,
    activeParameterCountB: 37,
    weights: [
      {dtype: 'fp8', weightsVramGiB: 350},
      {dtype: 'int4', weightsVramGiB: 200},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 320,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
      },
    ],
    hostedCatalogKeys: ['DeepSeek', 'deepseek-v3', 'deepseek'],
    sources: ['DeepSeek-V3 technical report'],
    checkedAt: '2026-07-20',
    caveats: ['Официальные serving recipes часто предполагают multi-node.'],
    confidence: 'medium',
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
      'Reasoning MoE на базе V3-класса (671B / ~37B active). По VRAM почти как DeepSeek V3; compute выше из‑за CoT.',
    weights: [
      {dtype: 'fp8', weightsVramGiB: 350},
      {dtype: 'int4', weightsVramGiB: 200},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 320,
    recommended: [
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
        notes: 'Практичный узел под full R1 FP8; для длинного CoT запас по KV важнее, чем у V3.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
      },
      {
        gpuFamily: 'H200',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 1128,
        notes: 'Запас под длинный reasoning-контекст и batch.',
      },
    ],
    hostedCatalogKeys: ['DeepSeek R1', 'deepseek-r1', 'deepseek'],
    sources: [
      'https://github.com/deepseek-ai/DeepSeek-R1',
      'DeepSeek-R1 model card (MIT, same weight class as V3)',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Full R1 — datacenter-класс; для single/dual GPU смотрите Distill 32B.',
      'Не путать с distill-вариантами (8B/14B/32B/70B) — у них другой footprint.',
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
    arch: 'dense',
    parameterCountB: 120,
    weights: [
      {dtype: 'int4', weightsVramGiB: 70},
      {dtype: 'fp8', weightsVramGiB: 130},
      {dtype: 'bf16', weightsVramGiB: 240},
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
          'Базовый productive path: MXFP4/INT4 на одной H100 80GB — 8×GPU не нужны.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 141,
        notes: '1×H200 141GB — запас под FP8 и длинный контекст без второго GPU.',
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
        notes: '1×A100 80GB INT4 — дешевле H100, если устраивает throughput.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'Только если нужен FP8/больший batch без агрессивной квантизации.',
      },
    ],
    hostedCatalogKeys: ['gpt-oss-120b', 'gpt-oss'],
    sources: [
      'OpenAI gpt-oss model card (single 80GB GPU with MXFP4)',
      'Yandex / MWS / Cloud.ru catalogs',
    ],
    checkedAt: '2026-07-20',
    caveats: [
      'Не берите 8×H100 «на всякий случай» — для 120B это избыточно при INT4/MXFP4.',
      'BF16 на одной карте не влезает (~240 GiB weights) — нужен multi-GPU или квант.',
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
    arch: 'dense',
    parameterCountB: 20,
    weights: [
      {dtype: 'int4', weightsVramGiB: 12},
      {dtype: 'fp8', weightsVramGiB: 22},
      {dtype: 'bf16', weightsVramGiB: 40},
    ],
    contextDefault: 128_000,
    minGpuMemoryGiB: 16,
    recommended: [
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'OpenAI: ~16 GB memory path — INT4/MXFP4 на L4.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
        notes: 'BF16 с запасом под контекст; для edge обычно достаточно L4/L40S.',
      },
    ],
    hostedCatalogKeys: ['gpt-oss-20b', 'gpt-oss'],
    sources: [
      'OpenAI gpt-oss model card (20B fits ~16GB with MXFP4)',
      'Apache 2.0 open-weight reasoning twin of gpt-oss-120b',
    ],
    checkedAt: '2026-07-20',
    caveats: ['Не путать с gpt-oss-120b — другой класс VRAM и цены узла.'],
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
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 80,
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
      },
    ],
    hostedCatalogKeys: ['Gemma', 'gemma-3-27b', 'gemma'],
    sources: ['Google Gemma 3 model card', 'MWS catalog'],
    checkedAt: '2026-07-20',
    caveats: [],
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
      '17B active × 16 experts (109B total). Все эксперты в VRAM; Meta: INT4 on-the-fly на 1×H100. Контекст до 10M.',
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
          'Официальный single-H100 путь: on-the-fly INT4 (~55–65 GiB весов). Самый частый self-host Llama 4.',
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
        notes: '1×H200 — FP8 без агрессивной 4-bit квантизации + запас под длинный контекст.',
      },
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
        notes: 'FP8 / больший batch без INT4.',
      },
    ],
    hostedCatalogKeys: ['Llama 4', 'llama-4-scout', 'llama4', 'llama'],
    sources: [
      'https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md',
      'Meta Llama 4 Scout (17B×16E, 109B total, 10M context)',
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
      '17B active × 128 experts (400B total). Meta: FP8 на одном HGX H100 host (8×); INT4 ~200+ GiB.',
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
        notes: 'Нижняя практическая полка INT4 (~200–240 GiB весов).',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 2,
        quant: 'int4',
        interconnect: 'NVLink',
        estimatedVramGiB: 282,
      },
      {
        gpuFamily: 'H100',
        gpuCount: 8,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 640,
        notes: 'Meta FP8 recipe: цельный 8×H100 host.',
      },
      {
        gpuFamily: 'H200',
        gpuCount: 4,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 564,
      },
    ],
    hostedCatalogKeys: ['Llama 4', 'llama-4-maverick', 'llama4', 'llama'],
    sources: [
      'https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md',
      'Meta Llama 4 Maverick (17B×128E, 400B total)',
    ],
    checkedAt: '2026-07-20',
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
    contextDefault: 128_000,
    minGpuMemoryGiB: 48,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'bf16',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 2,
        quant: 'bf16',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 2,
        quant: 'fp8',
        estimatedVramGiB: 96,
      },
    ],
    hostedCatalogKeys: ['Llama', 'llama-3.3', 'llama'],
    sources: ['Meta Llama 3.3 model card'],
    checkedAt: '2026-07-20',
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
    weights: [
      {dtype: 'bf16', weightsVramGiB: 280},
      {dtype: 'fp8', weightsVramGiB: 150},
      {dtype: 'int4', weightsVramGiB: 80},
    ],
    contextDefault: 65_536,
    minGpuMemoryGiB: 80,
    recommended: [
      {
        gpuFamily: 'H100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 2,
        quant: 'fp8',
        interconnect: 'NVLink',
        estimatedVramGiB: 160,
      },
      {
        gpuFamily: 'A100',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 80,
      },
    ],
    hostedCatalogKeys: ['Mixtral', 'mixtral'],
    sources: ['Mistral Mixtral 8x22B model card'],
    checkedAt: '2026-07-20',
    caveats: [],
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
    contextDefault: 32_768,
    minGpuMemoryGiB: 24,
    recommended: [
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
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
      },
    ],
    hostedCatalogKeys: ['Mistral', 'mistral'],
    sources: ['Mistral Small model card'],
    checkedAt: '2026-07-20',
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
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'bf16',
        estimatedVramGiB: 48,
        notes: 'Агентный coding на одной карте; vendor target — класс RTX 4090 / 24–48 GB.',
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
        quant: 'int4',
        estimatedVramGiB: 24,
        notes: 'INT4 — бюджетный local agent path.',
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
        estimatedVramGiB: 80,
        notes: 'Офиц. serve ~65k ctx; нужен T-Search harness + corpus search backend.',
      },
      {
        gpuFamily: 'L40S',
        gpuCount: 1,
        quant: 'fp8',
        estimatedVramGiB: 48,
        notes: 't-tech/T-Search-FP8 — практичный single-GPU деплой.',
      },
      {
        gpuFamily: 'L4',
        gpuCount: 1,
        quant: 'int4',
        estimatedVramGiB: 24,
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
      /\b(next|480b?|235b?|123b?|120b?|20b|14b|8b|32b|35b|70b|109b|397b|a3b|a17b|a22b|a35b|scout|maverick|r1|distill|devstral|flash|lite|pro|max|\d)\b/i.test(
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
      /\b(next|480b?|235b?|123b?|120b?|20b|14b|8b|32b|35b|70b|109b|397b|a3b|a17b|a22b|a35b|scout|maverick|r1|distill|devstral|flash|lite|pro|max|\d)\b/i.test(
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
