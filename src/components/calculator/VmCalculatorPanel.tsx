'use client';

import {useMemo, useState} from 'react';
import {Flex, Icon, SegmentedRadioGroup, Select, Text} from '@gravity-ui/uikit';
import {
  Cpu,
  Cpus,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  PlanetEarth,
  ScalesBalanced,
  Server,
  TagRuble,
  Thunderbolt,
} from '@gravity-ui/icons';
import {
  COMPUTE_FAMILY_TITLE,
  computePresetsByFamily,
  type ComputeFamily,
  type ComputePreset,
  type DiskMedia,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {formatGiBCapacity, type PeriodMode} from '@/lib/calculator/quote-view';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {CalculatorSidebar} from './CalculatorSidebar';
import {GpuPresetGrid} from './GpuPresetGrid';
import {IntegerSliderField, SliderField} from './SliderField';
import {VmPresetGrid} from './VmPresetGrid';
import panelStyles from './CalculatorPanel.module.css';
import styles from './VmCalculatorPanel.module.css';

const FAMILIES: ComputeFamily[] = ['general', 'high-cpu', 'high-memory', 'low-cost'];

const FAMILY_ICON: Record<ComputeFamily, typeof Cpu> = {
  general: ScalesBalanced,
  'high-cpu': Cpus,
  'high-memory': Layers3Diagonal,
  'low-cost': TagRuble,
};

type VmMode = ComputeFamily | 'gpu';

const RAM_PER_VCPU: Record<ComputeFamily, number> = {
  general: 4,
  'high-cpu': 2,
  'high-memory': 8,
  'low-cost': 2,
};

const VCPU_STEPS: Record<ComputeFamily, number[]> = {
  'low-cost': [1, 2, 4, 8, 16, 32],
  general: [2, 4, 8, 16, 32, 64, 96, 128],
  'high-cpu': [2, 4, 8, 16, 32, 64, 96, 128],
  'high-memory': [2, 4, 8, 16, 32, 64, 96, 128],
};

const VM_STEPS = [1, 2, 4, 8, 16, 32, 64];
/** Up to 10 TiB — discrete ladder for the volume slider. */
const DISK_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000, 10240];

const DEFAULT = {
  family: 'general' as ComputeFamily,
  vmCount: 1,
  vcpu: 4,
  diskGiB: 10,
  diskMedia: 'ssd' as DiskMedia,
  publicIpCount: 1,
};

function nearestIn(options: number[], value: number): number {
  if (!options.length) return value;
  let best = options[0]!;
  let bestDist = Math.abs(best - value);
  for (const opt of options) {
    const d = Math.abs(opt - value);
    if (d < bestDist) {
      best = opt;
      bestDist = d;
    }
  }
  return best;
}

function ramFor(family: ComputeFamily, vcpu: number): number {
  return vcpu * RAM_PER_VCPU[family];
}

function pickDefaultGpu(presets: GpuPreset[]): GpuPreset | null {
  if (presets.length === 0) return null;
  return (
    presets.find((p) => p.gpuModelMatch === 'H100' && p.gpuCount === 1) ??
    presets.find((p) => p.gpuModelMatch === 'H100') ??
    presets[0]!
  );
}

function gpuModelOptions(presets: GpuPreset[]) {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const p of presets) {
    if (seen.has(p.gpuModelMatch)) continue;
    seen.add(p.gpuModelMatch);
    models.push(p.gpuModelMatch);
  }
  return [
    {value: 'all', content: 'Все карты'},
    ...models.map((m) => ({value: m, content: m})),
  ];
}

