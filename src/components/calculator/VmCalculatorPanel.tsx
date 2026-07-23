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
  ChartPie,
  CirclePause,
  Cpu,
  Cpus,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  PlanetEarth,
  ScalesBalanced,
  Server,
  ShieldCheck,
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
  type PurchaseModel,
  type VcpuShare,
} from '@/lib/calculator/presets';
import {
  formatGiBCapacity,
  periodShortLabel,
  type PeriodMode,
} from '@/lib/calculator/quote-view';
import {vmChatPrompt} from '@/lib/calculator/self-host-links';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {
  clampShapeToShare,
  defaultRamForShare,
  isFractionalShare,
  ramOptionsForShare,
  VCPU_SHARE_OPTIONS,
  vcpuShareHint,
  vcpuStepsForShare,
} from '@/lib/calculator/vcpu-share';
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

/** Short labels for the mobile horizontal chip scroller (full titles stay on desktop). */
const FAMILY_TITLE_MOBILE: Record<ComputeFamily, string> = {
  general: 'Общие',
  'high-cpu': 'CPU',
  'high-memory': 'RAM',
  'low-cost': 'Дешевле',
};

type VmMode = ComputeFamily | 'gpu';

const FAMILY_MODE_OPTIONS: {id: VmMode; icon: typeof Cpu; label: string; mobileLabel: string}[] = [
  ...FAMILIES.map((id) => ({
    id: id as VmMode,
    icon: FAMILY_ICON[id],
    label: COMPUTE_FAMILY_TITLE[id],
    mobileLabel: FAMILY_TITLE_MOBILE[id],
  })),
  {id: 'gpu', icon: Gpu, label: 'GPU', mobileLabel: 'GPU'},
];

const VM_STEPS = [1, 2, 4, 8, 16, 32, 64];
/** Up to 10 TiB — discrete ladder for the volume slider. */
const DISK_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 4000, 8000, 10240];

