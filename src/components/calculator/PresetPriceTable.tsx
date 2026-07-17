'use client';

import {useMemo, type ComponentProps} from 'react';
import {Flex, Icon, Table, Text, Tooltip} from '@gravity-ui/uikit';
import {
  Cpu,
  Database,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  Pulse,
  Server,
  Wallet,
} from '@gravity-ui/icons';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {
  COMPUTE_FAMILY_TITLE,
  type CalculatorPreset,
  type ComputeFamily,
  type ComputePreset,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {
  CALCULATOR_PROVIDER_IDS,
  CALCULATOR_PROVIDER_NAMES,
  formatGiBCapacity,
  formatQuoteAmount,
  type PeriodMode,
  type ViewPresetQuoteSlim,
} from '@/lib/calculator/quote-view';
import styles from './PresetPriceTable.module.css';

type TableMode = 'compute' | 'gpu';

type ConfigChip = {
  icon: typeof Cpu;
  tone: string;
  value: string;
  unit: string;
};

type Row = {
  id: string;
  preset: CalculatorPreset;
  typeLabel: string;
  typeIcon: typeof Server;
  typeTone: string;
  highlight?: boolean;
  chips: ConfigChip[];
  configTitle: string;
  result: ViewPresetQuoteSlim | undefined;
};

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

function computeChips(preset: ComputePreset): ConfigChip[] {
  return [
    {icon: Cpu, tone: 'info', value: String(preset.vcpu), unit: 'vCPU'},
    {icon: Layers3Diagonal, tone: 'utility', value: String(preset.ramGiB), unit: 'GiB'},
    {icon: HardDrive, tone: 'success', value: String(preset.diskGiB), unit: 'SSD'},
  ];
}

function gpuChips(preset: GpuPreset): ConfigChip[] {
  const chips: ConfigChip[] = [
    {
      icon: Gpu,
      tone: 'warning',
      value: `${preset.gpuCount}×`,
      unit: preset.gpuModelMatch,
    },
  ];
  if (preset.dedicated || preset.vcpu == null || preset.ramGiB == null) {
    chips.push({
      icon: Server,
      tone: 'utility',
      value: preset.dedicated ? 'HGX' : 'GPU',
      unit: preset.dedicated ? 'dedicated' : 'unit',
    });
    return chips;
  }
  const ramLabel = formatGiBCapacity(preset.ramGiB);
  chips.push(
    {icon: Cpu, tone: 'info', value: String(preset.vcpu), unit: 'vCPU'},
    {
      icon: Layers3Diagonal,
      tone: 'utility',
      value: ramLabel.includes('TiB') ? ramLabel.replace(' TiB', '') : String(preset.ramGiB),
      unit: ramLabel.includes('TiB') ? 'TiB' : 'GiB',
    },
    {
      icon: HardDrive,
      tone: 'success',
      value: String(preset.diskGiB ?? 100),
      unit: 'SSD',
    },
  );
  return chips;
}

function buildRows(
  presets: CalculatorPreset[],
  quotesById: Record<string, ViewPresetQuoteSlim>,
  mode: TableMode,
): Row[] {
  return presets.map((preset) => {
    const result = quotesById[preset.id];
    if (mode === 'compute' && preset.kind === 'compute') {
      const chips = computeChips(preset);
      return {
        id: preset.id,
        preset,
        typeLabel: COMPUTE_FAMILY_TITLE[preset.family],
        typeIcon: FAMILY_ICON[preset.family],
        typeTone: FAMILY_TONE[preset.family],
        chips,
        configTitle: chips.map((c) => `${c.value} ${c.unit}`).join(' · '),
        result,
      };
    }
    const gpu = preset as GpuPreset;
    const chips = gpuChips(gpu);
    return {
      id: preset.id,
      preset,
      typeLabel: gpu.title,
      typeIcon: Gpu,
      typeTone: gpu.highlight ? 'warning' : 'warning',
      highlight: gpu.highlight,
      chips,
      configTitle: chips.map((c) => `${c.value} ${c.unit}`).join(' · '),
      result,
    };
  });
}

function ConfigChips({chips}: {chips: ConfigChip[]}) {
  return (
    <Flex alignItems="center" gap={3} className={styles.configChips}>
      {chips.map((chip) => (
        <span key={`${chip.unit}-${chip.value}`} className={styles.configChip}>
          <span className={styles.configChipIcon} data-tone={chip.tone}>
            <Icon data={chip.icon} size={12} />
          </span>
          <Text variant="body-1" className={styles.configChipValue}>
            {chip.value}
          </Text>
          <Text variant="caption-2" color="secondary">
            {chip.unit}
          </Text>
        </span>
      ))}
    </Flex>
  );
}

export function PresetPriceTable({
  presets,
  quotesById,
  period,
  mode,
  onOpen,
}: {
  presets: CalculatorPreset[];
  quotesById: Record<string, ViewPresetQuoteSlim>;
  period: PeriodMode;
  mode: TableMode;
  onOpen: (preset: CalculatorPreset) => void;
}) {
  const data = useMemo(
    () => buildRows(presets, quotesById, mode),
    [presets, quotesById, mode],
  );

  const columns = useMemo(() => {
    const configWidth = mode === 'gpu' ? 340 : 240;
    const cols: ComponentProps<typeof Table<Row>>['columns'] = [
      {
        id: 'type',
        name: 'Тип',
        primary: true,
        width: 140,
        className: styles.typeCol,
        template: (row) => (
          <Flex alignItems="center" gap={2} className={styles.typeCell}>
            <span
              className={styles.typeIcon}
              data-tone={row.typeTone}
              data-highlight={row.highlight ? 'true' : undefined}
            >
              <Icon data={row.typeIcon} size={14} />
            </span>
            <Text variant="body-1" ellipsis title={row.typeLabel}>
              {row.typeLabel}
            </Text>
          </Flex>
        ),
      },
      {
        id: 'config',
        name: 'Конфиг',
        width: configWidth,
        className: mode === 'gpu' ? styles.configColWide : styles.configCol,
        template: (row) => (
          <div title={row.configTitle}>
            <ConfigChips chips={row.chips} />
          </div>
        ),
      },
    ];

    for (const providerId of CALCULATOR_PROVIDER_IDS) {
      cols.push({
        id: providerId,
        name: () => (
          <Tooltip content={CALCULATOR_PROVIDER_NAMES[providerId]} openDelay={200}>
            <span className={styles.providerHead}>
              <ProviderMark providerId={providerId} size={18} />
            </span>
          </Tooltip>
        ),
        width: 112,
        align: 'right',
        className: styles.providerCol,
        template: (row) => {
          const quote = row.result?.quotes.find((q) => q.provider === providerId);
          if (!quote) {
            return (
              <Text variant="body-1" className={styles.muted}>
                —
              </Text>
            );
          }
          const amount = formatQuoteAmount(quote.total, period);
          const isBest = row.result?.best?.provider === providerId;
          if (isBest) {
            return (
              <span className={styles.priceBest} title="Best offer">
                {amount}
              </span>
            );
          }
          return <span className={styles.priceCell}>{amount}</span>;
        },
      });
    }

    return cols;
  }, [period, mode]);

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableWrap}>
        <Table
          data={data}
          columns={columns}
          getRowId={(row) => row.id}
          verticalAlign="middle"
          width="max"
          edgePadding
          onRowClick={(row) => onOpen(row.preset)}
          getRowDescriptor={() => ({interactive: true})}
        />
      </div>
    </div>
  );
}
