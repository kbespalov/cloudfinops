import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {buildQuotesByPeriod} from '@/lib/calculator/quote';

export const metadata: Metadata = {
  title: 'Калькулятор',
  description:
    'Пресеты облачных ВМ и GPU: General, High CPU, High Memory и GPU-конфигурации. Best offer по публичным ценам российских облаков.',
  keywords: [
    'калькулятор облака',
    'стоимость ВМ',
    'аренда GPU',
    'сравнение цен облако',
    'FinOps калькулятор',
  ],
  alternates: {
    canonical: '/calculator',
  },
};

export default function CalculatorRoute() {
  // Server-side: one pass over the catalog for all periods. Client gets lean JSON only.
  const quotesByPeriod = buildQuotesByPeriod();
  return <CalculatorPage quotesByPeriod={quotesByPeriod} />;
}
