import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {BlogArticle} from '@/components/blog/BlogArticle';
import {
  BLOG_TAG_TITLE,
  blogPosts,
  getBlogBySlug,
  type BlogPost,
} from '@/data/blog';

const SITE_URL = 'https://cloudfinops.ru';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((p) => ({slug: p.slug}));
}

type Params = {params: Promise<{slug: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {slug} = await params;
  const post = getBlogBySlug(slug);
  if (!post) return {title: 'Статья не найдена'};

  const url = `/blog/${post.slug}`;

  return {
    title: post.seoTitle,
    description: post.description,
    keywords: [
      ...(post.keywords ?? []),
      ...post.tags.map((t) => BLOG_TAG_TITLE[t]),
      'Cloud FinOps',
    ],
    alternates: {canonical: url},
    openGraph: {
      type: 'article',
      locale: 'ru_RU',
      url,
      siteName: 'Cloud FinOps',
      title: post.seoTitle,
      description: post.description,
      publishedTime: post.date,
      tags: [...(post.keywords ?? []).slice(0, 8), ...post.tags.map((t) => BLOG_TAG_TITLE[t])],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle,
      description: post.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
    },
    category: 'technology',
  };
}

function blogArticleJsonLd(post: BlogPost) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        inLanguage: 'ru-RU',
        articleSection: post.tags.map((t) => BLOG_TAG_TITLE[t]),
        keywords: [...(post.keywords ?? []), ...post.tags.map((t) => BLOG_TAG_TITLE[t])].join(', '),
        url,
        mainEntityOfPage: {'@type': 'WebPage', '@id': url},
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
          {'@type': 'ListItem', position: 2, name: 'Блог', item: `${SITE_URL}/blog`},
          {'@type': 'ListItem', position: 3, name: post.title, item: url},
        ],
      },
    ],
  };
}

export default async function BlogPostRoute({params}: Params) {
  const {slug} = await params;
  const post = getBlogBySlug(slug);
  if (!post) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(blogArticleJsonLd(post))}}
      />
      <BlogArticle post={post} />
    </>
  );
}
