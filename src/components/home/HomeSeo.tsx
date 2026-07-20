import {HOME_EXAMPLES} from './homePrompts';
import styles from './HomeSeo.module.css';

const PROVIDERS = [
  'Yandex Cloud',
  'VK Cloud',
  'Selectel',
  'Cloud.ru',
  'MWS Cloud',
  'T1 Cloud',
];

const TOOLS: {title: string; href: string; text: string}[] = [
  {
    title: 'Сравнение цен облаков России',
    href: '/chat',
    text: 'Задайте конфигурацию своими словами — ИИ-ассистент FinOps сравнит публичные тарифы шести облаков РФ и покажет самый дешёвый вариант в рублях с НДС.',
  },
  {
    title: 'Калькулятор цен ВМ и GPU',
    href: '/calculator/vm',
    text: 'Готовые пресеты ВМ и GPU (L4, A100, H100, H200, B300): расчёт стоимости по публичным SKU, Best offer без промо-тарифов и без ручного конструктора.',
  },
  {
    title: 'Каталог SKU',
    href: '/catalog',
    text: 'Единый каталог публичных позиций: vCPU, RAM, SSD, объектное хранилище, трафик, Managed Kubernetes и AI API — с фильтрами и поиском по провайдерам.',
  },
  {
    title: 'Калькулятор Self-host LLM',
    href: '/calculator/self-host',
    text: 'Подбор GPU под open-weight модель (Qwen, GLM, Kimi, DeepSeek): квант INT4/FP8, оценка VRAM, сравнение аренды H100/H200 в облаках РФ и ориентир Hosted API ₽/1M.',
  },
  {
    title: 'Расчёт GPU в чате FinOps',
    href: '/chat',
    text: 'Опишите модель своими словами — ассистент подскажет конфиг и сошлётся на тот же каталог цен, что и калькуляторы.',
  },
];

const FAQ: {question: string; answer: string}[] = [
  {
    question: 'Что такое Cloud FinOps?',
    answer:
      'Cloud FinOps — сервис сравнения цен публичных облаков России. На одной площадке собраны каталог SKU, калькулятор стоимости ВМ и GPU и ИИ-ассистент, который отвечает на вопросы о тарифах Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
  },
  {
    question: 'Как сравнить цены облаков России?',
    answer:
      'Опишите конфигурацию на главной или в чате (например «8 vCPU / 32 GiB / 100 ГБ SSD») — ассистент приведёт варианты к паритету и сравнит стоимость. Либо откройте /calculator/vm: пресет compute или GPU и Best offer по провайдерам.',
  },
  {
    question: 'Чем калькулятор цен отличается от каталога?',
    answer:
      'Каталог показывает отдельные строки прайса. Калькулятор ВМ (/calculator/vm) собирает полную конфигурацию у каждого провайдера и выбирает Best offer. Для self-host LLM с подбором карт под модель — /calculator/self-host.',
  },
  {
    question: 'Как считается стоимость облака?',
    answer:
      'Только по публичным тарифам каталога Cloud FinOps. Для unit-тарифов складываются vCPU, RAM и диск; для flavor — готовая ВМ плюс SSD при необходимости. Цены в рублях с НДС, расчётный месяц — 720 часов. Промо и неподтверждённые позиции не используются.',
  },
  {
    question: 'Какие облачные провайдеры России сравниваются?',
    answer: `${PROVIDERS.join(', ')}.`,
  },
  {
    question: 'Можно ли посчитать аренду GPU H100 или H200?',
    answer:
      'Да. В калькуляторе и в чате доступно сравнение аренды GPU NVIDIA L4, A100, H100, H200 и отдельных форм (включая B300 у части провайдеров) по публичным ценам.',
  },
  {
    question: 'Как рассчитать конфигурацию GPU под инференс LLM?',
    answer:
      'Откройте калькулятор Self-host LLM (/calculator/self-host): выберите модель и квант — получите минимум/рекомендуемую сборку и цены аренды. Либо опишите модель в чате FinOps — тот же каталог тарифов.',
  },
  {
    question: 'Сколько GPU нужно для Qwen или GLM в российском облаке?',
    answer:
      'Зависит от размера модели и кванта. Для компактных MoE вроде Qwen3-Coder-Next (80B/3B active) часто хватает 1×H100 INT4 или 1–2×H100/H200 FP8; крупные модели требуют multi-GPU. Ориентир — /calculator/self-host по публичным тарифам.',
  },
];

/**
 * Server-rendered SEO copy for `/`. Hero landing stays visual-first;
 * this block is in the DOM for crawlers (same approach as ChatSeo).
 */
export function HomeSeo() {
  return (
    <section className={styles.seo} aria-labelledby="home-seo-title">
      <h2 id="home-seo-title" className={styles.title}>
        Сравнение цен облаков России, калькулятор GPU и расчёт под инференс
      </h2>
      <p className={styles.lead}>
        Cloud FinOps помогает сравнить цены публичных облаков России и быстро посчитать стоимость
        инфраструктуры: ВМ, аренда GPU и расчёт конфигурации под инференс LLM (Qwen, GLM, Kimi,
        gpt-oss). На сайте — ИИ-ассистент FinOps, калькулятор и каталог SKU по{' '}
        {PROVIDERS.join(', ')}. Все цифры — из открытых прайс-листов, без выдуманных тарифов.
      </p>

      <div className={styles.grid}>
        {TOOLS.map((tool) => (
          <div key={tool.title} className={styles.card}>
            <h3 className={styles.subtitle}>
              <a href={tool.href}>{tool.title}</a>
            </h3>
            <p className={styles.cardText}>{tool.text}</p>
          </div>
        ))}
      </div>

      <h3 className={styles.subtitle}>Примеры расчёта стоимости</h3>
      <ul className={styles.list}>
        {HOME_EXAMPLES.map((example) => (
          <li key={example.id}>{example.prompt}</li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы</h3>
      <dl className={styles.faq}>
        {FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function homeJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': 'https://cloudfinops.ru/#website',
        name: 'Cloud FinOps',
        url: 'https://cloudfinops.ru/',
        inLanguage: 'ru-RU',
        description:
          'Сравнение цен облаков России: калькулятор стоимости ВМ и GPU, каталог SKU и ИИ-ассистент FinOps по публичным тарифам Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://cloudfinops.ru/chat?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/#app',
        name: 'Cloud FinOps — сравнение цен облаков России',
        url: 'https://cloudfinops.ru/',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Сервис сравнения цен и расчёта стоимости публичных облаков России. Калькулятор ВМ и GPU, каталог SKU и ИИ-ассистент FinOps для Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
        featureList: [
          'Сравнение цен облаков России',
          'Калькулятор цен ВМ и GPU',
          'Расчёт стоимости конфигурации',
          'Расчёт GPU под инференс LLM',
          'Каталог SKU',
          'ИИ-ассистент FinOps',
        ],
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
        '@id': 'https://cloudfinops.ru/#faq',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };
}
