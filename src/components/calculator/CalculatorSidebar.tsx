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
            <Flex direction="column" gap={1} className={styles.providerMeta}>
              <Flex alignItems="center" gap={2} className={styles.providerName}>
                <Text variant="body-2" ellipsis>
                  {q.providerName}
                </Text>
                {index === 0 ? (
                  <Label size="xs" theme="success">
                    лучший
                  </Label>
                ) : null}
                {q.scope !== 'compute' ? (
                  <Label size="xs" theme={q.scope === 'bundle' ? 'warning' : 'utility'}>
                    {scopeLabel(q.scope)}
                  </Label>
                ) : null}
              </Flex>
              <Text variant="caption-2" color={index === 0 ? 'positive' : 'secondary'}>
                {index === 0 ? 'лучшая цена' : `+${delta}% к лучшей`}
              </Text>
            </Flex>
            <Text variant="subheader-2" className={styles.providerAmount}>
              {formatQuoteAmount(q.total, period)}
            </Text>
          </button>
        );
      })}
      {quotes.length === 0 ? (
        <Text variant="body-2" color="secondary">
          Пока не из чего сравнивать
        </Text>
      ) : null}
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
  footer,
  extras,
}: {
  period: PeriodMode;
  result: ViewPresetQuote | null;
  loading?: boolean;
  eyebrow?: string;
  subtitle?: string;
  emptyHint?: string;
  footer?: ReactNode;
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

  const alternateScope = result?.alternateQuotes[0]?.scope;
  const alternateTitle =
    alternateScope === 'bundle'
      ? 'Flavor целиком (vCPU + RAM + GPU)'
      : alternateScope === 'gpu-only'
        ? 'Только GPU (без vCPU / RAM)'
        : 'Другие офферы';

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
            {eyebrow ?? 'Оптимальный вариант'}
          </Text>
          <Text variant="header-1">—</Text>
          <Text variant="body-2" color="secondary">
            {emptyHint ?? 'Нет публичных котировок для этой конфигурации'}
          </Text>
        </div>
        {extras}
        {footer}
      </aside>
    );
  }

  return (
    <aside className={styles.root}>
      <div className={styles.heroCard}>
        <Text variant="caption-2" className={styles.eyebrow}>
          {eyebrow ?? 'Оптимальный вариант'}
          {result.best.providerName ? ` · ${result.best.providerName}` : ''}
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
          <Flex justifyContent="space-between" alignItems="flex-start" gap={2}>
            <Flex direction="column" gap={1}>
              <Text variant="subheader-2">Из чего складывается</Text>
              <Text variant="caption-2" color="secondary">
                {selected.providerName}
                {selected.note ? ` · ${selected.note}` : ''}
              </Text>
            </Flex>
            <Label size="s" theme={selected.scope === 'bundle' ? 'warning' : 'utility'}>
              {scopeLabel(selected.scope)}
            </Label>
          </Flex>
          <CostBreakdownBar parts={selected.parts} showLegend={false} />
          <div className={styles.breakdownList}>
            {selected.parts.map((part) => {
              const pct =
                selected.total > 0 ? Math.round((part.amount / selected.total) * 100) : 0;
              return (
                <Flex key={part.id} alignItems="center" gap={3} className={styles.breakdownRow}>
                  <span className={styles.dot} data-tone={partTone(part.id)} />
                  <Flex direction="column" gap={0} className={styles.breakdownMeta}>
                    <Text variant="body-2" ellipsis>
                      {part.label}
                    </Text>
                    <Text variant="caption-2" color="secondary">
                      {pct}% стоимости
                    </Text>
                  </Flex>
                  <Text variant="body-2" className={styles.breakdownAmount}>
                    {formatQuoteAmount(part.amount, period)}
                  </Text>
                </Flex>
              );
            })}
            <Flex
              justifyContent="space-between"
              alignItems="baseline"
              gap={3}
              className={styles.totalRow}
            >
              <Text variant="subheader-2">Итого</Text>
              <Text variant="subheader-2">
                {formatQuoteAmount(selected.total, period)} / {periodShortLabel(period)}
              </Text>
            </Flex>
          </div>
        </div>
      ) : null}

      <div className={styles.panel}>
        <Flex justifyContent="space-between" alignItems="baseline" gap={3}>
          <Text variant="subheader-2">Предложения провайдеров</Text>
          {result.quotes.length > 0 ? (
            <Text variant="caption-2" color="secondary">
              {result.quotes.length}
            </Text>
          ) : null}
        </Flex>
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
          <Flex direction="column" gap={1}>
            <Text variant="subheader-2">{alternateTitle}</Text>
            <Text variant="caption-2" color="secondary">
              Другой состав цены — не сравниваем с лучшим оффером выше
            </Text>
          </Flex>
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
      {footer}
    </aside>
  );
}
