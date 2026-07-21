import type {CalculatorProviderId} from '@/lib/calculator/quote-view';

export type ProviderFaqItem = {
  question: string;
  answer: string;
};

export type CalculatorProviderSeo = {
  /** URL slug under /calculator/{slug} */
  slug: string;
  providerId: CalculatorProviderId;
  /** Primary Russian brand for titles / H1 */
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
  faq: ProviderFaqItem[];
};

const ALL_BRANDS =
  'Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS Cloud и T1 Cloud';

export const CALCULATOR_PROVIDER_SEO: CalculatorProviderSeo[] = [
  {
    slug: 'yandex-cloud',
    providerId: 'yandex-cloud',
    brandRu: 'Яндекс.Облако',
    brandEn: 'Yandex Cloud',
    aliases: ['Яндекс Облако', 'Yandex.Cloud', 'облако Яндекс'],
    title: 'Калькулятор Яндекс.Облако — цены ВМ и GPU',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в Яндекс.Облаке (Yandex Cloud): сравнение с VK Cloud, Selectel, Cloud.ru, MWS и T1 по публичным тарифам Cloud FinOps.',
    keywords: [
      'калькулятор Яндекс.Облако',
      'калькулятор Яндекс Облако',
      'калькулятор Yandex Cloud',
      'цена ВМ Яндекс.Облако',
      'стоимость ВМ Яндекс.Облако',
      'аренда GPU Яндекс.Облако',
      'калькулятор GPU Яндекс.Облако',
      'H100 Яндекс.Облако',
      'сравнение цен Яндекс.Облако',
      'тарифы Яндекс.Облако калькулятор',
    ],
    h1: 'Калькулятор Яндекс.Облако',
    lead: 'Цены ВМ и GPU в Яндекс.Облаке рядом с другими облаками РФ',
    intro:
      'Считайте виртуальные машины и аренду NVIDIA GPU в Яндекс.Облаке (Yandex Cloud) на тех же пресетах, что и у остальных провайдеров РФ. Best offer показывает, где конфигурация дешевле по открытому каталогу — без промо и закрытых прайсов.',
    faq: [
      {
        question: 'Есть ли калькулятор для Яндекс.Облака?',
        answer:
          'Да. На этой странице — калькулятор ВМ и GPU с колонкой Яндекс.Облако (Yandex Cloud) и сравнением с VK Cloud, Selectel, Cloud.ru, MWS и T1 Cloud по публичным тарифам.',
      },
      {
        question: 'Как посчитать стоимость ВМ в Яндекс.Облаке?',
        answer:
          'Выберите пресет (например 4/16 или 8/32) или вкладку GPU. Калькулятор соберёт unit-тариф vCPU + RAM + диск (или flavor) для Yandex Cloud и покажет итог рядом с другими облаками. Месяц = 720 часов.',
      },
      {
        question: 'Можно ли сравнить Яндекс.Облако с Selectel и VK Cloud?',
        answer:
          'Да — это основная задача калькулятора: одна конфигурация, шесть провайдеров, Best offer по минимальной ордерабельной цене в каталоге Cloud FinOps.',
      },
    ],
  },
  {
    slug: 'vk-cloud',
    providerId: 'vk-cloud',
    brandRu: 'VK Cloud',
    brandEn: 'VK Cloud',
    aliases: ['ВК Облако', 'ВК.Облако', 'Cloud VK', 'VK.Cloud'],
    title: 'Калькулятор VK Cloud — цены ВМ и GPU',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в VK Cloud (ВК Облако): сравнение с Яндекс.Облаком, Selectel, Cloud.ru, MWS и T1 по публичным тарифам.',
    keywords: [
      'калькулятор VK Cloud',
      'калькулятор ВК Облако',
      'калькулятор ВК.Облако',
      'цена ВМ VK Cloud',
      'стоимость ВМ VK Cloud',
      'аренда GPU VK Cloud',
      'калькулятор GPU VK Cloud',
      'H100 VK Cloud',
      'сравнение цен VK Cloud',
      'тарифы VK Cloud калькулятор',
    ],
    h1: 'Калькулятор VK Cloud',
    lead: 'Цены ВМ и GPU в VK Cloud рядом с другими облаками РФ',
    intro:
      'Оцените виртуальные машины и GPU-формы VK Cloud (ВК Облако) в одном сравнении с Яндекс.Облаком, Selectel, Cloud.ru, MWS и T1. Публичные SKU, единая таксономия, Best offer без ручного сбора прайсов.',
    faq: [
      {
        question: 'Есть ли калькулятор для VK Cloud?',
        answer:
          'Да. Страница считает ВМ и аренду GPU с колонкой VK Cloud и сравнивает результат с Яндекс.Облаком, Selectel, Cloud.ru, MWS и T1 Cloud.',
      },
      {
        question: 'Как узнать цену GPU в VK Cloud?',
        answer:
          'Откройте вкладку GPU, выберите пресет (L4, A100, H100, H200 и др.). Калькулятор покажет цену VK Cloud и Best offer среди облаков России по каталогу Cloud FinOps.',
      },
      {
        question: 'Чем калькулятор Cloud FinOps отличается от калькулятора VK?',
        answer:
          'Официальный калькулятор VK считает только свой прайс. Здесь одна конфигурация сравнивается сразу с несколькими облаками РФ.',
      },
    ],
  },
  {
    slug: 'selectel',
    providerId: 'selectel',
    brandRu: 'Selectel',
    brandEn: 'Selectel',
    aliases: ['Селектел', 'Selectel Cloud', 'облако Selectel'],
    title: 'Калькулятор Selectel — цены ВМ и GPU B300',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в Selectel: H100, H200, выделенный B300 и сравнение с Яндекс.Облаком, VK Cloud, Cloud.ru, MWS и T1.',
    keywords: [
      'калькулятор Selectel',
      'калькулятор Селектел',
      'стоимость B300 Selectel',
      'аренда B300 Selectel',
      'цена ВМ Selectel',
      'аренда GPU Selectel',
      'H100 Selectel',
      'H200 Selectel',
      'сравнение цен Selectel',
      'тарифы Selectel калькулятор',
    ],
    h1: 'Калькулятор Selectel',
    lead: 'ВМ, H100/H200 и dedicated B300 Selectel vs облака РФ',
    intro:
      'Считайте ВМ и GPU Selectel — включая выделенный узел NVIDIA B300 — и сразу видите, как цена выглядит рядом с Яндекс.Облаком, VK Cloud, Cloud.ru, MWS и T1 Cloud.',
    faq: [
      {
        question: 'Есть ли калькулятор для Selectel?',
        answer:
          'Да. На странице сравниваются ВМ и GPU Selectel с другими облаками РФ; для B300 показывается dedicated-узел из публичного каталога.',
      },
      {
        question: 'Как посчитать аренду B300 в Selectel?',
        answer:
          'Во вкладке GPU выберите пресет B300. Это bundle выделенного 8×B300, не обычная облачная GPU-ВМ. Рядом — цены H100/H200 и альтернативы у других провайдеров.',
      },
      {
        question: 'Можно ли сравнить Selectel с Яндекс.Облаком?',
        answer:
          'Да — одна и та же конфигурация ВМ или GPU считается для Selectel и Яндекс.Облака (и остальных) с общим Best offer.',
      },
    ],
  },
  {
    slug: 'cloud-ru',
    providerId: 'cloud-ru',
    brandRu: 'Cloud.ru',
    brandEn: 'Cloud.ru',
    aliases: ['Клауд.ру', 'Cloud RU', 'облако Cloud.ru'],
    title: 'Калькулятор Cloud.ru — цены ВМ и GPU',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в Cloud.ru: flavor и unit-тарифы, сравнение с Яндекс.Облаком, VK Cloud, Selectel, MWS и T1.',
    keywords: [
      'калькулятор Cloud.ru',
      'калькулятор Cloud RU',
      'калькулятор Клауд.ру',
      'цена ВМ Cloud.ru',
      'стоимость ВМ Cloud.ru',
      'аренда GPU Cloud.ru',
      'H100 Cloud.ru',
      'сравнение цен Cloud.ru',
      'тарифы Cloud.ru калькулятор',
    ],
    h1: 'Калькулятор Cloud.ru',
    lead: 'Цены ВМ и GPU Cloud.ru рядом с другими облаками РФ',
    intro:
      'Cloud.ru часто отдаёт готовые flavor-ВМ и GPU. Калькулятор раскладывает их рядом с unit-сборками других провайдеров, чтобы сравнивать Яндекс.Облако, VK Cloud, Selectel, MWS и T1 на одной сетке.',
    faq: [
      {
        question: 'Есть ли калькулятор для Cloud.ru?',
        answer:
          'Да. Страница считает ВМ и GPU Cloud.ru и сравнивает с Яндекс.Облаком, VK Cloud, Selectel, MWS и T1 Cloud по публичным SKU.',
      },
      {
        question: 'Как считаются flavor Cloud.ru?',
        answer:
          'Для Cloud.ru калькулятор берёт готовую ВМ/GPU из каталога и при необходимости добавляет диск отдельно, если он не входит в SKU. Месяц = 720 часов.',
      },
      {
        question: 'Можно ли сравнить Cloud.ru с Selectel по H100?',
        answer:
          'Да — во вкладке GPU выберите пресет H100: увидите цену Cloud.ru и Best offer среди облаков России.',
      },
    ],
  },
  {
    slug: 'mws-cloud',
    providerId: 'mws-cloud',
    brandRu: 'MWS Cloud',
    brandEn: 'MWS Cloud Platform',
    aliases: ['МВС Облако', 'МВС.Облако', 'MWS', 'МТС Web Services'],
    title: 'Калькулятор MWS Cloud — цены ВМ и GPU',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в MWS Cloud (МВС Облако): сравнение с Яндекс.Облаком, VK Cloud, Selectel, Cloud.ru и T1 по публичным тарифам.',
    keywords: [
      'калькулятор MWS',
      'калькулятор MWS Cloud',
      'калькулятор МВС Облако',
      'калькулятор МВС.Облако',
      'цена ВМ MWS',
      'стоимость ВМ MWS Cloud',
      'аренда GPU MWS',
      'H100 MWS Cloud',
      'сравнение цен MWS Cloud',
      'тарифы MWS калькулятор',
    ],
    h1: 'Калькулятор MWS Cloud',
    lead: 'Цены ВМ и GPU в MWS Cloud (МВС) рядом с облаками РФ',
    intro:
      'Считайте виртуальные машины и GPU в MWS Cloud Platform (МВС Облако) и сразу сравнивайте с Яндекс.Облаком, VK Cloud, Selectel, Cloud.ru и T1 Cloud — единые пресеты, публичный каталог, Best offer.',
    faq: [
      {
        question: 'Есть ли калькулятор для MWS Cloud / МВС Облако?',
        answer:
          'Да. На странице есть колонка MWS Cloud Platform и сравнение с другими облаками РФ по публичным тарифам Cloud FinOps.',
      },
      {
        question: 'Как посчитать ВМ в MWS?',
        answer:
          'Выберите пресет Compute (General, High CPU, High Memory или Low-cost). Калькулятор покажет цену MWS и Best offer среди провайдеров. Месяц = 720 часов.',
      },
      {
        question: 'Можно ли сравнить MWS с Яндекс.Облаком?',
        answer:
          'Да — одна конфигурация считается для MWS Cloud и Яндекс.Облака (и остальных) в одной таблице.',
      },
    ],
  },
  {
    slug: 't1-cloud',
    providerId: 't1-cloud',
    brandRu: 'T1 Cloud',
    brandEn: 'T1 Cloud',
    aliases: ['Т1 Облако', 'Т1.Облако', 'T1', 'облако Т1'],
    title: 'Калькулятор T1 Cloud — цены ВМ и GPU',
    description:
      'Калькулятор стоимости ВМ и аренды GPU в T1 Cloud (Т1 Облако): сравнение с Яндекс.Облаком, VK Cloud, Selectel, Cloud.ru и MWS по публичным тарифам.',
    keywords: [
      'калькулятор T1 Cloud',
      'калькулятор T1',
      'калькулятор Т1 Облако',
      'калькулятор Т1.Облако',
      'цена ВМ T1 Cloud',
      'стоимость ВМ T1',
      'аренда GPU T1 Cloud',
      'H100 T1 Cloud',
      'сравнение цен T1 Cloud',
      'тарифы T1 калькулятор',
    ],
    h1: 'Калькулятор T1 Cloud',
    lead: 'Цены ВМ и GPU в T1 Cloud рядом с другими облаками РФ',
    intro:
      'Оцените ВМ и аренду GPU в T1 Cloud (Т1 Облако) на общих пресетах с Яндекс.Облаком, VK Cloud, Selectel, Cloud.ru и MWS. Публичные SKU, Best offer, без ручного сведения прайсов.',
    faq: [
      {
        question: 'Есть ли калькулятор для T1 Cloud?',
        answer:
          'Да. Страница считает ВМ и GPU с колонкой T1 Cloud и сравнивает результат с Яндекс.Облаком, VK Cloud, Selectel, Cloud.ru и MWS.',
      },
      {
        question: 'Как узнать цену H100 в T1 Cloud?',
        answer:
          'Во вкладке GPU выберите пресет H100 (1× или 8×). Калькулятор покажет цену T1 и Best offer среди облаков России.',
      },
      {
        question: 'Чем калькулятор Cloud FinOps отличается от калькулятора T1?',
        answer:
          'Калькулятор T1 считает только свой прайс. Здесь одна конфигурация сравнивается сразу с несколькими облаками РФ.',
      },
    ],
  },
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
        name: `${seo.h1} · Cloud FinOps`,
        url,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description: seo.description,
        featureList: [
          `Калькулятор ${seo.brandRu}`,
          'Сравнение цен облаков России',
          'Калькулятор стоимости ВМ',
          'Калькулятор аренды GPU',
          'H100 H200 B300 A100 L4',
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
