'use client';

import {useEffect, useMemo, useState} from 'react';
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
  quotePreset,
  scopeLabel,
  type ProviderQuote,
} from '@/lib/calculator/quote';
import type {PeriodMode} from '@/lib/catalog';
import {CostBreakdownBar} from '@/components/calculator/CostBreakdownBar';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import styles from './PresetDrawer.module.css';

function presetHeadline(preset: CalculatorPreset): string {
  if (preset.kind === 'compute') {
    return `${COMPUTE_FAMILY_TITLE[preset.family]} · ${preset.title}`;
  }
  return preset.title;
}

export function PresetDrawer({
  preset,
  period,
  open,
  onClose,
}: {
  preset: CalculatorPreset | null;
  period: PeriodMode;
  open: boolean;
  onClose: () => void;
}) {
  const result = useMemo(
    () => (preset ? quotePreset(preset, period) : null),
    [preset, period],
  );
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProvider(result?.best?.provider ?? null);
  }, [preset?.id, period, result?.best?.provider]);

  const selected: ProviderQuote | null =
    result?.quotes.find((q) => q.provider === selectedProvider) ?? result?.best ?? null;

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
                <Text variant="subheader-2">Все провайдеры</Text>
                {result.quotes.length > 0 ? (
                  <Text variant="caption-2" color="secondary">
                    {result.quotes.length} оффер(ов)
                  </Text>
                ) : null}
              </Flex>
              <Flex direction="column" gap={2} className={styles.providerList}>
                {result.quotes.map((q, index) => {
                  const active = q.provider === selected?.provider;
                  const best = result.best;
                  const delta =
                    best && index > 0 && best.total > 0
                      ? Math.round((q.total / best.total - 1) * 100)
                      : 0;
                  return (
                    <button
                      key={q.provider}
                      type="button"
                      className={styles.providerRow}
                      data-active={active ? 'true' : 'false'}
                      onClick={() => setSelectedProvider(q.provider)}
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
                        <Text
                          variant="caption-2"
                          color={index === 0 ? 'positive' : 'secondary'}
                        >
                          {index === 0 ? 'лучшая цена' : `+${delta}% к лучшей`}
                        </Text>
                      </Flex>
                      <Text variant="subheader-2" className={styles.providerAmount}>
                        {formatQuoteAmount(q.total, period)}
                      </Text>
                    </button>
                  );
                })}
                {result.quotes.length === 0 ? (
                  <Text variant="body-2" color="secondary">
                    Пока не из чего сравнивать
                  </Text>
                ) : null}
              </Flex>
            </div>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
