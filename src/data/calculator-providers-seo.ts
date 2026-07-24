import type {CalculatorProviderId} from '@/lib/calculator/quote-view';

export type ProviderFaqItem = {
  question: string;
  answer: string;
};

export type CalculatorProviderSeo = {
  /** URL slug under /calculator/{slug} */
  slug: string;
  providerId: CalculatorProviderId;
  /** Display brand in H1 / title (not inflected) */
  brandDisplay: string;
  /** Primary Russian brand for search aliases */
  brandRu: string;
  /** English / legal brand as in catalog */
  brandEn: string;
  /** Extra search aliases (no need to repeat brandRu/brandEn) */
  aliases: string[];
  title: string;
  description: string;
  keywords: string[];
  h1: string;
  lead: string;
  intro: string;
  /** Calm independence line under the hero lead */
  independenceNote: string;
  faq: ProviderFaqItem[];
};

const ALL_BRANDS =
  'Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS Cloud и T1 Cloud';

function buildProviderSeo(input: {
  slug: string;
  providerId: CalculatorProviderId;
  brandDisplay: string;
  brandRu: string;
  brandEn: string;
  aliases: string[];
  keywords: string[];
  /** Extra FAQ answers beyond the shared trio */
  faqExtra?: ProviderFaqItem[];
}): CalculatorProviderSeo {
  const {brandDisplay} = input;
  return {
    slug: input.slug,
    providerId: input.providerId,
    brandDisplay,
    brandRu: input.brandRu,
    brandEn: input.brandEn,
    aliases: input.aliases,
    // SERP: публичные цены + расчёт + сравнение + Cloud FinOps (не «официальный прайс»).
    title: `Публичные цены ${brandDisplay}: расчёт и сравнение — Cloud FinOps`,
    description: `Публичные цены ${brandDisplay}: независимый расчёт стоимости VM и GPU и сравнение с другими облаками России. Cloud FinOps — информационно-аналитический сервис; скидки и промо не учитываются.`,
    keywords: input.keywords,
    h1: `Публичные цены ${brandDisplay}: расчёт и сравнение`,
    lead: `Рассчитайте стоимость VM и GPU по публичным ценам ${brandDisplay} и сравните результат с другими облачными провайдерами.`,
    intro: `На этой странице можно рассчитать стоимость виртуальных машин и GPU по публичным тарифам ${brandDisplay} в сопоставимом виде и сравнить результат с предложениями других облачных провайдеров. Индивидуальные скидки, специальные договорные условия и промоакции не учитываются.`,
    independenceNote: `Cloud FinOps — независимый аналитический сервис. Страница не является официальным калькулятором или прайс-листом ${brandDisplay}.`,
    faq: [
      {
        question: `Откуда берутся тарифы ${brandDisplay} на Cloud FinOps?`,
        answer: `Мы используем только публичные тарифы ${brandDisplay} из открытых источников провайдера. Закрытые прайсы, партнёрские скидки и промоакции в расчёт не входят. Перед заказом сверьте актуальные условия на сайте ${brandDisplay}.`,
      },
      {
        question: `Что считает калькулятор по тарифам ${brandDisplay}?`,
        answer: `Калькулятор оценивает стоимость VM и GPU по публичным тарифам ${brandDisplay} и показывает цены других провайдеров для выбранных параметров.`,
      },
      {
        question: `Как посчитать стоимость ВМ в ${brandDisplay}?`,
        answer: `Выберите пресет или параметры (например 4 vCPU / 16 GiB) на этой странице. Калькулятор соберёт цену по публичным тарифам ${brandDisplay} и покажет сравнение с другими провайдерами. Расчётный месяц = 720 часов. Для каждого тарифа используется налоговый статус, указанный в каталоге и источнике цены.`,
      },
      {
        question: `Это официальные тарифы или калькулятор ${brandDisplay}?`,
        answer: `Нет. Cloud FinOps — независимый информационно-аналитический сервис. Мы не заменяем официальный прайс и калькулятор провайдера. Перед заказом проверьте итоговую стоимость и доступность ресурсов на сайте ${brandDisplay}.`,
      },
      ...(input.faqExtra ?? []),
    ],
  };
}

