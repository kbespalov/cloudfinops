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
        question: 'Это официальные цены NVIDIA или провайдеров?',
        answer:
          'Нет. Cloud FinOps — независимый каталог публичных тарифов облаков России. Итоговая цена у провайдера может отличаться из‑за квот, наличия, контракта и скидок.',
      },
      {
        question: 'Чем H200 отличается от H100 в каталоге?',
        answer:
          'У H200 больше HBM (ориентир 141GB) — чаще берут под длинный контекст и крупные MoE. В каталоге это разные facet: gpu=h200 и gpu=h100.',
      },
    ],
    eyebrow: 'Топ по спросу',
    hubFacts: ['141 GB', '1× / 8×'],
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
    hubFacts: ['80 GB', '1× / 8×'],
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
    hubFacts: ['40 / 80 GB', '1× / multi'],
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
    hubFacts: ['288 GB', '8× HGX'],
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
    hubFacts: ['8× H200', 'узел'],
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
    hubFacts: ['8× B300', 'dedicated'],
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
    hubFacts: ['24 GB', '1× / vGPU'],
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
