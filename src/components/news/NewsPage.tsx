'use client';

import {useMemo, useState} from 'react';
import {
  Button,
  Flex,
  Icon,
  Label,
  PlaceholderContainer,
  SegmentedRadioGroup,
  Text,
} from '@gravity-ui/uikit';
import {BookOpen, ChevronRight, Layers3Diagonal, Magnifier} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {NewsDrawer} from '@/components/news/NewsDrawer';
import {
  NEWS_PROVIDER_TITLE,
  NEWS_TAG_TITLE,
  formatNewsDate,
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

const MONTH_OPTIONS: {value: MonthFilter; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: '2026-06', title: 'Июнь 2026'},
];

const PROVIDER_ORDER: NewsProviderId[] = [
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

function tagTheme(tag: NewsTag): 'info' | 'success' | 'warning' | 'utility' | 'normal' {
  if (tag === 'ai') return 'utility';
  if (tag === 'security') return 'warning';
  if (tag === 'finops') return 'success';
  if (tag === 'network' || tag === 'kubernetes') return 'info';
  return 'normal';
}

export function NewsPage() {
  const [month, setMonth] = useState<MonthFilter>('2026-06');
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [activeItem, setActiveItem] = useState<NewsItem | null>(null);

  const providerOptions = useMemo(() => {
    const present = new Set(newsItems.map((n) => n.provider));
    return [
      {value: 'all' as const, title: 'Все'},
      ...PROVIDER_ORDER.filter((id) => present.has(id)).map((id) => ({
        value: id,
        title: NEWS_PROVIDER_TITLE[id],
      })),
    ];
  }, []);

  const filtered = useMemo(() => {
    const list = newsItems.filter((item) => {
      if (month !== 'all' && newsMonthKey(item.date) !== month) return false;
      if (provider !== 'all' && item.provider !== provider) return false;
      return true;
    });
    return sortNewsNewestFirst(list);
  }, [month, provider]);

  const reset = () => {
    setMonth('2026-06');
    setProvider('all');
  };

  const hasFilters = month !== '2026-06' || provider !== 'all';

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Flex direction="column" gap={4}>
          <Flex direction="column" gap={1}>
            <Flex alignItems="center" gap={2}>
              <Icon data={BookOpen} size={24} />
              <Text variant="header-1">Новости</Text>
            </Flex>
            <Text color="secondary" variant="body-1">
              Новые возможности облаков · {filtered.length}{' '}
              {filtered.length === 1 ? 'материал' : 'материалов'}
            </Text>
          </Flex>

          <div className={styles.filters}>
            <div className={styles.facetRow}>
              <div className={styles.facetControl} title="Период">
                <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                  Период
                </Text>
                <SegmentedRadioGroup
                  size="m"
                  value={month}
                  onUpdate={(v) => setMonth(v as MonthFilter)}
                >
                  {MONTH_OPTIONS.map((o) => (
                    <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                      {o.title}
                    </SegmentedRadioGroup.Option>
                  ))}
                </SegmentedRadioGroup>
              </div>

              <div className={styles.facetControl} title="Провайдер">
                <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                  Провайдер
                </Text>
                <SegmentedRadioGroup
                  size="m"
                  value={provider}
                  onUpdate={(v) => setProvider(v as ProviderFilter)}
                >
                  {providerOptions.map((o) => (
                    <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                      <Flex alignItems="center" gap={1}>
                        {o.value === 'all' ? <Icon data={Layers3Diagonal} size={14} /> : null}
                        <span>{o.title}</span>
                      </Flex>
                    </SegmentedRadioGroup.Option>
                  ))}
                </SegmentedRadioGroup>
              </div>

              <Button view="flat-secondary" size="m" onClick={reset} disabled={!hasFilters}>
                Сбросить
              </Button>
            </div>
          </div>

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
            <div className={styles.feed}>
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.item}
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
                    <Text
                      variant="body-1"
                      color="secondary"
                      className={styles.itemSummary}
                      ellipsisLines={2}
                    >
                      {item.summary}
                    </Text>

                    <div className={styles.itemTags}>
                      {item.tags.map((tag) => (
                        <Label key={tag} size="xs" theme={tagTheme(tag)}>
                          {NEWS_TAG_TITLE[tag]}
                        </Label>
                      ))}
                    </div>
                  </div>
                  <Icon data={ChevronRight} size={16} className={styles.itemChevron} />
                </button>
              ))}
            </div>
          )}

          <Text variant="caption-2" color="secondary">
            Клик по строке — описание и ссылка на источник.
          </Text>
        </Flex>
      </div>

      <NewsDrawer
        item={activeItem}
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
      />
    </>
  );
}
