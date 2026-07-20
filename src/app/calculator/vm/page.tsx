import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {VmCalculatorSeo, vmCalculatorJsonLd} from '@/components/calculator/CalculatorSeo';
import {getGpuCardPresets, getGpuFlavorPresets} from '@/lib/calculator/quotes-cache';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор ВМ и GPU H100 H200 B300 — цены облаков России',
  description:
    'Калькулятор стоимости ВМ и аренды GPU NVIDIA: H100, H200, B300, A100, L4, V100. Сравнение цен Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 по публичным тарифам.',
  keywords: [
    'калькулятор облака',
    'калькулятор облаков',
    'калькулятор ВМ',
    'калькулятор стоимости ВМ',
    'калькулятор GPU',
    'калькулятор H100',
    'калькулятор H200',
    'калькулятор B300',
    'калькулятор A100',
    'калькулятор L4',
    'аренда GPU',
    'аренда GPU H100',
    'аренда GPU H200',
    'аренда GPU B300',
    'аренда NVIDIA B300',
    'аренда NVIDIA H100',
    'аренда NVIDIA H200',
    'аренда A100',
    'аренда L4',
    'стоимость H100 Россия',
    'стоимость B300 Selectel',
    'цена GPU облако',
    'стоимость ВМ',
    'цена vCPU',
    'сравнение цен облако',
    'сравнение облаков России',
    'калькулятор Yandex Cloud',
    'калькулятор Selectel',
    'калькулятор Cloud.ru',
    'FinOps калькулятор',
  ],
  alternates: {
    canonical: '/calculator/vm',
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
    url: '/calculator/vm',
    siteName: 'Cloud FinOps',
    title: 'Калькулятор ВМ и GPU H100 / H200 / B300 · Cloud FinOps',
    description:
      'Сравните цены на ВМ и аренду NVIDIA H100, H200, B300, A100, L4 у облаков России.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор ВМ и GPU H100 H200 B300 · Cloud FinOps',
    description:
      'Цены H100, H200, B300, A100, L4 и ВМ: Yandex, VK, Selectel, Cloud.ru, MWS, T1.',
  },
  category: 'technology',
};

export default function CalculatorVmRoute() {
  const gpuPresets = getGpuFlavorPresets();
  const gpuCardPresets = getGpuCardPresets();
  const jsonLd = vmCalculatorJsonLd(gpuPresets.length);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage mode="vm" gpuPresets={gpuCardPresets} />
      <VmCalculatorSeo gpuPresets={gpuCardPresets} gpuShapeCount={gpuPresets.length} />
    </>
  );
}
