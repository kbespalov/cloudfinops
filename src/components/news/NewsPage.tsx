'use client';

import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {Button, Flex, Icon, Label, Link, PlaceholderContainer, Text} from '@gravity-ui/uikit';
import {ArrowUpRightFromSquare, BookOpen, ChevronRight, Magnifier} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {NewsDrawer} from '@/components/news/NewsDrawer';
import {
  NEWS_PROVIDER_TITLE,
  NEWS_TAG_TITLE,
  formatNewsDate,
  formatNewsMonth,
  listNewsMonths,
  newsItems,
  newsMonthKey,
  sortNewsNewestFirst,
  type NewsItem,
  type NewsProviderId,
  type NewsTag,
} from '@/data/news';
import styles from './NewsPage.module.css';

type ProviderFilter = 'all' | NewsProviderId;
type MonthFilter = 'all' | string;
type TagFilter = 'all' | NewsTag;

const PAGE_SIZE = 10;

const PROVIDER_ORDER: NewsProviderId[] = [
  'market',
  'yandex-cloud',
  'selectel',
  'cloud-ru',
  'mws-cloud',
  'vk-cloud',
  't1-cloud',
  'aws',
  'azure',
  'google-cloud',
];

const TAG_ORDER: NewsTag[] = [
  'finops',
  'ai',
  'compute',
  'storage',
  'network',
  'kubernetes',
  'data',
  'security',
];

function tagTheme(tag: NewsTag): 'info' | 'success' | 'warning' | 'utility' | 'normal' {
  if (tag === 'ai') return 'utility';
  if (tag === 'security') return 'warning';
  if (tag === 'finops') return 'success';
  if (tag === 'network' || tag === 'kubernetes') return 'info';
  return 'normal';
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button view={active ? 'outlined-action' : 'outlined'} size="m" onClick={onClick}>
      {children}
    </Button>
  );
}

