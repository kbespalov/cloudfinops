'use client';

import Link from 'next/link';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {Suspense, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Button,
  Flex,
  HelpMark,
  Icon,
  Label,
  NumberInput,
  SegmentedRadioGroup,
  Select,
  Text,
  Tooltip,
} from '@gravity-ui/uikit';
import {Sparkles} from '@gravity-ui/icons';
import {INFERENCE_MODELS} from '@/data/inference-models';
import {
  defaultPricedConfigIndex,
  type InferenceRecommendResult,
} from '@/lib/chat/inference-recommend-view';
import {
  formatQuoteAmount,
  formatRuNumber,
  periodShortLabel,
  scalePresetQuote,
  type PeriodMode,
} from '@/lib/calculator/quote-view';
import {
  parseSelfHostQuant,
  resolveSelfHostModelDisplayName,
  selfHostCalculatorUrl,
  selfHostChatPrompt,
  type SelfHostQuantParam,
} from '@/lib/calculator/self-host-links';
import {formatLabel} from '@/lib/calculator/weight-formats';
import {
  CONTEXT_LENGTH_OPTIONS,
  formatContextTokens,
  formatNodeCount,
  formatVramUsage,
  planInferenceNodes,
  type InferenceNodePlan,
} from '@/lib/calculator/vram-breakdown';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {chatUrlForQuery} from '@/components/home/homePrompts';
import {CalculatorSidebar} from './CalculatorSidebar';
import {ModelPicker} from './ModelPicker';
import {VramBreakdownCard} from './VramBreakdownCard';
import panelStyles from './CalculatorPanel.module.css';
import styles from './InferenceCalculatorPanel.module.css';

type QuantOption = SelfHostQuantParam;

const QUANT_OPTIONS: {value: QuantOption; label: string}[] = [
  {value: 'auto', label: 'Auto'},
  {value: 'int4', label: 'INT4 / NVFP4'},
  {value: 'fp8', label: 'FP8'},
  {value: 'bf16', label: 'BF16'},
  {value: 'int8', label: 'INT8'},
];

const DEFAULT_MODEL = 'Qwen3-Coder-Next';

type ConfigPick = NonNullable<InferenceRecommendResult['configs']>[number];

function monthToPeriod(month: number | null | undefined, period: PeriodMode): number | null {
  if (month == null || !Number.isFinite(month)) return null;
  if (period === 'month') return month;
  if (period === 'year') return month * 12;
  return month / 720;
}

function contextOptions(contextDefault: number) {
  const values = new Set<number>([...CONTEXT_LENGTH_OPTIONS, contextDefault]);
  return [...values]
    .sort((a, b) => a - b)
    .map((n) => ({
      value: String(n),
      content: formatContextTokens(n),
    }));
}

function planForConfig(
  config: ConfigPick,
  profile: (typeof INFERENCE_MODELS)[number],
  concurrentRequests: number,
  avgContextTokens: number,
  maxContextTokens: number,
): InferenceNodePlan | null {
  const weight =
    profile.weights.find((w) => w.dtype === config.quant) ?? profile.weights[0];
  if (!weight) return null;
  return planInferenceNodes({
    weightsGiB: weight.weightsVramGiB,
    weightVariant: weight,
    totalParametersB: profile.parameterCountB,
    activeParameterCountB: profile.activeParameterCountB,
    attention: profile.attention,
    contextDefault: profile.contextDefault,
    avgContextTokens,
    maxContextTokens,
    batchSize: 1,
    concurrentUsers: concurrentRequests,
    quant: config.quant,
    gpuCount: config.gpuCount,
    gpuFamily: config.gpuFamily,
    gpuMemoryGb: config.host?.gpuMemoryGb ?? null,
  });
}

function quantDisplay(config: ConfigPick, plan: InferenceNodePlan | null): string {
  if (plan?.sizing?.weightFormatLabel) return plan.sizing.weightFormatLabel;
  return formatLabel(
    config.quant === 'int4' ? 'int4' : (config.quant as 'fp8' | 'bf16' | 'int8'),
  );
}

function defaultAvgContext(maxContext: number): number {
  return Math.max(4_096, Math.min(32_768, Math.round(maxContext / 4)));
}

