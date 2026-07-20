import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {CalculatorSeo, calculatorJsonLd} from '@/components/calculator/CalculatorSeo';
import {getGpuCardPresets, getGpuFlavorPresets} from '@/lib/calculator/quotes-cache';

/** Static shell — live quotes load client-side via /api/calculator/*. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор облаков и GPU — ВМ и AI inference',
  description:
    'Калькулятор стоимости облака в России: виртуальные машины (vCPU, RAM, SSD) и подбор GPU под open-source LLM (Qwen, GLM, Kimi). Сравнение Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
  keywords: [
    'калькулятор облака',
    'калькулятор облаков',
    'калькулятор GPU',
    'AI inference calculator',
    'калькулятор инференса',
    'расчет GPU для инференса',
    'GPU под LLM',
    'self-host LLM GPU',
    'аренда GPU',
    'аренда GPU H100',
    'аренда GPU H200',
    'стоимость ВМ',
    'цена vCPU',
    'сравнение цен облако',
    'сравнение облаков России',
    'калькулятор Yandex Cloud',
    'калькулятор Selectel',
    'FinOps калькулятор',
    'cloud calculator Russia',
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
    title: 'Калькулятор ВМ и AI inference · Cloud FinOps',
    description:
      'Сравните цены на ВМ и подберите GPU под open-weight модели у облаков России.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор ВМ и AI inference · Cloud FinOps',
    description:
      'Цены на ВМ и GPU под LLM: Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS, T1.',
  },
  category: 'technology',
};

export default function CalculatorRoute() {
  const gpuPresets = getGpuFlavorPresets();
  const gpuCardPresets = getGpuCardPresets();
  const jsonLd = calculatorJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage />
      <CalculatorSeo gpuPresets={gpuCardPresets} gpuShapeCount={gpuPresets.length} />
    </>
  );
}
