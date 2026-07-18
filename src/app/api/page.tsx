import type {Metadata} from 'next';
import {ApiPage} from '@/components/api/ApiPage';

export const metadata: Metadata = {
  title: 'API сравнения облачных ресурсов — в разработке',
  description:
    'Будущий Cloud FinOps API: одна конфигурация ресурсов для сравнения цен и доступности в Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud, Selectel и MWS.',
  keywords: [
    'cloud API',
    'FinOps API',
    'сравнение облаков API',
    'калькулятор облачных ресурсов API',
  ],
  alternates: {
    canonical: '/api',
  },
  openGraph: {
    title: 'Cloud FinOps API — один запрос для сравнения облаков',
    description:
      'Передайте конфигурацию один раз и получите сравнимые предложения российских облачных провайдеров. Проект в разработке.',
    url: '/api',
    type: 'website',
  },
};

export default function ApiRoute() {
  return <ApiPage />;
}
