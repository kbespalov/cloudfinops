import type {Metadata} from 'next';
import {Suspense} from 'react';
import {Inter} from 'next/font/google';
import '@gravity-ui/uikit/styles/styles.css';
import '@gravity-ui/aikit/styles';
import './globals.css';
import {AppProviders} from '@/components/AppProviders';
import {YandexMetrika} from '@/components/YandexMetrika';
import {THEME_BOOT_SCRIPT} from '@/lib/theme-boot';

const SITE_URL = 'https://cloudfinops.ru';

/** Self-hosted Inter (no Google Fonts @import) — same family Gravity expects. */
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Cloud FinOps — цены облаков РФ, каталог SKU и FinOps-инструменты',
    template: '%s · Cloud FinOps',
  },
  description:
    'Сравнение цен публичных облаков России: каталог SKU Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1. Цены на vCPU, GPU, диски, хранилище. FinOps-инструменты, калькулятор облаков и ИИ-ассистент FinOps, который отвечает на вопросы о стоимости облаков.',
  applicationName: 'Cloud FinOps',
  keywords: [
    'FinOps',
    'FinOps инструменты',
    'ИИ-ассистент FinOps',
    'ИИ FinOps',
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
    // Yandex: file named favicon in site root + link in <head>.
    // Prefer SVG / 120×120; keep a single controlled set (no src/app/favicon.* —
    // Next.js file icons inject a conflicting first <link> and the robot may pick any).
    // https://yandex.ru/support/webmaster/ru/search-results/favicon
    icon: [
      {url: `${SITE_URL}/favicon.svg`, type: 'image/svg+xml'},
      {url: `${SITE_URL}/favicon-120.png`, sizes: '120x120', type: 'image/png'},
      {url: `${SITE_URL}/favicon.png`, sizes: '120x120', type: 'image/png'},
      {url: `${SITE_URL}/favicon-32.png`, sizes: '32x32', type: 'image/png'},
      {url: `${SITE_URL}/favicon-16.png`, sizes: '16x16', type: 'image/png'},
      {url: `${SITE_URL}/favicon.ico`, sizes: 'any', type: 'image/x-icon'},
    ],
    shortcut: [{url: `${SITE_URL}/favicon.ico`, type: 'image/x-icon'}],
    apple: [
      {url: `${SITE_URL}/apple-touch-icon.png`, sizes: '180x180', type: 'image/png'},
    ],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{__html: THEME_BOOT_SCRIPT}} />
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
