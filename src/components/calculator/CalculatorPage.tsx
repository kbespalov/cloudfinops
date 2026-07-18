'use client';

import dynamic from 'next/dynamic';
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
        <Text variant="body-2" ellipsis title={name}>
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
}: {
  preset: CalculatorPreset;
  period: PeriodMode;
  result: ViewPresetQuoteSlim | undefined;
  onOpen: () => void;
}) {
  const best = result?.best ?? null;

  const highlight = preset.kind === 'gpu' && preset.highlight;

  return (
    <Card
      className={highlight ? `${styles.card} ${styles.cardHighlight}` : styles.card}
      type="action"
      size="l"
      onClick={onOpen}
    >
      <div className={styles.cardInner}>
        {preset.kind === 'compute' ? (
          <ComputeSpecs preset={preset} />
        ) : (
          <GpuHostSpecs preset={preset} />
        )}

        {preset.kind === 'gpu' ? <GpuIdentity preset={preset} /> : null}

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
                  {result.quoteCount > 1
                    ? `лучшая из ${result.quoteCount}`
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
  quotesById: Record<string, ViewPresetQuoteSlim>;
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
  const [active, setActive] = useState<CalculatorPreset | null>(null);
  const quotesById = useMemo(() => quotesByPeriod[period], [quotesByPeriod, period]);

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
                Сравните цены ВМ и аренды GPU (L4, A100, H100, H200) у Yandex Cloud, VK Cloud,
                Selectel, Cloud.ru, MWS и T1 — Best offer по публичным тарифам и разбивка стоимости.
              </Text>
            </Flex>
            <Flex alignItems="center" gap={3} wrap className={styles.heroControls}>
              <Flex alignItems="center" gap={2} className={styles.viewControl}>
                <Text variant="body-1" color="secondary">
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
          <Flex alignItems="baseline" justifyContent="space-between" gap={3} wrap>
            <Flex alignItems="center" gap={2}>
              <Icon data={Cpu} size={20} />
              <Text variant="header-1">Compute</Text>
            </Flex>
            <Text variant="body-2" color="secondary">
              vCPU + RAM + 100 GiB SSD
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
            FAMILIES.map((family) => (
              <FamilyShelf
                key={family}
                family={family}
                period={period}
                quotesById={quotesById}
                onOpen={setActive}
              />
            ))
          )}
        </section>

        <section className={styles.section}>
          <Flex alignItems="baseline" justifyContent="space-between" gap={3} wrap>
            <Flex direction="column" gap={1}>
              <Flex alignItems="center" gap={2}>
                <Icon data={Gpu} size={20} />
                <Text variant="header-1">GPU</Text>
              </Flex>
              <Text variant="body-2" color="secondary">
                Формы Cloud.ru + уникальные VK/Selectel (B300). Сравнение: flavor или сборка GPU +
                vCPU + RAM. {gpuPresets.length} конфигураций.
              </Text>
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
            <div className={styles.grid}>
              {gpuCardPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  period={period}
                  result={quotesById[preset.id]}
                  onOpen={() => setActive(preset)}
                />
              ))}
            </div>
          )}
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
        open={Boolean(active)}
        onClose={() => setActive(null)}
      />
    </>
  );
}
