import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';

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
  return <CalculatorPage />;
}
