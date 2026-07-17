'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ComponentProps,
} from 'react';
import {
  Button,
  Flex,
  Icon,
  Pagination,
  PlaceholderContainer,
  SegmentedRadioGroup,
  Select,
  Table,
  Tab,
  TabList,
  TabProvider,
  Text,
  TextInput,
} from '@gravity-ui/uikit';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Cpu,
  Database,
  FaceRobot,
  Globe,
  Gpu,
  HardDrive,
  Layers3Diagonal,
  Magnifier,
  Picture,
  Server,
  SquareDashed,
  SquareListUl,
} from '@gravity-ui/icons';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {
  CATEGORY_TITLE,
  billingUnitLabel,
  catalog,
  displayAmount,
  displayMeterName,
  extractAiModelFamily,
  listAiModelOptions,
  meterMatchesAiModel,
  extractDiskMedia,
  extractDiskVariant,
  extractGpuModel,
  extractKubernetesAvailability,
  extractRamGiB,
  extractStorageClass,
  extractVcpu,
  isAiTokenMeter,
  isDiskMeter,
  isImageMeter,
  isSnapshotMeter,
  formatAsOf,
  formatPlatform,
  kubernetesAvailabilityLabel,
  kubernetesFaultToleranceHint,
  AI_FAMILY_TITLE,
  meterMatchesAiFacet,
  meterMatchesAiFamilyFacet,
  meterMatchesCategory,
  meterMatchesComputeFacet,
  meterMatchesDiskFacet,
  meterMatchesGpuFacet,
  meterMatchesKubernetesAvailabilityFacet,
  meterMatchesSearch,
  meterMatchesNetworkFacet,
  meterMatchesStorageFacet,
  meterMatchesStorageKindFacet,
  meterMatchesVcpuPlatformFacet,
  meterMatchesVcpuShareFacet,
  meterPriceLabel,
  paramsLabel,
  periodLabel,
  sortMeters,
  isRequestMeter,
  type AiFacet,
  type AiFamilyFacet,
  type CatalogMeter,
  type CategoryFilter,
  type ComputeFacet,
  type DiskFacet,
  type GpuFacet,
  type KubernetesAvailabilityFacet,
  type NetworkFacet,
  type PeriodMode,
  type SortKey,
  type StorageFacet,
  type StorageKindFacet,
  type VcpuPlatformFacet,
  type VcpuShareFacet,
} from '@/lib/catalog';
import {SkuDrawer} from '@/components/catalog/SkuDrawer';
import {ProviderMark} from '@/components/catalog/ProviderMark';
import {AppHeader} from '@/components/AppHeader';
import styles from './CatalogPage.module.css';

const PROVIDER_FACET_ORDER = [
  'yandex-cloud',
  'vk-cloud',
  'selectel',
  'cloud-ru',
  'mws-cloud',
  't1-cloud',
] as const;

const PROVIDER_SHORT_TITLE: Record<string, string> = {
  'yandex-cloud': 'Yandex',
  'vk-cloud': 'VK',
  selectel: 'Selectel',
  'cloud-ru': 'Cloud.ru',
  'mws-cloud': 'MWS',
  't1-cloud': 'T1',
};

const PAGE_SIZE = 40;

const CATEGORY_FILTERS: {id: CategoryFilter; title: string}[] = [
  {id: 'all', title: 'Все'},
  {id: 'compute', title: 'Compute'},
  {id: 'gpu', title: 'GPU'},
  {id: 'storage', title: 'Storage'},
  {id: 'network', title: 'Network'},
  {id: 'kubernetes', title: 'Kubernetes'},
  {id: 'ai', title: 'AI'},
];

const AI_FACET_OPTIONS: {value: AiFacet; title: string; icon: typeof Layers3Diagonal}[] = [
  {value: 'all', title: 'Все', icon: FaceRobot},
  {value: 'input', title: 'Input', icon: ArrowDownToLine},
  {value: 'output', title: 'Output', icon: ArrowUpFromLine},
];

const AI_FAMILY_OPTIONS: {value: AiFamilyFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'qwen', title: AI_FAMILY_TITLE.qwen},
  {value: 'alice', title: AI_FAMILY_TITLE.alice},
  {value: 'yandexgpt', title: AI_FAMILY_TITLE.yandexgpt},
  {value: 'deepseek', title: AI_FAMILY_TITLE.deepseek},
  {value: 'gemma', title: AI_FAMILY_TITLE.gemma},
  {value: 'gpt-oss', title: AI_FAMILY_TITLE['gpt-oss']},
  {value: 'glm', title: AI_FAMILY_TITLE.glm},
  {value: 'gigachat', title: AI_FAMILY_TITLE.gigachat},
  {value: 'kimi', title: AI_FAMILY_TITLE.kimi},
];

const FACET_OPTIONS: {
  value: ComputeFacet;
  title: string;
  icon: typeof Cpu;
}[] = [
  {value: 'all', title: 'Все', icon: Layers3Diagonal},
  {value: 'flavor', title: 'VM', icon: Server},
  {value: 'vcpu', title: 'Ядра', icon: Cpu},
  {value: 'ram', title: 'RAM', icon: SquareDashed},
  {value: 'disk', title: 'Диск', icon: HardDrive},
  {value: 'image', title: 'Образ', icon: Picture},
  {value: 'snapshot', title: 'Снимок', icon: Copy},
];

const GPU_FACET_OPTIONS: {value: GpuFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'h100', title: 'H100'},
  {value: 'h200', title: 'H200'},
  {value: 'b300', title: 'B300'},
  {value: 'a100', title: 'A100'},
  {value: 'l40s', title: 'L40S'},
  {value: 'v100', title: 'V100'},
  {value: 'l4', title: 'L4'},
  {value: 'a30', title: 'A30'},
  {value: 't4', title: 'T4'},
];

const STORAGE_KIND_OPTIONS: {value: StorageKindFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'capacity', title: 'Хранение'},
  {value: 'operations', title: 'Операции'},
];

const NETWORK_FACET_OPTIONS: {value: NetworkFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'public-ip', title: 'Публичный IP'},
  {value: 'egress', title: 'Исходящий трафик'},
];

const KUBERNETES_AVAILABILITY_OPTIONS: {
  value: KubernetesAvailabilityFacet;
  title: string;
}[] = [
  {value: 'all', title: 'Все'},
  {value: 'zonal', title: 'Зональный'},
  {value: 'regional', title: 'Региональный'},
];

