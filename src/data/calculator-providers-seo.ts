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
  /** Short visible independence phrase under the hero lead */
  independenceNote: string;
  /** Full disclaimer for tooltip near independenceNote */
  independenceTooltip: string;
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
    // SERP: калькулятор стоимости + бренд + Cloud FinOps (не «официальный прайс»).
    title: `Калькулятор стоимости ${brandDisplay} — Cloud FinOps`,
    description: `Рассчитайте стоимость виртуальных машин, GPU и других облачных ресурсов по опубликованным тарифам ${brandDisplay} и сравните с другими провайдерами. Независимый расчёт Cloud FinOps; скидки и промо не учитываются.`,
    keywords: input.keywords,
    h1: `Калькулятор стоимости ${brandDisplay}`,
    lead: `Рассчитайте стоимость облачных ресурсов ${brandDisplay} и сравните её с предложениями других провайдеров.`,
    intro:
      'Расчёт выполняется по опубликованным тарифам. Индивидуальные скидки, промоакции и специальные условия договоров не учитываются. Предложения провайдеров могут различаться по характеристикам и модели предоставления ресурсов.',
    independenceNote: 'Независимый расчёт по открытым тарифам',
    independenceTooltip:
      `Cloud FinOps не связан с ${brandDisplay}. Итоговая цена у провайдера может отличаться.`,
    faq: [
      {
        question: 'Откуда берутся цены?',
        answer:
          'Из опубликованных тарифов и документации провайдеров, собранных в каталоге Cloud FinOps. Перед заказом проверьте актуальные условия на сайте провайдера.',
      },
      {
        question: 'Что считает калькулятор?',
        answer:
          'Стоимость выбранной конфигурации и ориентировочное сравнение предложений других облачных провайдеров с близкими выбранными параметрами. Характеристики и условия предоставления ресурсов могут различаться.',
      },
      {
        question: 'Как рассчитывается месяц?',
        answer:
          'Почасовые тарифы пересчитываются в месяц как 720 часов. Если в источнике цена уже помесячная, берётся она.',
      },
      {
        question: `Это официальный калькулятор ${brandDisplay}?`,
        answer: `Нет. Cloud FinOps — независимый информационно-аналитический сервис и не связан с ${brandDisplay}.`,
      },
      {
        question: 'Как рассчитывается GPU?',
        answer:
          'Учитываются модель ускорителя и формат предоставления: отдельная тарификация GPU и готовые конфигурации сравниваются в разных группах, а не смешиваются в одну цену.',
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
          `Калькулятор стоимости ${seo.brandDisplay}`,
          `Расчёт по опубликованным тарифам ${seo.brandDisplay}`,
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
