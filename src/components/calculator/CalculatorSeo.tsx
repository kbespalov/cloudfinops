import {
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {INFERENCE_MODELS} from '@/data/inference-models';
import styles from './CalculatorSeo.module.css';

const FAMILIES: ComputeFamily[] = ['low-cost', 'general', 'high-cpu', 'high-memory'];

const PROVIDERS = [
  'Yandex Cloud',
  'VK Cloud',
  'Selectel',
  'Cloud.ru',
  'MWS Cloud',
  'T1 Cloud',
];

/** Featured NVIDIA SKUs people search for (calculator + SEO). */
const GPU_CARDS = [
  {
    id: 'b300',
    title: 'NVIDIA B300',
    text: 'Выделенный 8×B300 288GB (Selectel) — калькулятор показывает bundle dedicated-узла, не облачную GPU-ВМ.',
  },
  {
    id: 'h100',
    title: 'NVIDIA H100 80GB',
    text: '1× и 8× H100 PCIe/NVLink: сравнение Cloud.ru flavor и сборки GPU + host у Selectel / T1 / других.',
  },
  {
    id: 'h200',
    title: 'NVIDIA H200 141GB',
    text: '1× и 8× H200 под крупные MoE и длинный контекст — Best offer по публичным тарифам РФ.',
  },
  {
    id: 'a100',
    title: 'NVIDIA A100 80GB',
    text: 'Классика датацентрового инференса и обучения; flavor и unit-цены в одном сравнении.',
  },
  {
    id: 'l4',
    title: 'NVIDIA L4 24GB',
    text: 'Экономичный inference / embedding; часто дешевле H100 при подходящем размере модели.',
  },
  {
    id: 'v100',
    title: 'NVIDIA V100 32GB',
    text: 'Legacy-карта в каталоге — полезно для оценки миграции со старых кластеров.',
  },
] as const;

/** Server-rendered SEO: in DOM for crawlers, visually hidden (interactive UI owns viewport). */
export function VmCalculatorSeo({
  gpuPresets,
  gpuShapeCount,
}: {
  gpuPresets: GpuPreset[];
  gpuShapeCount: number;
}) {
  return (
    <section className={styles.seo} aria-labelledby="calculator-vm-seo-title">
      <h2 id="calculator-vm-seo-title" className={styles.title}>
        Калькулятор стоимости ВМ и аренды GPU H100, H200, B300 в облаках России
      </h2>
      <p className={styles.lead}>
        Сравните публичные цены на виртуальные машины (vCPU, RAM, SSD/NVMe, публичный IP) и аренду
        видеокарт NVIDIA — <strong>B300</strong>, <strong>H100</strong>, <strong>H200</strong>,{' '}
        <strong>A100</strong>, <strong>L4</strong>, <strong>V100</strong> — у {PROVIDERS.join(', ')}.
        Best offer — минимальная ордерабельная конфигурация по открытому каталогу Cloud FinOps, без
        промо-тарифов.
      </p>

      <h3 className={styles.subtitle}>Для кого этот калькулятор</h3>
      <ul className={styles.list}>
        <li>
          <strong>FinOps и закупки</strong> — быстрый ориентир «сколько стоит 4/16 или 8/32 в РФ»
          без ручного сбора прайсов.
        </li>
        <li>
          <strong>Архитекторы и DevOps</strong> — сравнение General / High CPU / High Memory /
          Low-cost и вкладки GPU с flavor-пресетами.
        </li>
        <li>
          <strong>AI-команды</strong> — оценка аренды H100 / H200 / B300 до детального self-host
          расчёта на <a href="/calculator/self-host">калькуляторе Self-host LLM</a>.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Калькулятор по видеокартам</h3>
      <ul className={styles.list}>
        {GPU_CARDS.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong> — {card.text}
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Как считается цена ВМ</h3>
      <ul className={styles.list}>
        <li>
          <strong>Unit-тариф</strong> — складываем N × vCPU + M × RAM + диск (по умолчанию 10 GiB
          SSD/NVMe) + публичные IP, если включены.
        </li>
        <li>
          <strong>Flavor</strong> — готовая ВМ (типично Cloud.ru) + диск отдельно, если не входит в
          SKU.
        </li>
        <li>
          <strong>General / High CPU / High Memory</strong> — только on-demand с гарантией ядра
          100%. Shared и preemptible — в Low-cost.
        </li>
        <li>
          <strong>GPU</strong> — flavor Cloud.ru и уникальные формы VK/Selectel (в т.ч. dedicated
          B300); иначе GPU unit + host vCPU/RAM.
        </li>
        <li>
          Месяц = 720 часов. Неподтверждённые и снятые SKU не участвуют.
        </li>
      </ul>

      <div className={styles.grid}>
        <div>
          <h3 className={styles.subtitle}>Пресеты Compute</h3>
          <ul className={styles.list}>
            {FAMILIES.map((family) => {
              const samples = computePresetsByFamily(family)
                .map((p) => `${p.vcpu}/${p.ramGiB}`)
                .join(', ');
              return (
                <li key={family}>
                  <strong>{COMPUTE_FAMILY_TITLE[family]}</strong> — {samples} (vCPU / GiB) + 10 GiB
                  SSD
                </li>
              );
            })}
          </ul>
          <p className={styles.meta}>{COMPUTE_PRESETS.length} конфигураций ВМ</p>
        </div>
        <div>
          <h3 className={styles.subtitle}>Пресеты GPU</h3>
          <ul className={styles.list}>
            {gpuPresets.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong> — {p.subtitle}
              </li>
            ))}
          </ul>
          <p className={styles.meta}>{gpuShapeCount} GPU-форм в каталоге</p>
        </div>
      </div>

      <h3 className={styles.subtitle}>Частые вопросы · калькулятор ВМ и GPU</h3>
      <dl className={styles.faq}>
        {VM_FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SelfHostCalculatorSeo() {
  const modelNames = INFERENCE_MODELS.map((m) => m.displayName).slice(0, 12);

  return (
    <section className={styles.seo} aria-labelledby="calculator-llm-seo-title">
      <h2 id="calculator-llm-seo-title" className={styles.title}>
        Калькулятор GPU H100, H200, B300 для self-host LLM и инференса
      </h2>
      <p className={styles.lead}>
        Подберите конфигурацию под open-weight модель (квант INT4 / FP8 / BF16 / INT8) и сравните
        аренду <strong>NVIDIA H100</strong>, <strong>H200</strong>, <strong>A100</strong>,{' '}
        <strong>L4</strong> и выделенного <strong>B300</strong> у {PROVIDERS.join(', ')}. Калькулятор
        оценивает VRAM и число карт, показывает Best offer по публичным тарифам — рядом ориентир
        Hosted API ₽/1M токенов, где модель есть в каталоге.
      </p>

      <h3 className={styles.subtitle}>Ключевые сценарии</h3>
      <ul className={styles.list}>
        <li>
          <strong>Сколько GPU нужно для модели</strong> — ориентир по параметрам и кванту (например
          Qwen3-Coder-Next 80B/3B active → 1×H100 INT4).
        </li>
        <li>
          <strong>Аренда H100 / H200 / B300 под инференс</strong> — сравнение Selectel, Cloud.ru, T1,
          MWS, VK, Yandex по публичным SKU.
        </li>
        <li>
          <strong>Self-host vs API</strong> — фиксированная цена GPU-узла против ₽/1M input/output
          у hosted API того же семейства моделей.
        </li>
        <li>
          Для сырого сравнения flavor без модели (включая B300 dedicated) откройте{' '}
          <a href="/calculator/vm">калькулятор ВМ и GPU</a>.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Карты в расчёте self-host</h3>
      <ul className={styles.list}>
        {GPU_CARDS.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong> — {card.text}
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Модели в базе self-host</h3>
      <p className={styles.lead}>
        {modelNames.join(', ')}
        {INFERENCE_MODELS.length > modelNames.length
          ? ` и ещё ${INFERENCE_MODELS.length - modelNames.length}`
          : ''}
        . Рецепты — инженерные оценки VRAM (weights + запас), не лабораторные бенчмарки.
      </p>

      <h3 className={styles.subtitle}>Как считается конфигурация</h3>
      <ul className={styles.list}>
        <li>Выбираете модель и квант (Auto подставляет рекомендуемый).</li>
        <li>Сервис отдаёт минимум / рекомендуемую / запасные GPU-сборки с оценкой VRAM.</li>
        <li>
          Цена узла — quote GPU из каталога (bundle flavor или GPU + host). Месяц = 720 часов.
        </li>
        <li>API-only модели (без публичных весов) показывают только Hosted API.</li>
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы · Self-host LLM</h3>
      <dl className={styles.faq}>
        {SELF_HOST_FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @deprecated use VmCalculatorSeo */
export const CalculatorSeo = VmCalculatorSeo;

const VM_FAQ = [
  {
    question: 'Как считается стоимость ВМ в калькуляторе Cloud FinOps?',
    answer:
      'Складываем публичные unit-цены vCPU, RAM и диск одного региона и платформы либо берём точный flavor плюс SSD. Best offer — минимальная ордерабельная цена среди провайдеров. Месяц = 720 часов.',
  },
  {
    question: 'Какие облака России сравниваются?',
    answer: `${PROVIDERS.join(', ')} — по единой таксономии SKU Cloud FinOps.`,
  },
  {
    question: 'Можно ли посчитать аренду GPU H100, H200 или B300?',
    answer:
      'Да. Во вкладке GPU сравниваются пресеты NVIDIA L4, A100, H100 (1×/8×), H200 (1×/8×), V100 и dedicated B300 8× у Selectel — по публичным ценам каталога Cloud FinOps.',
  },
  {
    question: 'Сколько стоит аренда NVIDIA B300 в калькуляторе?',
    answer:
      'B300 в каталоге — выделенный узел Selectel (8×GPU), не обычная облачная GPU-ВМ. Калькулятор показывает bundle-цену dedicated; host vCPU/RAM в SKU не разложены.',
  },
  {
    question: 'Чем этот калькулятор отличается от калькулятора провайдера?',
    answer:
      'Мы сравниваем несколько облаков РФ на одних и тех же пресетах H100/H200/B300/A100/L4. Калькуляторы Selectel или Yandex Cloud считают только свой прайс.',
  },
];

const SELF_HOST_FAQ = [
  {
    question: 'Как рассчитать GPU под инференс LLM (self-host)?',
    answer:
      'Выберите open-weight модель и квант. Калькулятор оценит VRAM, предложит конфигурации (1×H100, 1×H200, multi-GPU) и сравнит цены аренды у облаков России по публичным тарифам.',
  },
  {
    question: 'Сколько стоит аренда H100 или H200 для self-host в России?',
    answer:
      'Зависит от flavor vs unit GPU + host. Для 1×H100 80GB и 1×H200 141GB смотрите актуальный Best offer на странице (Selectel / Cloud.ru / T1 и др.); месяц = 720 часов. 8× узлы считаются отдельными пресетами.',
  },
  {
    question: 'Нужен ли B300 для self-host LLM?',
    answer:
      'B300 — топовый dedicated-узел (Selectel). Для многих open-weight моделей достаточно 1×H100/H200; B300 имеет смысл для максимальной плотности и спец. нагрузок. Цену B300 удобнее смотреть на /calculator/vm во вкладке GPU.',
  },
  {
    question: 'Чем INT4 отличается от FP8 и BF16 в калькуляторе?',
    answer:
      'Квант уменьшает VRAM под веса: INT4 — максимум экономии карт (часто 1×H100 вместо multi-GPU), FP8 — частый баланс на H100/H200, BF16 — ближе к полному качеству и требует больше памяти.',
  },
  {
    question: 'Какие модели поддерживаются для self-host расчёта?',
    answer: `В базе: ${INFERENCE_MODELS.map((m) => m.displayName).join(', ')}. Часть моделей API-only — для них показывается только Hosted API.`,
  },
  {
    question: 'Self-host дешевле Hosted API?',
    answer:
      'Только при высокой утилизации GPU. Калькулятор показывает фиксированную стоимость узла и ориентир ₽/1M токенов API — точку безубыточности считайте по своему tok/s и смеси input/output.',
  },
];

export function vmCalculatorJsonLd(gpuShapeCount: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator/vm#app',
        name: 'Калькулятор ВМ и GPU H100 H200 B300 · Cloud FinOps',
        url: 'https://cloudfinops.ru/calculator/vm',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор стоимости виртуальных машин и аренды GPU NVIDIA H100, H200, B300, A100, L4, V100 в России: сравнение Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
        featureList: [
          'Калькулятор стоимости ВМ',
          'Сравнение цен облаков России',
          'Калькулятор аренды H100',
          'Калькулятор аренды H200',
          'Калькулятор аренды B300',
          'Аренда A100 и L4',
          'Пресеты General High CPU High Memory Low-cost',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator/vm#faq',
        mainEntity: VM_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cloud FinOps',
            item: 'https://cloudfinops.ru/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Калькулятор ВМ и GPU',
            item: 'https://cloudfinops.ru/calculator/vm',
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'GPU-формы в каталоге Cloud FinOps',
        numberOfItems: gpuShapeCount,
        itemListOrder: 'https://schema.org/ItemListUnordered',
      },
    ],
  };
}

export function selfHostCalculatorJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator/self-host#app',
        name: 'Калькулятор Self-host LLM H100 H200 B300 · Cloud FinOps',
        url: 'https://cloudfinops.ru/calculator/self-host',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор GPU под self-host и инференс open-weight LLM: подбор NVIDIA H100, H200, A100, L4 и ориентир по B300; сравнение аренды в облаках России и Hosted API ₽/1M.',
        featureList: [
          'Калькулятор GPU для LLM',
          'Self-host LLM на H100',
          'Self-host LLM на H200',
          'Калькулятор инференса B300',
          'Аренда A100 L4 под модель',
          'Сравнение с Hosted API',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator/self-host#faq',
        mainEntity: SELF_HOST_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cloud FinOps',
            item: 'https://cloudfinops.ru/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Self-host LLM',
            item: 'https://cloudfinops.ru/calculator/self-host',
          },
        ],
      },
    ],
  };
}

/** @deprecated use vmCalculatorJsonLd */
export function calculatorJsonLd() {
  return vmCalculatorJsonLd(0);
}
