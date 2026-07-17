import type {Metadata} from 'next';
import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
import './globals.css';
import {AppProviders} from '@/components/AppProviders';

export const metadata: Metadata = {
  title: 'Cloud FinOps — каталог цен облаков РФ',
  description: 'Каталог SKU, калькулятор и новости облачного рынка',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
