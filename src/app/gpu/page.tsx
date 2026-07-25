import type {Metadata} from 'next';
import {GpuHubPage} from '@/components/gpu/GpuHubPage';
import {featuredGpuLandings} from '@/data/gpu-landings';

const SITE_URL = 'https://cloudfinops.ru';

export const metadata: Metadata = {
  title: {absolute: 'Аренда GPU в облаке России — H100, H200, A100 · Cloud FinOps'},
  description:
    'Аренда GPU сервера в облаке России: сравнение публичных тарифов NVIDIA H100, H200, A100, B300, L40S и L4. Цена ₽/час и ₽/мес с НДС — каталог Cloud FinOps, без промо.',
  keywords: [
    'аренда GPU',
    'GPU сервер',
    'аренда сервера с GPU',
    'аренда GPU в облаке',
    'облако GPU',
    'аренда H100',
    'аренда H200',
    'аренда A100',
    'NVIDIA H100',
    'NVIDIA H200',
    'HGX H200',
    'GPU для LLM',
    'GPU для ИИ',
    'почасовая аренда GPU',
    'выделенный сервер GPU',
    'dedicated GPU',
    'VPS с GPU',
    'цены GPU облако',
    'Cloud FinOps',
  ],
  alternates: {canonical: '/gpu'},
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/gpu',
    siteName: 'Cloud FinOps',
    title: 'Аренда GPU в облаке России — H100, H200, A100',
    description:
      'Сравнение аренды GPU в российских облаках: H100, H200, A100, B300, L4 и HGX. Публичные тарифы в одном каталоге.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Аренда GPU в облаке России — Cloud FinOps',
    description: 'H100, H200, A100, B300 и HGX — публичные цены в одном каталоге.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
  },
  category: 'technology',
};

function gpuHubJsonLd() {
  const featured = featuredGpuLandings();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/gpu#page`,
        url: `${SITE_URL}/gpu`,
        name: 'Аренда GPU в облаке России',
        description:
          'Сравнение публичных тарифов на аренду GPU NVIDIA у облаков России: H100, H200, A100, B300, L4, HGX.',
        keywords:
          'аренда GPU, GPU сервер, аренда H100, аренда H200, NVIDIA H100, NVIDIA H200, облако GPU',
        inLanguage: 'ru-RU',
        isPartOf: {'@id': `${SITE_URL}/#website`},
        about: {
          '@type': 'Thing',
          name: 'Аренда GPU в облаке России',
        },
        mainEntity: {
          '@type': 'ItemList',
          itemListOrder: 'https://schema.org/ItemListOrderAscending',
          numberOfItems: featured.length,
          itemListElement: featured.map((def, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: def.shortTitle,
            url: `${SITE_URL}/gpu/${def.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Cloud FinOps', item: SITE_URL},
          {'@type': 'ListItem', position: 2, name: 'GPU', item: `${SITE_URL}/gpu`},
        ],
      },
    ],
  };
}

export default function GpuHubRoute() {
  const jsonLd = gpuHubJsonLd();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <GpuHubPage />
    </>
  );
}
