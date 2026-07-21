'use client';

import {Flex, Text, Tooltip} from '@gravity-ui/uikit';
import {
  formatQuoteAmount,
  partTone,
  type CostPartId,
  type PeriodMode,
  type ViewCostPart,
} from '@/lib/calculator/quote-view';
import styles from './CostBreakdownBar.module.css';

function partCategory(id: CostPartId | string, label?: string): string {
  if (id === 'bundle') return label?.startsWith('ВМ:') ? 'ВМ' : 'Flavor';
  if (id === 'gpu') return 'GPU';
  if (id === 'vcpu') return 'CPU';
  if (id === 'ram') return 'RAM';
  if (id === 'disk') return 'Диск';
  if (id === 'ip') return 'Публичный IP';
  return 'Прочее';
}

function formatShare(amount: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (amount / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0,1%';
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${String(rounded).replace('.', ',')}%`;
}

export function CostBreakdownBar({
  parts,
  period = 'month',
  showLegend = true,
}: {
  parts: ViewCostPart[];
  period?: PeriodMode;
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
    <Flex direction="column" gap={2}>
      <div className={styles.bar} role="img" aria-label="Структура стоимости">
        {parts.map((part) => {
          const pct = (part.amount / total) * 100;
          const tip = `${partCategory(part.id, part.label)}: ${formatQuoteAmount(part.amount, period)} · ${formatShare(part.amount, total)}`;
          return (
            <Tooltip key={part.id} content={tip} openDelay={200}>
              <span
                className={styles.segment}
                data-tone={partTone(part.id)}
                style={{flexGrow: Math.max(pct, 0), flexBasis: 0}}
                tabIndex={0}
              />
            </Tooltip>
          );
        })}
      </div>
      {showLegend ? (
        <Flex gap={3} wrap className={styles.legend}>
          {parts.map((part) => {
            const tip = `${partCategory(part.id, part.label)}: ${formatQuoteAmount(part.amount, period)} · ${formatShare(part.amount, total)}`;
            return (
              <Tooltip key={part.id} content={tip} openDelay={200}>
                <Flex alignItems="center" gap={2} className={styles.legendItem} tabIndex={0}>
                  <span className={styles.swatch} data-tone={partTone(part.id)} />
                  <Text variant="caption-2" color="secondary">
                    {partCategory(part.id, part.label)} · {formatShare(part.amount, total)}
                  </Text>
                </Flex>
              </Tooltip>
            );
          })}
        </Flex>
      ) : null}
    </Flex>
  );
}

export function CostPartSwatch({id}: {id: CostPartId | string}) {
  return <span className={styles.swatch} data-tone={partTone(id as CostPartId)} aria-hidden />;
}