export function InferenceCalculatorPanel({period}: {period: PeriodMode}) {
  return (
    <Suspense fallback={null}>
      <InferenceCalculatorPanelInner period={period} />
    </Suspense>
  );
}

function InferenceCalculatorPanelInner({period}: {period: PeriodMode}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [model, setModel] = useState(() => {
    return (
      resolveSelfHostModelDisplayName(searchParams.get('model')) ?? DEFAULT_MODEL
    );
  });
  const [quant, setQuant] = useState<QuantOption>(() =>
    parseSelfHostQuant(searchParams.get('quant')),
  );
  const [concurrentRequests, setConcurrentRequests] = useState(4);
  const [maxContextTokens, setMaxContextTokens] = useState(128_000);
  const [avgContextTokens, setAvgContextTokens] = useState(32_768);
  const [rec, setRec] = useState<InferenceRecommendResult | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  /** True when the user picked a row other than the algorithm recommendation. */
  const [manualPick, setManualPick] = useState(false);

  const profile = useMemo(
    () => INFERENCE_MODELS.find((m) => m.displayName === model) ?? null,
    [model],
  );

  // Keep shareable URL in sync with picker (replace — no history spam).
  useEffect(() => {
    if (pathname !== '/calculator/self-host') return;
    const next = selfHostCalculatorUrl({model, quant});
    const nextParams = new URLSearchParams(next.split('?')[1] ?? '');
    if (
      searchParams.get('model') === nextParams.get('model') &&
      (searchParams.get('quant') ?? null) === (nextParams.get('quant') ?? null)
    ) {
      return;
    }
    router.replace(next, {scroll: false});
  }, [model, quant, pathname, router, searchParams]);

  useEffect(() => {
    if (!profile?.contextDefault) return;
    const maxCtx = profile.contextDefault;
    setMaxContextTokens(maxCtx);
    setAvgContextTokens(defaultAvgContext(maxCtx));
  }, [profile?.id, profile?.contextDefault]);

  useEffect(() => {
    let cancelled = false;
    setRecLoading(true);
    const params = new URLSearchParams({
      model,
      quant,
      maxConfigs: '4',
    });
    fetch(`/api/calculator/inference?${params}`, {cache: 'no-store'})
      .then((res) => {
        if (!res.ok) throw new Error(`inference ${res.status}`);
        return res.json() as Promise<InferenceRecommendResult>;
      })
      .then((data) => {
        if (cancelled) return;
        setRec(data);
        setManualPick(false);
        // Index is refined once node plans are ready (cheapest fleet cost).
        setSelectedIdx(defaultPricedConfigIndex(data.configs ?? []));
      })
      .catch(() => {
        if (!cancelled) setRec(null);
      })
      .finally(() => {
        if (!cancelled) setRecLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [model, quant]);

  const configs = rec?.configs ?? [];

  const configPlans = useMemo(() => {
    if (!profile) return [] as Array<InferenceNodePlan | null>;
    return configs.map((c) =>
      planForConfig(c, profile, concurrentRequests, avgContextTokens, maxContextTokens),
    );
  }, [configs, profile, concurrentRequests, avgContextTokens, maxContextTokens]);

  /**
   * Algorithm recommendation: cheapest fitting fleet (unit × nodes).
   * Independent of the user's radio selection.
   */
  const recommendedIdx = useMemo(() => {
    let bestIdx = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    configs.forEach((c, i) => {
      const plan = configPlans[i];
      if (!plan || plan.kind === 'impossible') return;
      const unit = c.best?.totalMonth;
      if (unit == null || !Number.isFinite(unit)) return;
      const nodes = plan.kind === 'replicas' ? plan.nodeCount : 1;
      const cost = unit * nodes;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) return bestIdx;
    return configs.length ? defaultPricedConfigIndex(configs) : 0;
  }, [configs, configPlans]);

  const recommendKey = useMemo(
    () =>
      configs
        .map((c) => `${c.gpuFamily}:${c.gpuCount}:${c.quant}:${c.best?.totalMonth ?? ''}`)
        .join('|'),
    [configs],
  );

  useEffect(() => {
    if (!configPlans.length || !configs.length) return;
    // New recommendation payload → follow algorithm, clear manual pick.
    setManualPick(false);
    setSelectedIdx(recommendedIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when recommend payload identity changes
  }, [recommendKey]);

  useEffect(() => {
    if (!configPlans.length || !configs.length) return;
    setSelectedIdx((idx) => {
      const plan = configPlans[idx];
      if (plan && plan.kind !== 'impossible') return idx;
      setManualPick(false);
      return recommendedIdx;
    });
  }, [configPlans, configs, recommendedIdx]);

  function selectConfigRow(i: number) {
    setSelectedIdx(i);
    setManualPick(i !== recommendedIdx);
  }

  function returnToRecommendation() {
    setManualPick(false);
    setSelectedIdx(recommendedIdx);
  }

  const selected: ConfigPick | null = configs[selectedIdx] ?? configs[0] ?? null;
  const selectedPlan = configPlans[selectedIdx] ?? null;
  const vramBreakdown = selectedPlan?.perNode ?? null;

  const quoteRequest = useMemo(() => {
    if (!selected) return null;
    if (selectedPlan?.kind === 'impossible') return null;
    const dedicated = selected.host?.dedicated === true;
    const unitOnly = selected.host?.unitOnly === true;
    const hostless = dedicated || unitOnly;
    return {
      kind: 'gpu' as const,
      period,
      gpuModelMatch: selected.gpuFamily,
      gpuCount: selected.gpuCount,
      gpuInterconnect: selected.interconnect ?? null,
      vcpu: hostless ? undefined : selected.host?.vcpu,
      ramGiB: hostless ? undefined : selected.host?.ramGiB,
      diskGiB: hostless ? undefined : (selected.host?.diskGiB ?? 100),
      dedicated: dedicated || undefined,
      gpuMemoryGb: selected.host?.gpuMemoryGb ?? null,
    };
  }, [selected, selectedPlan?.kind, period]);

  const {result: rawQuote, loading: quoteLoading} = useAdhocQuote(quoteRequest);
  const result = useMemo(() => {
    if (!rawQuote) return null;
    const nodes = selectedPlan?.kind === 'replicas' ? selectedPlan.nodeCount : 1;
    return scalePresetQuote(rawQuote, nodes);
  }, [rawQuote, selectedPlan]);

  const modelMeta = rec?.model;
  // Only true API-only models. Empty configs for a self-host model (e.g. unsupported
  // weight format) must show the empty state, not «Self-hosted недоступен».
  const apiOnly = modelMeta?.deployment === 'api-only';
  const maxCtxOptions = contextOptions(profile?.contextDefault ?? 128_000);
  const avgCtxOptions = contextOptions(
    Math.max(avgContextTokens, Math.min(32_768, maxContextTokens)),
  ).filter((o) => Number(o.value) <= maxContextTokens);

  const selectedNodes =
    selectedPlan?.kind === 'impossible' ? 0 : (selectedPlan?.nodeCount ?? 1);
  const selectedGpuTotal =
    selected && selectedNodes > 0 ? selectedNodes * selected.gpuCount : null;

  const recommendedConfig = configs[recommendedIdx] ?? null;
  const recommendedPlan = configPlans[recommendedIdx] ?? null;
  const recommendedQuantLabel = recommendedConfig
    ? quantDisplay(recommendedConfig, recommendedPlan)
    : null;
  const recommendedGpuLabel = recommendedConfig
    ? `${recommendedConfig.gpuCount}× ${recommendedConfig.gpuFamily}`
    : null;
  const selectedQuantLabel =
    selected && !apiOnly ? quantDisplay(selected, selectedPlan) : null;
  const selectedGpuLabel = selected
    ? `${selected.gpuCount}× ${selected.gpuFamily}`
    : null;
  const selectedUtilPct =
    selectedPlan?.perNode?.utilizationPct ??
    (selectedPlan?.perNode?.capacityGiB && selectedPlan.perNode.capacityGiB > 0
      ? (selectedPlan.perNode.totalGiB / selectedPlan.perNode.capacityGiB) * 100
      : null);
  const selectedLoadBand = selectedPlan?.perNode?.loadBand ?? null;
  const showVramRisk =
    selectedPlan?.kind !== 'impossible' &&
    (selectedLoadBand === 'tight' ||
      selectedLoadBand === 'limit' ||
      (selectedUtilPct != null && selectedUtilPct >= 75 && selectedUtilPct < 100));
  const vramRiskIsCritical =
    selectedLoadBand === 'limit' ||
    (selectedUtilPct != null && selectedUtilPct >= 90 && selectedUtilPct < 100);
  const noFittingConfigs =
    !recLoading && !apiOnly && configs.length > 0 && configs.every((_, i) => configPlans[i]?.kind === 'impossible');
  const emptyConfigs = !recLoading && !apiOnly && configs.length === 0 && Boolean(rec?.ok);

  return (
    <>
      <div className={`${panelStyles.formColumn} ${styles.configCard}`}>
        <div className={styles.configInner}>
          <section className={styles.group} aria-label="Модель">
            <div className={panelStyles.topSlot}>
              <div className={panelStyles.topSlotGrow}>
                <ModelPicker value={model} onUpdate={setModel} />
              </div>
              {modelMeta?.deployment === 'api-only' ? (
                <Label size="xs" theme="danger">
                  API-only
                </Label>
              ) : null}
              {modelMeta?.deployment === 'weights-pending' ? (
                <Text variant="caption-2" color="warning">
                  веса скоро
                </Text>
              ) : null}
            </div>
          </section>

          <section className={styles.group} aria-label="Формат весов и квантование">
            <div className={styles.field}>
              <div className={styles.fieldLabelRow}>
                <Text as="span" className={styles.fieldLabel}>
                  Формат весов
                </Text>
                <HelpMark aria-label="Про формат весов" iconSize="s">
                  Формат хранения весов модели. Auto подбирает формат весов и рекомендуемую
                  GPU-конфигурацию из доступных вариантов — самую дешёвую, которая помещает модель и
                  рассчитанную нагрузку. INT4 / NVFP4: конкретный формат зависит от GPU и runtime.
                </HelpMark>
              </div>
              <div className={styles.quantControl}>
                <SegmentedRadioGroup
                  size="l"
                  width="max"
                  value={quant}
                  onUpdate={(v) => {
                    setManualPick(false);
                    setQuant(v as QuantOption);
                  }}
                  aria-label="Формат весов и квантование"
                >
                  {QUANT_OPTIONS.map((o) => (
                    <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                      {o.label}
                    </SegmentedRadioGroup.Option>
                  ))}
                </SegmentedRadioGroup>
              </div>
              {!apiOnly && recommendedQuantLabel && recommendedGpuLabel ? (
                <div className={styles.autoHintRow}>
                  {manualPick && selectedQuantLabel && selectedGpuLabel ? (
                    <>
                      <Text variant="caption-2" color="complementary" className={styles.autoHint}>
                        Выбрано вручную: {selectedQuantLabel} · {selectedGpuLabel}
                      </Text>
                      <Button size="s" view="flat" onClick={returnToRecommendation}>
                        Вернуться к рекомендации
                      </Button>
                    </>
                  ) : (
                    <Tooltip
                      content={
                        quant === 'auto'
                          ? 'Auto выбрал самый дешёвый формат и GPU-конфигурацию, которые удовлетворяют требованиям по VRAM'
                          : 'Самая дешёвая конфигурация среди подходящих при выбранном формате весов'
                      }
                      openDelay={200}
                    >
                      <Text variant="caption-2" color="complementary" className={styles.autoHint}>
                        Рекомендовано: {recommendedQuantLabel} · {recommendedGpuLabel}
                      </Text>
                    </Tooltip>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.group} aria-labelledby="workload-heading">
            <div className={styles.sectionTitleRow}>
              <Text as="h3" id="workload-heading" className={styles.sectionTitle}>
                Нагрузка
              </Text>
              <HelpMark aria-label="Про расчёт нагрузки" iconSize="s">
                Расчёт оценивает требуемую VRAM. Фактическая пропускная способность зависит от
                runtime, batch size, длины output и целевой задержки.
              </HelpMark>
            </div>
            <div className={styles.workload}>
              <div className={styles.field}>
                <div className={styles.fieldLabelRow}>
                  <Text as="span" className={styles.fieldLabel}>
                    Параллельные запросы
                  </Text>
                  <HelpMark aria-label="Про параллельные запросы" iconSize="s">
                    Максимальное число запросов, которые одновременно находятся в генерации. Это не
                    обязательно равно числу пользователей.
                  </HelpMark>
                </div>
                <NumberInput
                  size="l"
                  min={1}
                  max={128}
                  value={concurrentRequests}
                  onUpdate={(v) =>
                    setConcurrentRequests(Math.max(1, Math.round(v ?? 1)))
                  }
                  controlProps={{
                    'aria-label': 'Параллельные запросы',
                  }}
                />
              </div>
              <div className={styles.field}>
                <div className={styles.fieldLabelRow}>
                  <Text as="span" className={styles.fieldLabel}>
                    Средняя длина последовательности
                  </Text>
                  <HelpMark aria-label="Про среднюю длину последовательности" iconSize="s">
                    Среднее суммарное число входных и генерируемых токенов на запрос. Влияет на
                    оценку KV cache. Отдельное поле длины ответа не используется — output входит в
                    эту сумму.
                  </HelpMark>
                </div>
                <Select
                  size="l"
                  width="max"
                  value={[String(avgContextTokens)]}
                  options={avgCtxOptions}
                  onUpdate={(v) => {
                    const n = Number(v[0]);
                    if (Number.isFinite(n) && n > 0) {
                      setAvgContextTokens(Math.min(n, maxContextTokens));
                    }
                  }}
                />
              </div>
              <div className={styles.field}>
                <div className={styles.fieldLabelRow}>
                  <Text as="span" className={styles.fieldLabel}>
                    Максимальная длина контекста
                  </Text>
                  <HelpMark aria-label="Про максимальную длину контекста" iconSize="s">
                    Максимальное число токенов, которое модель должна поддерживать для одного
                    запроса. Используется при расчёте KV cache и резерва памяти.
                  </HelpMark>
                </div>
                <Select
                  size="l"
                  width="max"
                  value={[String(maxContextTokens)]}
                  options={maxCtxOptions}
                  onUpdate={(v) => {
                    const n = Number(v[0]);
                    if (!Number.isFinite(n) || n <= 0) return;
                    setMaxContextTokens(n);
                    setAvgContextTokens((avg) => Math.min(avg, n));
                  }}
                />
              </div>
            </div>
            <Text variant="caption-2" color="secondary" className={styles.workloadNote}>
              Расчёт подбирает конфигурации, достаточные по VRAM. Фактическая скорость и задержка
              зависят от runtime, batching, длины ответа и настроек инференса.
            </Text>
          </section>

          <div className={styles.configSection} data-stale={recLoading ? 'true' : 'false'}>
            <div className={styles.sectionTitleRow}>
              <Text as="h3" variant="subheader-1" className={styles.sectionTitle}>
                Подходящие GPU-конфигурации
              </Text>
              {!apiOnly && selected && selectedPlan?.kind !== 'impossible' ? (
                <Tooltip
                  content="Конфигурация помещает веса модели и рассчитанные компоненты памяти. Производительность не гарантируется этим расчётом."
                  openDelay={200}
                >
                  <Text variant="caption-2" color="secondary">
                    Достаточно по VRAM
                  </Text>
                </Tooltip>
              ) : null}
            </div>

            {apiOnly && !recLoading ? (
              <Text variant="body-2" color="secondary">
                Self-hosted недоступен для этой модели.
              </Text>
            ) : null}

            {(emptyConfigs || noFittingConfigs) && !apiOnly ? (
              <div className={styles.emptyState}>
                <Text as="h4" variant="subheader-2" className={styles.emptyTitle}>
                  Подходящие конфигурации не найдены
                </Text>
                <Text variant="body-2" color="secondary">
                  Выбранная модель или нагрузка не помещается в доступные GPU-конфигурации.
                </Text>
                <Flex gap={2} wrap className={styles.emptyActions}>
                  <Button size="s" view="outlined" onClick={() => setQuant('auto')}>
                    Выбрать Auto
                  </Button>
                  <Button
                    size="s"
                    view="outlined"
                    onClick={() => {
                      const next = Math.max(4_096, Math.round(maxContextTokens / 2));
                      setMaxContextTokens(next);
                      setAvgContextTokens((avg) => Math.min(avg, next));
                    }}
                  >
                    Уменьшить контекст
                  </Button>
                  <Button
                    size="s"
                    view="flat"
                    onClick={() => {
                      setConcurrentRequests(1);
                      const def = defaultAvgContext(profile?.contextDefault ?? 128_000);
                      setMaxContextTokens(profile?.contextDefault ?? 128_000);
                      setAvgContextTokens(def);
                    }}
                  >
                    Сбросить нагрузку
                  </Button>
                </Flex>
              </div>
            ) : null}

            {!apiOnly && configs.length && !noFittingConfigs ? (
              <div
                className={styles.configList}
                role="listbox"
                aria-label="Подходящие GPU-конфигурации"
              >
                <div className={styles.configHead} aria-hidden="true">
                  <span className={styles.configHeadSpacer} />
                  <Text variant="caption-2" color="secondary">
                    GPU-конфигурация
                  </Text>
                  <Text variant="caption-2" color="secondary">
                    Формат
                  </Text>
                  <Text variant="caption-2" color="secondary">
                    Использование VRAM
                  </Text>
                  <Text
                    variant="caption-2"
                    color="secondary"
                    className={styles.configLoad}
                    title="Количество серверных узлов в конфигурации"
                  >
                    Ноды
                  </Text>
                  <Text variant="caption-2" color="secondary" className={styles.configPrice}>
                    Стоимость
                  </Text>
                </div>
                {configs.slice(0, 4).map((c, i) => {
                  const isActive = selectedIdx === i;
                  const plan = configPlans[i];
                  const bd = plan?.perNode ?? null;
                  const nodes = plan?.kind === 'replicas' ? plan.nodeCount : 1;
                  const unitMonth = c.best?.totalMonth;
                  const amount = monthToPeriod(
                    unitMonth != null && plan?.kind !== 'impossible'
                      ? unitMonth * nodes
                      : unitMonth,
                    period,
                  );
                  const impossible = plan?.kind === 'impossible';
                  const usedGiB = bd?.totalGiB ?? c.estimatedVramGiB;
                  const capGiB = bd?.capacityGiB ?? null;
                  const freeGiB =
                    capGiB != null
                      ? Math.max(0, Math.round((capGiB - usedGiB) * 10) / 10)
                      : null;
                  const utilPct =
                    bd?.utilizationPct ??
                    (capGiB != null && capGiB > 0
                      ? Math.round((usedGiB / capGiB) * 1000) / 10
                      : null);
                  const vramLabel = impossible
                    ? formatVramUsage(usedGiB, capGiB)
                    : bd != null
                      ? formatVramUsage(bd.totalGiB, bd.capacityGiB)
                      : `~${c.estimatedVramGiB} GiB`;
                  const isRecommended = i === recommendedIdx && !impossible;
                  const tightVram =
                    !impossible &&
                    (bd?.loadBand === 'tight' ||
                      bd?.loadBand === 'limit' ||
                      (utilPct != null && utilPct >= 75 && utilPct < 100));
                  return (
                    <button
                      key={`${c.gpuFamily}-${c.gpuCount}-${c.quant}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={styles.configRow}
                      data-active={isActive ? 'true' : 'false'}
                      data-recommended={isRecommended && !isActive ? 'true' : 'false'}
                      data-overload={impossible ? 'true' : 'false'}
                      data-replicas={plan?.kind === 'replicas' ? 'true' : 'false'}
                      onClick={() => selectConfigRow(i)}
                    >
                      <span
                        className={styles.radio}
                        data-checked={isActive ? 'true' : 'false'}
                        aria-hidden
                      />
                      <span className={styles.configGpuCell}>
                        <Text ellipsis className={styles.configGpu}>
                          {c.gpuCount}×&nbsp;{c.gpuFamily}
                        </Text>
                        {isRecommended ? (
                          <Label
                            size="xs"
                            theme="success"
                            title="Самая дешёвая конфигурация, которая помещает модель и рассчитанную нагрузку"
                          >
                            Минимальная цена
                          </Label>
                        ) : null}
                        {tightVram ? (
                          <Label
                            size="xs"
                            theme="warning"
                            title="Свободно менее 10% памяти. Изменение batch size, длины контекста или runtime может привести к OOM"
                          >
                            Малый запас VRAM
                          </Label>
                        ) : null}
                      </span>
                      <Text color="secondary" className={styles.configQuant}>
                        {quantDisplay(c, plan)}
                      </Text>
                      <span
                        className={styles.configVram}
                        title={
                          !impossible && utilPct != null
                            ? `${formatRuNumber(utilPct, 1)}% занято`
                            : undefined
                        }
                      >
                        <Text color="secondary" className={styles.configVramUsed}>
                          {vramLabel}
                        </Text>
                        {!impossible && freeGiB != null ? (
                          <span className={styles.configVramFree}>
                            свободно&nbsp;{formatRuNumber(freeGiB, 1)}&nbsp;GiB
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.configLoad}>
                        {impossible ? (
                          <Label size="xs" theme="normal">
                            —
                          </Label>
                        ) : (
                          <Text color="secondary" title={formatNodeCount(plan?.nodeCount ?? 1)}>
                            {plan?.nodeCount ?? 1}
                          </Text>
                        )}
                      </span>
                      <span className={styles.configPrice}>
                        {amount != null && !impossible
                          ? `${formatQuoteAmount(amount, period).replace(/\s*₽$/, '')} ₽`
                          : '—'}
                        {amount != null && !impossible ? (
                          <span className={styles.configPeriod}>/ {periodShortLabel(period)}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {showVramRisk ? (
              <Alert
                theme="warning"
                view="outlined"
                size="s"
                className={styles.vramWarning}
                title={
                  selectedUtilPct != null && selectedUtilPct >= 95
                    ? 'Высокий риск нехватки VRAM'
                    : 'Малый запас VRAM'
                }
                message={
                  vramRiskIsCritical
                    ? 'Свободно менее 10% памяти. Изменение batch size, длины контекста или runtime может привести к OOM.'
                    : 'Свободно менее 25% памяти (порог расчётной модели). Изменение batch size, длины контекста или runtime может привести к OOM.'
                }
              />
            ) : null}
          </div>

          {!apiOnly && vramBreakdown ? (
            <VramBreakdownCard breakdown={vramBreakdown} embedded />
          ) : null}

          {!apiOnly && selected && selectedPlan?.kind !== 'impossible' ? (
            <div className={styles.chatBridge}>
              <Button
                component={Link}
                href={chatUrlForQuery(
                  selfHostChatPrompt({
                    model,
                    quant: selected.quant,
                    gpuFamily: selected.gpuFamily,
                    gpuCount: selected.gpuCount,
                    nodeCount: selectedNodes,
                    vramLabel: vramBreakdown
                      ? formatVramUsage(vramBreakdown.totalGiB, vramBreakdown.capacityGiB)
                      : null,
                    concurrentRequests,
                    avgContextTokens,
                    maxContextTokens,
                    monthlyRub: result?.best?.total ?? null,
                    providerName: result?.best?.providerName ?? null,
                  }),
                )}
                view="flat-secondary"
                size="m"
                prefetch
              >
                <Icon data={Sparkles} size={16} />
                Разобрать конфигурацию с AI
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <CalculatorSidebar
        period={period}
        result={apiOnly || selectedPlan?.kind === 'impossible' ? null : result}
        loading={recLoading || quoteLoading}
        emptyHint={
          apiOnly
            ? 'Self-hosted недоступен'
            : emptyConfigs || noFittingConfigs || selectedPlan?.kind === 'impossible'
              ? 'Подходящие конфигурации не найдены'
              : 'Конфигурация найдена, но актуальные цены провайдеров недоступны'
        }
        bestPriceHint="Самая низкая стоимость текущей выбранной конфигурации среди найденных провайдеров"
        bestPriceBadge="Самый дешёвый провайдер"
        deploymentSummary={
          selected && selectedPlan?.kind !== 'impossible'
            ? {
                nodeCount: selectedNodes,
                gpuCount: selected.gpuCount,
                gpuFamily: selected.gpuFamily,
                totalGpus: selectedGpuTotal ?? selected.gpuCount,
              }
            : null
        }
      />
    </>
  );
}
