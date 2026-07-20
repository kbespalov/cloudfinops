'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Text} from '@gravity-ui/uikit';
import {
  computePresetsByFamily,
  type ComputeFamily,
  type ComputePreset,
  type DiskMedia,
} from '@/lib/calculator/presets';
import {
  formatQuoteAmount,
  type PeriodMode,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';
import styles from './VmPresetGrid.module.css';

type Props = {
  family: ComputeFamily;
  period: PeriodMode;
  vmCount: number;
  diskMedia: DiskMedia;
  publicIpCount: number;
  activePresetId: string | null;
  onSelect: (preset: ComputePreset) => void;
};

export function VmPresetGrid({
  family,
  period,
  vmCount,
  diskMedia,
  publicIpCount,
  activePresetId,
  onSelect,
}: Props) {
  const presets = useMemo(() => computePresetsByFamily(family), [family]);
  const [totals, setTotals] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mySeq = ++seq.current;
    setLoading(true);
    setTotals({});

    Promise.all(
      presets.map(async (preset) => {
        const body = {
          kind: 'compute' as const,
          period,
          vcpu: preset.vcpu,
          ramGiB: preset.ramGiB,
          diskGiB: preset.diskGiB,
          diskMedia,
          family,
          vmCount,
          publicIpCount,
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
  }, [family, period, vmCount, diskMedia, publicIpCount, presets]);

  return (
    <div className={styles.root}>
      <Text variant="subheader-2">Пресеты</Text>
      <div className={styles.grid} role="listbox" aria-label="Пресеты конфигурации">
        {presets.map((preset) => {
          const active = preset.id === activePresetId;
          const total = totals[preset.id];
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
              <Text variant="body-2">
                {preset.vcpu} vCPU
              </Text>
              <Text variant="body-2" color="complementary">
                {preset.ramGiB} GiB RAM
              </Text>
              <Text variant="subheader-2" className={styles.price}>
                {total != null
                  ? formatQuoteAmount(total, period)
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
