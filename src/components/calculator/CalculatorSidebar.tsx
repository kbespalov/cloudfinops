'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {Button, Card, DefinitionList, Flex, Label, Text} from '@gravity-ui/uikit';
import {CostBreakdownBar} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  formatQuoteAmount,
  periodShortLabel,
  scopeLabel,
  type PeriodMode,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import styles from './CalculatorSidebar.module.css';

const VISIBLE_PROVIDERS = 4;

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
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? quotes : quotes.slice(0, VISIBLE_PROVIDERS);
  const hidden = Math.max(0, quotes.length - VISIBLE_PROVIDERS);

  useEffect(() => {
    setExpanded(false);
  }, [quotes]);

  return (
    <div className={styles.providerList}>
      {visible.map((q) => {
        const key = quoteKey(q);
        const active = key === selectedKey;
        const absoluteIndex = quotes.indexOf(q);
        const delta =
          best && absoluteIndex > 0 && best.total > 0
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
              <ProviderMark providerId={q.provider} size={14} />
            </span>
            <Flex alignItems="center" gap={2} className={styles.providerMeta}>
              <Text variant="body-2" ellipsis>
                {q.providerName}
              </Text>
              {absoluteIndex === 0 ? (
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

      {!expanded && hidden > 0 ? (
        <Button view="flat" size="m" width="max" onClick={() => setExpanded(true)}>
          Показать ещё {hidden}
        </Button>
      ) : null}

      {expanded && hidden > 0 ? (
        <Button view="flat" size="m" width="max" onClick={() => setExpanded(false)}>
          Свернуть
        </Button>
      ) : null}
    </div>
  );
}

export function CalculatorSidebar({
  period,
  result,
  loading,
  eyebrow,
  emptyHint,
  extras,
}: {
  period: PeriodMode;
  result: ViewPresetQuote | null;
  loading?: boolean;
  eyebrow?: string;
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

  const isBest = Boolean(selected && result?.best && quoteKey(selected) === quoteKey(result.best));

  if (loading && !result) {
    return (
      <aside className={styles.root} aria-busy="true">
        <div className={styles.skeleton} />
        <div className={styles.skeletonShort} />
      </aside>
    );
  }

  if (!result?.best || !selected) {
    return (
      <aside className={styles.root}>
        <Card type="container" view="outlined" size="l" className={styles.summaryCard}>
          <div className={styles.summaryHead} data-empty="true">
            <Text variant="caption-2" color="secondary">
              {eyebrow ?? 'Лучшее предложение'}
            </Text>
            <Text variant="header-1">—</Text>
            {emptyHint ? (
              <Text variant="body-2" color="secondary">
                {emptyHint}
              </Text>
            ) : null}
          </div>
        </Card>
        {extras}
      </aside>
    );
  }

  return (
    <aside className={styles.root}>
      <Card type="container" view="outlined" size="l" className={styles.summaryCard}>
        <div className={styles.summaryHead}>
          <Flex justifyContent="space-between" alignItems="center" gap={2} wrap>
            <Flex alignItems="center" gap={2} className={styles.detailProvider}>
              <span className={styles.sellerMark}>
                <ProviderMark providerId={selected.provider} size={16} />
              </span>
              <Text variant="body-2" color="secondary">
                {eyebrow ?? 'Лучшее предложение'}
              </Text>
              <Text variant="subheader-2" ellipsis>
                {selected.providerName}
              </Text>
            </Flex>
            <Flex alignItems="center" gap={2}>
              {isBest ? (
                <Label size="xs" theme="success">
                  лучший
                </Label>
              ) : null}
              {selected.scope !== 'compute' ? (
                <Label size="xs" theme={selected.scope === 'bundle' ? 'warning' : 'utility'}>
                  {scopeLabel(selected.scope)}
                </Label>
              ) : null}
            </Flex>
          </Flex>
        </div>

        <div className={styles.breakdown}>
          <CostBreakdownBar parts={selected.parts} showLegend={false} />
          <DefinitionList direction="horizontal" responsive className={styles.breakdownParts}>
            {selected.parts.map((part) => (
              <DefinitionList.Item key={part.id} name={part.label}>
                {formatQuoteAmount(part.amount, period)}
              </DefinitionList.Item>
            ))}
          </DefinitionList>

          <div className={styles.breakdownTotal}>
            <Flex alignItems="baseline" gap={2}>
              <Text variant="header-1">Итого</Text>
              <Text variant="body-2" color="secondary">
                / {periodShortLabel(period)}
              </Text>
            </Flex>
            <Text variant="display-1" className={styles.bestPrice}>
              {formatQuoteAmount(selected.total, period)}
            </Text>
          </div>
        </div>
      </Card>

      <Card type="container" view="outlined" size="l" className={styles.providersCard}>
        <Text variant="subheader-2" className={styles.providersTitle}>
          Провайдеры
        </Text>
        <ProviderList
          quotes={result.quotes}
          best={result.best}
          selectedKey={selectedKey}
          period={period}
          onSelect={setSelectedKey}
        />
      </Card>

      {result.alternateQuotes.length > 0 ? (
        <Card type="container" view="outlined" size="l" className={styles.providersCard}>
          <Text variant="subheader-2" className={styles.providersTitle}>
            Другой scope
          </Text>
          <ProviderList
            quotes={result.alternateQuotes}
            best={result.alternateQuotes[0] ?? null}
            selectedKey={selectedKey}
            period={period}
            onSelect={setSelectedKey}
          />
        </Card>
      ) : null}

      {extras}
    </aside>
  );
}