const STORAGE_FACET_OPTIONS: {value: StorageFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'standard', title: 'Standard'},
  {value: 'warm', title: 'Warm'},
  {value: 'cold', title: 'Cold'},
  {value: 'ice', title: 'Ice'},
];

const DISK_FACET_OPTIONS: {value: DiskFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'hdd', title: 'HDD'},
  {value: 'ssd', title: 'SSD'},
  {value: 'nvme', title: 'NVMe'},
];

const VCPU_SHARE_OPTIONS: {value: VcpuShareFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'dedicated', title: '100%'},
  {value: 'shared', title: 'Shared'},
];

const VCPU_PLATFORM_OPTIONS: {value: VcpuPlatformFacet; title: string}[] = [
  {value: 'all', title: 'Все'},
  {value: 'ice-lake', title: 'Ice Lake'},
  {value: 'cascade-lake', title: 'Cascade'},
  {value: 'sapphire', title: 'Sapphire'},
  {value: 'other', title: 'Другое'},
];

function parseCategory(v: string | null): CategoryFilter {
  if (v && CATEGORY_FILTERS.some((c) => c.id === v)) return v as CategoryFilter;
  return 'all';
}

function parseFacet(v: string | null): ComputeFacet {
  if (
    v === 'vcpu' ||
    v === 'ram' ||
    v === 'flavor' ||
    v === 'disk' ||
    v === 'image' ||
    v === 'snapshot' ||
    v === 'all'
  ) {
    return v;
  }
  return 'all';
}

function parseGpuFacet(v: string | null): GpuFacet {
  if (
    v === 'h100' ||
    v === 'h200' ||
    v === 'b300' ||
    v === 'a100' ||
    v === 'l40s' ||
    v === 'v100' ||
    v === 'l4' ||
    v === 'a30' ||
    v === 't4' ||
    v === 'all'
  ) {
    return v;
  }
  return 'all';
}

function parseStorageFacet(v: string | null): StorageFacet {
  if (v === 'standard' || v === 'warm' || v === 'cold' || v === 'ice' || v === 'all') return v;
  return 'all';
}

function parseStorageKindFacet(v: string | null): StorageKindFacet {
  if (v === 'capacity' || v === 'operations' || v === 'all') return v;
  return 'all';
}

function parseNetworkFacet(v: string | null): NetworkFacet {
  if (v === 'public-ip' || v === 'egress' || v === 'all') return v;
  if (v === 'ip') return 'public-ip';
  return 'all';
}

function parseKubernetesAvailabilityFacet(v: string | null): KubernetesAvailabilityFacet {
  if (v === 'zonal' || v === 'regional' || v === 'all') return v;
  return 'all';
}

function parseAiFacet(v: string | null): AiFacet {
  if (v === 'input' || v === 'output' || v === 'all') return v;
  return 'all';
}

function parseAiFamilyFacet(v: string | null): AiFamilyFacet {
  if (
    v === 'gpt-oss' ||
    v === 'qwen' ||
    v === 'gemma' ||
    v === 'yandexgpt' ||
    v === 'alice' ||
    v === 'deepseek' ||
    v === 'glm' ||
    v === 'gigachat' ||
    v === 'kimi' ||
    v === 'all'
  ) {
    return v;
  }
  return 'all';
}

function parseDiskFacet(v: string | null): DiskFacet {
  if (v === 'hdd' || v === 'ssd' || v === 'nvme' || v === 'all') return v;
  return 'all';
}

function parseVcpuShareFacet(v: string | null): VcpuShareFacet {
  if (v === 'dedicated' || v === 'shared' || v === 'all') return v;
  if (v === '100') return 'dedicated';
  return 'all';
}

function parseVcpuPlatformFacet(v: string | null): VcpuPlatformFacet {
  if (
    v === 'ice-lake' ||
    v === 'cascade-lake' ||
    v === 'sapphire' ||
    v === 'other' ||
    v === 'all'
  ) {
    return v;
  }
  return 'all';
}

function parsePeriod(v: string | null): PeriodMode {
  if (v === 'unit' || v === 'month' || v === 'year') return v;
  return 'month';
}

function parseSort(v: string | null): SortKey {
  if (v === 'price-asc' || v === 'price-desc' || v === 'name' || v === 'provider') return v;
  return 'price-asc';
}

function priceColumnTitle(period: PeriodMode, category: CategoryFilter): string {
  if (category === 'ai') return 'Цена / 1M ток.';
  if (period === 'month') return 'Цена / мес';
  if (period === 'year') return 'Цена / год';
  return 'Цена / час';
}