export function VmCalculatorPanel({
  period,
  gpuPresets = [],
}: {
  period: PeriodMode;
  gpuPresets?: GpuPreset[];
}) {
  const [mode, setMode] = useState<VmMode>(DEFAULT.family);
  const [family, setFamily] = useState<ComputeFamily>(DEFAULT.family);
  const [customRam, setCustomRam] = useState(false);
  const [vmCount, setVmCount] = useState(DEFAULT.vmCount);
  const [vcpu, setVcpu] = useState(DEFAULT.vcpu);
  const [ramGiB, setRamGiB] = useState(ramFor(DEFAULT.family, DEFAULT.vcpu));
  const [diskGiB, setDiskGiB] = useState(DEFAULT.diskGiB);
  const [diskMedia, setDiskMedia] = useState<DiskMedia>(DEFAULT.diskMedia);
  const [publicIpCount, setPublicIpCount] = useState(DEFAULT.publicIpCount);

  const defaultGpu = useMemo(() => pickDefaultGpu(gpuPresets), [gpuPresets]);
  const [gpuFilter, setGpuFilter] = useState<string>('all');
  const [selectedGpu, setSelectedGpu] = useState<GpuPreset | null>(null);

  const activeGpu = selectedGpu ?? defaultGpu;
  const isGpu = mode === 'gpu';

  const filteredGpuPresets = useMemo(() => {
    if (gpuFilter === 'all') return gpuPresets;
    return gpuPresets.filter((p) => p.gpuModelMatch === gpuFilter);
  }, [gpuPresets, gpuFilter]);

  const vcpuOptions = VCPU_STEPS[family];
  const ramOptions = vcpuOptions.map((v) => ramFor(family, v));

  const request = useMemo(() => {
    if (isGpu) {
      if (!activeGpu) return null;
      return {
        kind: 'gpu' as const,
        period,
        gpuModelMatch: activeGpu.gpuModelMatch,
        gpuCount: activeGpu.gpuCount,
        gpuInterconnect: activeGpu.gpuInterconnect ?? null,
        vcpu: activeGpu.vcpu,
        ramGiB: activeGpu.ramGiB,
        diskGiB: activeGpu.diskGiB,
        dedicated: activeGpu.dedicated === true,
        gpuMemoryGb: activeGpu.gpuMemoryGb ?? null,
      };
    }
    return {
      kind: 'compute' as const,
      period,
      vcpu,
      ramGiB,
      diskGiB,
      diskMedia,
      family,
      vmCount,
      publicIpCount,
    };
  }, [
    isGpu,
    activeGpu,
    period,
    vcpu,
    ramGiB,
    diskGiB,
    diskMedia,
    family,
    vmCount,
    publicIpCount,
  ]);

  const {result, loading} = useAdhocQuote(request);

  function applyMode(next: VmMode) {
    setMode(next);
    if (next === 'gpu') {
      if (!selectedGpu && defaultGpu) setSelectedGpu(defaultGpu);
      return;
    }
    applyFamily(next);
  }

  function applyFamily(next: ComputeFamily) {
    const steps = VCPU_STEPS[next];
    const nextVcpu = nearestIn(steps, vcpu);
    setFamily(next);
    setCustomRam(false);
    setVcpu(nextVcpu);
    setRamGiB(ramFor(next, nextVcpu));
  }

  function onVmCountChange(next: number) {
    setVmCount(next);
    setPublicIpCount((ips) => Math.min(ips, next));
  }

  function onVcpuChange(next: number) {
    setVcpu(next);
    if (!customRam) setRamGiB(ramFor(family, next));
  }

  function onRamChange(next: number) {
    setCustomRam(true);
    setRamGiB(next);
    const match = vcpuOptions.find((v) => ramFor(family, v) === next);
    if (match != null) {
      setVcpu(match);
      setCustomRam(false);
    }
  }

  function applyPreset(preset: ComputePreset) {
    setMode(preset.family);
    setFamily(preset.family);
    setCustomRam(false);
    setVcpu(preset.vcpu);
    setRamGiB(preset.ramGiB);
    setDiskGiB(nearestIn(DISK_STEPS, preset.diskGiB));
  }

  function applyGpuPreset(preset: GpuPreset) {
    setMode('gpu');
    setSelectedGpu(preset);
    if (gpuFilter !== 'all' && gpuFilter !== preset.gpuModelMatch) {
      setGpuFilter(preset.gpuModelMatch);
    }
  }

  function onGpuFilterChange(values: string[]) {
    const next = values[0] ?? 'all';
    setGpuFilter(next);
    const pool = next === 'all' ? gpuPresets : gpuPresets.filter((p) => p.gpuModelMatch === next);
    if (pool.length === 0) return;
    if (!activeGpu || (next !== 'all' && activeGpu.gpuModelMatch !== next)) {
      setSelectedGpu(pool[0]!);
    }
  }

  const activePresetId =
    computePresetsByFamily(family).find((p) => p.vcpu === vcpu && p.ramGiB === ramGiB)?.id ??
    null;

  const gpuHostRam =
    activeGpu?.ramGiB != null ? formatGiBCapacity(activeGpu.ramGiB) : '—';

  return (
    <>
      <div className={`${panelStyles.formColumn} ${styles.configCard}`}>
        <div className={styles.configInner}>
          <div className={`${panelStyles.topSlot} ${styles.familyBlock}`} data-mode={mode}>
            <SegmentedRadioGroup
              size="l"
              width="max"
              className={styles.familyGroup}
              value={mode}
              onUpdate={(v) => applyMode(v as VmMode)}
              aria-label="Семейство ВМ"
            >
              {[
                ...FAMILIES.map((id) => (
                  <SegmentedRadioGroup.Option key={id} value={id}>
                    <span className={styles.familyOption}>
                      <Icon data={FAMILY_ICON[id]} size={14} />
                      {COMPUTE_FAMILY_TITLE[id]}
                    </span>
                  </SegmentedRadioGroup.Option>
                )),
                <SegmentedRadioGroup.Option key="gpu" value="gpu">
                  <span className={styles.familyOption}>
                    <Icon data={Gpu} size={14} />
                    GPU
                  </span>
                </SegmentedRadioGroup.Option>,
              ]}
            </SegmentedRadioGroup>
          </div>

          {isGpu ? (
            <>
              <div className={styles.gpuSelectRow}>
                <Flex alignItems="center" gap={2} className={styles.gpuSelectLabel}>
                  <Icon data={Gpu} size={16} className={styles.fieldIcon} />
                  <Text variant="body-1">GPU</Text>
                </Flex>
                <Select
                  size="m"
                  width="max"
                  value={[gpuFilter]}
                  options={gpuModelOptions(gpuPresets)}
                  onUpdate={onGpuFilterChange}
                  placeholder="Карта"
                  disabled={gpuPresets.length === 0}
                />
              </div>

              <div className={styles.gpuHost}>
                <div className={styles.gpuHostStat}>
                  <Text variant="caption-2" color="secondary">
                    Карты
                  </Text>
                  <Text variant="subheader-2">
                    {activeGpu ? `${activeGpu.gpuCount}× ${activeGpu.gpuModelMatch}` : '—'}
                  </Text>
                </div>
                <div className={styles.gpuHostStat}>
                  <Text variant="caption-2" color="secondary">
                    vCPU
                  </Text>
                  <Text variant="subheader-2">
                    {activeGpu?.vcpu != null ? activeGpu.vcpu : '—'}
                  </Text>
                </div>
                <div className={styles.gpuHostStat}>
                  <Text variant="caption-2" color="secondary">
                    RAM
                  </Text>
                  <Text variant="subheader-2">{gpuHostRam}</Text>
                </div>
                <div className={styles.gpuHostStat}>
                  <Text variant="caption-2" color="secondary">
                    Диск
                  </Text>
                  <Text variant="subheader-2">
                    {activeGpu?.diskGiB != null
                      ? `${activeGpu.diskGiB} GiB SSD`
                      : activeGpu?.dedicated
                        ? 'dedicated'
                        : '—'}
                  </Text>
                </div>
              </div>

              <GpuPresetGrid
                presets={filteredGpuPresets}
                period={period}
                activePresetId={activeGpu?.id ?? null}
                onSelect={applyGpuPreset}
              />
            </>
          ) : (
            <>
              <section className={styles.fieldGroup} aria-label="Вычисления">
                <Text className={styles.groupTitle}>Вычисления</Text>
                <div className={styles.fields}>
                  <SliderField
                    icon={Server}
                    label="Число VM"
                    value={vmCount}
                    options={VM_STEPS}
                    scaleMin={1}
                    scaleMax={64}
                    unit="шт"
                    onUpdate={onVmCountChange}
                  />
                  <SliderField
                    icon={Cpu}
                    label="vCPU на VM"
                    value={vcpu}
                    options={vcpuOptions}
                    scaleMin={1}
                    scaleMax={128}
                    unit="vCPU"
                    onUpdate={onVcpuChange}
                  />
                  <SliderField
                    icon={Layers3Diagonal}
                    label="RAM на VM"
                    value={ramGiB}
                    options={ramOptions}
                    scaleMin={1}
                    scaleMax={1024}
                    unit="GiB"
                    onUpdate={onRamChange}
                  />
                </div>
              </section>

              <section className={styles.fieldGroup} aria-label="Хранилище">
                <Text className={styles.groupTitle}>Хранилище</Text>
                <div className={styles.fields}>
                  <div className={styles.diskTypeRow}>
                    <Flex alignItems="center" gap={2} className={styles.diskTypeLabel}>
                      <Icon data={HardDrive} size={16} className={styles.fieldIcon} />
                      <Text variant="body-1">Тип диска</Text>
                    </Flex>
                    <SegmentedRadioGroup
                      size="m"
                      value={diskMedia}
                      onUpdate={(v) => setDiskMedia(v as DiskMedia)}
                      aria-label="Тип диска"
                    >
                      <SegmentedRadioGroup.Option value="ssd">
                        <Flex alignItems="center" gap={1}>
                          <Icon data={Thunderbolt} size={14} />
                          SSD
                        </Flex>
                      </SegmentedRadioGroup.Option>
                      <SegmentedRadioGroup.Option value="hdd">
                        <Flex alignItems="center" gap={1}>
                          <Icon data={HardDrive} size={14} />
                          HDD
                        </Flex>
                      </SegmentedRadioGroup.Option>
                    </SegmentedRadioGroup>
                  </div>
                  <SliderField
                    icon={HardDrive}
                    label="Объём"
                    value={diskGiB}
                    options={DISK_STEPS}
                    scaleMin={10}
                    scaleMax={10240}
                    unit="GiB"
                    onUpdate={setDiskGiB}
                  />
                </div>
              </section>

              <section className={styles.fieldGroup} aria-label="Сеть">
                <Text className={styles.groupTitle}>Сеть</Text>
                <div className={styles.fields}>
                  <IntegerSliderField
                    icon={PlanetEarth}
                    label="Публичные IP"
                    value={publicIpCount}
                    min={0}
                    max={vmCount}
                    unit="шт"
                    onUpdate={setPublicIpCount}
                  />
                </div>
              </section>

              <VmPresetGrid
                family={family}
                period={period}
                vmCount={vmCount}
                diskMedia={diskMedia}
                publicIpCount={publicIpCount}
                activePresetId={activePresetId}
                onSelect={applyPreset}
              />
            </>
          )}
        </div>
      </div>

      <CalculatorSidebar
        period={period}
        result={result}
        loading={loading}
        emptyHint="Нет котировок"
      />
    </>
  );
}
