import {focusCloudDetailingPost} from '@/data/blog/posts/focus-cloud-detailing';

export type BlogTag = 'finops' | 'billing' | 'standards';

export type BlogBlock =
  | {type: 'p'; text: string}
  | {type: 'h2'; text: string}
  | {type: 'h3'; text: string}
  | {type: 'ul'; items: string[]}
  | {type: 'ol'; items: string[]}
  | {type: 'quote'; text: string}
  | {type: 'aside'; text: string; label?: string}
  | {type: 'pre'; text: string}
  | {type: 'table'; caption?: string; headers: string[]; rows: string[][]};

export type BlogSource = {
  label: string;
  url: string;
};

export type BlogPost = {
  slug: string;
  date: string;
  title: string;
  seoTitle: string;
  description: string;
  lead: string;
  series?: string;
  tags: BlogTag[];
  /** Extra meta keywords for the article page (beyond tags). */
  keywords?: string[];
  readingMinutes: number;
  body: BlogBlock[];
  sources: BlogSource[];
};

export const BLOG_TAG_TITLE: Record<BlogTag, string> = {
  finops: 'FinOps',
  billing: 'Биллинг',
  standards: 'Стандарты',
};

export function formatBlogDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function sortBlogNewestFirst(items: BlogPost[]): BlogPost[] {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getBlogBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export const blogPosts: BlogPost[] = [focusCloudDetailingPost];
