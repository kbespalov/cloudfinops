import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {GpuModelPage} from '@/components/gpu/GpuModelPage';
import {
  allGpuLandingSlugs,
  faqForLanding,
  getGpuLanding,
  type GpuLandingDef,
} from '@/data/gpu-landings';
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
  return {
    title: def.title,
    description: def.description,
    keywords: def.keywords,
    alternates: {canonical: url},
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      url,
      siteName: 'Cloud FinOps',
      title: def.title,
      description: def.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: def.title,
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

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: def.title,
        description: def.description,
        isPartOf: {'@id': `${SITE_URL}/#website`},
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
