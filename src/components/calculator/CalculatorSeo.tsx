import {
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  GPU_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
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
export function CalculatorSeo() {
  return (
    <section className={styles.seo} aria-labelledby="calculator-seo-title">
      <h2 id="calculator-seo-title" className={styles.title}>
        Калькулятор облаков и аренды GPU в России
      </h2>
      <p className={styles.lead}>
        Сравните публичные цены на виртуальные машины и GPU у российских облачных провайдеров:{' '}
        {PROVIDERS.join(', ')}. Калькулятор Cloud FinOps показывает Best offer по готовым пресетам
        compute (vCPU, RAM, SSD) и GPU (NVIDIA L4, A100, H100, H200) — без конструктора и без
        скрытых промо-тарифов.
      </p>

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
          <p className={styles.meta}>{COMPUTE_PRESETS.length} конфигураций ВМ</p>
        </div>

        <div>
          <h3 className={styles.subtitle}>Пресеты GPU</h3>
          <ul className={styles.list}>
            {GPU_PRESETS.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong> — {p.subtitle}. Сравнение unit-цены GPU и flavor (vCPU +
                RAM + GPU).
              </li>
            ))}
          </ul>
          <p className={styles.meta}>
            Ключевые запросы: аренда GPU H100, H200, A100, L4, цена GPU в облаке, калькулятор GPU
          </p>
        </div>
      </div>

      <h3 className={styles.subtitle}>Частые вопросы</h3>
      <dl className={styles.faq}>
        <div>
          <dt>Как считается стоимость ВМ в калькуляторе?</dt>
          <dd>
            Берём публичные тарифы на vCPU, RAM и SSD одного региона и совместимой CPU-платформы,
            складываем в готовую конфигурацию и выбираем минимальную цену среди провайдеров (Best
            offer).
          </dd>
        </div>
        <div>
          <dt>Чем low-cost отличается от General?</dt>
          <dd>
            Low-cost использует самые дешёвые ордерабельные варианты: preemptible и shared vCPU, где
            они есть в каталоге. General / High CPU / High Memory — on-demand с выделенными (100%)
            ядрами.
          </dd>
        </div>
        <div>
          <dt>Почему цена GPU H100 у провайдеров отличается так сильно?</dt>
          <dd>
            Часть облаков продаёт только GPU (unit), часть — готовую ВМ с ядрами и памятью (flavor /
            bundle). В калькуляторе эти офферы разделены, чтобы не сравнивать «только карту» с
            «целой машиной».
          </dd>
        </div>
        <div>
          <dt>Какие облака сравниваются?</dt>
          <dd>
            Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS Cloud и T1 Cloud — по единой таксономии
            SKU Cloud FinOps.
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
        'Публичные тарифы vCPU, RAM и SSD одного региона и совместимой CPU-платформы складываются в пресет; Best offer — минимальная цена среди провайдеров.',
    },
    {
      question: 'Какие GPU можно сравнить в калькуляторе?',
      answer:
        'Пресеты NVIDIA L4, A100, H100, H200 (1× и 8×). Unit-цены GPU и flavor-конфигурации показываются отдельно.',
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
          'Калькулятор стоимости облачных ВМ и аренды GPU в России: сравнение цен Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 по пресетам compute и NVIDIA L4/A100/H100/H200.',
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
