import type {Metadata} from 'next';
import {Suspense} from 'react';
import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
import './globals.css';
import {AppProviders} from '@/components/AppProviders';
import {YandexMetrika} from '@/components/YandexMetrika';

const SITE_URL = 'https://cloudfinops.ru';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Cloud FinOps — цены облаков РФ, каталог SKU и FinOps-инструменты',
    template: '%s · Cloud FinOps',
  },
  description:
    'Сравнение цен публичных облаков России: каталог SKU Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1. Цены на vCPU, GPU, диски, хранилище. FinOps-инструменты и калькулятор облаков.',
  applicationName: 'Cloud FinOps',
  keywords: [
    'FinOps',
    'FinOps инструменты',
    'каталог SKU',
    'SKU облако',
    'цена облака',
    'цены облаков',
    'калькулятор облаков',
    'сравнение облаков',
    'стоимость облака',
    'облако цена',
    'Yandex Cloud цены',
    'VK Cloud цены',
    'Selectel цены',
    'Cloud.ru цены',
    'MWS Cloud',
    'T1 Cloud',
    'vCPU цена',
    'GPU облако',
    'object storage цена',
    'cloud pricing Russia',
  ],
  authors: [{name: 'Cloud FinOps', url: SITE_URL}],
  creator: 'Cloud FinOps',
  publisher: 'Cloud FinOps',
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: 'Cloud FinOps',
    title: 'Cloud FinOps — цены облаков РФ и каталог SKU',
    description:
      'Каталог SKU и сравнение цен облаков России. FinOps-инструменты для прозрачной оценки стоимости инфраструктуры.',
  },
  twitter: {
    card: 'summary',
    title: 'Cloud FinOps — цены облаков РФ и каталог SKU',
    description:
      'Сравнение SKU и цен публичных облаков России. FinOps-инструменты и калькулятор облаков.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      {url: '/favicon.ico', sizes: 'any'},
      {url: '/favicon.svg', type: 'image/svg+xml'},
      {url: '/favicon-32.png', sizes: '32x32', type: 'image/png'},
      {url: '/icon-192.png', sizes: '192x192', type: 'image/png'},
    ],
    apple: [{url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png'}],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <AppProviders>
          {children}
          <Suspense fallback={null}>
            <YandexMetrika />
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
