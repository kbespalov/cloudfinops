'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {Button, Flex, HelpMark, Label, Text, Tooltip} from '@gravity-ui/uikit';
import {CostBreakdownBar, CostPartSwatch} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  formatQuoteAmount,
  periodTotalLabel,
  type PeriodMode,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import {formatNodeCount} from '@/lib/calculator/vram-breakdown';
import styles from './CalculatorSidebar.module.css';

const VISIBLE_PROVIDERS = 4;

export type DeploymentSummary = {
  nodeCount: number;
  gpuCount: number;
  gpuFamily: string;
  totalGpus: number;
};

/** Free-form config lines shown under the provider (VM or GPU). */
export type ConfigSummary = {
  primary: string;
  secondary?: string;
  tertiary?: string;
  quaternary?: string;
  quinary?: string;
  /** Aggregate resources across the whole fleet. */
  totals?: string;
};

function quoteKey(q: ViewProviderQuote): string {
  return `${q.scope}|${q.provider}`;
}

function formatGpuDeployment(summary: DeploymentSummary): ConfigSummary {
  const {nodeCount, gpuCount, gpuFamily, totalGpus} = summary;
  const nodes = formatNodeCount(nodeCount);
  const primary =
    nodeCount === 1
      ? `${nodes}, ${gpuCount} GPU ${gpuFamily}`
      : `${nodes}, по ${gpuCount} GPU ${gpuFamily}`;
  return {
    primary,
    secondary: `${totalGpus} GPU всего`,
  };
}

