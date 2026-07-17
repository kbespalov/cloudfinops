import {NewsPage} from '@/components/news/NewsPage';

export const metadata = {
  title: 'Новости · Cloud FinOps',
  description:
    'Новые возможности облачных провайдеров: Yandex, Selectel, Cloud.ru, MWS, VK, AWS, Azure, Google Cloud.',
};

export default function NewsRoute() {
  return <NewsPage />;
}
