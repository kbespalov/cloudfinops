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
    title: `Калькулятор публичных цен ${brandDisplay} — Cloud FinOps`,
    description: `Независимый расчёт стоимости VM и GPU по публичным тарифам ${brandDisplay}. Сравнение стоимости с предложениями других облачных провайдеров.`,
    keywords: input.keywords,
    h1: `Калькулятор публичных цен ${brandDisplay}`,
    lead: `Рассчитайте стоимость VM и GPU в ${brandDisplay} и сравните её с публичными тарифами других облачных провайдеров.`,
    intro: `На этой странице можно оценить стоимость виртуальных машин и GPU по публичным тарифам ${brandDisplay} и сравнить расчёт с предложениями других облачных провайдеров. Индивидуальные скидки, специальные договорные условия и промоакции не учитываются.`,
    independenceNote: `Cloud FinOps — независимый аналитический сервис. Страница не является официальным калькулятором ${brandDisplay}.`,
    faq: [
      {
        question: `Что рассчитывает калькулятор публичных цен ${brandDisplay}?`,
        answer: `Калькулятор оценивает стоимость VM и GPU по публичным тарифам ${brandDisplay} и показывает цены других провайдеров для выбранных параметров.`,
      },
      {
        question: `Как посчитать стоимость ВМ в ${brandDisplay}?`,
        answer: `Выберите пресет или параметры (например 4 vCPU / 16 GiB) на этой странице. Калькулятор соберёт цену по публичным тарифам ${brandDisplay} и покажет сравнение с другими провайдерами. Расчётный месяц = 720 часов. Для каждого тарифа используется налоговый статус, указанный в каталоге и источнике цены.`,
      },
      {
        question: `Является ли Cloud FinOps официальным калькулятором ${brandDisplay}?`,
        answer: `Нет. Cloud FinOps — независимый аналитический сервис. Перед заказом проверьте итоговую стоимость и доступность ресурсов на официальном сайте провайдера.`,
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
    aliases: ['Яндекс Облако', 'Yandex.Cloud', 'облако Яндекс', 'калькулятор Яндекс.Облако'],
    keywords: [
      'калькулятор Yandex Cloud',
      'калькулятор Яндекс.Облако',
      'калькулятор Яндекс Облако',
      'калькулятор публичных цен Yandex Cloud',
      'цена ВМ Яндекс.Облако',
      'стоимость ВМ Yandex Cloud',
      'аренда GPU Яндекс.Облако',
      'калькулятор GPU Yandex Cloud',
      'H100 Яндекс.Облако',
      'сравнение цен Yandex Cloud',
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
      'калькулятор VK Cloud',
      'калькулятор ВК Облако',
      'калькулятор ВК.Облако',
      'калькулятор публичных цен VK Cloud',
      'цена ВМ VK Cloud',
      'стоимость ВМ VK Cloud',
      'аренда GPU VK Cloud',
      'калькулятор GPU VK Cloud',
      'H100 VK Cloud',
      'сравнение цен VK Cloud',
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
      'калькулятор Selectel',
      'калькулятор Селектел',
      'калькулятор публичных цен Selectel',
      'стоимость B300 Selectel',
      'аренда B300 Selectel',
      'цена ВМ Selectel',
      'аренда GPU Selectel',
      'H100 Selectel',
      'H200 Selectel',
      'сравнение цен Selectel',
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
      'калькулятор Cloud.ru',
      'калькулятор Cloud RU',
      'калькулятор Клауд.ру',
      'калькулятор публичных цен Cloud.ru',
      'цена ВМ Cloud.ru',
      'стоимость ВМ Cloud.ru',
      'аренда GPU Cloud.ru',
      'H100 Cloud.ru',
      'сравнение цен Cloud.ru',
      'тарифы Cloud.ru калькулятор',
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
      'калькулятор MWS',
      'калькулятор MWS Cloud',
      'калькулятор МВС Облако',
      'калькулятор публичных цен MWS Cloud',
      'цена ВМ MWS',
      'стоимость ВМ MWS Cloud',
      'аренда GPU MWS',
      'H100 MWS Cloud',
      'сравнение цен MWS Cloud',
      'тарифы MWS калькулятор',
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
      'калькулятор T1 Cloud',
      'калькулятор T1',
      'калькулятор Т1 Облако',
      'калькулятор публичных цен T1 Cloud',
      'цена ВМ T1 Cloud',
      'стоимость ВМ T1',
      'аренда GPU T1 Cloud',
      'H100 T1 Cloud',
      'сравнение цен T1 Cloud',
      'тарифы T1 калькулятор',
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
        name: `Cloud FinOps — калькулятор публичных цен ${seo.brandDisplay}`,
        url,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description: seo.description,
        featureList: [
          `Расчёт по публичным тарифам ${seo.brandDisplay}`,
          'Сравнение стоимости облачных ресурсов',
          'Расчёт стоимости VM и доступных GPU',
          'Пояснение структуры итоговой цены',
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
