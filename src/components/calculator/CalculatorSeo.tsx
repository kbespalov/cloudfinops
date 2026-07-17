import {
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
  type GpuPreset,
} from '@/lib/calculator/presets';
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

/**
 * Server-rendered SEO copy: real content for crawlers (not cloaked),
 * calm footer block so the interactive calculator stays the focus.
 */
export function CalculatorSeo({
  gpuPresets,
  gpuShapeCount,
}: {
  gpuPresets: GpuPreset[];
  gpuShapeCount: number;
}) {
  return (
    <section className={styles.seo} aria-labelledby="calculator-seo-title">
      <h2 id="calculator-seo-title" className={styles.title}>
        Калькулятор облаков и аренды GPU в России
      </h2>
      <p className={styles.lead}>
        Сравните публичные цены на виртуальные машины и GPU у российских облачных провайдеров:{' '}
        {PROVIDERS.join(', ')}. Cloud FinOps считает Best offer по готовым пресетам — без
        конструктора и без промо-тарифов, которых нет в открытом прайсе.
      </p>

      <h3 className={styles.subtitle}>Как считается цена</h3>
      <p className={styles.lead}>
        Калькулятор работает только с публичным каталогом SKU Cloud FinOps. Для каждого пресета и
        каждого провайдера подбирается <strong>ордерабельная</strong> конфигурация — такая, которую
        реально можно заказать: компоненты из одного региона, совместимая CPU-платформа, есть
        загрузочный диск. Затем выбирается минимальная итоговая цена (Best offer).
      </p>
      <ul className={styles.list}>
        <li>
          <strong>Unit-тариф (vCPU + RAM + SSD)</strong> — если провайдер публикует отдельные цены
          за ядро и гигабайт памяти (Yandex Cloud, VK Cloud, Selectel, MWS, T1). Складываем:{' '}
          <em>N × цена vCPU + M × цена RAM + 100 GiB × цена SSD</em>.
        </li>
        <li>
          <strong>Flavor / готовая ВМ</strong> — если unit-цен нет, а есть готовые конфигурации
          (типичный случай Cloud.ru: SKU «4 vCPU / 8 GiB»). Берём точный flavor под пресет и
          добавляем SSD отдельно — в тарифе диск обычно не входит в цену ВМ.
        </li>
        <li>
          <strong>General / High CPU / High Memory</strong> — только on-demand и выделенные ядра
          (100% guarantee). Shared (1:N), burstable 5–50% и preemptible в эти полки не попадают.
        </li>
        <li>
          <strong>Low-cost</strong> — самые дешёвые ордерабельные варианты: preemptible, shared /
          oversubscribed vCPU и flavor с долей ядра &lt;100% (например 10%/30% у Cloud.ru). Дробные
          unit-ядра Yandex (5%/20%/50%) не используем: на них нельзя честно собрать «8 vCPU».
        </li>
        <li>
          <strong>GPU</strong> — строки таблицы = flavor Cloud.ru + уникальные формы VK/Selectel
          (в т.ч. B300). У провайдера без flavor собираем GPU + те же vCPU/RAM (+ SSD). Exact flavor
          имеет приоритет над сборкой.
        </li>
        <li>
          <strong>Что отбрасываем</strong> — SKU с пометкой «наличие не подтверждено», снятые с
          продажи и тарифы без публичной цены. Месяц = 720 часов; сеть, IP, образы и бэкапы в
          пресет не входят.
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
                  <strong>{COMPUTE_FAMILY_TITLE[family]}</strong> — {samples} (vCPU / GiB RAM) + 100
                  GiB SSD
                </li>
              );
            })}
          </ul>
          <p className={styles.meta}>
            {COMPUTE_PRESETS.length} конфигураций ВМ · Low-cost / General / High CPU / High Memory
          </p>
        </div>

        <div>
          <h3 className={styles.subtitle}>Пресеты GPU</h3>
          <ul className={styles.list}>
            {gpuPresets.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong> — {p.subtitle}
                {p.highlight ? ' · выделено' : ''}
              </li>
            ))}
          </ul>
          <p className={styles.meta}>
            {gpuShapeCount} GPU-форм · Cloud.ru flavors + уникальные VK/Selectel · B300 dedicated
          </p>
        </div>
      </div>

      <h3 className={styles.subtitle}>Частые вопросы</h3>
      <dl className={styles.faq}>
        <div>
          <dt>Как считается стоимость ВМ в калькуляторе?</dt>
          <dd>
            Либо складываем публичные unit-цены vCPU + RAM + SSD одного региона и платформы, либо
            берём точный flavor (готовая ВМ) и добавляем SSD. Среди провайдеров выбираем минимум —
            Best offer. Пример: у Cloud.ru нет отдельных цен за ядро, поэтому в расчёт идут их
            flavor SKU.
          </dd>
        </div>
        <div>
          <dt>Почему у части пресетов нет Cloud.ru?</dt>
          <dd>
            Cloud.ru продаёт фиксированные размеры ВМ. Если в тарифе нет точного совпадения по vCPU
            и RAM (например High CPU без точного flavor или High Memory 32/256), провайдера в
            карточке нет — мы не подставляем «похожий» размер и не занижаем цену.
          </dd>
        </div>
        <div>
          <dt>Чем Low-cost отличается от General?</dt>
          <dd>
            Low-cost — preemptible, shared и flavor с долей vCPU &lt;100%, где они есть в каталоге.
            General / High CPU / High Memory — только on-demand с гарантией 100% ядра.
          </dd>
        </div>
        <div>
          <dt>Почему цена GPU H100 у провайдеров отличается так сильно?</dt>
          <dd>
            Часть облаков продаёт только GPU (unit), часть — готовую ВМ с ядрами и памятью (flavor).
            Списки разделены: «только GPU» не сравнивается с «vCPU + RAM + GPU» в одном Best offer.
          </dd>
        </div>
        <div>
          <dt>Какие облака сравниваются?</dt>
          <dd>
            {PROVIDERS.join(', ')} — по единой таксономии SKU Cloud FinOps и только по публичным
            тарифам.
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function calculatorJsonLd() {
  const faq = [
    {
      question: 'Как считается стоимость ВМ в калькуляторе Cloud FinOps?',
      answer:
        'Складываем публичные unit-цены vCPU, RAM и SSD одного региона и CPU-платформы либо берём точный flavor (готовая ВМ, как у Cloud.ru) плюс SSD. Best offer — минимальная ордерабельная цена среди провайдеров. Месяц = 720 часов.',
    },
    {
      question: 'Почему у части пресетов нет Cloud.ru?',
      answer:
        'Cloud.ru публикует фиксированные flavor SKU. Если нет точного совпадения vCPU/RAM с пресетом, провайдер не показывается — похожие размеры не подставляются.',
    },
    {
      question: 'Какие GPU можно сравнить в калькуляторе?',
      answer:
        'Строки GPU = flavor Cloud.ru (vCPU+RAM+GPU) плюс уникальные формы VK и Selectel, включая выделенный B300. У провайдеров без flavor цена собирается как GPU + те же vCPU/RAM.',
    },
    {
      question: 'Какие облачные провайдеры России есть в калькуляторе?',
      answer: `${PROVIDERS.join(', ')}.`,
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator#app',
        name: 'Калькулятор облаков и GPU · Cloud FinOps',
        url: 'https://cloudfinops.ru/calculator',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор стоимости облачных ВМ и аренды GPU в России: сравнение цен Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 по пресетам compute и NVIDIA L4/A100/H100/H200. Учитываются unit-тарифы и flavor SKU, ордерабельность региона и платформы.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'RUB',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator#faq',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
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
            name: 'Калькулятор',
            item: 'https://cloudfinops.ru/calculator',
          },
        ],
      },
    ],
  };
}
