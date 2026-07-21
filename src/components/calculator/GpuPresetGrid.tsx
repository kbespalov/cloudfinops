'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Flex, Icon, Text} from '@gravity-ui/uikit';
import {Cpu, HardDrive, Layers3Diagonal} from '@gravity-ui/icons';
import type {GpuPreset} from '@/lib/calculator/presets';
import {
  formatGiBCapacity,
  formatQuoteAmount,
  periodShortLabel,
  type PeriodMode,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';
import styles from './GpuPresetGrid.module.css';

type Props = {
  presets: GpuPreset[];
  period: PeriodMode;
  activePresetId: string | null;
  onSelect: (preset: GpuPreset) => void;
};

function modelLabel(preset: GpuPreset): string {
  return preset.title.replace(/^\d+×\s*/, '');
}

export function GpuPresetGrid({presets, period, activePresetId, onSelect}: Props) {
  const [totals, setTotals] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const presetKey = useMemo(() => presets.map((p) => p.id).join('|'), [presets]);

  useEffect(() => {
    const mySeq = ++seq.current;
    setLoading(true);
    setTotals({});

    Promise.all(
      presets.map(async (preset) => {
        const body = {
          kind: 'gpu' as const,
          period,
          gpuModelMatch: preset.gpuModelMatch,
          gpuCount: preset.gpuCount,
          gpuInterconnect: preset.gpuInterconnect ?? null,
          vcpu: preset.vcpu,
          ramGiB: preset.ramGiB,
          diskGiB: preset.diskGiB,
          dedicated: preset.dedicated === true,
          gpuMemoryGb: preset.gpuMemoryGb ?? null,
        };
        try {
          const res = await fetch('/api/calculator/quote', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
          });
          if (!res.ok) return [preset.id, null] as const;
          const data = (await res.json()) as ViewPresetQuote;
          return [preset.id, data.best?.total ?? null] as const;
        } catch {
          return [preset.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (mySeq !== seq.current) return;
      setTotals(Object.fromEntries(entries));
      setLoading(false);
    });
  }, [period, presetKey, presets]);

  if (presets.length === 0) {
    return (
      <div className={styles.root}>
        <Text variant="subheader-1">Пресеты GPU</Text>
        <Text variant="body-2" color="secondary">
          Нет конфигураций для выбранной карты
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Text variant="subheader-1">Пресеты GPU</Text>
      <div className={styles.grid} role="listbox" aria-label="Пресеты GPU">
        {presets.map((preset) => {
          const active = preset.id === activePresetId;
          const total = totals[preset.id];
          const ram = preset.ramGiB != null ? formatGiBCapacity(preset.ramGiB) : '—';
          const disk =
            preset.diskGiB != null
              ? `${preset.diskGiB} SSD`
              : preset.dedicated
                ? 'dedicated'
                : '—';
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={active}
              className={styles.card}
              data-active={active ? 'true' : 'false'}
              onClick={() => onSelect(preset)}
            >
              <Flex alignItems="center" gap={2} className={styles.cardHead}>
                <span className={styles.countBadge}>{preset.gpuCount}×</span>
                <Text variant="body-2" className={styles.model}>
                  {modelLabel(preset)}
                </Text>
              </Flex>

              <div className={styles.stats}>
                <span className={styles.stat}>
                  <Icon data={Cpu} size={12} />
                  {preset.vcpu != null ? `${preset.vcpu} vCPU` : '—'}
                </span>
                <span className={styles.stat}>
                  <Icon data={Layers3Diagonal} size={12} />
                  {ram}
                </span>
                <span className={styles.stat}>
                  <Icon data={HardDrive} size={12} />
                  {disk}
                </span>
              </div>

              <Text variant="subheader-2" className={styles.price}>
                {total != null
                  ? `от ${formatQuoteAmount(total, period)} / ${periodShortLabel(period)}`
                  : loading
                    ? '…'
                    : '—'}
              </Text>
            </button>
          );
        })}
      </div>
    </div>
  );
}
