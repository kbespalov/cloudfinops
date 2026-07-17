import type {Metadata} from 'next';
import {NewsPage} from '@/components/news/NewsPage';
import {sortNewsNewestFirst, newsItems} from '@/data/news';

const SITE_URL = 'https://cloudfinops.ru';

export const metadata: Metadata = {
  title: 'Новости облаков и FinOps — Yandex Cloud, Selectel, Cloud.ru, MWS',
  description:
    'Новостная лента облачной индустрии России и FinOps: релизы и цены Yandex Cloud, Selectel, Cloud.ru, MWS, VK Cloud, T1, а также AI, GPU, Kubernetes и хранилища. Кратко, с разбором, что это значит для стоимости инфраструктуры.',
  keywords: [
    'новости облаков',
    'новости облачных технологий',
    'FinOps новости',
    'облачный рынок России',
    'Yandex Cloud новости',
    'Selectel новости',
    'Cloud.ru новости',
    'MWS Cloud новости',
    'VK Cloud новости',
    'новости GPU',
    'новости AI облака',
  ],
  alternates: {
    canonical: '/news',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/news',
    siteName: 'Cloud FinOps',
    title: 'Новости облаков и FinOps · Cloud FinOps',
    description:
      'Лента новостей облачной индустрии РФ: релизы, цены и сервисы Yandex Cloud, Selectel, Cloud.ru, MWS, VK Cloud, T1 — с FinOps-разбором.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
  },
  category: 'technology',
};

function newsListJsonLd() {
  const recent = sortNewsNewestFirst(newsItems).slice(0, 30);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${SITE_URL}/news#list`,
    name: 'Новости облаков и FinOps',
    description: 'Новостная лента облачной индустрии России и FinOps.',
    numberOfItems: recent.length,
    itemListElement: recent.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/news/${item.id}`,
      name: item.title,
    })),
  };
}

export default function NewsRoute() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(newsListJsonLd())}}
      />
      <NewsPage />
    </>
  );
}
