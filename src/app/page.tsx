import type {Metadata} from 'next';
import {HomeLanding} from '@/components/home/HomeLanding';

export const metadata: Metadata = {
  title: 'Cloud FinOps — сравнение цен облаков России',
  description:
    'Cloud FinOps: сравнение цен публичных облаков России — AI-ассистент, каталог SKU и калькулятор.',
  alternates: {
    canonical: '/',
  },
};

export default function HomePage() {
  return <HomeLanding />;
}
