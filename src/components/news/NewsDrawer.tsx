'use client';

import {Button, Divider, Drawer, Flex, Icon, Label, Link, Text} from '@gravity-ui/uikit';
import {ArrowUpRightFromSquare, Xmark} from '@gravity-ui/icons';
import {
  NEWS_TAG_TITLE,
  formatNewsDate,
  type NewsItem,
  type NewsTag,
} from '@/data/news';
import styles from './NewsDrawer.module.css';

function tagTheme(tag: NewsTag): 'info' | 'success' | 'warning' | 'utility' | 'normal' {
  if (tag === 'ai') return 'utility';
  if (tag === 'security') return 'warning';
  if (tag === 'finops') return 'success';
  if (tag === 'network' || tag === 'kubernetes') return 'info';
  return 'normal';
}

export function NewsDrawer({
  item,
  open,
  onClose,
}: {
  item: NewsItem | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      placement="right"
      size={400}
      contentOverflow="auto"
      aria-label={item?.title || 'Новость'}
    >
      {item ? (
        <div className={styles.root}>
          <div className={styles.header}>
            <Flex justifyContent="space-between" alignItems="center" gap={3}>
              <Label size="s" theme="unknown">
                {item.providerName}
              </Label>
              <Button view="flat-secondary" size="m" onClick={onClose} aria-label="Закрыть">
                <Icon data={Xmark} size={18} />
              </Button>
            </Flex>

            <Flex direction="column" gap={2} className={styles.titleBlock}>
              <Text variant="header-1">{item.title}</Text>
              <Text variant="body-1" color="secondary">
                {formatNewsDate(item.date)}
              </Text>
            </Flex>

            <div className={styles.tags}>
              {item.tags.map((tag) => (
                <Label key={tag} size="xs" theme={tagTheme(tag)}>
                  {NEWS_TAG_TITLE[tag]}
                </Label>
              ))}
            </div>
          </div>

          <Divider />

          <div className={styles.section}>
            <Flex direction="column" gap={3}>
              <Text variant="subheader-2">Описание</Text>
              <Text variant="body-1" className={styles.summary}>
                {item.summary}
              </Text>
            </Flex>
          </div>

          <Divider />

          <div className={styles.section}>
            <Flex direction="column" gap={3}>
              <Text variant="subheader-2">Источник</Text>
              <Text variant="body-2" color="secondary">
                {item.sourceLabel}
              </Text>
              <Button
                view="action"
                size="l"
                width="max"
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Открыть источник
                <Icon data={ArrowUpRightFromSquare} size={16} />
              </Button>
              <Link
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                view="secondary"
                className={styles.url}
              >
                {item.sourceUrl}
              </Link>
            </Flex>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
