import type {Metadata} from 'next';
import {Suspense} from 'react';
import {ChatPage} from '@/components/chat/ChatPage';
import {ChatSeo, chatJsonLd} from '@/components/chat/ChatSeo';

export const metadata: Metadata = {
  title: 'ИИ-ассистент FinOps — чат по ценам облаков РФ, GPU, ВМ',
  description:
    'ИИ-ассистент FinOps: спросите про цены облаков России и получите ответ таблицей. Рекомендательная система подбирает оптимального провайдера, аналитика цен сравнивает ВМ, GPU (H100, H200, A100, B300), хранилище, трафик и AI-модели у Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
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
      'Специализированный ИИ-чат по ценам облаков России: рекомендательная система и аналитика цен ищут по каталогу, считают конфигурации и отвечают таблицами.',
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
