import type {MetadataRoute} from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: 'https://cloudfinops.ru/',
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://cloudfinops.ru/catalog',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://cloudfinops.ru/calculator',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://cloudfinops.ru/news',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: 'https://cloudfinops.ru/about',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
