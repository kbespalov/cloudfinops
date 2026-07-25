import type {GpuFacet} from '@/lib/catalog';

export type GpuLandingSlug =
  | 'h100'
  | 'h200'
  | 'h200-nvl'
  | 'a100'
  | 'b300'
  | 'hgx-h200'
  | 'hgx-b300'
  | 'l40s'
  | 'l4';

export type GpuLandingDef = {
  slug: GpuLandingSlug;
  /** Short label for cards / nav chips. */
  shortTitle: string;
  /** H1 without brand suffix. */
  title: string;
  /** Meta + OG description. */
  description: string;
  /** Hero lead under H1. */
  lead: string;
  /** Catalog GPU facet when applicable. */
  gpuFacet?: Exclude<GpuFacet, 'all'>;
  /** Extra catalog `q` for narrow pages (NVL / HGX). */
  catalogQuery?: string;
  /** Prefer 8× / dedicated node pricing on the page. */
  preferNode?: boolean;
  /** SEO keywords. */
  keywords: string[];
  /** Related landing slugs. */
  related: GpuLandingSlug[];
  /** Bullet highlights (honest, non-promotional). */
  highlights: string[];
  /** FAQ for the model page. */
  faq: {question: string; answer: string}[];
  /** Hub card eyebrow (model pages / SEO only — not shown as pale chips on hub). */
  eyebrow: string;
  /** Short comparison facts for hub cards (VRAM, form-factor). */
  hubFacts: string[];
  /** «О модели» — год, архитектура, память и особенности (SEO + решение). */
  about: string;
  /** Compact fact chips under about. */
  aboutFacts: string[];
  /** Short «Подходит для» scenarios (one line each). */
  useCases: string[];
  /** Whether to feature on hub grid (not only related links). */
  hubFeatured: boolean;
  /** Sort weight on hub (lower = earlier). */
  hubOrder: number;
};

/** Catalog deep-link builder inputs — kept pure for tests/SEO. */
export function catalogHrefForLanding(def: Pick<GpuLandingDef, 'gpuFacet' | 'catalogQuery'>): string {
  const params = new URLSearchParams();
  params.set('category', 'gpu');
  if (def.gpuFacet) params.set('gpu', def.gpuFacet);
  if (def.catalogQuery?.trim()) params.set('q', def.catalogQuery.trim());
  return `/catalog?${params.toString()}`;
}

export type GpuLandingFaq = GpuLandingDef['faq'][number];

/** Shared FAQ for every model landing — pricing / catalog scope. */
export const COMMON_GPU_LANDING_FAQ: GpuLandingFaq[] = [
  {
    question: 'Это официальные цены NVIDIA или облачных провайдеров?',
    answer:
      'Нет. Cloud FinOps — независимый каталог публичных тарифов облаков России. Итоговая цена у провайдера может отличаться из‑за квот, наличия, контракта и скидок.',
  },
  {
    question: 'Почему цена может отличаться от сайта провайдера?',
    answer:
      'Мы нормализуем публичные тарифы в единый каталог (₽ с НДС, час/месяц). У провайдера могут быть другие единицы, скрытые компоненты, региональные отличия или изменения после даты среза.',
  },
];

/** Common pricing FAQ first, then model-specific items (no duplicate questions). */
export function faqForLanding(def: Pick<GpuLandingDef, 'faq'>): GpuLandingFaq[] {
  const seen = new Set(COMMON_GPU_LANDING_FAQ.map((item) => item.question));
  return [
    ...COMMON_GPU_LANDING_FAQ,
    ...def.faq.filter((item) => !seen.has(item.question)),
  ];
}

