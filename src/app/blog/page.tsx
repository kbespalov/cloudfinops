import type {Metadata} from 'next';
import {BlogPage} from '@/components/blog/BlogPage';
import {blogPosts, sortBlogNewestFirst} from '@/data/blog';

const SITE_URL = 'https://cloudfinops.ru';

export const metadata: Metadata = {
  title: 'Блог: FOCUS, детализация биллинга и оптимизация расходов в облаке',
  description:
    'Статьи Cloud FinOps о FOCUS, cost & usage, биллинговых выгрузках и практике оптимизации облачных расходов.',
  keywords: [
    'FOCUS',
    'детализация биллинга',
    'cost and usage',
    'оптимизация расходов облако',
    'FinOps блог',
    'биллинговая выгрузка',
  ],
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/blog',
    siteName: 'Cloud FinOps',
    title: 'Блог: FOCUS и детализация биллинга',
    description:
      'Статьи о FOCUS, cost & usage, выгрузках биллинга и оптимизации облачных расходов.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
  },
  category: 'technology',
};

function blogListJsonLd() {
  const posts = sortBlogNewestFirst(blogPosts);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${SITE_URL}/blog#blog`,
        name: 'Блог Cloud FinOps',
        description:
          'Статьи о FOCUS, детализации биллинга, cost & usage и оптимизации облачных расходов.',
        url: `${SITE_URL}/blog`,
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: SITE_URL,
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/blog#list`,
        name: 'Статьи блога Cloud FinOps',
        numberOfItems: posts.length,
        itemListElement: posts.map((post, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/blog/${post.slug}`,
          name: post.title,
        })),
      },
    ],
  };
}

export default function BlogRoute() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(blogListJsonLd())}}
      />
      <BlogPage />
    </>
  );
}