export function NewsPage() {
  const [month, setMonth] = useState<MonthFilter>('all');
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [tag, setTag] = useState<TagFilter>('all');
  const [page, setPage] = useState(1);
  const [activeItem, setActiveItem] = useState<NewsItem | null>(null);

  const monthOptions = useMemo(() => {
    return [
      {value: 'all' as const, title: 'Все'},
      ...listNewsMonths().map((value) => ({value, title: formatNewsMonth(value)})),
    ];
  }, []);

  const providerOptions = useMemo(() => {
    const present = new Set(newsItems.map((n) => n.provider));
    return PROVIDER_ORDER.filter((id) => present.has(id));
  }, []);

  const tagOptions = useMemo(() => {
    const present = new Set(newsItems.flatMap((n) => n.tags));
    return TAG_ORDER.filter((id) => present.has(id));
  }, []);

  const filtered = useMemo(() => {
    const list = newsItems.filter((item) => {
      if (month !== 'all' && newsMonthKey(item.date) !== month) return false;
      if (provider !== 'all' && item.provider !== provider) return false;
      if (tag !== 'all' && !item.tags.includes(tag)) return false;
      return true;
    });
    return sortNewsNewestFirst(list);
  }, [month, provider, tag]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [month, provider, tag]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const reset = () => {
    setMonth('all');
    setProvider('all');
    setTag('all');
    setPage(1);
  };

  const hasFilters = month !== 'all' || provider !== 'all' || tag !== 'all';
  const rangeFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.main}>
            <Flex direction="column" gap={1}>
              <Flex alignItems="center" gap={2}>
                <Icon data={BookOpen} size={24} />
                <Text variant="header-1">Новости</Text>
              </Flex>
              <Text color="secondary" variant="body-1">
                Новые возможности облаков и FinOps · {filtered.length}{' '}
                {filtered.length === 1 ? 'материал' : 'материалов'}
                {filtered.length > 0
                  ? ` · ${rangeFrom}–${rangeTo} на странице`
                  : null}
              </Text>
            </Flex>

            {filtered.length === 0 ? (
              <PlaceholderContainer
                title="Пока пусто"
                description="Нет новостей по выбранным фильтрам. Сбросьте фильтры или загляните позже."
                size="m"
                align="center"
                image={<Icon data={Magnifier} size={28} />}
                actions={[
                  {
                    text: 'Сбросить фильтры',
                    view: 'action',
                    size: 'm',
                    onClick: reset,
                  },
                ]}
              />
            ) : (
              <>
                <div className={styles.feed}>
                  {pageItems.map((item) => (
                    <article key={item.id} className={styles.item}>
                      <button
                        type="button"
                        className={styles.itemButton}
                        onClick={() => setActiveItem(item)}
                      >
                        <div className={styles.itemBody}>
                          <div className={styles.itemMeta}>
                            <Label size="s" theme="unknown">
                              {item.providerName}
                            </Label>
                            <Text variant="caption-2" color="secondary">
                              {formatNewsDate(item.date)}
                            </Text>
                          </div>

                          <Text variant="subheader-2" className={styles.itemTitle}>
                            {item.title}
                          </Text>
                          <Text variant="body-1" color="secondary" className={styles.itemSummary}>
                            {item.summary}
                          </Text>

                          <div className={styles.itemTags}>
                            {item.tags.map((t) => (
                              <Label key={t} size="xs" theme={tagTheme(t)}>
                                {NEWS_TAG_TITLE[t]}
                              </Label>
                            ))}
                          </div>
                        </div>
                        <Icon data={ChevronRight} size={16} className={styles.itemChevron} />
                      </button>

                      <div className={styles.itemSource}>
                        <Text variant="caption-2" color="secondary">
                          Источник:
                        </Text>
                        <Link
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          view="secondary"
                          className={styles.sourceLink}
                        >
                          {item.sourceLabel}
                          <Icon data={ArrowUpRightFromSquare} size={12} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                {pageCount > 1 ? (
                  <Flex
                    alignItems="center"
                    justifyContent="space-between"
                    gap={3}
                    className={styles.pagination}
                  >
                    <Text variant="caption-2" color="secondary">
                      Страница {page} из {pageCount}
                    </Text>
                    <Flex gap={2}>
                      <Button
                        view="outlined"
                        size="m"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Назад
                      </Button>
                      <Button
                        view="outlined"
                        size="m"
                        disabled={page >= pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      >
                        Дальше
                      </Button>
                    </Flex>
                  </Flex>
                ) : null}
              </>
            )}
          </div>

          <aside className={styles.sidebar} aria-label="Фильтры новостей">
            <div className={styles.filterBlock}>
              <Text variant="caption-2" color="complementary" className={styles.filterLabel}>
                Период
              </Text>
              <div className={styles.filterOptions}>
                {monthOptions.map((o) => (
                  <FilterChip
                    key={o.value}
                    active={month === o.value}
                    onClick={() => setMonth(o.value)}
                  >
                    {o.title}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className={styles.filterBlock}>
              <Text variant="caption-2" color="complementary" className={styles.filterLabel}>
                Категория
              </Text>
              <div className={styles.filterOptions}>
                <FilterChip active={tag === 'all'} onClick={() => setTag('all')}>
                  Все
                </FilterChip>
                {tagOptions.map((id) => (
                  <FilterChip key={id} active={tag === id} onClick={() => setTag(id)}>
                    {NEWS_TAG_TITLE[id]}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className={styles.filterBlock}>
              <Text variant="caption-2" color="complementary" className={styles.filterLabel}>
                Провайдер
              </Text>
              <div className={styles.filterOptions}>
                <FilterChip active={provider === 'all'} onClick={() => setProvider('all')}>
                  Все
                </FilterChip>
                {providerOptions.map((id) => (
                  <FilterChip
                    key={id}
                    active={provider === id}
                    onClick={() => setProvider(id)}
                  >
                    {NEWS_PROVIDER_TITLE[id]}
                  </FilterChip>
                ))}
              </div>
            </div>

            <Button view="flat-secondary" size="m" width="max" onClick={reset} disabled={!hasFilters}>
              Сбросить фильтры
            </Button>
          </aside>
        </div>
      </div>

      <NewsDrawer
        item={activeItem}
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
      />
    </>
  );
}
