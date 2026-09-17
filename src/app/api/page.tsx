import type {Metadata} from 'next';
import {ApiPage} from '@/components/api/ApiPage';
import {listProducts, listProviders} from '@/lib/public-api/catalog';
import {createEstimate} from '@/lib/public-api/estimates';

export const metadata: Metadata = {
  title: 'API и MCP для каталога и расчёта облачных ресурсов',
  description:
    'Cloud FinOps Public API v1 предоставляет доступ к каталогу SKU и расчёту стоимости ресурсов в Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud, Selectel и MWS.',
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
    title: 'Cloud FinOps API — каталог и расчёт стоимости облачных ресурсов',
    description:
      'Документация REST API и MCP для поиска SKU и расчёта стоимости облачных ресурсов с описанием параметров и интерактивными примерами.',
    url: '/api',
    type: 'website',
  },
};

export default function ApiRoute() {
  const exampleProduct = listProducts({q: 'L4', providers: ['selectel'], limit: 1}).items[0]
    ?? listProducts({limit: 1}).items[0];
  const exampleEstimate = createEstimate({resource: {type: 'compute', vcpu: 4, memoryGiB: 8}, providers: ['cloud-ru']});
  return <ApiPage exampleProduct={exampleProduct} exampleEstimate={exampleEstimate} providers={listProviders().map(({id, name}) => ({id, name}))}/>;
}