const DEFAULT = {
  family: 'general' as ComputeFamily,
  vmCount: 1,
  vcpu: 4,
  diskGiB: 10,
  diskMedia: 'ssd' as DiskMedia,
  purchaseModel: 'on-demand' as PurchaseModel,
  vcpuShare: '100%' as VcpuShare,
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
  const [ramGiB, setRamGiB] = useState(
    defaultRamForShare(DEFAULT.vcpuShare, DEFAULT.family, DEFAULT.vcpu),
  );
  const [diskGiB, setDiskGiB] = useState(DEFAULT.diskGiB);
  const [diskMedia, setDiskMedia] = useState<DiskMedia>(DEFAULT.diskMedia);
  const [purchaseModel, setPurchaseModel] = useState<PurchaseModel>(DEFAULT.purchaseModel);
  const [vcpuShare, setVcpuShare] = useState<VcpuShare>(DEFAULT.vcpuShare);
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

  const vcpuOptions = vcpuStepsForShare(vcpuShare, family);
  const ramOptions = ramOptionsForShare(vcpuShare, family, vcpu);

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
      purchaseModel,
      vcpuShare,
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
    purchaseModel,
    vcpuShare,
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
    const clamped = clampShapeToShare(vcpuShare, next, vcpu, ramGiB);
    setFamily(next);
    setCustomRam(false);
    setVcpu(clamped.vcpu);
    setRamGiB(defaultRamForShare(vcpuShare, next, clamped.vcpu));
  }

  function onVmCountChange(next: number) {
    setVmCount(next);
    // In count mode keep the fixed value, but never above the fleet size.
    // In per-vm mode effective IPs follow vmCount via derivation — mode stays.
    setManualIpCount((ips) => Math.min(ips, next));
  }

  function onVcpuShareChange(next: VcpuShare) {
    const clamped = clampShapeToShare(next, family, vcpu, ramGiB);
    setVcpuShare(next);
    setForceCustomPreset(true);
    setCustomRam(false);
    setVcpu(clamped.vcpu);
    setRamGiB(defaultRamForShare(next, family, clamped.vcpu));
  }

  function onVcpuChange(next: number) {
    setForceCustomPreset(true);
    setVcpu(next);
    if (!customRam) setRamGiB(defaultRamForShare(vcpuShare, family, next));
    else {
      const options = ramOptionsForShare(vcpuShare, family, next);
      setRamGiB(nearestIn(options, ramGiB));
    }
  }

  function onRamChange(next: number) {
    setForceCustomPreset(true);
    setCustomRam(true);
    setRamGiB(next);
    if (!isFractionalShare(vcpuShare)) {
      const match = vcpuOptions.find(
        (v) => defaultRamForShare(vcpuShare, family, v) === next,
      );
      if (match != null) {
        setVcpu(match);
        setCustomRam(false);
      }
    }
  }

  function applyPreset(preset: ComputePreset) {
    const clamped = clampShapeToShare(vcpuShare, preset.family, preset.vcpu, preset.ramGiB);
    setMode(preset.family);
    setFamily(preset.family);
    setCustomRam(false);
    setForceCustomPreset(false);
    setVcpu(clamped.vcpu);
    setRamGiB(clamped.ramGiB);
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
  const purchaseShort = purchaseModel === 'preemptible' ? 'прерываемая' : 'обычная';
  const vmEmptyHint = (() => {
    if (
      purchaseModel === 'preemptible' &&
      (vcpuShare === '10%' || vcpuShare === '30%')
    ) {
      return 'Прерываемые тарифы с долей 10%/30% в каталоге нет (эконом Cloud.ru — только обычные ВМ). Выберите обычную ВМ или долю Yandex 5/20/50/100%.';
    }
    if (isFractionalShare(vcpuShare)) {
      return `Нет предложений для доли ${vcpuShare} и выбранного типа ВМ. Для Yandex shared — до 4 vCPU (при 5% до 8 GiB RAM); смените долю или тип.`;
    }
    return 'Для выбранных параметров предложения не найдены';
  })();
  const vmConfigSummary = isGpu
    ? null
    : {
        primary: vmCount === 1 ? `1 ВМ · ${purchaseShort}` : `${vmCount} ВМ · ${purchaseShort}`,
        secondary:
          vmCount === 1
            ? `${vcpu} vCPU · доля ${vcpuShare} · ${formatGiBCapacity(ramGiB)} RAM · ${diskShort} ${diskGiB} GiB`
            : `${vcpu} vCPU · доля ${vcpuShare} · ${formatGiBCapacity(ramGiB)} RAM · ${diskShort} ${diskGiB} GiB на одну ВМ`,
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
              className={`${styles.familyGroup} ${styles.familyDesktop}`}
              value={mode}
              onUpdate={(v) => applyMode(v as VmMode)}
              aria-label="Семейство ВМ"
            >
              {FAMILY_MODE_OPTIONS.map((opt) => (
                <SegmentedRadioGroup.Option key={opt.id} value={opt.id}>
                  <span className={styles.familyOption}>
                    <Icon data={opt.icon} size={14} />
                    {opt.label}
                  </span>
                </SegmentedRadioGroup.Option>
              ))}
            </SegmentedRadioGroup>

            <div
              className={styles.familyMobile}
              role="radiogroup"
              aria-label="Семейство ВМ"
            >
              {FAMILY_MODE_OPTIONS.map((opt) => {
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={styles.familyChip}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => applyMode(opt.id)}
                  >
                    <Icon data={opt.icon} size={16} />
                    <span>{opt.mobileLabel}</span>
                  </button>
                );
              })}
            </div>
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
                  <div className={styles.diskTypeRow}>
                    <Flex alignItems="center" gap={2} className={styles.diskTypeLabel}>
                      <Icon data={Server} size={16} className={styles.fieldIcon} />
                      <Text variant="body-1">Тип ВМ</Text>
                      <HelpMark aria-label="Про тип ВМ" iconSize="s">
                        Обычная ВМ работает постоянно; на неё действует SLA провайдера.
                        Прерываемая дешевле, но может быть остановлена в любой момент (обычно не
                        дольше 24 часов), без SLA. В каталоге прерываемые тарифы есть у Yandex Cloud
                        и Selectel — у остальных провайдеров при выборе «Прерываемая» цена не
                        покажется.
                      </HelpMark>
                    </Flex>
                    <SegmentedRadioGroup
                      size="m"
                      value={purchaseModel}
                      onUpdate={(v) => setPurchaseModel(v as PurchaseModel)}
                      aria-label="Тип виртуальной машины"
                    >
                      <SegmentedRadioGroup.Option value="on-demand">
                        <Flex alignItems="center" gap={1}>
                          <Icon data={ShieldCheck} size={14} />
                          Обычная
                        </Flex>
                      </SegmentedRadioGroup.Option>
                      <SegmentedRadioGroup.Option value="preemptible">
                        <Flex alignItems="center" gap={1}>
                          <Icon data={CirclePause} size={14} />
                          Прерываемая
                        </Flex>
                      </SegmentedRadioGroup.Option>
                    </SegmentedRadioGroup>
                  </div>
                  <div className={styles.shareRow}>
                    <Flex alignItems="center" gap={2} className={styles.diskTypeLabel}>
                      <Icon data={ChartPie} size={16} className={styles.fieldIcon} />
                      <Text variant="body-1">Доля CPU</Text>
                      <HelpMark aria-label="Про долю CPU" iconSize="s">
                        Гарантированная доля производительности ядра. 100% — выделенное ядро. Меньше
                        100% — дешевле (Yandex: 5/20/50%, до 4 vCPU и 16 GiB; Cloud.ru: 10/30% по
                        флейворам). Azure B-series — похожая burstable-модель, в каталоге РФ не
                        сравниваем. {vcpuShareHint(vcpuShare)}
                      </HelpMark>
                    </Flex>
                    <SegmentedRadioGroup
                      size="m"
                      value={vcpuShare}
                      onUpdate={(v) => onVcpuShareChange(v as VcpuShare)}
                      aria-label="Доля CPU"
                      className={styles.shareGroup}
                    >
                      {VCPU_SHARE_OPTIONS.map((share) => (
                        <SegmentedRadioGroup.Option key={share} value={share}>
                          {share}
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                  {isFractionalShare(vcpuShare) ? (
                    <Text variant="caption-2" color="secondary" className={styles.shareHint}>
                      {vcpuShareHint(vcpuShare)}
                    </Text>
                  ) : null}
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
                    scaleMin={vcpuOptions[0] ?? 1}
                    scaleMax={vcpuOptions[vcpuOptions.length - 1] ?? 128}
                    unit="vCPU"
                    hint={
                      isFractionalShare(vcpuShare)
                        ? `Количество vCPU при доле ${vcpuShare}. Для долей Yandex Cloud доступны только 2 или 4 ядра.`
                        : 'Количество виртуальных процессоров для каждого экземпляра.'
                    }
                    onUpdate={onVcpuChange}
                  />
                  <SliderField
                    icon={Layers3Diagonal}
                    label="RAM на одну ВМ"
                    value={ramGiB}
                    options={ramOptions}
                    scaleMin={ramOptions[0] ?? 1}
                    scaleMax={ramOptions[ramOptions.length - 1] ?? 1024}
                    unit="GiB"
                    hint={
                      isFractionalShare(vcpuShare)
                        ? `Объём RAM при доле ${vcpuShare}; лимит зависит от провайдера и числа ядер.`
                        : 'Объём оперативной памяти для каждого экземпляра.'
                    }
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
                purchaseModel={purchaseModel}
                vcpuShare={vcpuShare}
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
        emptyHint={isGpu ? 'Для выбранных параметров предложения не найдены' : vmEmptyHint}
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
                    purchaseModel,
                    vcpuShare,
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