function ProviderList({
  quotes,
  best,
  selectedKey,
  period,
  onSelect,
  bestHint,
}: {
  quotes: ViewProviderQuote[];
  best: ViewProviderQuote | null;
  selectedKey: string | null;
  period: PeriodMode;
  onSelect: (key: string) => void;
  bestHint: string;
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
        const deltaPct =
          best && absoluteIndex > 0 && best.total > 0
            ? Math.round((q.total / best.total - 1) * 100)
            : 0;
        const deltaAbs =
          best && absoluteIndex > 0 ? Math.max(0, Math.round(q.total - best.total)) : 0;
        const periodWord =
          period === 'unit' ? 'в час' : period === 'year' ? 'в год' : 'в месяц';
        const tip =
          absoluteIndex === 0
            ? bestHint
            : deltaAbs > 0
              ? `На ${formatQuoteAmount(deltaAbs, period)} дороже ${periodWord}`
              : q.providerName;
        return (
          <Tooltip key={key} content={tip} openDelay={250}>
            <button
              type="button"
              className={styles.providerRow}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSelect(key)}
            >
              <span className={styles.sellerMark}>
                <ProviderMark providerId={q.provider} size={12} />
              </span>
              <Flex alignItems="center" gap={1} className={styles.providerMeta}>
                <Text variant="body-2" ellipsis>
                  {q.providerName}
                </Text>
                {deltaPct > 0 ? (
                  <Text variant="caption-2" color="complementary" className={styles.providerDelta}>
                    +{deltaPct}%
                  </Text>
                ) : null}
              </Flex>
              <Text variant="body-2" className={styles.providerAmount}>
                {formatQuoteAmount(q.total, period)}
              </Text>
            </button>
          </Tooltip>
        );
      })}

      {!expanded && hidden > 0 ? (
        <Button view="flat" size="s" width="max" onClick={() => setExpanded(true)}>
          Показать ещё {hidden}
        </Button>
      ) : null}

      {expanded && hidden > 0 ? (
        <Button view="flat" size="s" width="max" onClick={() => setExpanded(false)}>
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
  emptyHint,
  extras,
  deploymentSummary,
  configSummary,
  bestPriceHint,
  bestPriceBadge,
}: {
  period: PeriodMode;
  result: ViewPresetQuote | null;
  loading?: boolean;
  emptyHint?: string;
  extras?: ReactNode;
  deploymentSummary?: DeploymentSummary | null;
  configSummary?: ConfigSummary | null;
  /** Tooltip for provider price badge. */
  bestPriceHint?: string;
  /** Compact badge label on the cheapest provider. */
  bestPriceBadge?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const priceHint =
    bestPriceHint ??
    'Самая низкая стоимость текущей выбранной конфигурации среди найденных провайдеров';
  const priceBadge = bestPriceBadge ?? 'Самый дешёвый провайдер';

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
        <div className={styles.card}>
          <div className={styles.skeleton} />
          <div className={styles.skeletonShort} />
        </div>
      </aside>
    );
  }

  if (!result?.best || !selected) {
    return (
      <aside className={styles.root}>
        <div className={styles.card}>
          <div className={styles.summaryHead} data-empty="true">
            <Text variant="header-1">—</Text>
            {emptyHint ? (
              <Text variant="body-2" color="secondary">
                {emptyHint}
              </Text>
            ) : null}
          </div>
          {extras}
        </div>
      </aside>
    );
  }

  const isBest = result.best != null && quoteKey(selected) === quoteKey(result.best);
  const lines = configSummary ?? (deploymentSummary ? formatGpuDeployment(deploymentSummary) : null);

  return (
    <aside className={styles.root} data-stale={loading ? 'true' : 'false'}>
      <div className={styles.card}>
        <div className={styles.block}>
          <Flex alignItems="center" gap={2} className={styles.detailProvider}>
            <span className={styles.sellerMarkLg}>
              <ProviderMark providerId={selected.provider} size={16} />
            </span>
            <Text variant="subheader-2" ellipsis>
              {selected.providerName}
            </Text>
            {isBest ? (
              <Tooltip content={priceHint} openDelay={200}>
                <span>
                  <Label size="xs" theme="success">
                    {priceBadge}
                  </Label>
                </span>
              </Tooltip>
            ) : null}
          </Flex>

          {lines ? (
            <div className={styles.deployment}>
              <Text variant="body-2" className={styles.deploymentPrimary}>
                {lines.primary}
              </Text>
              {lines.secondary ? (
                <Text variant="body-2" color="complementary" className={styles.deploymentUnit}>
                  {lines.secondary}
                </Text>
              ) : null}
              {lines.tertiary ? (
                <Text variant="caption-2" color="complementary">
                  {lines.tertiary}
                </Text>
              ) : null}
              {lines.quaternary ? (
                <Text variant="caption-2" color="complementary">
                  {lines.quaternary}
                </Text>
              ) : null}
              {lines.quinary ? (
                <Text variant="caption-2" color="complementary">
                  {lines.quinary}
                </Text>
              ) : null}
              {lines.totals ? (
                <Text variant="caption-2" color="complementary" className={styles.totalsLine}>
                  {lines.totals}
                </Text>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.divider} />

        <div className={styles.block}>
          <Text variant="caption-2" color="complementary" className={styles.blockLabel}>
            Структура цены
          </Text>
          <CostBreakdownBar parts={selected.parts} period={period} showLegend={false} />
          <ul className={styles.partList}>
            {selected.parts.map((part) => {
              const share =
                selected.total > 0
                  ? Math.round((part.amount / selected.total) * 1000) / 10
                  : 0;
              const shareLabel =
                share > 0 && share < 0.1
                  ? '<0,1%'
                  : `${String(share).replace('.', ',')}%`;
              const tip =
                part.id === 'bundle'
                  ? `Стоимость готовой конфигурации виртуальной машины у провайдера. ${formatQuoteAmount(part.amount, period)} · ${shareLabel}`
                  : `${part.label}: ${formatQuoteAmount(part.amount, period)} · ${shareLabel}`;
              return (
                <Tooltip key={part.id} content={tip} openDelay={200}>
                  <li className={styles.partRow} tabIndex={0}>
                    <CostPartSwatch id={part.id} />
                    <Text variant="caption-2" ellipsis className={styles.partLabel}>
                      {part.label}
                    </Text>
                    <Text variant="caption-2" className={styles.partAmount}>
                      {formatQuoteAmount(part.amount, period)}
                    </Text>
                  </li>
                </Tooltip>
              );
            })}
          </ul>

          <div className={styles.breakdownTotal}>
            <Text variant="body-2" color="complementary">
              {periodTotalLabel(period)}
            </Text>
            <Text variant="display-1" className={styles.bestPrice}>
              {formatQuoteAmount(selected.total, period)}
            </Text>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.block}>
          <div className={styles.blockLabelRow}>
            <Text variant="caption-2" color="complementary" className={styles.blockLabel}>
              Альтернативы
            </Text>
            <HelpMark aria-label="Про альтернативы" iconSize="s">
              Стоимость аналогичной конфигурации у других провайдеров. Процент — разница
              относительно самого дешёвого варианта.
            </HelpMark>
          </div>
          <ProviderList
            quotes={result.quotes}
            best={result.best}
            selectedKey={selectedKey}
            period={period}
            onSelect={setSelectedKey}
            bestHint={priceHint}
          />
        </div>

        {result.alternateQuotes.length > 0 ? (
          <>
            <div className={styles.divider} />
            <div className={styles.block}>
              <Text variant="caption-2" color="complementary" className={styles.blockLabel}>
                Другой scope
              </Text>
              <ProviderList
                quotes={result.alternateQuotes}
                best={result.alternateQuotes[0] ?? null}
                selectedKey={selectedKey}
                period={period}
                onSelect={setSelectedKey}
                bestHint={priceHint}
              />
            </div>
          </>
        ) : null}

        {extras}
      </div>
    </aside>
  );
}
