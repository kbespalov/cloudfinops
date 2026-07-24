'use client';

import {useEffect, useState} from 'react';
import {Button, Drawer, Flex, Icon, Label, PlaceholderContainer, Text} from '@gravity-ui/uikit';
import {Cpu, Gpu, HardDrive, Layers3Diagonal, Xmark} from '@gravity-ui/icons';
import {
  COMPUTE_FAMILY_TITLE,
  type CalculatorPreset,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  formatGiBCapacity,
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
import {CALCULATOR_EMPTY_ILLUSTRATION} from '@/components/ui/emptyIllustration';
import styles from './PresetDrawer.module.css';

function presetHeadline(preset: CalculatorPreset): string {
  if (preset.kind === 'compute') {
    const p = preset as ComputePreset;
    return `${COMPUTE_FAMILY_TITLE[p.family]} · ${p.vcpu}/${p.ramGiB}`;
  }
  return preset.title;
}

function HeaderStat({
  icon,
  tone,
  value,
  unit,
}: {
  icon: typeof Cpu;
  tone: string;
  value: string | number;
  unit: string;
}) {
  return (
    <div className={styles.headerStat}>
      <span className={styles.headerStatIcon} data-tone={tone}>
        <Icon data={icon} size={14} />
      </span>
      <Text variant="subheader-2" className={styles.headerStatValue}>
        {value}
      </Text>
      <Text variant="caption-2" color="secondary">
        {unit}
      </Text>
    </div>
  );
}

function PresetHeaderSpecs({preset}: {preset: CalculatorPreset}) {
  if (preset.kind === 'compute') {
    const p = preset as ComputePreset;
    return (
      <div className={styles.headerStats}>
        <HeaderStat icon={Cpu} tone="info" value={p.vcpu} unit="vCPU" />
        <HeaderStat icon={Layers3Diagonal} tone="utility" value={p.ramGiB} unit="GiB" />
        <HeaderStat icon={HardDrive} tone="success" value={p.diskGiB} unit="SSD" />
      </div>
    );
  }
  const p = preset as GpuPreset;
  if (p.dedicated || p.vcpu == null || p.ramGiB == null) {
    return (
      <div className={styles.headerStats} data-cols="1">
        <HeaderStat
          icon={Gpu}
          tone="warning"
          value={`${p.gpuCount}×`}
          unit={p.dedicated ? `${p.gpuModelMatch} · dedicated` : p.gpuModelMatch}
        />
      </div>
    );
  }
  const ramLabel = formatGiBCapacity(p.ramGiB);
  return (
    <div className={styles.headerStats} data-cols="4">
      <HeaderStat icon={Gpu} tone="warning" value={`${p.gpuCount}×`} unit={p.gpuModelMatch} />
      <HeaderStat icon={Cpu} tone="info" value={p.vcpu} unit="vCPU" />
      <HeaderStat
        icon={Layers3Diagonal}
        tone="utility"
        value={ramLabel.includes('TiB') ? ramLabel.replace(' TiB', '') : String(p.ramGiB)}
        unit={ramLabel.includes('TiB') ? 'TiB' : 'GiB'}
      />
      <HeaderStat icon={HardDrive} tone="success" value={p.diskGiB ?? 100} unit="SSD" />
    </div>
  );
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
  open,
  onClose,
}: {
  preset: CalculatorPreset | null;
  period: PeriodMode;
  open: boolean;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ViewPresetQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !preset) {
      setResult(null);
      setSelectedKey(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setResult(null);

    const url = `/api/calculator/preset-quote?presetId=${encodeURIComponent(preset.id)}&period=${period}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`quote ${res.status}`);
        return res.json() as Promise<ViewPresetQuote>;
      })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setSelectedKey(data.best ? quoteKey(data.best) : null);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, preset?.id, period]);

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
      {preset && loading ? (
        <div className={styles.root}>
          <div className={styles.header}>
            <Flex justifyContent="space-between" alignItems="center" gap={3}>
              <Label size="s" theme="utility">
                Загрузка…
              </Label>
              <Button view="flat-secondary" size="m" onClick={onClose} aria-label="Закрыть">
                <Icon data={Xmark} size={18} />
              </Button>
            </Flex>
            <PresetHeaderSpecs preset={preset} />
          </div>
          <div className={styles.body}>
            <Text variant="body-2" color="secondary">
              Подтягиваем разбивку стоимости…
            </Text>
          </div>
        </div>
      ) : null}
      {preset && result ? (
        <div className={styles.root}>
          <div className={styles.header}>
            <Flex justifyContent="space-between" alignItems="center" gap={3}>
              {preset.kind === 'compute' ? (
                <Label size="s" theme="info">
                  {COMPUTE_FAMILY_TITLE[(preset as ComputePreset).family]}
                </Label>
              ) : (
                <Label size="s" theme="warning">
                  GPU
                </Label>
              )}
              <Button view="flat-secondary" size="m" onClick={onClose} aria-label="Закрыть">
                <Icon data={Xmark} size={18} />
              </Button>
            </Flex>
            <PresetHeaderSpecs preset={preset} />
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
              <PlaceholderContainer
                title="Нет котировок"
                description="Публичные предложения для этого пресета не найдены."
                size="s"
                align="left"
                image={
                  <CALCULATOR_EMPTY_ILLUSTRATION width="100%" height="100%" aria-hidden />
                }
              />
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
                <CostBreakdownBar parts={selected.parts} period={period} showLegend={false} />
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
