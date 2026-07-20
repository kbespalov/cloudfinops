'use client';

import {useMemo, useState} from 'react';
import {Flex, Text, TextInput} from '@gravity-ui/uikit';
import {
  COMPUTE_FAMILY_HINT,
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
} from '@/lib/calculator/presets';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {CalculatorSidebar} from './CalculatorSidebar';
import styles from './VmCalculatorPanel.module.css';

const FAMILIES: ComputeFamily[] = ['general', 'high-cpu', 'high-memory', 'low-cost'];

const DEFAULT = {
  family: 'general' as ComputeFamily,
  vmCount: 1,
  vcpu: 4,
  ramGiB: 16,
  diskGiB: 100,
};

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw.replace(/\s/g, ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function VmCalculatorPanel({period}: {period: PeriodMode}) {
  const [family, setFamily] = useState<ComputeFamily | 'custom'>(DEFAULT.family);
  const [vmCount, setVmCount] = useState(String(DEFAULT.vmCount));
  const [vcpu, setVcpu] = useState(String(DEFAULT.vcpu));
  const [ramGiB, setRamGiB] = useState(String(DEFAULT.ramGiB));
  const [diskGiB, setDiskGiB] = useState(String(DEFAULT.diskGiB));

  const parsed = useMemo(
    () => ({
      vmCount: clampInt(vmCount, 1, 64, DEFAULT.vmCount),
      vcpu: clampInt(vcpu, 1, 128, DEFAULT.vcpu),
      ramGiB: clampInt(ramGiB, 1, 1024, DEFAULT.ramGiB),
      diskGiB: clampInt(diskGiB, 10, 4096, DEFAULT.diskGiB),
      family: family === 'custom' ? ('general' as ComputeFamily) : family,
    }),
    [vmCount, vcpu, ramGiB, diskGiB, family],
  );

  const request = useMemo(
    () => ({
      kind: 'compute' as const,
      period,
      vcpu: parsed.vcpu,
      ramGiB: parsed.ramGiB,
      diskGiB: parsed.diskGiB,
      family: parsed.family,
      vmCount: parsed.vmCount,
    }),
    [period, parsed],
  );

  const {result, loading} = useAdhocQuote(request);

  function applyFamily(next: ComputeFamily) {
    const mid = computePresetsByFamily(next)[1] ?? COMPUTE_PRESETS.find((p) => p.family === next);
    setFamily(next);
    if (!mid) return;
    setVcpu(String(mid.vcpu));
    setRamGiB(String(mid.ramGiB));
    setDiskGiB(String(mid.diskGiB));
  }

  function markCustom() {
    setFamily('custom');
  }

  const summary = `${parsed.vmCount} × ${parsed.vcpu} vCPU · ${parsed.ramGiB} GiB RAM · ${parsed.diskGiB} GiB SSD`;

  return (
    <>
      <div className={styles.root}>
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <span className={styles.step}>1</span>
            <Flex direction="column" gap={0}>
              <Text variant="subheader-2">Виртуальные машины</Text>
              <Text variant="caption-2" color="secondary">
                Выберите семейство или задайте свою конфигурацию
              </Text>
            </Flex>
          </div>

          <div className={styles.chips} role="list">
            <button
              type="button"
              className={styles.chip}
              data-active={family === 'custom' ? 'true' : 'false'}
              onClick={markCustom}
            >
              Своя конфигурация
            </button>
            {FAMILIES.map((id) => (
              <button
                key={id}
                type="button"
                className={styles.chip}
                data-active={family === id ? 'true' : 'false'}
                onClick={() => applyFamily(id)}
              >
                {COMPUTE_FAMILY_TITLE[id]}
              </button>
            ))}
          </div>

          {family !== 'custom' ? (
            <Text variant="body-2" color="secondary">
              {COMPUTE_FAMILY_HINT[family]}
            </Text>
          ) : null}

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Количество VM
              </Text>
              <TextInput
                size="l"
                type="number"
                value={vmCount}
                onUpdate={(v) => {
                  markCustom();
                  setVmCount(v);
                }}
              />
            </label>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                vCPU на VM
              </Text>
              <TextInput
                size="l"
                type="number"
                value={vcpu}
                onUpdate={(v) => {
                  markCustom();
                  setVcpu(v);
                }}
              />
            </label>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                RAM на VM, GiB
              </Text>
              <TextInput
                size="l"
                type="number"
                value={ramGiB}
                onUpdate={(v) => {
                  markCustom();
                  setRamGiB(v);
                }}
              />
            </label>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                SSD на VM, GiB
              </Text>
              <TextInput
                size="l"
                type="number"
                value={diskGiB}
                onUpdate={(v) => {
                  markCustom();
                  setDiskGiB(v);
                }}
              />
            </label>
          </div>

          <div className={styles.summary}>
            <Text variant="body-2">Итого: {summary}</Text>
            <Text variant="body-2" color="secondary">
              НДС вкл. · месяц = 720 ч
            </Text>
          </div>
        </section>
      </div>

      <CalculatorSidebar
        period={period}
        result={result}
        loading={loading}
        eyebrow="Оптимальный вариант"
        subtitle={summary}
        emptyHint="Нет публичных котировок для этой конфигурации"
        footer={
          <Text variant="caption-2" color="secondary">
            Сеть, IP, образы и бэкапы не входят в пресет — смотрите каталог SKU.
          </Text>
        }
      />
    </>
  );
}
