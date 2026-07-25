import type {MetadataRoute} from 'next';
import {blogPosts} from '@/data/blog';
import {CALCULATOR_PROVIDER_SEO} from '@/data/calculator-providers-seo';
import {allGpuLandingSlugs} from '@/data/gpu-landings';
import {newsItems} from '@/data/news';

const SITE_URL = 'https://cloudfinops.ru';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/catalog`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/gpu`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...allGpuLandingSlugs().map((slug) => ({
      url: `${SITE_URL}/gpu/${slug}`,
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.85,
    })),
    {
      url: `${SITE_URL}/calculator`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/calculator/vm`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/calculator/self-host`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/calculator/lakehouse`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/calculator/ai`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    ...CALCULATOR_PROVIDER_SEO.map((p) => ({
      url: `${SITE_URL}/calculator/${p.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
    {
      url: `${SITE_URL}/chat`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/api`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  const newsRoutes: MetadataRoute.Sitemap = newsItems.map((item) => ({
    url: `${SITE_URL}/news/${item.id}`,
    lastModified: new Date(`${item.date}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.65,
  }));

  return [...staticRoutes, ...newsRoutes, ...blogRoutes];
}
