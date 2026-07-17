'use client';

import {useEffect, useState} from 'react';
import {Button, Drawer, Flex, Icon, Label, Text} from '@gravity-ui/uikit';
import {Xmark} from '@gravity-ui/icons';
import {
  COMPUTE_FAMILY_TITLE,
  type CalculatorPreset,
  type ComputePreset,
} from '@/lib/calculator/presets';
import {
  formatQuoteAmount,
  partTone,
  periodShortLabel,
  scopeLabel,
  type PeriodMode,
  type ViewPresetQuote,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import {CostBreakdownBar} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import styles from './PresetDrawer.module.css';

function presetHeadline(preset: CalculatorPreset): string {
  if (preset.kind === 'compute') {
    return `${COMPUTE_FAMILY_TITLE[preset.family]} · ${preset.title}`;
  }
  return preset.title;
}

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

export function PresetDrawer({
  preset,
  period,
  result,
  open,
  onClose,
}: {
  preset: CalculatorPreset | null;
  period: PeriodMode;
  result: ViewPresetQuote | null;
  open: boolean;
  onClose: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKey(result?.best ? quoteKey(result.best) : null);
  }, [preset?.id, period, result?.best]);

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

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      placement="right"
      size={440}
      contentOverflow="auto"
      aria-label={preset ? presetHeadline(preset) : 'Пресет калькулятора'}
    >
      {preset && result ? (
        <div className={styles.root}>
          <div className={styles.header}>
            <Flex justifyContent="space-between" alignItems="flex-start" gap={3}>
              <Flex direction="column" gap={2} className={styles.titleBlock}>
                {preset.kind === 'compute' ? (
                  <Label size="s" theme="info">
                    {COMPUTE_FAMILY_TITLE[(preset as ComputePreset).family]}
                  </Label>
                ) : (
                  <Label size="s" theme="warning">
                    GPU
                  </Label>
                )}
                <Text variant="header-1">{presetHeadline(preset)}</Text>
                <Text variant="body-2" color="secondary">
                  {preset.subtitle}
                </Text>
              </Flex>
              <Button view="flat-secondary" size="m" onClick={onClose} aria-label="Закрыть">
                <Icon data={Xmark} size={18} />
              </Button>
            </Flex>
          </div>

          <div className={styles.body}>
            {result.best ? (
              <div className={styles.bestLine}>
                <Text variant="caption-2" color="secondary" className={styles.eyebrow}>
                  Best offer · {result.best.providerName}
                  {result.best.scope !== 'compute' ? ` · ${scopeLabel(result.best.scope)}` : ''}
                </Text>
                <Flex alignItems="baseline" gap={2}>
                  <Text variant="display-2" className={styles.bestPriceValue}>
                    {formatQuoteAmount(result.best.total, period)}
                  </Text>
                  <Text variant="body-1" color="secondary">
                    ₽ / {periodShortLabel(period)}
                  </Text>
                </Flex>
              </div>
            ) : (
              <Text variant="body-2" color="secondary">
                Нет публичных котировок для этого пресета
              </Text>
            )}

            {selected ? (
              <div className={styles.section}>
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
                      selected.total > 0
                        ? Math.round((part.amount / selected.total) * 100)
                        : 0;
                    return (
                      <Flex
                        key={part.id}
                        alignItems="center"
                        gap={3}
                        className={styles.breakdownRow}
                      >
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

            <div className={styles.section}>
              <Flex justifyContent="space-between" alignItems="baseline" gap={3}>
                <Text variant="subheader-2">
                  {result.best?.scope === 'bundle'
                    ? 'Flavor целиком'
                    : result.best?.scope === 'gpu-only'
                      ? 'Только GPU'
                      : 'Все провайдеры'}
                </Text>
                {result.quotes.length > 0 ? (
                  <Text variant="caption-2" color="secondary">
                    {result.quotes.length} оффер(ов)
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
              <div className={styles.section}>
                <Flex justifyContent="space-between" alignItems="baseline" gap={3}>
                  <Flex direction="column" gap={1}>
                    <Text variant="subheader-2">{alternateTitle}</Text>
                    <Text variant="caption-2" color="secondary">
                      Другой состав цены — не сравниваем с Best offer выше
                    </Text>
                  </Flex>
                  <Text variant="caption-2" color="secondary">
                    {result.alternateQuotes.length}
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
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
