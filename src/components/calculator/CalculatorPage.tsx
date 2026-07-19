'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {startTransition, useMemo, useState} from 'react';
import {Button, Card, Flex, Icon, Label, SegmentedRadioGroup, Text} from '@gravity-ui/uikit';
import {
  Calculator,
  ChevronRight,
  Cpu,
  Database,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  LayoutCells,
  LayoutList,
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
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type CalculatorPreset,
  type ComputeFamily,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  formatGiBCapacity,
  formatQuoteAmount,
  periodShortLabel,
  type PeriodMode,
  type QuotesByPeriodSlim,
  type ViewPresetQuoteSlim,
} from '@/lib/calculator/quote-view';
import styles from './CalculatorPage.module.css';

const PresetPriceTable = dynamic(
  () =>
    import('@/components/calculator/PresetPriceTable').then((m) => ({
      default: m.PresetPriceTable,
    })),
  {ssr: false},
);

type ViewMode = 'cards' | 'table';

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
        <Icon data={icon} size={14} />
      </span>
      <Text variant="subheader-2" className={styles.statValue}>
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

function GpuHostSpecs({preset}: {preset: GpuPreset}) {
  if (preset.vcpu == null || preset.ramGiB == null) return null;

  const ramLabel = formatGiBCapacity(preset.ramGiB);
  const ramIsTiB = ramLabel.includes('TiB');
  const ramValue = ramIsTiB ? ramLabel.replace(' TiB', '') : String(preset.ramGiB);
  return (
    <div className={styles.statGrid}>
      <Stat icon={Cpu} tone="info" value={preset.vcpu} unit="vCPU" />
      <Stat
        icon={Layers3Diagonal}
        tone="utility"
        value={ramValue}
        unit={ramIsTiB ? 'TiB' : 'GiB'}
      />
      <Stat icon={HardDrive} tone="success" value={preset.diskGiB ?? 100} unit="SSD" />
    </div>
  );
}

function GpuIdentity({preset}: {preset: GpuPreset}) {
  const memPart = preset.gpuMemoryGb ? ` ${preset.gpuMemoryGb}GB` : '';
  const linkPart = preset.gpuInterconnect ? ` ${preset.gpuInterconnect}` : '';
  const name = `${preset.gpuModelMatch}${memPart}${linkPart}`.trim();
  const hint = preset.dedicated ? 'Выделенный узел' : null;

  return (
    <Flex alignItems="center" gap={2} className={styles.gpuIdentity}>
      <Label theme="warning" size="s">
        {preset.gpuCount}×
      </Label>
      <Flex direction="column" gap={0} className={styles.gpuIdentityText}>
        <Text variant="subheader-2" ellipsis title={name}>
          {name}
        </Text>
        {hint ? (
          <Text variant="caption-2" color="secondary" ellipsis>
            {hint}
          </Text>
        ) : null}
      </Flex>
    </Flex>
  );
}

function PresetCard({
  preset,
  period,
  result,
  onOpen,
  tone,
}: {
  preset: CalculatorPreset;
  period: PeriodMode;
  result: ViewPresetQuoteSlim | undefined;
  onOpen: () => void;
  tone: string;
}) {
  const best = result?.best ?? null;
  const highlight = preset.kind === 'gpu' && preset.highlight;
  const offerLabel = result ? `Сравнить · ${pluralOffers(result.quoteCount)}` : null;

  return (
    <Card
      className={highlight ? `${styles.card} ${styles.cardHighlight}` : styles.card}
      type="action"
      size="l"
      onClick={onOpen}
    >
      <div className={styles.cardInner} data-tone={tone}>
        {preset.kind === 'gpu' ? <GpuIdentity preset={preset} /> : null}

        {preset.kind === 'compute' ? (
          <ComputeSpecs preset={preset} />
        ) : (
          <GpuHostSpecs preset={preset} />
        )}

        {best ? (
          <Flex alignItems="baseline" gap={1} wrap className={styles.priceBlock}>
            <Text variant="body-2" color="secondary" className={styles.priceLabel}>
              от
            </Text>
            <Text variant="header-1" className={styles.priceValue}>
              {formatQuoteAmount(best.total, period)}
            </Text>
            <Text variant="body-2" color="secondary">
              / {periodShortLabel(period)}
            </Text>
          </Flex>
        ) : (
          <Text variant="body-2" color="secondary" className={styles.priceBlock}>
            Нет публичной цены
          </Text>
        )}

        {best && result && offerLabel ? (
          <Flex
            alignItems="center"
            justifyContent="space-between"
            gap={2}
            className={styles.sellerRow}
          >
            <Flex alignItems="center" gap={2} className={styles.seller}>
              <span className={styles.sellerMark}>
                <ProviderMark providerId={best.provider} size={14} />
              </span>
              <Text variant="caption-2" color="secondary" ellipsis className={styles.sellerText}>
                {best.providerName}
              </Text>
            </Flex>
            <Flex alignItems="center" gap={1} className={styles.cta}>
              <Text variant="caption-2" className={styles.ctaLabel}>
                {offerLabel}
              </Text>
              <Icon data={ChevronRight} size={14} className={styles.chevron} />
            </Flex>
          </Flex>
        ) : null}
      </div>
    </Card>
  );
}

function pluralOffers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} оффер`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} оффера`;
  return `${count} офферов`;
}

