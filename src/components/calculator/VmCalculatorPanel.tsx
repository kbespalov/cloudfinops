'use client';

import Link from 'next/link';
import {useMemo, useState} from 'react';
import {
  Button,
  Flex,
  HelpMark,
  Icon,
  NumberInput,
  SegmentedRadioGroup,
  Select,
  Text,
} from '@gravity-ui/uikit';
import {
  Cpu,
  Cpus,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  PlanetEarth,
  ScalesBalanced,
  Server,
  Sparkles,
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
import {
  formatGiBCapacity,
  periodShortLabel,
  type PeriodMode,
} from '@/lib/calculator/quote-view';
import {vmChatPrompt} from '@/lib/calculator/self-host-links';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {chatUrlForQuery} from '@/components/home/homePrompts';
import {CalculatorSidebar} from './CalculatorSidebar';
import {GpuPresetGrid} from './GpuPresetGrid';
import {SliderField} from './SliderField';
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

type PublicIpMode = 'count' | 'per-vm';

function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function ipv4PerVmHint(count: number): string {
  const addr = pluralRu(count, 'IPv4-адрес', 'IPv4-адреса', 'IPv4-адресов');
  const verb = count === 1 ? 'Будет выделен' : 'Будет выделено';
  return `${verb} ${count} ${addr} для ${count} ВМ`;
}

function ipv4TotalsFragment(count: number): string {
  if (count <= 0) return 'Без публичных IPv4';
  if (count === 1) return '1 публичный IPv4';
  return `${count} публичных IPv4`;
}

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
  const [forceCustomPreset, setForceCustomPreset] = useState(false);
  const [vmCount, setVmCount] = useState(DEFAULT.vmCount);
  const [vcpu, setVcpu] = useState(DEFAULT.vcpu);
  const [ramGiB, setRamGiB] = useState(ramFor(DEFAULT.family, DEFAULT.vcpu));
  const [diskGiB, setDiskGiB] = useState(DEFAULT.diskGiB);
  const [diskMedia, setDiskMedia] = useState<DiskMedia>(DEFAULT.diskMedia);
  const [publicIpMode, setPublicIpMode] = useState<PublicIpMode>('count');
  const [manualIpCount, setManualIpCount] = useState(DEFAULT.publicIpCount);
  const publicIpCount =
    publicIpMode === 'per-vm' ? vmCount : Math.min(manualIpCount, vmCount);

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
    // In count mode keep the fixed value, but never above the fleet size.
    // In per-vm mode effective IPs follow vmCount via derivation — mode stays.
    setManualIpCount((ips) => Math.min(ips, next));
  }

  function onVcpuChange(next: number) {
    setForceCustomPreset(true);
    setVcpu(next);
    if (!customRam) setRamGiB(ramFor(family, next));
  }

  function onRamChange(next: number) {
    setForceCustomPreset(true);
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
    setForceCustomPreset(false);
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

  const matchedPresetId =
    computePresetsByFamily(family).find((p) => p.vcpu === vcpu && p.ramGiB === ramGiB)?.id ??
    null;
  const activePresetId = forceCustomPreset ? null : matchedPresetId;
  const customSelected = forceCustomPreset || matchedPresetId == null;

  const gpuHostRam =
    activeGpu?.ramGiB != null ? formatGiBCapacity(activeGpu.ramGiB) : '—';

  const diskShort = diskMedia === 'ssd' ? 'SSD' : 'HDD';
  const vmConfigSummary = isGpu
    ? null
    : {
        primary: vmCount === 1 ? '1 ВМ' : `${vmCount} ВМ`,
        secondary:
          vmCount === 1
            ? `${vcpu} vCPU · ${formatGiBCapacity(ramGiB)} RAM · ${diskShort} ${diskGiB} GiB`
            : `${vcpu} vCPU · ${formatGiBCapacity(ramGiB)} RAM · ${diskShort} ${diskGiB} GiB на одну ВМ`,
        totals: `Итого: ${vmCount * vcpu} vCPU · ${formatGiBCapacity(vmCount * ramGiB)} RAM · ${formatGiBCapacity(vmCount * diskGiB)} ${diskShort} · ${ipv4TotalsFragment(publicIpCount)}`,
      };

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
              <section className={styles.fieldGroup} aria-label="Конфигурация ВМ">
                <Text as="h3" className={styles.groupTitle}>
                  Конфигурация ВМ
                </Text>
                <div className={styles.fields}>
                  <SliderField
                    icon={Server}
                    label="Количество ВМ"
                    value={vmCount}
                    options={VM_STEPS}
                    scaleMin={1}
                    scaleMax={64}
                    unit="шт"
                    hint="Количество одинаковых виртуальных машин в расчёте."
                    onUpdate={onVmCountChange}
                  />
                  <SliderField
                    icon={Cpu}
                    label="vCPU на одну ВМ"
                    value={vcpu}
                    options={vcpuOptions}
                    scaleMin={1}
                    scaleMax={128}
                    unit="vCPU"
                    hint="Количество виртуальных процессоров для каждого экземпляра."
                    onUpdate={onVcpuChange}
                  />
                  <SliderField
                    icon={Layers3Diagonal}
                    label="RAM на одну ВМ"
                    value={ramGiB}
                    options={ramOptions}
                    scaleMin={1}
                    scaleMax={1024}
                    unit="GiB"
                    hint="Объём оперативной памяти для каждого экземпляра."
                    onUpdate={onRamChange}
                  />
                </div>
              </section>

              <section className={styles.fieldGroup} aria-label="Хранилище">
                <Text as="h3" className={styles.groupTitle}>
                  Хранилище
                </Text>
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
                          Сетевой SSD
                        </Flex>
                      </SegmentedRadioGroup.Option>
                      <SegmentedRadioGroup.Option value="hdd">
                        <Flex alignItems="center" gap={1}>
                          <Icon data={HardDrive} size={14} />
                          Сетевой HDD
                        </Flex>
                      </SegmentedRadioGroup.Option>
                    </SegmentedRadioGroup>
                  </div>
                  <SliderField
                    icon={HardDrive}
                    label="Объём диска"
                    value={diskGiB}
                    options={DISK_STEPS}
                    scaleMin={10}
                    scaleMax={10240}
                    unit="GiB"
                    hint="Объём сетевого диска на одну виртуальную машину. В цене умножается на количество ВМ."
                    onUpdate={setDiskGiB}
                  />
                </div>
              </section>

              <section className={styles.fieldGroup} aria-label="Сеть">
                <Text as="h3" className={styles.groupTitle}>
                  Сеть
                </Text>
                <div className={styles.ipRow}>
                  <Flex alignItems="center" gap={2} className={styles.ipLabel}>
                    <Icon data={PlanetEarth} size={16} className={styles.fieldIcon} />
                    <Text as="span" className={styles.ipLabelText}>
                      Публичные IPv4
                    </Text>
                    <HelpMark aria-label="Про публичные IPv4" iconSize="s">
                      Укажите общее количество публичных IPv4-адресов или назначьте по одному адресу
                      каждой виртуальной машине.
                    </HelpMark>
                  </Flex>
                  <div className={styles.ipControlBlock}>
                    <div className={styles.ipControls}>
                      <SegmentedRadioGroup
                        size="l"
                        width="auto"
                        className={styles.ipModeGroup}
                        value={publicIpMode}
                        onUpdate={(v) => setPublicIpMode(v as PublicIpMode)}
                        aria-label="Режим публичных IPv4"
                      >
                        <SegmentedRadioGroup.Option value="count">
                          Количество
                        </SegmentedRadioGroup.Option>
                        <SegmentedRadioGroup.Option value="per-vm">
                          По одному на ВМ
                        </SegmentedRadioGroup.Option>
                      </SegmentedRadioGroup>
                      {publicIpMode === 'count' ? (
                        <NumberInput
                          size="l"
                          min={0}
                          max={vmCount}
                          step={1}
                          allowDecimal={false}
                          value={publicIpCount}
                          onUpdate={(v) => {
                            if (v == null || !Number.isFinite(v)) return;
                            setManualIpCount(Math.min(vmCount, Math.max(0, Math.round(v))));
                          }}
                          endContent={
                            <Text variant="caption-1" color="secondary">
                              шт.
                            </Text>
                          }
                          className={styles.ipInput}
                          controlProps={{'aria-label': 'Количество публичных IPv4'}}
                        />
                      ) : null}
                    </div>
                    {publicIpMode === 'per-vm' ? (
                      <Text variant="caption-2" color="secondary" className={styles.ipHint}>
                        {ipv4PerVmHint(vmCount)}
                      </Text>
                    ) : null}
                  </div>
                </div>
              </section>

              <VmPresetGrid
                family={family}
                period={period}
                vmCount={vmCount}
                diskMedia={diskMedia}
                publicIpCount={publicIpCount}
                activePresetId={activePresetId}
                customSelected={customSelected}
                onSelect={applyPreset}
                onSelectCustom={() => setForceCustomPreset(true)}
              />
            </>
          )}
        </div>
      </div>

      <CalculatorSidebar
        period={period}
        result={result}
        loading={loading}
        emptyHint="Для выбранных параметров предложения не найдены"
        bestPriceHint="Самая низкая стоимость текущей выбранной конфигурации среди найденных провайдеров"
        bestPriceBadge="Самый дешёвый провайдер"
        configSummary={
          isGpu && activeGpu
            ? {
                primary: `1× ${activeGpu.gpuModelMatch}`,
                secondary: [
                  activeGpu.vcpu != null ? `${activeGpu.vcpu} vCPU` : null,
                  activeGpu.ramGiB != null ? formatGiBCapacity(activeGpu.ramGiB) + ' RAM' : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                tertiary:
                  activeGpu.diskGiB != null
                    ? `SSD ${activeGpu.diskGiB} GiB`
                    : activeGpu.dedicated
                      ? 'Выделенный узел'
                      : undefined,
              }
            : vmConfigSummary
        }
        extras={
          !isGpu ? (
            <div className={styles.chatBridge}>
              <Button
                component={Link}
                href={chatUrlForQuery(
                  vmChatPrompt({
                    vmCount,
                    vcpu,
                    ramGiB,
                    diskGiB,
                    diskMedia,
                    publicIpCount,
                    period: periodShortLabel(period),
                    providerName: result?.best?.providerName,
                    totalRub: result?.best?.total,
                  }),
                )}
                view="flat-secondary"
                size="m"
                prefetch
              >
                <Icon data={Sparkles} size={16} />
                Сравнить конфигурацию с AI
              </Button>
            </div>
          ) : null
        }
      />
    </>
  );
}
