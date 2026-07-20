'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {Flex, Label, Text} from '@gravity-ui/uikit';
import {CostBreakdownBar} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  formatQuoteAmount,
  partTone,
  periodShortLabel,
  scopeLabel,
  type PeriodMode,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import styles from './CalculatorSidebar.module.css';

function quoteKey(q: ViewProviderQuote): string {
  return `${q.scope}|${q.provider}`;
}

function ProviderList({
  quotes,
  best,
  selectedKey,
  period,
  onSelect,
}: {
  quotes: ViewProviderQuote[];
  best: ViewProviderQuote | null;
  selectedKey: string | null;
  period: PeriodMode;
  onSelect: (key: string) => void;
}) {
  return (
    <Flex direction="column" gap={2} className={styles.providerList}>
      {quotes.map((q, index) => {
        const key = quoteKey(q);
        const active = key === selectedKey;
        const delta =
          best && index > 0 && best.total > 0
            ? Math.round((q.total / best.total - 1) * 100)
            : 0;
        return (
          <button
            key={key}
            type="button"
            className={styles.providerRow}
            data-active={active ? 'true' : 'false'}
            onClick={() => onSelect(key)}
          >
            <span className={styles.sellerMark}>
              <ProviderMark providerId={q.provider} size={16} />
            </span>
            <Flex alignItems="center" gap={2} className={styles.providerMeta}>
              <Text variant="body-2" ellipsis>
                {q.providerName}
              </Text>
              {index === 0 ? (
                <Label size="xs" theme="success">
                  лучший
                </Label>
              ) : delta > 0 ? (
                <Text variant="caption-2" color="secondary">
                  +{delta}%
                </Text>
              ) : null}
            </Flex>
            <Text variant="subheader-2" className={styles.providerAmount}>
              {formatQuoteAmount(q.total, period)}
            </Text>
          </button>
        );
      })}
    </Flex>
  );
}

export function CalculatorSidebar({
  period,
  result,
  loading,
  eyebrow,
  subtitle,
  emptyHint,
  extras,
}: {
  period: PeriodMode;
  result: ViewPresetQuote | null;
  loading?: boolean;
  eyebrow?: string;
  subtitle?: string;
  emptyHint?: string;
  extras?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKey(result?.best ? quoteKey(result.best) : null);
  }, [result]);

  const selected: ViewProviderQuote | null =
    [...(result?.quotes ?? []), ...(result?.alternateQuotes ?? [])].find(
      (q) => quoteKey(q) === selectedKey,
    ) ??
    result?.best ??
    null;

  if (loading && !result) {
    return (
      <aside className={styles.root} aria-busy="true">
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </aside>
    );
  }

  if (!result?.best) {
    return (
      <aside className={styles.root}>
        <div className={styles.heroCard} data-empty="true">
          <Text variant="caption-2" className={styles.eyebrow}>
            {eyebrow ?? 'Лучший оффер'}
          </Text>
          <Text variant="header-1">—</Text>
          {emptyHint ? (
            <Text variant="body-2" color="secondary">
              {emptyHint}
            </Text>
          ) : null}
        </div>
        {extras}
      </aside>
    );
  }

  return (
    <aside className={styles.root}>
      <div className={styles.heroCard}>
        <Text variant="caption-2" className={styles.eyebrow}>
          {result.best.providerName || eyebrow || 'Лучший оффер'}
        </Text>
        <Flex alignItems="baseline" gap={2} wrap>
          <Text variant="display-2" className={styles.bestPrice}>
            {formatQuoteAmount(result.best.total, period)}
          </Text>
          <Text variant="body-1" className={styles.heroMeta}>
            ₽ / {periodShortLabel(period)}
          </Text>
        </Flex>
        {subtitle ? (
          <Text variant="body-2" className={styles.heroMeta}>
            {subtitle}
          </Text>
        ) : null}
      </div>

      {selected ? (
        <div className={styles.panel}>
          <Flex justifyContent="space-between" alignItems="center" gap={2}>
            <Text variant="subheader-2">Состав</Text>
            {selected.scope !== 'compute' ? (
              <Label size="s" theme={selected.scope === 'bundle' ? 'warning' : 'utility'}>
                {scopeLabel(selected.scope)}
              </Label>
            ) : null}
          </Flex>
          <CostBreakdownBar parts={selected.parts} showLegend={false} />
          <div className={styles.breakdownList}>
            {selected.parts.map((part) => (
              <Flex key={part.id} alignItems="center" gap={3} className={styles.breakdownRow}>
                <span className={styles.dot} data-tone={partTone(part.id)} />
                <Text variant="body-2" ellipsis className={styles.breakdownMeta}>
                  {part.label}
                </Text>
                <Text variant="body-2" className={styles.breakdownAmount}>
                  {formatQuoteAmount(part.amount, period)}
                </Text>
              </Flex>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <Text variant="subheader-2">Провайдеры</Text>
        <ProviderList
          quotes={result.quotes}
          best={result.best}
          selectedKey={selectedKey}
          period={period}
          onSelect={setSelectedKey}
        />
      </div>

      {result.alternateQuotes.length > 0 ? (
        <div className={styles.panel}>
          <Text variant="subheader-2">Другой scope</Text>
          <ProviderList
            quotes={result.alternateQuotes}
            best={result.alternateQuotes[0] ?? null}
            selectedKey={selectedKey}
            period={period}
            onSelect={setSelectedKey}
          />
        </div>
      ) : null}

      {extras}
    </aside>
  );
}