export function CalculatorPage({
  quotesByPeriod,
  gpuPresets,
  gpuCardPresets,
}: {
  quotesByPeriod: QuotesByPeriodSlim;
  gpuPresets: GpuPreset[];
  gpuCardPresets: GpuPreset[];
}) {
  const [period, setPeriod] = useState<PeriodMode>('month');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [family, setFamily] = useState<ComputeFamily>('general');
  const [active, setActive] = useState<CalculatorPreset | null>(null);
  const quotesById = useMemo(() => quotesByPeriod[period], [quotesByPeriod, period]);
  const familyPresets = useMemo(() => computePresetsByFamily(family), [family]);

  return (
    <>
      <AppHeader />
      <main className={styles.page} data-view={viewMode}>
        <header className={styles.hero}>
          <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap>
            <Flex direction="column" gap={1}>
              <Flex alignItems="center" gap={2}>
                <Icon data={Calculator} size={24} />
                <Text variant="header-1">Калькулятор</Text>
              </Flex>
              <Text variant="body-1" color="secondary" className={styles.heroLead}>
                Выберите конфигурацию — откроется сравнение офферов по провайдерам.
              </Text>
            </Flex>
            <Flex alignItems="center" gap={3} wrap className={styles.heroControls}>
              <Flex alignItems="center" gap={2} className={styles.viewControl}>
                <Text variant="body-1" color="secondary" className={styles.viewControlLabel}>
                  Внешний вид
                </Text>
                <SegmentedRadioGroup
                  size="m"
                  aria-label="Внешний вид"
                  value={viewMode}
                  onUpdate={(v) => {
                    startTransition(() => setViewMode(v as ViewMode));
                  }}
                >
                  <SegmentedRadioGroup.Option value="cards" title="Плашки">
                    <Icon data={LayoutCells} size={16} />
                  </SegmentedRadioGroup.Option>
                  <SegmentedRadioGroup.Option value="table" title="Таблица">
                    <Icon data={LayoutList} size={16} />
                  </SegmentedRadioGroup.Option>
                </SegmentedRadioGroup>
              </Flex>
              <SegmentedRadioGroup
                size="m"
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
          </Flex>
        </header>

        <section className={styles.section}>
          <Flex alignItems="center" justifyContent="space-between" gap={3} wrap>
            <Flex alignItems="center" gap={2}>
              <span className={styles.sectionIcon} data-tone="info">
                <Icon data={Cpu} size={18} />
              </span>
              <Text variant="header-1">Compute</Text>
            </Flex>
            <Text variant="body-2" color="secondary">
              vCPU + RAM + диск
            </Text>
          </Flex>

          {viewMode === 'table' ? (
            <PresetPriceTable
              presets={COMPUTE_PRESETS}
              quotesById={quotesById}
              period={period}
              mode="compute"
              onOpen={setActive}
            />
          ) : (
            <div className={styles.familyPanel}>
              <Flex direction="column" gap={3}>
                <SegmentedRadioGroup
                  size="l"
                  aria-label="Семейство Compute"
                  value={family}
                  onUpdate={(v) => {
                    startTransition(() => setFamily(v as ComputeFamily));
                  }}
                  className={styles.familyTabs}
                >
                  {FAMILIES.map((id) => (
                    <SegmentedRadioGroup.Option
                      key={id}
                      value={id}
                      title={COMPUTE_FAMILY_TITLE[id]}
                    >
                      <Flex alignItems="center" gap={2}>
                        <span className={styles.tabIcon} data-tone={FAMILY_TONE[id]}>
                          <Icon data={FAMILY_ICON[id]} size={16} />
                        </span>
                        <span className={styles.tabLabel}>{COMPUTE_FAMILY_TITLE[id]}</span>
                      </Flex>
                    </SegmentedRadioGroup.Option>
                  ))}
                </SegmentedRadioGroup>

                <Text variant="body-2" color="complementary" className={styles.familyHint}>
                  {COMPUTE_FAMILY_HINT[family]}
                </Text>

                <div className={styles.grid}>
                  {familyPresets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      period={period}
                      result={quotesById[preset.id]}
                      tone={FAMILY_TONE[family]}
                      onOpen={() => setActive(preset)}
                    />
                  ))}
                </div>
              </Flex>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <Flex alignItems="center" justifyContent="space-between" gap={3} wrap>
            <Flex alignItems="center" gap={2}>
              <span className={styles.sectionIcon} data-tone="warning">
                <Icon data={Gpu} size={18} />
              </span>
              <Flex direction="column" gap={0}>
                <Text variant="header-1">GPU</Text>
                <Text variant="body-2" color="secondary">
                  {gpuPresets.length} конфигураций · сравните офферы по провайдерам
                </Text>
              </Flex>
            </Flex>
          </Flex>
          {viewMode === 'table' ? (
            <PresetPriceTable
              presets={gpuPresets}
              quotesById={quotesById}
              period={period}
              mode="gpu"
              onOpen={setActive}
            />
          ) : (
            <div className={styles.familyPanel}>
              <div className={styles.grid}>
                {gpuCardPresets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    period={period}
                    result={quotesById[preset.id]}
                    tone="warning"
                    onOpen={() => setActive(preset)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <Flex justifyContent="center">
          <Button
            component={Link}
            href="/catalog?category=compute"
            view="flat-secondary"
            size="l"
            prefetch
          >
            Открыть полный каталог SKU
            <Icon data={ChevronRight} size={16} />
          </Button>
        </Flex>
      </main>

      <PresetDrawer
        preset={active}
        period={period}
        open={Boolean(active)}
        onClose={() => setActive(null)}
      />
    </>
  );
}
