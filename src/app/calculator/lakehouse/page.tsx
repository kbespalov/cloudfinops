import type {Metadata} from 'next';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {
  LakehouseCalculatorSeo,
  lakehouseCalculatorJsonLd,
} from '@/components/calculator/CalculatorSeo';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Калькулятор Lakehouse и Data Platform — Iceberg, Spark, Trino, S3',
  description:
    'Калькулятор Lakehouse / Data Platform: сравните стоимость open lakehouse и платформы данных на Object Storage + Managed Kubernetes (Iceberg, Spark, Trino, Airflow) у Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1. Публичные тарифы, ₽ с НДС.',
  keywords: [
    // Core product
    'калькулятор lakehouse',
    'калькулятор Lakehouse',
    'калькулятор data platform',
    'калькулятор Data Platform',
    'калькулятор платформы данных',
    'калькулятор озера данных',
    'калькулятор data lake',
    'калькулятор data lakehouse',
    'калькулятор open lakehouse',
    'open lakehouse калькулятор',
    'стоимость lakehouse',
    'стоимость data platform',
    'стоимость платформы данных',
    'стоимость озера данных',
    'сколько стоит lakehouse',
    'сколько стоит data lake',
    'расчёт стоимости lakehouse',
    'расчет стоимости lakehouse',
    'TCO lakehouse',
    'TCO data platform',
    'FinOps lakehouse',
    'FinOps data platform',
    // Transliterations / colloquial
    'калькулятор лайкхаус',
    'калькулятор лейкхаус',
    'стоимость лайкхаус',
    'лайкхаус облако',
    'лейкхаус калькулятор',
    // Stack
    'Apache Iceberg стоимость',
    'калькулятор Iceberg',
    'Iceberg Object Storage',
    'Iceberg S3 стоимость',
    'стоимость Apache Iceberg',
    'калькулятор Spark',
    'стоимость Spark облако',
    'Spark на Kubernetes стоимость',
    'калькулятор Trino',
    'стоимость Trino',
    'Trino на Kubernetes',
    'калькулятор Airflow',
    'Airflow Kubernetes стоимость',
    'Spark Trino Airflow облако',
    'Iceberg Spark Trino',
    // Infra building blocks
    'object storage калькулятор',
    'калькулятор S3',
    'калькулятор объектного хранилища',
    'стоимость Object Storage',
    'kubernetes data platform',
    'Managed Kubernetes data platform',
    'калькулятор S3 Kubernetes',
    'data platform на kubernetes',
    'озеро данных на S3',
    'data lake на object storage',
    // Architecture intents
    'open lakehouse vs warehouse',
    'lakehouse vs data warehouse',
    'serverless SQL vs lakehouse',
    'DIY lakehouse',
    'self-hosted lakehouse',
    'аналитическая платформа облако',
    'стоимость аналитической платформы',
    'калькулятор ETL Spark',
    'стоимость BI платформы данных',
    // Comparison / Russia
    'сравнение lakehouse облака Россия',
    'сравнение data platform Россия',
    'lakehouse Яндекс.Облако',
    'lakehouse Selectel',
    'data lakehouse VK Cloud',
    // Per-provider
    'калькулятор Яндекс.Облако data platform',
    'калькулятор Яндекс.Облако lakehouse',
    'калькулятор Яндекс Облако озеро данных',
    'калькулятор Yandex Cloud lakehouse',
    'калькулятор VK Cloud Data Lakehouse',
    'калькулятор VK Cloud lakehouse',
    'калькулятор Selectel lakehouse',
    'калькулятор Selectel Iceberg',
    'калькулятор Selectel S3 Kubernetes',
    'калькулятор Cloud.ru object storage',
    'калькулятор Cloud.ru lakehouse',
    'калькулятор MWS data platform',
    'калькулятор MWS lakehouse',
    'калькулятор T1 Cloud lakehouse',
    'калькулятор T1 data platform',
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
    title: 'Калькулятор Lakehouse и Data Platform · Iceberg + Spark + Trino',
    description:
      'Оцените DIY open lakehouse в облаках РФ: Object Storage, Managed Kubernetes, Iceberg, Spark, Trino и Airflow. Минимальная цена в каталоге по публичным тарифам.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Калькулятор Lakehouse / Data Platform · Cloud FinOps',
    description:
      'Стоимость платформы данных: S3 + Kubernetes + Iceberg / Spark / Trino в облаках России.',
  },
  category: 'technology',
};

export default function CalculatorLakehouseRoute() {
  const jsonLd = lakehouseCalculatorJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage mode="lakehouse" />
      <LakehouseCalculatorSeo />
    </>
  );
}