export const GPU_LANDINGS: GpuLandingDef[] = [
  {
    slug: 'h200',
    shortTitle: 'H200',
    title: 'Аренда NVIDIA H200 в облаке России',
    description:
      'Сравнение публичных тарифов на NVIDIA H200 141GB у облаков РФ: Selectel, Cloud.ru, T1, VK Cloud и другие. Цены в ₽ с НДС, без промо — откройте в каталоге Cloud FinOps.',
    lead: 'H200 141GB — актуальная полка под длинный контекст и крупные open-weight модели. Смотрите предложения 1× и 8× в каталоге и сравните ₽/час.',
    gpuFacet: 'h200',
    keywords: [
      'аренда H200',
      'NVIDIA H200',
      'H200 141GB',
      'H200 цена',
      'аренда GPU',
      'GPU сервер',
      'облако GPU Россия',
    ],
    related: ['h200-nvl', 'hgx-h200', 'h100', 'b300'],
    highlights: [
      'Фильтр каталога по семейству H200 — без ручного поиска по прайсам',
      'Видны и card-only ставки, и flavor «GPU + хост»',
      'Можно сразу спросить ассистента: «самый дешёвый H200 в месяц»',
    ],
    faq: [
      {
        question: 'Чем H200 отличается от H100?',
        answer:
          'У H200 больше HBM (ориентир 141 GB) — чаще берут под длинный контекст и крупные MoE. В каталоге это разные фильтры: gpu=h200 и gpu=h100.',
      },
      {
        question: 'Что входит в стоимость выделенного HGX-сервера?',
        answer:
          'Обычно это bundle на 8× GPU с хостом (CPU/RAM/сеть) по публичному прайсу dedicated или flavor. Не делите цену «на одну карту» без оговорки — в каталоге такие строки помечены как выделенный узел.',
      },
    ],
    eyebrow: 'Топ по спросу',
    hubFacts: ['141 GB', '1× или 8×'],
    about:
      'NVIDIA H200 (Hopper, анонс 2023, поставки с 2024) — датацентровый ускоритель с 141 GB HBM3e и пропускной способностью памяти до ~4,8 ТБ/с: почти вдвое больше ёмкости, чем у H100 80 GB, и заметно выше bandwidth. Тот же класс Hopper Tensor Cores (FP8/BF16), но с запасом VRAM под длинный контекст, крупные MoE и модели, которым H100 уже тесно. В облаках РФ встречается как отдельная GPU, flavor «GPU + хост» и полка 8× / HGX — в каталоге это разные форматы аренды, а не одна «цена за карту».',
    aboutFacts: [
      '2024 · Hopper',
      '141 GB HBM3e',
      '~4,8 ТБ/с',
      '1× или 8× GPU',
      'отдельная GPU, GPU + хост, выделенный сервер',
    ],
    useCases: ['инференс крупных LLM', 'длинный контекст', 'обучение и дообучение моделей'],
    hubFeatured: true,
    hubOrder: 1,
  },
  {
    slug: 'h200-nvl',
    shortTitle: 'H200 NVL',
    title: 'NVIDIA H200 NVL — цены в облаках РФ',
    description:
      'Публичные предложения NVIDIA H200 NVL в каталоге Cloud FinOps: сравнение тарифов облаков России в рублях с НДС.',
    lead: 'H200 NVL часто ищут отдельно от SXM/PCIe. Мы открываем каталог с фильтром H200 и поиском NVL — дальше можно сузить провайдера.',
    gpuFacet: 'h200',
    catalogQuery: 'NVL',
    keywords: ['H200 NVL', 'NVIDIA H200 NVL', 'H200 NVL цена', 'аренда H200 NVL', 'GPU облако'],
    related: ['h200', 'hgx-h200', 'h100'],
    highlights: [
      'Узкий вход: H200 + запрос NVL в каталоге',
      'Если строк мало — снимите q=NVL и смотрите всё семейство H200',
    ],
    faq: [
      {
        question: 'Почему в выдаче может быть мало строк?',
        answer:
          'Не все провайдеры публикуют NVL отдельной строкой прайса. Тогда смотрите соседние H200 SXM/PCIe или спросите в AI-ассистенте.',
      },
    ],
    eyebrow: 'Спека',
    hubFacts: ['141 GB', 'NVL'],
    about:
      'NVIDIA H200 NVL (2024) — тот же Hopper H200 с 141 GB HBM3e, но в форм-факторе NVL (PCIe / NVLink Bridge): удобен, когда нужна связка из двух или нескольких карт без полной SXM/HGX-полки. Память и bandwidth сопоставимы с H200 SXM; отличается упаковка, охлаждение и типичная конфигурация узла у провайдера. В каталоге Cloud FinOps NVL часто публикуют отдельной строкой — если строк мало, смотрите соседние H200 SXM/PCIe в том же facet.',
    aboutFacts: ['2024 · Hopper', '141 GB HBM3e', 'форм-фактор NVL', 'семейство H200'],
    useCases: ['инференс на H200 NVL', 'длинный контекст', 'крупные open-weight модели'],
    hubFeatured: true,
    hubOrder: 2,
  },
  {
    slug: 'h100',
    shortTitle: 'H100',
    title: 'Аренда NVIDIA H100 в облаке России',
    description:
      'Сравнение аренды NVIDIA H100 80GB (PCIe / NVLink / SXM) у облаков РФ по публичным тарифам. Каталог Cloud FinOps — ₽ с НДС, без промо.',
    lead: 'H100 80GB — самая частая «рабочая» карта для обучения и инференса. Сравните 1× GPU и многокартовые flavor в одном каталоге.',
    gpuFacet: 'h100',
    keywords: [
      'аренда H100',
      'NVIDIA H100',
      'H100 80GB',
      'H100 цена',
      'аренда GPU H100',
      'GPU сервер H100',
    ],
    related: ['h200', 'a100', 'hgx-h200', 'l4'],
    highlights: [
      'Facet gpu=h100 отсекает соседние семейства',
      'Смотрите unit «только GPU» vs bundle «целиком»',
      'Для LLM — калькулятор self-host подберёт 1×/multi-GPU',
    ],
    faq: [
      {
        question: 'Почему у Cloud.ru бывает ВМ на 5× H100?',
        answer:
          'У части провайдеров минимальная публичная единица — многокартовый flavor, а не «одна карта». В каталоге такие строки помечены как конфигурация целиком; не делите цену «на глаз» без оговорки.',
      },
    ],
    eyebrow: 'Классика AI',
    hubFacts: ['80 GB', '1× или 8×'],
    about:
      'NVIDIA H100 (Hopper, 2022) — базовая «рабочая» карта поколения Hopper: обычно 80 GB HBM3 (SXM) или HBM2e (PCIe), Transformer Engine и FP8 Tensor Cores, NVLink 4.0 на многокартовых узлах. Именно её чаще всего сравнивают по ₽/час для обучения и production-инференса mid/large LLM. В облаках встречаются 1× PCIe, многокартовые flavor и полки 8× / HGX — в каталоге важно не смешивать «только GPU» и bundle «целиком».',
    aboutFacts: [
      '2022 · Hopper',
      '80 GB HBM',
      'FP8 / Transformer Engine',
      '1× или 8× GPU',
      'PCIe, SXM, HGX',
    ],
    useCases: ['обучение и инференс', 'production LLM', 'multi-GPU конфигурации'],
    hubFeatured: true,
    hubOrder: 3,
  },
  {
    slug: 'a100',
    shortTitle: 'A100',
    title: 'Аренда NVIDIA A100 в облаке России',
    description:
      'Публичные тарифы NVIDIA A100 40/80GB у облаков России. Сравнение в каталоге Cloud FinOps — независимо, в ₽ с НДС.',
    lead: 'A100 остаётся массовой картой для inference и обучения, когда H100/H200 избыточны по бюджету. Сравните 40GB и 80GB в каталоге.',
    gpuFacet: 'a100',
    keywords: ['аренда A100', 'NVIDIA A100', 'A100 80GB', 'Tesla A100', 'GPU сервер A100'],
    related: ['h100', 'l4', 'h200'],
    highlights: [
      'Много предложений 1× и multi-GPU',
      'Удобно как baseline «дешевле H100» для оценки TCO',
    ],
    faq: [
      {
        question: 'A100 40GB или 80GB?',
        answer:
          'Смотрите VRAM под модель и батч. В каталоге обе линейки в facet A100 — сортируйте по цене и читайте название/SKU.',
      },
    ],
    eyebrow: 'Массовый GPU',
    hubFacts: ['40 или 80 GB', '1× или несколько'],
    about:
      'NVIDIA A100 (Ampere, 2020) — массовый датацентровый GPU предыдущего поколения: линейки 40 GB HBM2 и 80 GB HBM2e, Tensor Cores 3-го поколения, MIG и NVLink 3.0 на SXM-узлах. До сих пор выгодная полка, когда Hopper/Blackwell избыточны по бюджету, а модель и батч помещаются в 40/80 GB. В каталоге сравнивайте 40 vs 80 GB и 1× vs multi-GPU — это разные TCO, даже при одном facet A100.',
    aboutFacts: [
      '2020 · Ampere',
      '40 или 80 GB HBM',
      'MIG / NVLink 3.0',
      '1× и multi-GPU',
      'GPU и ВМ',
    ],
    useCases: ['inference mid-size моделей', 'обучение при ограниченном бюджете', 'миграция со старых A100'],
    hubFeatured: true,
    hubOrder: 4,
  },
  {
    slug: 'b300',
    shortTitle: 'B300',
    title: 'NVIDIA B300 / HGX — цены в каталоге РФ',
    description:
      'Публичный тариф на выделенный NVIDIA B300 HGX (8×GPU) в каталоге Cloud FinOps. Сравнение dedicated GPU-узлов облаков России.',
    lead: 'B300 в каталоге — прежде всего выделенный HGX-узел (не обычная облачная GPU-ВМ). Откройте facet B300 и смотрите условия провайдера.',
    gpuFacet: 'b300',
    preferNode: true,
    keywords: ['B300', 'NVIDIA B300', 'HGX B300', 'аренда B300', 'GPU HGX', 'Selectel B300'],
    related: ['hgx-b300', 'hgx-h200', 'h200'],
    highlights: [
      'Фокус на 8× / dedicated, не на card-only',
      'Цена часто месячная bundle — смотрите подпись периода',
    ],
    faq: [
      {
        question: 'Можно ли арендовать 1× B300 как карту?',
        answer:
          'В текущем публичном срезе каталога B300 представлен как выделенный узел 8×GPU. Если появятся card-only строки — они попадут в тот же facet.',
      },
    ],
    eyebrow: 'Dedicated',
    hubFacts: ['288 GB', '8× GPU'],
    about:
      'NVIDIA B300 (Blackwell Ultra, 2025) — ускоритель следующего поколения после Hopper: ориентир до ~288 GB HBM3e на GPU и существенно выше memory bandwidth, чем у H200. В публичных прайсах облаков РФ B300 почти всегда идёт как выделенный HGX-узел на 8 GPU, а не как card-only on-demand. Сравнивайте помесячный bundle и условия dedicated — это другая экономика, чем аренда одной H100/H200.',
    aboutFacts: [
      '2025 · Blackwell',
      'до 288 GB HBM3e',
      '8× GPU / HGX',
      'выделенный узел',
      'часто ₽/мес',
    ],
    useCases: ['крупный training', 'dedicated AI-кластер', 'HGX-полки нового поколения'],
    hubFeatured: true,
    hubOrder: 5,
  },
  {
    slug: 'hgx-h200',
    shortTitle: 'HGX H200',
    title: 'Сервер HGX H200 8×GPU — цены в облаках РФ',
    description:
      'Сравнение публичных тарифов на 8× NVIDIA H200 / HGX-полки у облаков России. Каталог Cloud FinOps — ₽ с НДС.',
    lead: 'Запрос «HGX H200» обычно означает полку 8×GPU. Мы ведём в каталог H200 и подсвечиваем многокартовые / node-конфигурации.',
    gpuFacet: 'h200',
    preferNode: true,
    keywords: [
      'HGX H200',
      'NVIDIA HGX H200',
      'сервер 8 GPU',
      '8x H200',
      'аренда HGX',
      'GPU сервер H200',
    ],
    related: ['h200', 'hgx-b300', 'h100'],
    highlights: [
      'Ищите строки ×8 / SXM / flavor на 8 GPU',
      'Сравнивайте ₽/час за узел, а не «за карту» без пересчёта',
    ],
    faq: [
      {
        question: 'Есть ли отдельный facet HGX?',
        answer:
          'Нет — HGX это форм-фактор узла. Используйте facet модели (H200/B300) и смотрите gpuCount / название. При необходимости добавьте поиск HGX в каталоге.',
      },
    ],
    eyebrow: '8×GPU',
    hubFacts: ['8× H200', 'выделенный'],
    about:
      'HGX H200 — серверная полка NVIDIA на 8× H200 (Hopper, 2024): до ~1,1 ТБ суммарной HBM3e на узле при NVLink/NVSwitch между GPU. Так обычно берут крупные MoE (например GLM-класса), multi-GPU training и высоконагруженный инференс, когда одной карты мало. В каталоге это flavor ×8 / dedicated, а не «цена одной H200» — сравнивайте ₽ за узел и период (час/месяц).',
    aboutFacts: [
      '2024 · Hopper',
      '8× H200',
      '141 GB на GPU',
      '~1,1 ТБ на узел',
      'выделенный / HGX',
    ],
    useCases: ['обучение на 8× H200', 'крупный инференс', 'выделенная HGX-полка'],
    hubFeatured: true,
    hubOrder: 6,
  },
  {
    slug: 'hgx-b300',
    shortTitle: 'HGX B300',
    title: 'HGX B300 — выделенный 8×GPU в каталоге',
    description:
      'Публичные предложения NVIDIA HGX B300 (8×GPU) в облаках России. Независимый каталог Cloud FinOps.',
    lead: 'HGX B300 — запрос про выделенную полку нового поколения. Откройте B300 в каталоге и проверьте актуальный публичный тариф.',
    gpuFacet: 'b300',
    catalogQuery: 'HGX',
    preferNode: true,
    keywords: ['HGX B300', 'NVIDIA HGX B300', 'B300 8 GPU', 'dedicated GPU', 'аренда HGX B300'],
    related: ['b300', 'hgx-h200', 'h200'],
    highlights: ['Прямой переход в каталог: gpu=b300&q=HGX', 'Оговорка: dedicated ≠ on-demand VM'],
    faq: [
      {
        question: 'Это цена за час или за месяц?',
        answer:
          'Смотрите колонку периода в каталоге. Dedicated-узлы часто публикуются помесячно — переключатель «час/месяц» помогает сравнивать.',
      },
    ],
    eyebrow: 'HGX',
    hubFacts: ['8× B300', 'выделенный'],
    about:
      'HGX B300 — выделенная полка Blackwell Ultra (2025) на 8× B300: максимальная публичная конфигурация этого семейства в облаках РФ. Предназначена под крупнейший training и multi-GPU инференс нового поколения; тариф обычно помесячный dedicated-bundle. В каталоге смотрите facet B300 и строки HGX / 8× — не путайте с on-demand ВМ на одной карте.',
    aboutFacts: [
      '2025 · Blackwell',
      '8× B300',
      'выделенный HGX',
      'до 288 GB на GPU',
      'часто ₽/мес',
    ],
    useCases: ['dedicated B300', 'крупный training', 'HGX нового поколения'],
    hubFeatured: true,
    hubOrder: 7,
  },
  {
    slug: 'l40s',
    shortTitle: 'L40S',
    title: 'Аренда NVIDIA L40S в облаке России',
    description:
      'Сравнение публичных тарифов NVIDIA L40S у облаков РФ. Каталог Cloud FinOps — ₽ с НДС, без промо; отдельно от L4.',
    lead: 'L40S — Ada Lovelace для inference и графики в датацентре: больше VRAM и пропускной способности, чем у L4. Сравните предложения в каталоге по facet L40S.',
    gpuFacet: 'l40s',
    keywords: [
      'NVIDIA L40S',
      'аренда L40S',
      'L40S цена',
      'GPU L40S',
      'аренда GPU L40S',
      'облако L40S',
    ],
    related: ['l4', 'a100', 'h100'],
    highlights: [
      'Отдельный facet gpu=l40s — не смешивается с L4',
      'Часто берут как ступень между L4 и A100/H100',
      'Можно сразу обсудить в AI-ассистенте: «кто отдаёт L40S»',
    ],
    faq: [
      {
        question: 'L40S и L4 — в чём разница в каталоге?',
        answer:
          'Это разные модели NVIDIA. В каталоге Cloud FinOps у них разные фильтры: gpu=l40s и gpu=l4. Сравнивать ₽/час между ними можно, но не как «одну и ту же карту».',
      },
      {
        question: 'Для чего обычно берут L40S?',
        answer:
          'Inference mid-size моделей, batch-обработка, часть графических/рендер-нагрузок — когда L4 мало по VRAM/скорости, а H100 избыточен по бюджету. Итоговый выбор зависит от модели и SLA провайдера.',
      },
    ],
    eyebrow: 'Ada mid-range',
    hubFacts: ['48 GB', '1×'],
    about:
      'NVIDIA L40S (Ada Lovelace, 2023) — датацентровый PCIe-ускоритель с 48 GB GDDR6 и поддержкой FP8 Tensor Cores: ступень между экономичным L4 и дорогими HBM-картами A100/H100. Берут для mid-size LLM inference, batch-обработки и смешанных AI/графических нагрузок, когда 24 GB L4 уже мало, а Hopper избыточен по TCO. В каталоге L40S — отдельный facet от L4; сравнивать ₽/час между ними можно, но это разные модели.',
    aboutFacts: [
      '2023 · Ada Lovelace',
      '48 GB GDDR6',
      'FP8 Tensor Cores',
      'PCIe 1×',
      'inference / графика',
    ],
    useCases: ['mid-range inference', 'графика и рендер', 'ступень между L4 и A100'],
    hubFeatured: true,
    hubOrder: 8,
  },
  {
    slug: 'l4',
    shortTitle: 'L4',
    title: 'Аренда NVIDIA L4 в облаке России',
    description:
      'Публичные тарифы NVIDIA L4 / vGPU L4 у облаков РФ. Сравнение в каталоге Cloud FinOps для экономичного inference.',
    lead: 'L4 — частый выбор для embedding и лёгкого inference, когда H100 избыточен. Сравните flavor и vGPU-доли в каталоге.',
    gpuFacet: 'l4',
    keywords: ['NVIDIA L4', 'аренда L4', 'GPU L4', 'vGPU L4', 'inference GPU'],
    related: ['l40s', 'a100', 'h100'],
    highlights: ['Дешевле H100/H200 на подходящих задачах', 'В каталоге отдельно от L40S'],
    faq: [
      {
        question: 'L4 и L40S — это одно и то же?',
        answer:
          'Нет. В каталоге разные facet: L4 и L40S. Не смешивайте при сравнении ₽/час.',
      },
    ],
    eyebrow: 'Эконом inference',
    hubFacts: ['24 GB', '1× или vGPU'],
    about:
      'NVIDIA L4 (Ada Lovelace, 2023) — энергоэффективный PCIe GPU на 24 GB GDDR6 (типичный TDP около 72 Вт): наследник линейки T4 для embedding, лёгкого LLM inference, ASR и vGPU-долей. Удобен, когда H100/H200 избыточны, а модель и контекст помещаются в 24 GB (часто INT4/FP8). В каталоге не смешивайте с L40S (48 GB) — это разные facet и разный класс задач.',
    aboutFacts: [
      '2023 · Ada Lovelace',
      '24 GB GDDR6',
      '~72 Вт',
      '1× или vGPU',
      'лёгкий inference',
    ],
    useCases: ['embedding и лёгкий inference', 'vGPU-доли', 'экономичные AI-задачи'],
    hubFeatured: true,
    hubOrder: 9,
  },
];

const BY_SLUG = new Map(GPU_LANDINGS.map((d) => [d.slug, d]));

export function getGpuLanding(slug: string): GpuLandingDef | undefined {
  return BY_SLUG.get(slug as GpuLandingSlug);
}

export function allGpuLandingSlugs(): GpuLandingSlug[] {
  return GPU_LANDINGS.map((d) => d.slug);
}

export function featuredGpuLandings(): GpuLandingDef[] {
  return GPU_LANDINGS.filter((d) => d.hubFeatured).sort((a, b) => a.hubOrder - b.hubOrder);
}
