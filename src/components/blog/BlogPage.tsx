'use client';

import Link from 'next/link';
import {Icon, Label} from '@gravity-ui/uikit';
import {ChevronRight} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {
  BLOG_TAG_TITLE,
  blogPosts,
  formatBlogDate,
  sortBlogNewestFirst,
} from '@/data/blog';
import styles from './BlogPage.module.css';

export function BlogPage() {
  const posts = sortBlogNewestFirst(blogPosts);

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
          <Link href="/">Cloud FinOps</Link>
          <Icon data={ChevronRight} size={12} />
          <span aria-current="page">Блог</span>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.title}>Блог</h1>
          <p className={styles.lead}>
            FOCUS, детализация биллинга, cost &amp; usage и практика оптимизации облачных расходов.
          </p>
        </header>

        <div className={styles.feed}>
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.item} prefetch>
              <div className={styles.itemMeta}>
                {post.series ? (
                  <Label size="s" theme="unknown">
                    {post.series}
                  </Label>
                ) : null}
                <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                <span>~{post.readingMinutes} мин</span>
                {post.tags.slice(0, 2).map((t) => (
                  <span key={t}>{BLOG_TAG_TITLE[t]}</span>
                ))}
              </div>
              <h2 className={styles.itemTitle}>{post.title}</h2>
              <p className={styles.itemLead}>{post.lead}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
