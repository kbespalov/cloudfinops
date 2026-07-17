import type {Metadata} from 'next';
import {Suspense} from 'react';
import {CatalogPage} from '@/components/catalog/CatalogPage';

export const metadata: Metadata = {
  title: 'Каталог SKU — цены облаков РФ',
  description:
    'Каталог SKU публичных облаков России: цены на compute, GPU, диски, образы, снимки, object storage и сеть. Сравнение Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
  keywords: [
    'каталог SKU',
    'SKU облако',
    'цена облака',
    'цены облаков',
    'сравнение облаков',
    'стоимость vCPU',
    'цена GPU облако',
    'FinOps',
  ],
  alternates: {
    canonical: '/catalog',
  },
  openGraph: {
    title: 'Каталог SKU — цены облаков РФ · Cloud FinOps',
    description:
      'Сравнение публичных цен облаков России по единой таксономии SKU: compute, storage, GPU, network.',
    url: '/catalog',
  },
};

export default function CatalogRoute() {
  return (
    <Suspense fallback={<div style={{padding: 24}}>Загрузка каталога…</div>}>
      <CatalogPage />
    </Suspense>
  );
}
