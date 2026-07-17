import type {Metadata} from 'next';
import {AboutPage} from '@/components/about/AboutPage';

export const metadata: Metadata = {
  title: 'О нас',
  description:
    'Cloud FinOps — открытое сообщество и FinOps-инструменты для сравнения цен облаков в России: каталог SKU, калькулятор и новости рынка.',
  keywords: ['FinOps', 'FinOps инструменты', 'сообщество FinOps', 'Cloud FinOps'],
  alternates: {
    canonical: '/about',
  },
};

export default function AboutRoute() {
  return <AboutPage />;
}
