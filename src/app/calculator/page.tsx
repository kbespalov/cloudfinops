import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {CalculatorSeo, calculatorJsonLd} from '@/components/calculator/CalculatorSeo';
import {
  getGpuCardPresets,
  getGpuFlavorPresets,
  getQuotesByPeriodSlim,
} from '@/lib/calculator/quotes-cache';

/** Static catalog-derived page — no per-request dynamic data. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор облаков и GPU — цены ВМ, H100, H200, A100',
  description:
    'Калькулятор стоимости облака в России: сравнение цен ВМ (vCPU, RAM, SSD) и аренды GPU NVIDIA L4, A100, H100, H200 у Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1. Best offer по публичным тарифам.',
  keywords: [
    'калькулятор облака',
    'калькулятор облаков',
    'калькулятор GPU',
    'аренда GPU',
    'аренда GPU H100',
    'аренда GPU H200',
    'аренда GPU A100',
    'цена GPU облако',
    'стоимость GPU H100',
    'стоимость ВМ',
    'цена vCPU',
    'сравнение цен облако',
    'сравнение облаков России',
    'калькулятор Yandex Cloud',
    'калькулятор Selectel',
    'калькулятор VK Cloud',
    'Cloud.ru цены',
    'MWS Cloud цены',
    'T1 Cloud цены',
    'FinOps калькулятор',
    'cloud calculator Russia',
    'GPU cloud pricing',
    'H100 cloud',
    'H200 cloud',
    'A100 cloud',
    'L4 GPU цена',
    'low-cost ВМ',
    'preemptible VM',
    'high CPU cloud',
    'high memory cloud',
  ],
  alternates: {
    canonical: '/calculator',
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
    url: '/calculator',
    siteName: 'Cloud FinOps',
    title: 'Калькулятор облаков и GPU — H100, H200, A100, ВМ · Cloud FinOps',
    description:
      'Сравните публичные цены на ВМ и аренду GPU (L4, A100, H100, H200) у облаков России. Best offer по пресетам compute и GPU.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор облаков и GPU · Cloud FinOps',
    description:
      'Цены на ВМ и GPU H100/H200/A100/L4: Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS, T1.',
  },
  category: 'technology',
};

export default function CalculatorRoute() {
  const gpuPresets = getGpuFlavorPresets();
  const gpuCardPresets = getGpuCardPresets();
  const quotesByPeriod = getQuotesByPeriodSlim();
  const jsonLd = calculatorJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage
        quotesByPeriod={quotesByPeriod}
        gpuPresets={gpuPresets}
        gpuCardPresets={gpuCardPresets}
      />
      <CalculatorSeo gpuPresets={gpuCardPresets} gpuShapeCount={gpuPresets.length} />
    </>
  );
}
