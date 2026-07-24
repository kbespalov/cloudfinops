import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор Lakehouse — Iceberg, S3, Kubernetes',
  description:
    'Калькулятор Lakehouse: сравните стоимость DIY data platform на Object Storage + Managed Kubernetes + worker ВМ (Airflow, Spark, Trino, Iceberg) у Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1.',
  keywords: [
    'калькулятор lakehouse',
    'калькулятор data lakehouse',
    'Apache Iceberg стоимость',
    'object storage калькулятор',
    'kubernetes data platform',
    'стоимость data lake',
    'Spark Trino Airflow облако',
    'калькулятор S3 Kubernetes',
    'FinOps lakehouse',
    'калькулятор Яндекс.Облако data platform',
    'калькулятор Selectel ClickHouse S3',
    'калькулятор VK Cloud Data Lakehouse',
    'калькулятор Cloud.ru object storage',
  ],
  alternates: {
    canonical: '/calculator/lakehouse',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/calculator/lakehouse',
    siteName: 'Cloud FinOps',
    title: 'Калькулятор Lakehouse — Iceberg + S3 + Kubernetes',
    description:
      'DIY lakehouse в облаках РФ: Object Storage, Managed Kubernetes и worker ВМ под Iceberg / Airflow / Spark / Trino.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор Lakehouse · Cloud FinOps',
    description:
      'Сравнение DIY data platform: S3 + K8s + worker ВМ в облаках России.',
  },
  category: 'technology',
};

export default function CalculatorLakehouseRoute() {
  return <CalculatorPage mode="lakehouse" />;
}
