import type {Metadata} from 'next';
import {HomeLanding} from '@/components/home/HomeLanding';
import {HomeSeo, homeJsonLd} from '@/components/home/HomeSeo';

export const metadata: Metadata = {
  title: 'Cloud FinOps — сравнение цен облаков России',
  description:
    'Сравнение цен облаков России: калькулятор ВМ и GPU, расчёт конфигурации под инференс LLM (Qwen, GLM, Kimi), каталог SKU. Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 — публичные тарифы в рублях с НДС.',
  keywords: [
    'сравнение цен облаков России',
    'сравнение облаков',
    'калькулятор цены облака',
    'калькулятор цен облака',
    'калькулятор стоимости облака',
    'калькулятор облаков',
    'расчет стоимости облака',
    'расчёт стоимости облака',
    'стоимость облака',
    'цены облаков',
    'цена облака',
    'цена облака калькулятор',
    'калькулятор ВМ',
    'калькулятор GPU',
    'расчет GPU для инференса',
    'расчёт GPU для инференса',
    'расчет конфигурации под инференс',
    'сколько GPU для LLM',
    'VRAM для модели',
    'self-host LLM GPU',
    'GPU для Qwen',
    'GPU для GLM',
    'инференс в облаке РФ',
    'Yandex Cloud цены',
    'VK Cloud цены',
    'Selectel цены',
    'Cloud.ru цены',
    'MWS Cloud цены',
    'T1 Cloud цены',
    'FinOps',
    'cloud pricing Russia',
  ],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Cloud FinOps',
    title: 'Cloud FinOps — сравнение цен облаков России',
    description:
      'Калькулятор ВМ и GPU, расчёт конфигурации под инференс LLM и сравнение тарифов шести облаков РФ по публичным SKU.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cloud FinOps — сравнение цен облаков России',
    description:
      'Сравните цены облаков России: калькулятор ВМ/GPU, каталог SKU и ИИ-ассистент FinOps.',
  },
  category: 'technology',
};

export default function HomePage() {
  const jsonLd = homeJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <HomeLanding />
      <HomeSeo />
    </>
  );
}