export function CatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const facetRowRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<PeriodMode>(() => parsePeriod(searchParams.get('period')));
  const [category, setCategory] = useState<CategoryFilter>(() =>
    parseCategory(searchParams.get('category')),
  );
  const [facet, setFacet] = useState<ComputeFacet>(() => parseFacet(searchParams.get('facet')));
  const [gpuFacet, setGpuFacet] = useState<GpuFacet>(() => parseGpuFacet(searchParams.get('gpu')));
  const [storageFacet, setStorageFacet] = useState<StorageFacet>(() =>
    parseStorageFacet(searchParams.get('storage')),
  );
  const [storageKindFacet, setStorageKindFacet] = useState<StorageKindFacet>(() =>
    parseStorageKindFacet(searchParams.get('kind')),
  );
  const [networkFacet, setNetworkFacet] = useState<NetworkFacet>(() =>
    parseNetworkFacet(searchParams.get('net')),
  );
  const [kubernetesAvailabilityFacet, setKubernetesAvailabilityFacet] =
    useState<KubernetesAvailabilityFacet>(() =>
      parseKubernetesAvailabilityFacet(searchParams.get('k8s')),
    );
  const [aiFacet, setAiFacet] = useState<AiFacet>(() => parseAiFacet(searchParams.get('ai')));
  const [aiFamilyFacet, setAiFamilyFacet] = useState<AiFamilyFacet>(() =>
    parseAiFamilyFacet(searchParams.get('family')),
  );
  const [aiModel, setAiModel] = useState<string>(() => searchParams.get('model') || '');
  const [diskFacet, setDiskFacet] = useState<DiskFacet>(() =>
    parseDiskFacet(searchParams.get('disk')),
  );
  const [vcpuShareFacet, setVcpuShareFacet] = useState<VcpuShareFacet>(() =>
    parseVcpuShareFacet(searchParams.get('share')),
  );
  const [vcpuPlatformFacet, setVcpuPlatformFacet] = useState<VcpuPlatformFacet>(() =>
    parseVcpuPlatformFacet(searchParams.get('cpu')),
  );
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const deferredSearch = useDeferredValue(search);
  const [providers, setProviders] = useState<string[]>(() => {
    const raw = searchParams.get('providers');
    return raw ? raw.split(',').filter(Boolean) : [];
  });
  const [sort, setSort] = useState<SortKey>(() => parseSort(searchParams.get('sort')));
  const [page, setPage] = useState(1);
  const [activeMeter, setActiveMeter] = useState<CatalogMeter | null>(null);

  // Debounced URL sync — avoid router thrash on every keystroke
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (category === 'compute' && facet !== 'all') params.set('facet', facet);
      if (category === 'compute' && facet === 'disk' && diskFacet !== 'all') {
        params.set('disk', diskFacet);
      }
      if (category === 'compute' && facet === 'vcpu') {
        if (vcpuShareFacet !== 'all') params.set('share', vcpuShareFacet);
        if (vcpuPlatformFacet !== 'all') params.set('cpu', vcpuPlatformFacet);
      }
      if (category === 'gpu' && gpuFacet !== 'all') params.set('gpu', gpuFacet);
      if (category === 'storage' && storageFacet !== 'all') params.set('storage', storageFacet);
      if (category === 'storage' && storageKindFacet !== 'all') params.set('kind', storageKindFacet);
      if (category === 'network' && networkFacet !== 'all') params.set('net', networkFacet);
      if (category === 'kubernetes' && kubernetesAvailabilityFacet !== 'all') {
        params.set('k8s', kubernetesAvailabilityFacet);
      }
      if (category === 'ai' && aiFacet !== 'all') params.set('ai', aiFacet);
      if (category === 'ai' && aiFamilyFacet !== 'all') params.set('family', aiFamilyFacet);
      if (category === 'ai' && aiModel) params.set('model', aiModel);
      if (period !== 'month') params.set('period', period);
      if (search.trim()) params.set('q', search.trim());
      if (providers.length) params.set('providers', providers.join(','));
      if (sort !== 'price-asc') params.set('sort', sort);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    category,
    facet,
    diskFacet,
    vcpuShareFacet,
    vcpuPlatformFacet,
    gpuFacet,
    storageFacet,
    storageKindFacet,
    networkFacet,
    kubernetesAvailabilityFacet,
    aiFacet,
    aiFamilyFacet,
    aiModel,
    pathname,
    period,
    providers,
    router,
    search,
    sort,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const providerOptions = useMemo(
    () =>
      catalog.providers.map((p) => ({
        value: p.id,
        content: `${p.name} (${p.count})`,
      })),
    [],
  );

  const providerFacetOptions = useMemo(() => {
    const byId = new Map(catalog.providers.map((p) => [p.id, p]));
    return PROVIDER_FACET_ORDER.filter((id) => byId.has(id)).map((id) => ({
      value: id,
      title: PROVIDER_SHORT_TITLE[id] || byId.get(id)!.name,
    }));
  }, []);

  /** Single-select mirror of providers[] for the All-tab chip row. */
  const providerFacet = providers.length === 1 ? providers[0]! : 'all';

  // Deep-link ?providers=a,b on All is not representable by chips — keep the first.
  useEffect(() => {
    if (category === 'all' && providers.length > 1) {
      setProviders([providers[0]!]);
    }
  }, [category, providers]);

  const baseMeters = useMemo(
    () => catalog.meters.filter((m) => m.status === 'available'),
    [],
  );

  const providerFacetCounts = useMemo(() => {
    const counts: Record<string, number> = {all: baseMeters.length};
    for (const id of PROVIDER_FACET_ORDER) counts[id] = 0;
    for (const m of baseMeters) {
      if (m.provider in counts) counts[m.provider] += 1;
    }
    return counts;
  }, [baseMeters]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: baseMeters.length,
      compute: 0,
      gpu: 0,
      storage: 0,
      network: 0,
      kubernetes: 0,
      ai: 0,
    };
    for (const m of baseMeters) {
      if (m.categoryKey in counts) counts[m.categoryKey as CategoryFilter] += 1;
    }
    return counts;
  }, [baseMeters]);

  const facetCounts = useMemo(() => {
    const compute = baseMeters.filter((m) => m.categoryKey === 'compute');
    return {
      all: compute.length,
      vcpu: compute.filter((m) => meterMatchesComputeFacet(m, 'vcpu')).length,
      ram: compute.filter((m) => meterMatchesComputeFacet(m, 'ram')).length,
      flavor: compute.filter((m) => meterMatchesComputeFacet(m, 'flavor')).length,
      disk: compute.filter((m) => meterMatchesComputeFacet(m, 'disk')).length,
      image: compute.filter((m) => meterMatchesComputeFacet(m, 'image')).length,
      snapshot: compute.filter((m) => meterMatchesComputeFacet(m, 'snapshot')).length,
    };
  }, [baseMeters]);

  const gpuFacetCounts = useMemo(() => {
    const gpus = baseMeters.filter((m) => m.categoryKey === 'gpu');
    return {
      all: gpus.length,
      h100: gpus.filter((m) => meterMatchesGpuFacet(m, 'h100')).length,
      h200: gpus.filter((m) => meterMatchesGpuFacet(m, 'h200')).length,
      b300: gpus.filter((m) => meterMatchesGpuFacet(m, 'b300')).length,
      a100: gpus.filter((m) => meterMatchesGpuFacet(m, 'a100')).length,
      l40s: gpus.filter((m) => meterMatchesGpuFacet(m, 'l40s')).length,
      v100: gpus.filter((m) => meterMatchesGpuFacet(m, 'v100')).length,
      l4: gpus.filter((m) => meterMatchesGpuFacet(m, 'l4')).length,
      a30: gpus.filter((m) => meterMatchesGpuFacet(m, 'a30')).length,
      t4: gpus.filter((m) => meterMatchesGpuFacet(m, 't4')).length,
    };
  }, [baseMeters]);

  const storageMeters = useMemo(
    () => baseMeters.filter((m) => m.categoryKey === 'storage'),
    [baseMeters],
  );

  const networkMeters = useMemo(
    () => baseMeters.filter((m) => m.categoryKey === 'network'),
    [baseMeters],
  );

  const storageKindCounts = useMemo(
    () => ({
      all: storageMeters.length,
      capacity: storageMeters.filter((m) => meterMatchesStorageKindFacet(m, 'capacity')).length,
      operations: storageMeters.filter((m) => meterMatchesStorageKindFacet(m, 'operations'))
        .length,
    }),
    [storageMeters],
  );

  const networkFacetCounts = useMemo(
    () => ({
      all: networkMeters.length,
      'public-ip': networkMeters.filter((m) => meterMatchesNetworkFacet(m, 'public-ip')).length,
      egress: networkMeters.filter((m) => meterMatchesNetworkFacet(m, 'egress')).length,
    }),
    [networkMeters],
  );

  const kubernetesMeters = useMemo(
    () => baseMeters.filter((m) => m.categoryKey === 'kubernetes'),
    [baseMeters],
  );

  const kubernetesAvailabilityCounts = useMemo(
    () => ({
      all: kubernetesMeters.length,
      zonal: kubernetesMeters.filter((m) =>
        meterMatchesKubernetesAvailabilityFacet(m, 'zonal'),
      ).length,
      regional: kubernetesMeters.filter((m) =>
        meterMatchesKubernetesAvailabilityFacet(m, 'regional'),
      ).length,
    }),
    [kubernetesMeters],
  );

  const aiMeters = useMemo(
    () => baseMeters.filter((m) => m.categoryKey === 'ai'),
    [baseMeters],
  );

  /** AI meters after provider + family + model — drives Input/Output counters. */
  const aiMetersScoped = useMemo(() => {
    const providerSet = providers.length ? new Set(providers) : null;
    return aiMeters.filter((m) => {
      if (providerSet && !providerSet.has(m.provider)) return false;
      if (!meterMatchesAiFamilyFacet(m, aiFamilyFacet)) return false;
      if (!meterMatchesAiModel(m, aiModel || null)) return false;
      return true;
    });
  }, [aiMeters, providers, aiFamilyFacet, aiModel]);

  const aiFacetCounts = useMemo(
    () => ({
      all: aiMetersScoped.length,
      input: aiMetersScoped.filter((m) => meterMatchesAiFacet(m, 'input')).length,
      output: aiMetersScoped.filter((m) => meterMatchesAiFacet(m, 'output')).length,
    }),
    [aiMetersScoped],
  );

  /** Family counters respect provider + token direction (not exact model). */
  const aiFamilyCounts = useMemo(() => {
    const providerSet = providers.length ? new Set(providers) : null;
    const scope = aiMeters.filter((m) => {
      if (providerSet && !providerSet.has(m.provider)) return false;
      if (!meterMatchesAiFacet(m, aiFacet)) return false;
      return true;
    });
    return {
      all: scope.length,
      'gpt-oss': scope.filter((m) => meterMatchesAiFamilyFacet(m, 'gpt-oss')).length,
      qwen: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'qwen')).length,
      gemma: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'gemma')).length,
      yandexgpt: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'yandexgpt')).length,
      alice: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'alice')).length,
      deepseek: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'deepseek')).length,
      glm: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'glm')).length,
      gigachat: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'gigachat')).length,
      kimi: scope.filter((m) => meterMatchesAiFamilyFacet(m, 'kimi')).length,
    };
  }, [aiMeters, providers, aiFacet]);

  const aiModelOptions = useMemo(() => {
    // Model list respects provider + family, but not the selected model itself.
    const providerSet = providers.length ? new Set(providers) : null;
    const scope = aiMeters.filter((m) => {
      if (providerSet && !providerSet.has(m.provider)) return false;
      if (!meterMatchesAiFamilyFacet(m, aiFamilyFacet)) return false;
      return true;
    });
    const options = listAiModelOptions(scope);
    return options.map((o) => ({
      value: o.value,
      content: `${o.content} · ${o.count}`,
    }));
  }, [aiMeters, providers, aiFamilyFacet]);

  /** Drop family/model filters that become empty after provider (or token) scope changes. */
  useEffect(() => {
    if (category !== 'ai') return;
    if (aiFamilyFacet !== 'all' && aiFamilyCounts[aiFamilyFacet] === 0) {
      setAiFamilyFacet('all');
      setAiModel('');
      return;
    }
    if (aiModel && !aiModelOptions.some((o) => o.value === aiModel)) {
      setAiModel('');
    }
  }, [category, aiFamilyFacet, aiFamilyCounts, aiModel, aiModelOptions]);

  const storageFacetCounts = useMemo(() => {
    const items = storageMeters.filter((m) => meterMatchesStorageKindFacet(m, storageKindFacet));
    return {
      all: items.length,
      standard: items.filter((m) => meterMatchesStorageFacet(m, 'standard')).length,
      warm: items.filter((m) => meterMatchesStorageFacet(m, 'warm')).length,
      cold: items.filter((m) => meterMatchesStorageFacet(m, 'cold')).length,
      ice: items.filter((m) => meterMatchesStorageFacet(m, 'ice')).length,
    };
  }, [storageMeters, storageKindFacet]);

  const diskFacetCounts = useMemo(() => {
    const disks = baseMeters.filter(
      (m) => m.categoryKey === 'compute' && meterMatchesComputeFacet(m, 'disk'),
    );
    return {
      all: disks.length,
      hdd: disks.filter((m) => meterMatchesDiskFacet(m, 'hdd')).length,
      ssd: disks.filter((m) => meterMatchesDiskFacet(m, 'ssd')).length,
      nvme: disks.filter((m) => meterMatchesDiskFacet(m, 'nvme')).length,
    };
  }, [baseMeters]);

  const vcpuMeters = useMemo(
    () => baseMeters.filter((m) => m.categoryKey === 'compute' && meterMatchesComputeFacet(m, 'vcpu')),
    [baseMeters],
  );

  const vcpuShareCounts = useMemo(
    () => ({
      all: vcpuMeters.length,
      dedicated: vcpuMeters.filter((m) => meterMatchesVcpuShareFacet(m, 'dedicated')).length,
      shared: vcpuMeters.filter((m) => meterMatchesVcpuShareFacet(m, 'shared')).length,
    }),
    [vcpuMeters],
  );

  const vcpuPlatformCounts = useMemo(
    () => ({
      all: vcpuMeters.length,
      'ice-lake': vcpuMeters.filter((m) => meterMatchesVcpuPlatformFacet(m, 'ice-lake')).length,
      'cascade-lake': vcpuMeters.filter((m) =>
        meterMatchesVcpuPlatformFacet(m, 'cascade-lake'),
      ).length,
      sapphire: vcpuMeters.filter((m) => meterMatchesVcpuPlatformFacet(m, 'sapphire')).length,
      other: vcpuMeters.filter((m) => meterMatchesVcpuPlatformFacet(m, 'other')).length,
    }),
    [vcpuMeters],
  );

  const filtered = useMemo(() => {
    const providerSet = providers.length ? new Set(providers) : null;
    const list = baseMeters.filter((m) => {
      if (!meterMatchesCategory(m, category)) return false;
      if (category === 'compute' && !meterMatchesComputeFacet(m, facet)) return false;
      if (category === 'compute' && facet === 'disk' && !meterMatchesDiskFacet(m, diskFacet)) {
        return false;
      }
      if (category === 'compute' && facet === 'vcpu') {
        if (!meterMatchesVcpuShareFacet(m, vcpuShareFacet)) return false;
        if (!meterMatchesVcpuPlatformFacet(m, vcpuPlatformFacet)) return false;
      }
      if (category === 'gpu' && !meterMatchesGpuFacet(m, gpuFacet)) return false;
      if (category === 'storage' && !meterMatchesStorageKindFacet(m, storageKindFacet)) {
        return false;
      }
      if (category === 'storage' && !meterMatchesStorageFacet(m, storageFacet)) return false;
      if (category === 'network' && !meterMatchesNetworkFacet(m, networkFacet)) return false;
      if (
        category === 'kubernetes' &&
        !meterMatchesKubernetesAvailabilityFacet(m, kubernetesAvailabilityFacet)
      ) {
        return false;
      }
      if (category === 'ai' && !meterMatchesAiFacet(m, aiFacet)) return false;
      if (category === 'ai' && !meterMatchesAiFamilyFacet(m, aiFamilyFacet)) return false;
      if (category === 'ai' && !meterMatchesAiModel(m, aiModel || null)) return false;
      if (!meterMatchesSearch(m, deferredSearch)) return false;
      if (providerSet && !providerSet.has(m.provider)) return false;
      return true;
    });
    return sortMeters(list, sort, period);
  }, [
    baseMeters,
    category,
    facet,
    diskFacet,
    vcpuShareFacet,
    vcpuPlatformFacet,
    gpuFacet,
    storageFacet,
    storageKindFacet,
    networkFacet,
    kubernetesAvailabilityFacet,
    aiFacet,
    aiFamilyFacet,
    aiModel,
    deferredSearch,
    providers,
    sort,
    period,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [
    category,
    facet,
    diskFacet,
    vcpuShareFacet,
    vcpuPlatformFacet,
    gpuFacet,
    storageFacet,
    storageKindFacet,
    networkFacet,
    kubernetesAvailabilityFacet,
    aiFacet,
    aiFamilyFacet,
    aiModel,
    deferredSearch,
    providers,
    sort,
    period,
  ]);

  /** When nested compute facets open, scroll so the active type (Ядра/Диск) is left-aligned. */
  useEffect(() => {
    const row = facetRowRef.current;
    if (!row) return;

    if (category !== 'compute' || (facet !== 'vcpu' && facet !== 'disk')) {
      row.scrollTo({left: 0, behavior: 'smooth'});
      return;
    }

    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      // Wait one more frame for Доля/CPU (or Медиа) to mount and widen the row
      frame2 = window.requestAnimationFrame(() => {
        const anchor = row.querySelector(
          `[data-facet-anchor="${facet}"]`,
        ) as HTMLElement | null;
        if (!anchor) return;
        const rowRect = row.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const nextLeft = row.scrollLeft + (anchorRect.left - rowRect.left) - 4;
        row.scrollTo({left: Math.max(0, nextLeft), behavior: 'smooth'});
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [category, facet]);

  const columns = useMemo(() => {
    // Stable column skeleton across tabs — prevents «Тариф» from shifting
    const cols: ComponentProps<typeof Table<CatalogMeter>>['columns'] = [
      {
        id: 'name',
        name: 'Тариф',
        primary: true,
        width: 340,
        className: styles.nameCol,
        template: (m) => {
          const title = displayMeterName(m);
          return (
            <Text variant="body-1" ellipsis title={title}>
              {title}
            </Text>
          );
        },
      },
      {
        id: 'provider',
        name: 'Провайдер',
        width: 130,
        className: styles.providerCol,
        template: (m) => (
          <Text variant="body-1" color="secondary">
            {m.providerName}
          </Text>
        ),
      },
      {
        id: 'specs',
        name:
          category === 'gpu'
            ? 'GPU'
            : category === 'compute'
              ? facet === 'image' || facet === 'snapshot'
                ? 'Единица'
                : 'Конфиг'
              : category === 'storage'
                ? 'Класс'
                : category === 'kubernetes'
                  ? 'Мастер'
                  : category === 'network'
                    ? 'Единица'
                    : category === 'ai'
                      ? 'Токены'
                      : 'Параметры',
        width: 220,
        className: styles.specsCol,
        template: (m) => {
          let label = paramsLabel(m);
          let title = label;
          if (category === 'gpu') {
            label = extractGpuModel(m) || label;
            title = label;
          } else if (category === 'ai') {
            label = billingUnitLabel(m);
            const model = extractAiModelFamily(m);
            title = model ? `${model} · ${label}` : label;
          } else if (category === 'kubernetes') {
            const availability = extractKubernetesAvailability(m);
            if (availability) {
              label = kubernetesAvailabilityLabel(availability);
              title = `${label} · ${kubernetesFaultToleranceHint(availability)}`;
            } else {
              label = '—';
              title = 'Компонент мастера без зональности';
            }
          } else if (category === 'storage') {
            // Only object storage class — never show bare GiB as «Класс»
            const cls = extractStorageClass(m);
            const clsTitle = cls
              ? cls.charAt(0).toUpperCase() + cls.slice(1)
              : null;
            const op =
              typeof m.dimensions.operation === 'string' ? m.dimensions.operation : null;
            if (clsTitle && op) label = `${clsTitle} · ${op}`;
            else if (clsTitle) label = clsTitle;
            else if (op) label = op;
            else label = '—';
          } else if (category === 'network') {
            label = billingUnitLabel(m);
            if (m.meter === 'network.ipv4.attached') {
              title = `Активный · ${label}`;
            } else if (m.meter === 'network.ipv4.reserved') {
              title = `Резерв · ${label}`;
            } else {
              title = label;
            }
          } else if (category === 'compute') {
            if (isImageMeter(m) || isSnapshotMeter(m)) {
              label = billingUnitLabel(m);
            } else if (isDiskMeter(m)) {
              const media = extractDiskMedia(m);
              const variant = extractDiskVariant(m);
              const parts: string[] = [];
              if (media) parts.push(media);
              if (variant) parts.push(variant);
              if (m.meter === 'storage.block.iops') parts.push('IOPS');
              else parts.push(billingUnitLabel(m));
              if (parts.length) label = parts.join(' · ');
            } else {
              const vcpu = extractVcpu(m);
              const ram = extractRamGiB(m);
              const parts: string[] = [];
              if (vcpu != null) parts.push(`${vcpu} vCPU`);
              if (ram != null) parts.push(`${ram} GiB`);
              const platform = formatPlatform(m.cpuPlatformFamily);
              if (platform && platform !== 'Платформа не указана') parts.push(platform);
              if (parts.length) label = parts.join(' · ');
            }
          } else if (category === 'all') {
            if (isImageMeter(m) || isSnapshotMeter(m)) {
              label = `${CATEGORY_TITLE.compute} · ${displayMeterName(m)} · ${billingUnitLabel(m)}`;
            } else {
              label = `${CATEGORY_TITLE[m.categoryKey]} · ${paramsLabel(m)}`;
            }
          }
          if (category !== 'kubernetes' && category !== 'network' && category !== 'ai') {
            title = label;
          }
          return (
            <Text variant="body-1" color="secondary" ellipsis title={title}>
              {label}
            </Text>
          );
        },
      },
      {
        id: 'price',
        name: priceColumnTitle(period, category),
        align: 'end',
        width: 140,
        className: styles.priceCol,
        template: (m) => {
          const amount = displayAmount(m, period);
          const unitHint = meterPriceLabel(m, period);
          return (
            <span className={styles.priceCell} title={unitHint}>
              {amount ?? '—'}
            </span>
          );
        },
      },
    ];

    return cols;
  }, [category, period, facet]);

  const resetFilters = useCallback(() => {
    startTransition(() => {
      setCategory('all');
      setFacet('all');
      setDiskFacet('all');
      setVcpuShareFacet('all');
      setVcpuPlatformFacet('all');
      setGpuFacet('all');
      setStorageFacet('all');
      setStorageKindFacet('all');
      setNetworkFacet('all');
      setKubernetesAvailabilityFacet('all');
      setAiFacet('all');
      setAiFamilyFacet('all');
      setAiModel('');
      setSearch('');
      setProviders([]);
      setSort('price-asc');
    });
  }, []);

  const hasFilters =
    category !== 'all' ||
    facet !== 'all' ||
    diskFacet !== 'all' ||
    vcpuShareFacet !== 'all' ||
    vcpuPlatformFacet !== 'all' ||
    gpuFacet !== 'all' ||
    storageFacet !== 'all' ||
    storageKindFacet !== 'all' ||
    networkFacet !== 'all' ||
    kubernetesAvailabilityFacet !== 'all' ||
    aiFacet !== 'all' ||
    aiFamilyFacet !== 'all' ||
    Boolean(aiModel) ||
    search.trim() !== '' ||
    providers.length > 0 ||
    sort !== 'price-asc';

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Flex direction="column" gap={4}>
          <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap>
            <Flex direction="column" gap={1}>
              <Flex alignItems="center" gap={2}>
                <Icon data={SquareListUl} size={24} />
                <Text variant="header-1">Каталог SKU</Text>
              </Flex>
              <Text color="secondary" variant="body-1">
                {filtered.length} тарифов · {formatAsOf(catalog.asOf)}
              </Text>
            </Flex>
            <SegmentedRadioGroup
              size="m"
              value={period}
              onUpdate={(v) => setPeriod(v as PeriodMode)}
            >
              <SegmentedRadioGroup.Option value="unit">Час</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="month">Месяц</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="year">Год</SegmentedRadioGroup.Option>
            </SegmentedRadioGroup>
          </Flex>

          <TabProvider
            value={category}
            onUpdate={(v) => {
              startTransition(() => {
                const next = v as CategoryFilter;
                setCategory(next);
                // All-tab chips are single-select; multi from other tabs collapses to first.
                if (next === 'all') {
                  setProviders((prev) => (prev.length > 1 ? [prev[0]!] : prev));
                }
                if (next !== 'compute') {
                  setFacet('all');
                  setDiskFacet('all');
                  setVcpuShareFacet('all');
                  setVcpuPlatformFacet('all');
                }
                if (next !== 'gpu') setGpuFacet('all');
                if (next !== 'storage') {
                  setStorageFacet('all');
                  setStorageKindFacet('all');
                }
                if (next !== 'network') setNetworkFacet('all');
                if (next !== 'kubernetes') setKubernetesAvailabilityFacet('all');
                if (next !== 'ai') {
                  setAiFacet('all');
                  setAiFamilyFacet('all');
                  setAiModel('');
                }
              });
            }}
          >
            <TabList size="l">
              {CATEGORY_FILTERS.map((item) => (
                <Tab key={item.id} value={item.id} counter={categoryCounts[item.id]}>
                  {item.title}
                </Tab>
              ))}
            </TabList>
          </TabProvider>

          <div className={styles.filters}>
            <Flex gap={3} alignItems="center" className={styles.controlsPrimary}>
              <div className={category === 'ai' ? styles.searchCompact : styles.search}>
                <TextInput
                  controlRef={searchRef}
                  size="m"
                  value={search}
                  onUpdate={setSearch}
                  placeholder={category === 'ai' ? 'Поиск' : 'Поиск тарифа или провайдера'}
                  startContent={
                    <span className={styles.searchIcon}>
                      <Icon data={Magnifier} size={16} />
                    </span>
                  }
                  hasClear
                />
              </div>

              {category === 'ai' ? (
                <Select
                  size="m"
                  filterable
                  hasClear
                  placeholder="Модель"
                  value={aiModel ? [aiModel] : []}
                  options={aiModelOptions}
                  onUpdate={(v) => setAiModel(v[0] || '')}
                  className={styles.controlSelectModel}
                />
              ) : null}

              {category !== 'all' ? (
                <Select
                  size="m"
                  multiple
                  filterable
                  hasClear
                  placeholder="Провайдер"
                  value={providers}
                  options={providerOptions}
                  onUpdate={setProviders}
                  className={styles.controlSelect}
                />
              ) : null}

              <Select
                size="m"
                value={[sort]}
                onUpdate={(v) => setSort((v[0] as SortKey) || 'price-asc')}
                options={[
                  {value: 'price-asc', content: 'Сначала дешевле'},
                  {value: 'price-desc', content: 'Сначала дороже'},
                  {value: 'name', content: 'По названию'},
                  {value: 'provider', content: 'По провайдеру'},
                ]}
                className={styles.controlSelect}
              />

              <Button
                view="flat-secondary"
                size="m"
                onClick={resetFilters}
                disabled={!hasFilters}
                className={styles.resetButton}
              >
                Сбросить
              </Button>
            </Flex>

            {/* Reserved row — keeps table from jumping across tabs */}
            <div className={styles.facetRow} ref={facetRowRef}>
              {category === 'all' ? (
                <div className={styles.facetControl} title="Провайдер облака">
                  <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                    Провайдер
                  </Text>
                  <SegmentedRadioGroup
                    size="m"
                    value={providerFacet}
                    onUpdate={(v) => {
                      setProviders(v === 'all' ? [] : [v]);
                      setPage(1);
                    }}
                  >
                    {[
                      {value: 'all' as const, title: 'Все'},
                      ...providerFacetOptions,
                    ].map((o) => (
                      <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                        <span className={styles.facetOption}>
                          {o.value === 'all' ? (
                            <Icon data={Layers3Diagonal} size={14} />
                          ) : (
                            <ProviderMark
                              providerId={o.value}
                              size={14}
                              className={styles.providerMark}
                            />
                          )}
                          <span>
                            {o.title} {providerFacetCounts[o.value] ?? 0}
                          </span>
                        </span>
                      </SegmentedRadioGroup.Option>
                    ))}
                  </SegmentedRadioGroup>
                </div>
              ) : null}

              {category === 'compute' ? (
                <>
                  <div className={styles.facetControl} title="Тип compute-ресурса">
                    <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                      Тип
                    </Text>
                    <SegmentedRadioGroup
                      size="m"
                      value={facet}
                      onUpdate={(v) => {
                        const next = v as ComputeFacet;
                        setFacet(next);
                        if (next !== 'disk') setDiskFacet('all');
                        if (next !== 'vcpu') {
                          setVcpuShareFacet('all');
                          setVcpuPlatformFacet('all');
                        }
                      }}
                    >
                      {FACET_OPTIONS.map((o) => (
                        <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                          <span
                            className={styles.facetOption}
                            data-facet-anchor={
                              o.value === 'vcpu' || o.value === 'disk' ? o.value : undefined
                            }
                          >
                            <Icon data={o.icon} size={14} />
                            <span>
                              {o.title} {facetCounts[o.value]}
                            </span>
                          </span>
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                  {facet === 'disk' ? (
                    <div className={styles.facetControl} title="Тип диска">
                      <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                        Медиа
                      </Text>
                      <SegmentedRadioGroup
                        size="m"
                        value={diskFacet}
                        onUpdate={(v) => setDiskFacet(v as DiskFacet)}
                      >
                        {DISK_FACET_OPTIONS.map((o) => (
                          <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                            <span className={styles.facetOption}>
                              {o.value === 'all' ? (
                                <Icon data={Layers3Diagonal} size={14} />
                              ) : (
                                <Icon data={HardDrive} size={14} />
                              )}
                              <span>
                                {o.title} {diskFacetCounts[o.value]}
                              </span>
                            </span>
                          </SegmentedRadioGroup.Option>
                        ))}
                      </SegmentedRadioGroup>
                    </div>
                  ) : null}
                  {facet === 'vcpu' ? (
                    <>
                      <div className={styles.facetControl} title="Гарантия доли vCPU">
                        <Text
                          variant="caption-2"
                          color="complementary"
                          className={styles.facetLabel}
                        >
                          Доля
                        </Text>
                        <SegmentedRadioGroup
                          size="m"
                          value={vcpuShareFacet}
                          onUpdate={(v) => setVcpuShareFacet(v as VcpuShareFacet)}
                        >
                          {VCPU_SHARE_OPTIONS.map((o) => (
                            <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                              <span className={styles.facetOption}>
                                {o.value === 'all' ? (
                                  <Icon data={Layers3Diagonal} size={14} />
                                ) : (
                                  <Icon data={Cpu} size={14} />
                                )}
                                <span>
                                  {o.title} {vcpuShareCounts[o.value]}
                                </span>
                              </span>
                            </SegmentedRadioGroup.Option>
                          ))}
                        </SegmentedRadioGroup>
                      </div>
                      <div className={styles.facetControl} title="Платформа CPU">
                        <Text
                          variant="caption-2"
                          color="complementary"
                          className={styles.facetLabel}
                        >
                          CPU
                        </Text>
                        <SegmentedRadioGroup
                          size="m"
                          value={vcpuPlatformFacet}
                          onUpdate={(v) => setVcpuPlatformFacet(v as VcpuPlatformFacet)}
                        >
                          {VCPU_PLATFORM_OPTIONS.map((o) => (
                            <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                              <span className={styles.facetOption}>
                                {o.value === 'all' ? (
                                  <Icon data={Layers3Diagonal} size={14} />
                                ) : (
                                  <Icon data={Cpu} size={14} />
                                )}
                                <span>
                                  {o.title} {vcpuPlatformCounts[o.value]}
                                </span>
                              </span>
                            </SegmentedRadioGroup.Option>
                          ))}
                        </SegmentedRadioGroup>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}

              {category === 'gpu' ? (
                <div className={styles.facetControl} title="Семейство GPU">
                  <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                    GPU
                  </Text>
                  <SegmentedRadioGroup
                    size="m"
                    value={gpuFacet}
                    onUpdate={(v) => setGpuFacet(v as GpuFacet)}
                  >
                    {GPU_FACET_OPTIONS.map((o) => (
                      <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                        <span className={styles.facetOption}>
                          {o.value === 'all' ? (
                            <Icon data={Layers3Diagonal} size={14} />
                          ) : (
                            <Icon data={Gpu} size={14} />
                          )}
                          <span>
                            {o.title} {gpuFacetCounts[o.value]}
                          </span>
                        </span>
                      </SegmentedRadioGroup.Option>
                    ))}
                  </SegmentedRadioGroup>
                </div>
              ) : null}

              {category === 'storage' ? (
                <>
                  <div className={styles.facetControl} title="Тип тарифа хранения">
                    <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                      Тип
                    </Text>
                    <SegmentedRadioGroup
                      size="m"
                      value={storageKindFacet}
                      onUpdate={(v) => setStorageKindFacet(v as StorageKindFacet)}
                    >
                      {STORAGE_KIND_OPTIONS.map((o) => (
                        <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                          <span className={styles.facetOption}>
                            {o.value === 'all' ? (
                              <Icon data={Layers3Diagonal} size={14} />
                            ) : (
                              <Icon data={Database} size={14} />
                            )}
                            <span>
                              {o.title} {storageKindCounts[o.value]}
                            </span>
                          </span>
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                  <div className={styles.facetControl} title="Класс объектного хранения">
                    <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                      Класс
                    </Text>
                    <SegmentedRadioGroup
                      size="m"
                      value={storageFacet}
                      onUpdate={(v) => setStorageFacet(v as StorageFacet)}
                    >
                      {STORAGE_FACET_OPTIONS.map((o) => (
                        <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                          <span className={styles.facetOption}>
                            {o.value === 'all' ? (
                              <Icon data={Layers3Diagonal} size={14} />
                            ) : (
                              <Icon data={Database} size={14} />
                            )}
                            <span>
                              {o.title} {storageFacetCounts[o.value]}
                            </span>
                          </span>
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                </>
              ) : null}

              {category === 'network' ? (
                <div className={styles.facetControl} title="Тип сетевого тарифа">
                  <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                    Тип
                  </Text>
                  <SegmentedRadioGroup
                    size="m"
                    value={networkFacet}
                    onUpdate={(v) => setNetworkFacet(v as NetworkFacet)}
                  >
                    {NETWORK_FACET_OPTIONS.map((o) => (
                      <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                        <span className={styles.facetOption}>
                          {o.value === 'all' ? (
                            <Icon data={Layers3Diagonal} size={14} />
                          ) : (
                            <Icon data={Globe} size={14} />
                          )}
                          <span>
                            {o.title} {networkFacetCounts[o.value]}
                          </span>
                        </span>
                      </SegmentedRadioGroup.Option>
                    ))}
                  </SegmentedRadioGroup>
                </div>
              ) : null}

              {category === 'kubernetes' ? (
                <div
                  className={styles.facetControl}
                  title="Зональный — не отказоустойчивый; региональный — отказоустойчивый"
                >
                  <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                    Мастер
                  </Text>
                  <SegmentedRadioGroup
                    size="m"
                    value={kubernetesAvailabilityFacet}
                    onUpdate={(v) =>
                      setKubernetesAvailabilityFacet(v as KubernetesAvailabilityFacet)
                    }
                  >
                    {KUBERNETES_AVAILABILITY_OPTIONS.map((o) => (
                      <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                        <span className={styles.facetOption}>
                          {o.value === 'all' ? (
                            <Icon data={Layers3Diagonal} size={14} />
                          ) : (
                            <Icon data={Server} size={14} />
                          )}
                          <span>
                            {o.title} {kubernetesAvailabilityCounts[o.value]}
                          </span>
                        </span>
                      </SegmentedRadioGroup.Option>
                    ))}
                  </SegmentedRadioGroup>
                </div>
              ) : null}

              {category === 'ai' ? (
                <>
                  <div className={styles.facetControl} title="Семейство моделей">
                    <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                      Семейство
                    </Text>
                    <SegmentedRadioGroup
                      size="m"
                      value={aiFamilyFacet}
                      onUpdate={(v) => {
                        setAiFamilyFacet(v as AiFamilyFacet);
                        setAiModel('');
                      }}
                    >
                      {AI_FAMILY_OPTIONS.filter(
                        (o) => o.value === 'all' || aiFamilyCounts[o.value] > 0,
                      ).map((o) => (
                        <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                          <span className={styles.facetOption}>
                            <span>
                              {o.title} {aiFamilyCounts[o.value]}
                            </span>
                          </span>
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                  <div className={styles.facetControl} title="Направление токенов">
                    <Text variant="caption-2" color="complementary" className={styles.facetLabel}>
                      Токены
                    </Text>
                    <SegmentedRadioGroup
                      size="m"
                      value={aiFacet}
                      onUpdate={(v) => setAiFacet(v as AiFacet)}
                    >
                      {AI_FACET_OPTIONS.map((o) => (
                        <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                          <span className={styles.facetOption}>
                            <Icon data={o.icon} size={14} />
                            <span>
                              {o.title} {aiFacetCounts[o.value]}
                            </span>
                          </span>
                        </SegmentedRadioGroup.Option>
                      ))}
                    </SegmentedRadioGroup>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className={styles.tableCard}>
            {filtered.length === 0 ? (
              <PlaceholderContainer
                title="Ничего не найдено"
                description="Сбросьте фильтры или измените запрос."
                size="m"
                align="center"
                image={<Icon data={Magnifier} size={28} />}
                actions={[
                  {
                    text: 'Сбросить фильтры',
                    view: 'action',
                    size: 'm',
                    onClick: resetFilters,
                  },
                ]}
              />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <Table
                    data={pageItems}
                    columns={columns}
                    getRowId={(m) => m.id}
                    verticalAlign="middle"
                    width="max"
                    edgePadding
                    onRowClick={(item) => setActiveMeter(item)}
                    getRowDescriptor={() => ({interactive: true})}
                  />
                </div>
                {filtered.length > PAGE_SIZE ? (
                  <Flex justifyContent="space-between" alignItems="center" className={styles.pager}>
                    <Text variant="body-1" color="secondary">
                      {(safePage - 1) * PAGE_SIZE + 1}–
                      {Math.min(safePage * PAGE_SIZE, filtered.length)} из {filtered.length}
                    </Text>
                    <Pagination
                      page={safePage}
                      pageSize={PAGE_SIZE}
                      total={filtered.length}
                      onUpdate={(nextPage) => setPage(nextPage)}
                      compact
                    />
                  </Flex>
                ) : null}
              </>
            )}
          </div>

          <Text variant="caption-2" color="secondary">
            {category === 'ai' || filtered.some(isAiTokenMeter)
              ? 'Цены AI — за 1M токенов (локальный inference)'
              : `Цены ${periodLabel(period)}; ёмкость — за GiB`}
            {category === 'storage' || filtered.some(isRequestMeter)
              ? '; запросы — за 10 000 операций'
              : ''}
            . Клик по строке — детали SKU.
          </Text>
        </Flex>
      </div>

      <SkuDrawer
        meter={activeMeter}
        period={period}
        open={Boolean(activeMeter)}
        onClose={() => setActiveMeter(null)}
      />
    </>
  );
}
