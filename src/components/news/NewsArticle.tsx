'use client';

import Link from 'next/link';
import {Button, Icon, Label, Text} from '@gravity-ui/uikit';
import {
  ArrowUpRightFromSquare,
  Calculator,
  ChevronRight,
  Sparkles,
  SquareListUl,
} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {
  NEWS_TAG_TITLE,
  formatNewsDate,
  getRelatedNews,
  type NewsItem,
  type NewsTag,
} from '@/data/news';
import styles from './NewsArticle.module.css';

function tagTheme(tag: NewsTag): 'info' | 'success' | 'warning' | 'utility' | 'normal' {
  if (tag === 'ai') return 'utility';
  if (tag === 'security') return 'warning';
  if (tag === 'finops') return 'success';
  if (tag === 'network' || tag === 'kubernetes') return 'info';
  return 'normal';
}

export function NewsArticle({item}: {item: NewsItem}) {
  const related = getRelatedNews(item);

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
          <Link href="/">Cloud FinOps</Link>
          <Icon data={ChevronRight} size={12} />
          <Link href="/news">Новости</Link>
          <Icon data={ChevronRight} size={12} />
          <span aria-current="page">{item.providerName}</span>
        </nav>

        <article className={styles.article}>
          <div className={styles.meta}>
            <Label size="m" theme="unknown">
              {item.providerName}
            </Label>
            <time dateTime={item.date} className={styles.date}>
              {formatNewsDate(item.date)}
            </time>
          </div>

          <h1 className={styles.title}>{item.title}</h1>

          <div className={styles.tags}>
            {item.tags.map((t) => (
              <Label key={t} size="s" theme={tagTheme(t)}>
                {NEWS_TAG_TITLE[t]}
              </Label>
            ))}
          </div>

          <p className={styles.summary}>{item.summary}</p>

          <div className={styles.sourceBlock}>
            <Text variant="caption-2" color="secondary">
              Первоисточник
            </Text>
            <Button
              view="action"
              size="l"
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.sourceLabel}
              <Icon data={ArrowUpRightFromSquare} size={16} />
            </Button>
          </div>

          <aside className={styles.cta} aria-label="Инструменты Cloud FinOps">
            <Text variant="subheader-2">Посчитать стоимость под эту новость</Text>
            <Text variant="body-1" color="secondary">
              Сравните цены облаков России по каталогу SKU, посчитайте конфигурацию в калькуляторе
              или спросите ИИ-ассистента FinOps своими словами.
            </Text>
            <div className={styles.ctaButtons}>
              <Button view="outlined" size="l" href="/chat">
                <Icon data={Sparkles} size={16} />
                ИИ-ассистент FinOps
              </Button>
              <Button view="outlined" size="l" href="/calculator">
                <Icon data={Calculator} size={16} />
                Калькулятор
              </Button>
              <Button view="outlined" size="l" href="/catalog">
                <Icon data={SquareListUl} size={16} />
                Каталог SKU
              </Button>
            </div>
          </aside>
        </article>

        {related.length > 0 ? (
          <section className={styles.related} aria-labelledby="related-title">
            <h2 id="related-title" className={styles.relatedTitle}>
              Похожие новости
            </h2>
            <ul className={styles.relatedList}>
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/news/${r.id}`} className={styles.relatedLink}>
                    <span className={styles.relatedMeta}>
                      {r.providerName} · {formatNewsDate(r.date)}
                    </span>
                    <span className={styles.relatedName}>{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
