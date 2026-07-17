import type {MetadataRoute} from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://cloudfinops.ru/sitemap.xml',
    host: 'https://cloudfinops.ru',
  };
}
