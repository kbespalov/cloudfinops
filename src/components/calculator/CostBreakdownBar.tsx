'use client';

import {Flex, Text} from '@gravity-ui/uikit';
import {partTone, type ViewCostPart} from '@/lib/calculator/quote-view';
import styles from './CostBreakdownBar.module.css';

export function CostBreakdownBar({
  parts,
  showLegend = true,
}: {
  parts: ViewCostPart[];
  showLegend?: boolean;
}) {
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (total <= 0) {
    return (
      <Text variant="body-2" color="secondary">
        Нет данных для разбивки
      </Text>
    );
  }

  return (
    <Flex direction="column" gap={3}>
      <div className={styles.bar} role="img" aria-label="Структура стоимости">
        {parts.map((part) => {
          const pct = Math.max((part.amount / total) * 100, part.amount > 0 ? 2 : 0);
          return (
            <span
              key={part.id}
              className={styles.segment}
              data-tone={partTone(part.id)}
              style={{flexGrow: pct, flexBasis: 0}}
              title={`${part.label}: ${Math.round((part.amount / total) * 100)}%`}
            />
          );
        })}
      </div>
      {showLegend ? (
        <Flex gap={3} wrap className={styles.legend}>
          {parts.map((part) => {
            const pct = Math.round((part.amount / total) * 100);
            return (
              <Flex key={part.id} alignItems="center" gap={2} className={styles.legendItem}>
                <span className={styles.swatch} data-tone={partTone(part.id)} />
                <Text variant="caption-2" color="secondary">
                  {part.label} · {pct}%
                </Text>
              </Flex>
            );
          })}
        </Flex>
      ) : null}
    </Flex>
  );
}
