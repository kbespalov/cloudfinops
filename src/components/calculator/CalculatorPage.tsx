'use client';

import {startTransition, useMemo, useState} from 'react';
import {Button, Card, Flex, Icon, SegmentedRadioGroup, Text} from '@gravity-ui/uikit';
import {
  Calculator,
  ChevronRight,
  Cpu,
  Database,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  Pulse,
  Server,
  Wallet,
} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {PresetDrawer} from '@/components/calculator/PresetDrawer';
import {
  COMPUTE_FAMILY_HINT,
  COMPUTE_FAMILY_TITLE,
  GPU_PRESETS,
  computePresetsByFamily,
  type CalculatorPreset,
  type ComputeFamily,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  formatQuoteAmount,
  periodShortLabel,
  type PeriodMode,
  type QuotesByPeriod,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';
import styles from './CalculatorPage.module.css';

const FAMILIES: ComputeFamily[] = ['low-cost', 'general', 'high-cpu', 'high-memory'];

const FAMILY_ICON: Record<ComputeFamily, typeof Server> = {
  'low-cost': Wallet,
  general: Server,
  'high-cpu': Pulse,
  'high-memory': Database,
};

const FAMILY_TONE: Record<ComputeFamily, string> = {
  'low-cost': 'success',
  general: 'info',
  'high-cpu': 'warning',
  'high-memory': 'utility',
};

function Stat({
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
    <div className={styles.stat}>
      <span className={styles.statIcon} data-tone={tone}>
        <Icon data={icon} size={16} />
      </span>
      <Text variant="header-2" className={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption-2" color="secondary" className={styles.statUnit}>
        {unit}
      </Text>
    </div>
  );
}

function ComputeSpecs({preset}: {preset: ComputePreset}) {
  return (
    <div className={styles.statGrid}>
      <Stat icon={Cpu} tone="info" value={preset.vcpu} unit="vCPU" />
      <Stat icon={Layers3Diagonal} tone="utility" value={preset.ramGiB} unit="GiB" />
      <Stat icon={HardDrive} tone="success" value={preset.diskGiB} unit="SSD" />
    </div>
  );
}

function GpuSpecs({preset}: {preset: GpuPreset}) {
  return (
    <div className={styles.statGrid} data-cols="1">
      <Stat
        icon={Gpu}
        tone="warning"
        value={`${preset.gpuCount}× ${preset.gpuModelMatch}`}
        unit={preset.preferBundle ? 'Flavor целиком · vCPU+RAM+GPU' : 'только GPU · без vCPU/RAM'}
      />
    </div>
  );
}

function PresetCard({
  preset,
  period,
  result,
  onOpen,
}: {
  preset: CalculatorPreset;
  period: PeriodMode;
  result: ViewPresetQuote | undefined;
  onOpen: () => void;
}) {
  const best = result?.best ?? null;

  return (
    <Card className={styles.card} type="action" size="l" onClick={onOpen}>
      <div className={styles.cardInner}>
        {preset.kind === 'compute' ? (
          <ComputeSpecs preset={preset} />
        ) : (
          <GpuSpecs preset={preset} />
        )}

        <div className={styles.spacer} />

        {best ? (
          <div className={styles.priceBlock}>
            <Text variant="caption-2" color="secondary" className={styles.priceLabel}>
              от
            </Text>
            <Flex alignItems="baseline" gap={1}>
              <Text variant="display-1" className={styles.priceValue}>
                {formatQuoteAmount(best.total, period)}
              </Text>
              <Text variant="body-1" color="secondary">
                ₽ / {periodShortLabel(period)}
              </Text>
            </Flex>
          </div>
        ) : (
          <div className={styles.priceBlock}>
            <Text variant="subheader-2" color="secondary">
              Нет публичной цены
            </Text>
          </div>
        )}

        {best && result ? (
          <Flex
            alignItems="center"
            justifyContent="space-between"
            gap={3}
            className={styles.sellerRow}
          >
            <Flex alignItems="center" gap={2} className={styles.seller}>
              <span className={styles.sellerMark}>
                <ProviderMark providerId={best.provider} size={16} />
              </span>
              <Flex direction="column" gap={0} className={styles.sellerText}>
                <Text variant="body-2" ellipsis>
                  {best.providerName}
                </Text>
                <Text variant="caption-2" color="secondary">
                  {result.quotes.length > 1
                    ? `лучшая из ${result.quotes.length}`
                    : 'единственный оффер'}
                </Text>
              </Flex>
            </Flex>
            <Icon data={ChevronRight} size={16} className={styles.chevron} />
          </Flex>
        ) : null}
      </div>
    </Card>
  );
}

function FamilyShelf({
  family,
  period,
  quotesById,
  onOpen,
}: {
  family: ComputeFamily;
  period: PeriodMode;
  quotesById: Record<string, ViewPresetQuote>;
  onOpen: (preset: CalculatorPreset) => void;
}) {
  return (
    <div className={styles.shelf}>
      <Flex alignItems="center" gap={3} className={styles.shelfHead}>
        <span className={styles.shelfIcon} data-tone={FAMILY_TONE[family]}>
          <Icon data={FAMILY_ICON[family]} size={20} />
        </span>
        <Flex direction="column" gap={1}>
          <Text variant="header-1">{COMPUTE_FAMILY_TITLE[family]}</Text>
          <Text variant="body-2" color="secondary">
            {COMPUTE_FAMILY_HINT[family]}
          </Text>
        </Flex>
      </Flex>
      <div className={styles.grid}>
        {computePresetsByFamily(family).map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            period={period}
            result={quotesById[preset.id]}
            onOpen={() => onOpen(preset)}
          />
        ))}
      </div>
    </div>
  );
}

