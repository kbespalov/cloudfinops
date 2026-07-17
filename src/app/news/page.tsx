import type {Metadata} from 'next';
import {NewsPage} from '@/components/news/NewsPage';

export const metadata: Metadata = {
  title: 'Новости облаков и FinOps',
  description:
    'Новости облачного рынка и FinOps: обновления Yandex Cloud, Selectel, Cloud.ru, MWS, VK Cloud, цены и новые сервисы.',
  keywords: ['новости облаков', 'FinOps новости', 'Yandex Cloud', 'Selectel', 'Cloud.ru'],
  alternates: {
    canonical: '/news',
  },
};

export default function NewsRoute() {
  return <NewsPage />;
}
