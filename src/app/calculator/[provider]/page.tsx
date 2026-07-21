import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {CalculatorPage} from '@/components/calculator/CalculatorPage';
import {ProviderCalculatorSeo} from '@/components/calculator/ProviderCalculatorSeo';
import {
  calculatorProviderSlugs,
  getCalculatorProviderSeo,
  providerCalculatorJsonLd,
} from '@/data/calculator-providers-seo';
import {getGpuCardPresets} from '@/lib/calculator/quotes-cache';

export const dynamic = 'force-static';

type RouteParams = {provider: string};

export function generateStaticParams(): RouteParams[] {
  return calculatorProviderSlugs().map((provider) => ({provider}));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const {provider} = await params;
  const seo = getCalculatorProviderSeo(provider);
  if (!seo) return {};

  const path = `/calculator/${seo.slug}`;
  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: {canonical: path},
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
      url: path,
      siteName: 'Cloud FinOps',
      title: `${seo.h1} · Cloud FinOps`,
      description: seo.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.h1,
      description: seo.description,
    },
    category: 'technology',
  };
}

export default async function ProviderCalculatorRoute({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const {provider} = await params;
  const seo = getCalculatorProviderSeo(provider);
  if (!seo) notFound();

  const gpuCardPresets = getGpuCardPresets();
  const jsonLd = providerCalculatorJsonLd(seo);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <CalculatorPage
        mode="vm"
        gpuPresets={gpuCardPresets}
        title={seo.h1}
        lead={seo.lead}
      />
      <ProviderCalculatorSeo seo={seo} />
    </>
  );
}
