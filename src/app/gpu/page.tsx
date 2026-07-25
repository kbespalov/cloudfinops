import type {Metadata} from 'next';
import {GpuHubPage} from '@/components/gpu/GpuHubPage';

const SITE_URL = 'https://cloudfinops.ru';

export const metadata: Metadata = {
  title: 'Аренда GPU в облаке России — H100, H200, A100, B300',
  description:
    'Сравнение аренды GPU в облаках России: NVIDIA H100, H200, A100, B300, L4 и HGX. Публичные тарифы в каталоге Cloud FinOps — ₽ с НДС, без промо.',
  keywords: [
    'аренда GPU',
    'GPU сервер',
    'аренда H100',
    'аренда H200',
    'NVIDIA H100',
    'NVIDIA H200',
    'HGX',
    'облако GPU Россия',
    'цены GPU облако',
    'Cloud FinOps',
  ],
  alternates: {canonical: '/gpu'},
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/gpu',
    siteName: 'Cloud FinOps',
    title: 'Аренда GPU в облаке России — Cloud FinOps',
    description:
      'Каталог и карточки моделей: H100, H200, A100, B300, L4. Сравнение публичных тарифов шести облаков РФ.',
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
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/gpu#page`,
        url: `${SITE_URL}/gpu`,
        name: 'Аренда GPU в облаке России',
        description:
          'Сравнение публичных тарифов на GPU NVIDIA у облаков России: H100, H200, A100, B300, L4.',
        isPartOf: {'@id': `${SITE_URL}/#website`},
        about: {
          '@type': 'Thing',
          name: 'Cloud GPU rental pricing in Russia',
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