export function CalculatorPage({quotesByPeriod}: {quotesByPeriod: QuotesByPeriod}) {
  const [period, setPeriod] = useState<PeriodMode>('month');
  const [active, setActive] = useState<CalculatorPreset | null>(null);
  const quotesById = useMemo(() => quotesByPeriod[period], [quotesByPeriod, period]);

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap>
            <Flex direction="column" gap={3}>
              <Flex alignItems="center" gap={3}>
                <span className={styles.heroIcon}>
                  <Icon data={Calculator} size={28} />
                </span>
                <Text variant="display-1">Калькулятор</Text>
              </Flex>
              <Text variant="body-1" color="secondary" className={styles.heroLead}>
                Выберите готовую конфигурацию — сравним публичные цены провайдеров и покажем, из
                чего складывается Best offer.
              </Text>
            </Flex>
            <SegmentedRadioGroup
              size="l"
              value={period}
              onUpdate={(v) => {
                startTransition(() => setPeriod(v as PeriodMode));
              }}
            >
              <SegmentedRadioGroup.Option value="unit">Час</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="month">Месяц</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="year">Год</SegmentedRadioGroup.Option>
            </SegmentedRadioGroup>
          </Flex>
        </header>

        <section className={styles.section}>
          <Flex alignItems="baseline" justifyContent="space-between" gap={3} wrap>
            <Flex alignItems="center" gap={2}>
              <Icon data={Cpu} size={20} />
              <Text variant="header-1">Compute</Text>
            </Flex>
            <Text variant="body-2" color="secondary">
              vCPU + RAM + 100 GiB SSD
            </Text>
          </Flex>

          {FAMILIES.map((family) => (
            <FamilyShelf
              key={family}
              family={family}
              period={period}
              quotesById={quotesById}
              onOpen={setActive}
            />
          ))}
        </section>

        <section className={styles.section}>
          <Flex alignItems="baseline" justifyContent="space-between" gap={3} wrap>
            <Flex direction="column" gap={1}>
              <Flex alignItems="center" gap={2}>
                <Icon data={Gpu} size={20} />
                <Text variant="header-1">GPU</Text>
              </Flex>
              <Text variant="body-2" color="secondary">
                Полки по картам. Best offer — только GPU; flavor — отдельный список в карточке.
              </Text>
            </Flex>
          </Flex>
          <div className={styles.grid}>
            {GPU_PRESETS.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                period={period}
                result={quotesById[preset.id]}
                onOpen={() => setActive(preset)}
              />
            ))}
          </div>
        </section>

        <Flex justifyContent="center">
          <Button view="flat-secondary" size="l" href="/catalog?category=compute">
            Открыть полный каталог SKU
            <Icon data={ChevronRight} size={16} />
          </Button>
        </Flex>
      </main>

      <PresetDrawer
        preset={active}
        period={period}
        result={active ? quotesById[active.id] ?? null : null}
        open={Boolean(active)}
        onClose={() => setActive(null)}
      />
    </>
  );
}
