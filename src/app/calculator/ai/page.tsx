import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'AI-конфигурация — калькулятор цены облака',
  description:
    'Опишите конфигурацию облака текстом: ВМ, GPU или lakehouse. Калькулятор покажет минимальную расчётную цену и альтернативы провайдеров по публичным тарифам с НДС.',
  alternates: {
    canonical: '/calculator/ai',
  },
};

export default function CalculatorAiPage() {
  return <CalculatorPage mode="ai" />;
}
