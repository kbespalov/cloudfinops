'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Text} from '@gravity-ui/uikit';
import {
  computePresetsByFamily,
  type ComputeFamily,
  type ComputePreset,
  type DiskMedia,
  type PurchaseModel,
  type VcpuShare,
} from '@/lib/calculator/presets';
import {shapeAllowedForShare} from '@/lib/calculator/vcpu-share';
import {
  formatQuoteAmount,
  periodShortLabel,
  type PeriodMode,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';
import styles from './VmPresetGrid.module.css';

type Props = {
  family: ComputeFamily;
  period: PeriodMode;
  vmCount: number;
  diskMedia: DiskMedia;
  purchaseModel: PurchaseModel;
  vcpuShare: VcpuShare;
  publicIpCount: number;
  activePresetId: string | null;
  customSelected: boolean;
  onSelect: (preset: ComputePreset) => void;
  onSelectCustom: () => void;
};

export function VmPresetGrid({
  family,
  period,
  vmCount,
  diskMedia,
  purchaseModel,
  vcpuShare,
  publicIpCount,
  activePresetId,
  customSelected,
  onSelect,
  onSelectCustom,
}: Props) {
  const presets = useMemo(
    () =>
      computePresetsByFamily(family).filter((p) =>
        shapeAllowedForShare(vcpuShare, p.vcpu, p.ramGiB),
      ),
    [family, vcpuShare],
  );
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
          purchaseModel,
          vcpuShare,
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
  }, [family, period, vmCount, diskMedia, purchaseModel, vcpuShare, publicIpCount, presets]);

  return (
    <div className={styles.root}>
      <div className={styles.sectionHead}>
        <Text as="h3" className={styles.sectionTitle}>
          Пресеты конфигураций
        </Text>
        {customSelected ? (
          <button
            type="button"
            className={styles.customChip}
            data-active="true"
            onClick={onSelectCustom}
            title="Текущие значения vCPU и RAM без привязки к пресету"
          >
            Своя конфигурация
          </button>
        ) : null}
      </div>
      <div className={styles.grid} role="listbox" aria-label="Пресеты конфигурации">
        {presets.map((preset) => {
          const active = !customSelected && preset.id === activePresetId;
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
              title={`${preset.vcpu} vCPU и ${preset.ramGiB} GiB RAM на одну ВМ`}
            >
              <Text variant="body-2">
                {preset.vcpu} / {preset.ramGiB}
              </Text>
              <Text variant="caption-2" color="secondary">
                {preset.vcpu} vCPU · {preset.ramGiB} GiB
              </Text>
              <Text
                variant="caption-2"
                className={styles.price}
                title="Стоимость с текущими параметрами диска, сети, количества ВМ и периода"
              >
                {total != null
                  ? `${formatQuoteAmount(total, period).replace(/\s*₽$/, '')} ₽/${periodShortLabel(period)}`
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
