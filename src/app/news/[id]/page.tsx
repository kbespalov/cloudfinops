import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {NewsArticle} from '@/components/news/NewsArticle';
import {
  NEWS_TAG_TITLE,
  getNewsById,
  newsItems,
  type NewsItem,
} from '@/data/news';

const SITE_URL = 'https://cloudfinops.ru';

/** Fully static: every news item is prerendered at build time. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return newsItems.map((n) => ({id: n.id}));
}

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {id} = await params;
  const item = getNewsById(id);
  if (!item) return {title: 'Новость не найдена'};

  const url = `/news/${item.id}`;
  const title = `${item.title} — ${item.providerName}`;
  const description = item.summary.length > 300 ? `${item.summary.slice(0, 297)}…` : item.summary;
  const keywords = [
    item.providerName,
    'новости облаков',
    'облака России',
    'FinOps',
    ...item.tags.map((t) => NEWS_TAG_TITLE[t]),
  ];

  return {
    title,
    description,
    keywords,
    alternates: {canonical: url},
    openGraph: {
      type: 'article',
      locale: 'ru_RU',
      url,
      siteName: 'Cloud FinOps',
      title,
      description,
      publishedTime: item.date,
      tags: item.tags.map((t) => NEWS_TAG_TITLE[t]),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
    },
    category: 'technology',
  };
}

function newsJsonLd(item: NewsItem) {
  const url = `${SITE_URL}/news/${item.id}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        headline: item.title,
        description: item.summary,
        datePublished: item.date,
        dateModified: item.date,
        inLanguage: 'ru-RU',
        articleSection: item.tags.map((t) => NEWS_TAG_TITLE[t]),
        keywords: [item.providerName, ...item.tags.map((t) => NEWS_TAG_TITLE[t])].join(', '),
        url,
        mainEntityOfPage: {'@type': 'WebPage', '@id': url},
        isBasedOn: item.sourceUrl,
        author: {'@type': 'Organization', name: 'Cloud FinOps', url: SITE_URL},
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: SITE_URL,
          logo: {
            '@type': 'ImageObject',
            url: `${SITE_URL}/icon-512.png`,
            width: 512,
            height: 512,
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Cloud FinOps', item: `${SITE_URL}/`},
          {'@type': 'ListItem', position: 2, name: 'Новости', item: `${SITE_URL}/news`},
          {'@type': 'ListItem', position: 3, name: item.title, item: url},
        ],
      },
    ],
  };
}

export default async function NewsItemRoute({params}: Params) {
  const {id} = await params;
  const item = getNewsById(id);
  if (!item) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(newsJsonLd(item))}}
      />
      <NewsArticle item={item} />
    </>
  );
}
