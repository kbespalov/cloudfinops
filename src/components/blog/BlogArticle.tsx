'use client';

import Link from 'next/link';
import {Icon, Label, Text} from '@gravity-ui/uikit';
import {ChevronRight} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {
  BLOG_TAG_TITLE,
  formatBlogDate,
  type BlogBlock,
  type BlogPost,
  type BlogTag,
} from '@/data/blog';
import {RichText} from '@/components/blog/richText';
import styles from './BlogArticle.module.css';

function tagTheme(tag: BlogTag): 'info' | 'success' | 'warning' | 'utility' | 'normal' {
  if (tag === 'finops') return 'success';
  if (tag === 'billing') return 'info';
  if (tag === 'standards') return 'utility';
  if (tag === 'ai') return 'utility';
  return 'normal';
}

function BlockView({block}: {block: BlogBlock}) {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case 'h2':
      return <h2 className={styles.h2}>{block.text}</h2>;
    case 'h3':
      return <h3 className={styles.h3}>{block.text}</h3>;
    case 'ul':
      return (
        <ul className={styles.list}>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className={styles.list}>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <RichText text={block.text} />
        </blockquote>
      );
    case 'aside':
      return (
        <aside className={styles.aside}>
          <span className={styles.asideLabel}>{block.label ?? 'Из практики'}</span>
          <RichText text={block.text} />
        </aside>
      );
    case 'pre':
      return <pre className={styles.pre}>{block.text}</pre>;
    case 'table':
      return (
        <figure className={styles.tableWrap}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {block.headers.map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        <RichText text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption ? <figcaption className={styles.tableCaption}>{block.caption}</figcaption> : null}
        </figure>
      );
    default:
      return null;
  }
}

export function BlogArticle({post}: {post: BlogPost}) {
  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
          <Link href="/">Cloud FinOps</Link>
          <Icon data={ChevronRight} size={12} />
          <Link href="/blog">Блог</Link>
          <Icon data={ChevronRight} size={12} />
          <span aria-current="page">{post.series ?? 'Статья'}</span>
        </nav>

        <article className={styles.article}>
          <div className={styles.meta}>
            {post.series ? (
              <Label size="m" theme="unknown">
                {post.series}
              </Label>
            ) : null}
            <time dateTime={post.date} className={styles.date}>
              {formatBlogDate(post.date)}
            </time>
            <span className={styles.reading}>~{post.readingMinutes} мин чтения</span>
          </div>

          <h1 className={styles.title}>{post.title}</h1>

          <div className={styles.tags}>
            {post.tags.map((t) => (
              <Label key={t} size="s" theme={tagTheme(t)}>
                {BLOG_TAG_TITLE[t]}
              </Label>
            ))}
          </div>

          <p className={styles.lead}>
            <RichText text={post.lead} />
          </p>

          <div className={styles.body}>
            {post.body.map((block, i) => (
              <BlockView key={`${block.type}-${i}`} block={block} />
            ))}
          </div>

          {post.sources.length > 0 ? (
            <section className={styles.sources} aria-labelledby="blog-sources">
              <h2 id="blog-sources" className={styles.sourcesTitle}>
                Источники
              </h2>
              <ul className={styles.sourcesList}>
                {post.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Text as="p" className={styles.footerNote} color="secondary">
            Опубликовано {formatBlogDate(post.date)}. Информационно-аналитический материал Cloud
            FinOps.
          </Text>
        </article>
      </main>
    </>
  );
}