export const CALCULATOR_PROVIDER_SEO: CalculatorProviderSeo[] = [
  buildProviderSeo({
    slug: 'yandex-cloud',
    providerId: 'yandex-cloud',
    brandDisplay: 'Yandex Cloud',
    brandRu: 'Яндекс.Облако',
    brandEn: 'Yandex Cloud',
    aliases: ['Яндекс Облако', 'Яндекс.Облако', 'Yandex.Cloud', 'облако Яндекс'],
    keywords: [
      'тарифы Yandex Cloud',
      'тарифы Яндекс Облако',
      'тарифы Яндекс.Облако',
      'калькулятор Yandex Cloud',
      'калькулятор Яндекс Облако',
      'цены Yandex Cloud',
      'стоимость VM Yandex Cloud',
      'стоимость GPU Yandex Cloud',
      'сравнение тарифов Yandex Cloud',
      'Yandex Cloud или другие облака',
    ],
  }),
  buildProviderSeo({
    slug: 'vk-cloud',
    providerId: 'vk-cloud',
    brandDisplay: 'VK Cloud',
    brandRu: 'VK Cloud',
    brandEn: 'VK Cloud',
    aliases: ['ВК Облако', 'ВК.Облако', 'Cloud VK', 'VK.Cloud'],
    keywords: [
      'тарифы VK Cloud',
      'тарифы ВК Облако',
      'калькулятор VK Cloud',
      'цены VK Cloud',
      'стоимость VM VK Cloud',
      'стоимость GPU VK Cloud',
      'сравнение тарифов VK Cloud',
      'VK Cloud или другие облака',
    ],
  }),
  buildProviderSeo({
    slug: 'selectel',
    providerId: 'selectel',
    brandDisplay: 'Selectel',
    brandRu: 'Selectel',
    brandEn: 'Selectel',
    aliases: ['Селектел', 'Selectel Cloud', 'облако Selectel'],
    keywords: [
      'тарифы Selectel',
      'тарифы Селектел',
      'калькулятор Selectel',
      'цены Selectel',
      'стоимость VM Selectel',
      'стоимость GPU Selectel',
      'сравнение тарифов Selectel',
      'Selectel или другие облака',
    ],
    faqExtra: [
      {
        question: 'Как посчитать аренду B300 в Selectel?',
        answer:
          'Во вкладке GPU выберите пресет B300. Это выделенный узел (dedicated), не обычная облачная GPU-ВМ. Рядом — цены других провайдеров для выбранных параметров по публичным тарифам. Предложения могут различаться по модели предоставления ресурсов.',
      },
    ],
  }),
  buildProviderSeo({
    slug: 'cloud-ru',
    providerId: 'cloud-ru',
    brandDisplay: 'Cloud.ru',
    brandRu: 'Cloud.ru',
    brandEn: 'Cloud.ru',
    aliases: ['Клауд.ру', 'Cloud RU', 'облако Cloud.ru'],
    keywords: [
      'тарифы Cloud.ru',
      'тарифы Cloud RU',
      'калькулятор Cloud.ru',
      'цены Cloud.ru',
      'стоимость VM Cloud.ru',
      'стоимость GPU Cloud.ru',
      'сравнение тарифов Cloud.ru',
      'Cloud.ru или другие облака',
    ],
    faqExtra: [
      {
        question: 'Как считаются готовые конфигурации Cloud.ru?',
        answer:
          'Для Cloud.ru калькулятор берёт публичный тариф готовой ВМ или GPU из каталога и при необходимости добавляет диск отдельно, если он не входит в позицию. Месяц = 720 часов. Перед заказом сверьте условия на сайте провайдера.',
      },
    ],
  }),
  buildProviderSeo({
    slug: 'mws-cloud',
    providerId: 'mws-cloud',
    brandDisplay: 'MWS Cloud',
    brandRu: 'MWS Cloud',
    brandEn: 'MWS Cloud Platform',
    aliases: ['МВС Облако', 'МВС.Облако', 'MWS', 'МТС Web Services'],
    keywords: [
      'тарифы MWS Cloud',
      'тарифы MWS',
      'калькулятор MWS Cloud',
      'цены MWS Cloud',
      'стоимость VM MWS Cloud',
      'стоимость GPU MWS Cloud',
      'сравнение тарифов MWS Cloud',
      'MWS Cloud или другие облака',
    ],
  }),
  buildProviderSeo({
    slug: 't1-cloud',
    providerId: 't1-cloud',
    brandDisplay: 'T1 Cloud',
    brandRu: 'T1 Cloud',
    brandEn: 'T1 Cloud',
    aliases: ['Т1 Облако', 'Т1.Облако', 'T1', 'облако Т1'],
    keywords: [
      'тарифы T1 Cloud',
      'тарифы T1',
      'калькулятор T1 Cloud',
      'цены T1 Cloud',
      'стоимость VM T1 Cloud',
      'стоимость GPU T1 Cloud',
      'сравнение тарифов T1 Cloud',
      'T1 Cloud или другие облака',
    ],
  }),
];

export function getCalculatorProviderSeo(slug: string): CalculatorProviderSeo | undefined {
  return CALCULATOR_PROVIDER_SEO.find((p) => p.slug === slug);
}

export function calculatorProviderSlugs(): string[] {
  return CALCULATOR_PROVIDER_SEO.map((p) => p.slug);
}

/** Shared phrase for cross-links / hub copy. */
export function allProviderBrandsLabel(): string {
  return ALL_BRANDS;
}

export function providerCalculatorJsonLd(seo: CalculatorProviderSeo) {
  const url = `https://cloudfinops.ru/calculator/${seo.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name: seo.title,
        url,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description: seo.description,
        featureList: [
          `Публичные цены ${seo.brandDisplay}: расчёт и сравнение`,
          `Расчёт по публичным тарифам ${seo.brandDisplay}`,
          'Стоимость VM и GPU',
          'Сравнение с другими облаками России',
        ],
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'RUB'},
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: seo.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {'@type': 'Answer', text: item.answer},
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
          {
            '@type': 'ListItem',
            position: 3,
            name: seo.h1,
            item: url,
          },
        ],
      },
    ],
  };
}
