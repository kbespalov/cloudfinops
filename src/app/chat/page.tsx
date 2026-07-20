import type {Metadata} from 'next';
import {Suspense} from 'react';
import {ChatPage} from '@/components/chat/ChatPage';
import {ChatSeo, chatJsonLd} from '@/components/chat/ChatSeo';

export const metadata: Metadata = {
  title: 'ИИ-ассистент FinOps — чат по ценам облаков РФ, GPU, ВМ',
  description:
    'ИИ-ассистент FinOps: цены облаков РФ, расчёт GPU под инференс LLM (Qwen, GLM, Kimi, gpt-oss), сравнение ВМ, H100/H200/A100 и AI API. Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 — таблицы с НДС.',
  keywords: [
    'ИИ FinOps',
    'ИИ ассистент FinOps',
    'ИИ-ассистент FinOps',
    'AI ассистент FinOps',
    'FinOps ассистент',
    'ИИ рекомендательная система',
    'рекомендательная система облако',
    'ИИ аналитика цен',
    'аналитика цен облаков',
    'ИИ для облаков',
    'чат по ценам облаков',
    'AI ассистент облако',
    'искусственный интеллект FinOps',
    'подбор облачного провайдера',
    'калькулятор облака AI',
    'стоимость GPU облако',
    'сравнение цен облаков',
    'аренда GPU H100',
    'расчет GPU для инференса',
    'расчёт GPU для инференса',
    'расчет конфигурации под инференс',
    'сколько H100 для Qwen',
    'сколько GPU для GLM',
    'VRAM для Qwen',
    'self-host LLM в облаке',
    'подбор GPU под модель',
    'инференс LLM Россия',
    'GigaChat',
  ],
  alternates: {
    canonical: '/chat',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/chat',
    siteName: 'Cloud FinOps',
    title: 'ИИ-ассистент FinOps — цены облаков РФ · Cloud FinOps',
    description:
      'ИИ-чат по ценам облаков РФ: подбор ВМ/GPU, расчёт GPU под инференс LLM (Qwen, GLM, Kimi) и сравнение тарифов таблицами.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ИИ-ассистент FinOps · Cloud FinOps',
    description:
      'Спросите ИИ про цены облаков РФ — рекомендательная система и аналитика цен ответят таблицами с ценами (₽ с НДС).',
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
  category: 'technology',
};

export default function ChatRoute() {
  const jsonLd = chatJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <Suspense fallback={null}>
        <ChatPage />
      </Suspense>
      <ChatSeo />
    </>
  );
}
