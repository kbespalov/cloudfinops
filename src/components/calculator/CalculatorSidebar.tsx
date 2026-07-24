'use client';

import {useCallback, useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {Button, Flex, HelpMark, Label, Text, Tooltip} from '@gravity-ui/uikit';
import {CostBreakdownBar, CostPartSwatch} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  formatQuoteAmount,
  periodShortLabel,
  type CalculatorProviderId,
  type PeriodMode,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import {formatNodeCount} from '@/lib/calculator/vram-breakdown';
import {catalogCompareScopeHint} from '@/lib/catalog/compare-disclaimer';
import styles from './CalculatorSidebar.module.css';

const VISIBLE_PROVIDERS = 4;
const MOBILE_MQ = '(max-width: 720px)';

const DEFAULT_BEST_BADGE = 'Минимальная цена в каталоге';
const DEFAULT_BEST_HINT = catalogCompareScopeHint();
const ALT_DELTA_HINT =
  'Разница относительно минимальной расчётной цены для выбранной конфигурации в каталоге Cloud FinOps.';

export type DeploymentSummary = {
  nodeCount: number;
  gpuCount: number;
  gpuFamily: string;
  totalGpus: number;
};

/** Single compact config line under the provider (VM or GPU). */
export type ConfigSummary = {
  line: string;
};

function quoteKey(q: ViewProviderQuote): string {
  return `${q.scope}|${q.provider}`;
}

function formatGpuDeployment(summary: DeploymentSummary): ConfigSummary {
  const {nodeCount, gpuCount, gpuFamily, totalGpus} = summary;
  if (nodeCount === 1) {
    return {line: `${gpuCount} GPU ${gpuFamily}`};
  }
  return {line: `${formatNodeCount(nodeCount)} · ${totalGpus} GPU ${gpuFamily}`};
}

function ProviderList({
  quotes,
  best,
  selectedKey,
  period,
  onSelect,
  bestHint,
  focusProviderId,
}: {
  quotes: ViewProviderQuote[];
  best: ViewProviderQuote | null;
  selectedKey: string | null;
  period: PeriodMode;
  onSelect: (key: string) => void;
  bestHint: string;
  focusProviderId?: CalculatorProviderId | null;
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
        const isCatalogMin = best != null && quoteKey(q) === quoteKey(best);
        const deltaPct =
          best && !isCatalogMin && best.total > 0
            ? Math.round((q.total / best.total - 1) * 100)
            : 0;
        const tip = isCatalogMin
          ? bestHint
          : deltaPct > 0
            ? ALT_DELTA_HINT
            : q.providerName;
        const isFocus = focusProviderId != null && q.provider === focusProviderId;
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
                  {isFocus ? (
                    <Text as="span" variant="caption-2" color="complementary">
                      {' '}
                      · выбранный провайдер
                    </Text>
                  ) : null}
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
  focusProviderId,
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
  /** Compact badge label on the catalog-minimum provider. */
  bestPriceBadge?: string;
  /** Provider landing focus — neutral label in the comparison list. */
  focusProviderId?: CalculatorProviderId | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Hide sticky bar while the details card is on screen — avoids doubled price. */
  const [detailsInView, setDetailsInView] = useState(false);
  const detailsId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const priceHint = bestPriceHint ?? DEFAULT_BEST_HINT;
  const priceBadge = bestPriceBadge ?? DEFAULT_BEST_BADGE;

  useEffect(() => {
    setSelectedKey(result?.best ? quoteKey(result.best) : null);
  }, [result]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof IntersectionObserver === 'undefined') return;

    const mq = window.matchMedia(MOBILE_MQ);
    let observer: IntersectionObserver | null = null;

    const sync = () => {
      observer?.disconnect();
      observer = null;
      if (!mq.matches) {
        setDetailsInView(false);
        return;
      }
      observer = new IntersectionObserver(
        ([entry]) => setDetailsInView(Boolean(entry?.isIntersecting)),
        {root: null, threshold: 0.35},
      );
      observer.observe(card);
    };

    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      observer?.disconnect();
    };
  }, [result, selectedKey]);

  const scrollToDetails = useCallback(() => {
    const el = document.getElementById(detailsId);
    el?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, [detailsId]);

  const selected: ViewProviderQuote | null =
    [...(result?.quotes ?? []), ...(result?.alternateQuotes ?? [])].find(
      (q) => quoteKey(q) === selectedKey,
    ) ??
    result?.best ??
    null;

  if (loading && !result) {
    return (
      <aside className={styles.root} aria-busy="true" id={detailsId}>
        <div className={styles.card}>
          <div className={styles.skeleton} />
          <div className={styles.skeletonShort} />
        </div>
      </aside>
    );
  }

  if (!result?.best || !selected) {
    return (
      <aside className={styles.root} id={detailsId}>
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
        <div className={styles.mobileBar} data-empty="true" aria-hidden="true">
          <Text variant="body-2" color="secondary">
            {emptyHint ?? 'Нет котировок'}
          </Text>
        </div>
      </aside>
    );
  }

  const isBest = result.best != null && quoteKey(selected) === quoteKey(result.best);
  const lines = configSummary ?? (deploymentSummary ? formatGpuDeployment(deploymentSummary) : null);
  const periodWord = periodShortLabel(period);
  const showMobileBar = !detailsInView;

  return (
    <aside
      className={styles.root}
      data-stale={loading ? 'true' : 'false'}
      id={detailsId}
    >
      <button
        type="button"
        className={styles.mobileBar}
        data-hidden={showMobileBar ? 'false' : 'true'}
        onClick={scrollToDetails}
        aria-hidden={showMobileBar ? undefined : true}
        tabIndex={showMobileBar ? 0 : -1}
        aria-label={`Смотреть сравнение: ${selected.providerName}, ${formatQuoteAmount(selected.total, period)} за ${periodWord}`}
      >
        <span className={styles.mobileBarMark}>
          <ProviderMark providerId={selected.provider} size={14} />
        </span>
        <span className={styles.mobileBarMeta}>
          <Text variant="body-2" ellipsis className={styles.mobileBarProvider}>
            {selected.providerName}
            {isBest ? (
              <Text as="span" variant="caption-2" color="complementary" className={styles.mobileBarBest}>
                {' '}
                · мин. в каталоге
              </Text>
            ) : null}
          </Text>
          <Text variant="subheader-2" className={styles.mobileBarPrice}>
            {formatQuoteAmount(selected.total, period)}
            <Text as="span" variant="caption-2" color="complementary" className={styles.mobileBarPeriod}>
              {' '}
              / {periodWord}
            </Text>
          </Text>
        </span>
        <span className={styles.mobileBarCta}>Сравнение</span>
      </button>

      <div className={styles.card} ref={cardRef}>
        <div className={styles.summary}>
          <Flex alignItems="center" gap={2} className={styles.detailProvider}>
            <span className={styles.sellerMarkLg}>
              <ProviderMark providerId={selected.provider} size={16} />
            </span>
            <Text variant="subheader-2" ellipsis className={styles.providerName}>
              {selected.providerName}
            </Text>
            {isBest ? (
              <Tooltip content={priceHint} openDelay={200}>
                <span className={styles.bestBadge}>
                  <Label size="xs" theme="success">
                    {priceBadge}
                  </Label>
                </span>
              </Tooltip>
            ) : null}
          </Flex>

          {lines?.line ? (
            <Text variant="body-2" color="complementary" className={styles.configLine}>
              {lines.line}
            </Text>
          ) : null}

          <div className={styles.heroPrice}>
            <Text as="span" className={styles.bestPrice}>
              {formatQuoteAmount(selected.total, period)}
            </Text>
            <Text as="span" variant="body-2" color="complementary" className={styles.heroPeriod}>
              / {periodWord}
            </Text>
          </div>
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
          {selected.note ? (
            <Text variant="caption-2" color="secondary" className={styles.quoteNote}>
              {selected.note}
            </Text>
          ) : null}
        </div>

        <div className={styles.divider} />

        {(() => {
          const otherQuotes = result.quotes.filter(
            (q) => result.best == null || quoteKey(q) !== quoteKey(result.best),
          );
          if (otherQuotes.length === 0) return null;
          return (
            <>
              <div className={styles.divider} />
              <div className={styles.block}>
                <div className={styles.blockLabelRow}>
                  <Text variant="caption-2" color="complementary" className={styles.blockLabel}>
                    Другие предложения
                  </Text>
                  <HelpMark aria-label="Про другие предложения" iconSize="s">
                    {ALT_DELTA_HINT} Предложения могут различаться по модели предоставления
                    ресурсов, производительности и включённым услугам.
                  </HelpMark>
                </div>
                <ProviderList
                  quotes={otherQuotes}
                  best={result.best}
                  selectedKey={selectedKey}
                  period={period}
                  onSelect={setSelectedKey}
                  bestHint={priceHint}
                  focusProviderId={focusProviderId}
                />
              </div>
            </>
          );
        })()}

        {result.alternateQuotes.length > 0 ? (
          <>
            <div className={styles.divider} />
            <div className={styles.block}>
              <Text variant="caption-2" color="complementary" className={styles.blockLabel}>
                Другой состав цены
              </Text>
              <ProviderList
                quotes={result.alternateQuotes}
                best={result.alternateQuotes[0] ?? null}
                selectedKey={selectedKey}
                period={period}
                onSelect={setSelectedKey}
                bestHint={priceHint}
                focusProviderId={focusProviderId}
              />
            </div>
          </>
        ) : null}

        {extras}
      </div>
    </aside>
  );
}
