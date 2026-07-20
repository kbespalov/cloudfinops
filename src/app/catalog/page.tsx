import type {Metadata} from 'next';
import {Suspense} from 'react';
import {CatalogPage} from '@/components/catalog/CatalogPage';

export const metadata: Metadata = {
  title: 'Каталог SKU — цены облаков РФ',
  description:
    'Каталог SKU облаков России: compute, GPU, диски, S3, сеть, Kubernetes и AI inference. Open-weight модели — кнопка «Развернуть» для расчёта GPU под self-host. Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS, T1.',
  keywords: [
    'каталог SKU',
    'SKU облако',
    'цена облака',
    'цены облаков',
    'сравнение облаков',
    'стоимость vCPU',
    'цена GPU облако',
    'цена токенов LLM',
    'AI inference',
    'open-source LLM каталог',
    'self-host модель облако',
    'развернуть LLM на GPU',
    'расчет GPU для инференса',
    'FinOps',
  ],
  alternates: {
    canonical: '/catalog',
  },
  openGraph: {
    title: 'Каталог SKU — цены облаков РФ · Cloud FinOps',
    description:
      'Сравнение публичных цен облаков России по единой таксономии SKU: compute, storage, GPU, network, AI.',
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
