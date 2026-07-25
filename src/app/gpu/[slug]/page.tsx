import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {GpuModelPage} from '@/components/gpu/GpuModelPage';
import {
  allGpuLandingSlugs,
  faqForLanding,
  getGpuLanding,
  type GpuLandingDef,
} from '@/data/gpu-landings';
import {buildGpuLandingStats} from '@/lib/gpu-landing';

const SITE_URL = 'https://cloudfinops.ru';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return allGpuLandingSlugs().map((slug) => ({slug}));
}

type Params = {params: Promise<{slug: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {slug} = await params;
  const def = getGpuLanding(slug);
  if (!def) return {title: 'GPU не найден'};

  const url = `/gpu/${def.slug}`;
  const docTitle = def.seoTitle;
  return {
    title: {absolute: `${docTitle} · Cloud FinOps`},
    description: def.description,
    keywords: def.keywords,
    alternates: {canonical: url},
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      url,
      siteName: 'Cloud FinOps',
      title: docTitle,
      description: def.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: docTitle,
      description: def.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
    },
    category: 'technology',
  };
}

function modelJsonLd(def: GpuLandingDef) {
  const url = `${SITE_URL}/gpu/${def.slug}`;
  const stats = buildGpuLandingStats(def);
  // Prefer stats.catalogHref so empty narrow slices (e.g. H200 NVL) do not
  // advertise a dead `q=` filter in structured data.
  const catalogUrl = `${SITE_URL}${stats.catalogHref}`;
  const lowOffer =
    stats.narrowEmpty || stats.offerCount === 0
      ? null
      : stats.cheapestSingle ?? stats.cheapestNode;
  const offers =
    lowOffer != null
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'RUB',
          lowPrice: Math.round(lowOffer.amount * 100) / 100,
          offerCount: stats.offerCount,
          availability: 'https://schema.org/InStock',
          url: catalogUrl,
        }
      : {
          '@type': 'Offer',
          url: catalogUrl,
          availability: stats.narrowEmpty
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
          priceCurrency: 'RUB',
        };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: def.seoTitle,
        headline: def.title,
        description: def.description,
        keywords: def.keywords.join(', '),
        inLanguage: 'ru-RU',
        isPartOf: {'@id': `${SITE_URL}/#website`},
        about: {
          '@type': 'Product',
          '@id': `${url}#product`,
          name: `NVIDIA ${def.shortTitle}`,
          description: def.description,
          brand: {'@type': 'Brand', name: 'NVIDIA'},
          category: 'Cloud GPU rental',
          offers,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Cloud FinOps', item: SITE_URL},
          {'@type': 'ListItem', position: 2, name: 'GPU', item: `${SITE_URL}/gpu`},
          {'@type': 'ListItem', position: 3, name: def.shortTitle, item: url},
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqForLanding(def).map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  };
}

export default async function GpuModelRoute({params}: Params) {
  const {slug} = await params;
  const def = getGpuLanding(slug);
  if (!def) notFound();

  const jsonLd = modelJsonLd(def);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <GpuModelPage def={def} />
    </>
  );
}
