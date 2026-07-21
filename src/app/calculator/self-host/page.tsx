import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {
  SelfHostCalculatorSeo,
  selfHostCalculatorJsonLd,
} from '@/components/calculator/CalculatorSeo';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор GPU H100 H200 B300 для Self-host LLM',
  description:
    'Калькулятор GPU под self-host LLM: сколько нужно H100, H200, A100, L4; аренда B300 (Selectel); квант INT4/FP8; сравнение цен в облаках РФ и ориентир Hosted API для Qwen, GLM, Kimi, DeepSeek.',
  keywords: [
    'калькулятор GPU',
    'калькулятор GPU для LLM',
    'калькулятор инференса',
    'калькулятор H100',
    'калькулятор H200',
    'калькулятор B300',
    'калькулятор A100',
    'H100 для LLM',
    'H200 для LLM',
    'B300 для LLM',
    'self-host LLM',
    'self-host LLM GPU',
    'GPU под LLM',
    'расчет GPU для инференса',
    'сколько GPU нужно для модели',
    'сколько H100 для Qwen',
    'аренда GPU H100',
    'аренда GPU H200',
    'аренда GPU B300',
    'аренда NVIDIA B300',
    'аренда NVIDIA H100',
    'стоимость H100 Россия',
    'стоимость B300 Selectel',
    'инференс на H100',
    'инференс на H200',
    'инференс LLM облако',
    'Qwen GPU',
    'Qwen H100',
    'GLM GPU',
    'Kimi GPU',
    'DeepSeek GPU',
    'калькулятор self-host',
    'сравнение GPU облака Россия',
    'калькулятор Яндекс.Облако GPU',
    'калькулятор VK Cloud GPU',
    'калькулятор MWS GPU',
    'калькулятор T1 Cloud GPU',
  ],
  alternates: {
    canonical: '/calculator/self-host',
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
    url: '/calculator/self-host',
    siteName: 'Cloud FinOps',
    title: 'Self-host LLM · H100 H200 B300 · Cloud FinOps',
    description:
      'Подберите H100, H200, A100 или B300 под open-weight модель и сравните аренду в облаках России.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор Self-host LLM H100 H200 B300',
    description:
      'Конфиг GPU под Qwen/GLM/Kimi: H100, H200, B300, квант и цены в облаках РФ.',
  },
  category: 'technology',
};

export default function CalculatorSelfHostRoute() {
  const jsonLd = selfHostCalculatorJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage mode="inference" />
      <SelfHostCalculatorSeo />
    </>
  );
}
