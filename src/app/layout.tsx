import type {Metadata} from 'next';
import {Suspense} from 'react';
import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
import './globals.css';
import {AppProviders} from '@/components/AppProviders';
import {YandexMetrika} from '@/components/YandexMetrika';

export const metadata: Metadata = {
  title: 'Cloud FinOps — каталог цен облаков РФ',
  description: 'Каталог SKU, калькулятор и новости облачного рынка',
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
