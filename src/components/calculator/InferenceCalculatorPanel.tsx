'use client';

import Link from 'next/link';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {Suspense, useEffect, useMemo, useState} from 'react';
import {
  Button,
  Icon,
  Label,
  NumberInput,
  SegmentedRadioGroup,
  Select,
  Text,
} from '@gravity-ui/uikit';
import {Sparkles} from '@gravity-ui/icons';
import {INFERENCE_MODELS} from '@/data/inference-models';
import {
  defaultPricedConfigIndex,
  type InferenceRecommendResult,
} from '@/lib/chat/inference-recommend-view';
import {
  formatQuoteAmount,
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
import {
  canonicalRecipeTotalGiB,
  CONTEXT_LENGTH_OPTIONS,
  formatContextTokens,
  formatNodeCount,
  formatVramUsage,
  loadBandLabel,
  planInferenceNodes,
  type InferenceNodePlan,
  type VramLoadBand,
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
  {value: 'int4', label: 'INT4'},
  {value: 'fp8', label: 'FP8'},
  {value: 'bf16', label: 'BF16'},
  {value: 'int8', label: 'INT8'},
];

const DEFAULT_MODEL = 'Qwen3-Coder-Next';

/** Pills for extremes; mid bands stay plain text. */
function loadAsBadge(band: VramLoadBand): boolean {
  return band === 'limit' || band === 'tight' || band === 'overload';
}

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
  recipeTotalGiB: number,
  concurrentRequests: number,
  avgContextTokens: number,
  maxContextTokens: number,
): InferenceNodePlan | null {
  const weight =
    profile.weights.find((w) => w.dtype === config.quant) ?? profile.weights[0];
  if (!weight) return null;
  return planInferenceNodes({
    weightsGiB: weight.weightsVramGiB,
    recipeTotalGiB,
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
    fetch(`/api/calculator/inference?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`inference ${res.status}`);
        return res.json() as Promise<InferenceRecommendResult>;
      })
      .then((data) => {
        if (cancelled) return;
        setRec(data);
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

  const recipeByQuant = useMemo(() => {
    const map = new Map<string, number>();
    if (!profile || !configs.length) return map;
    const quants = new Set(configs.map((c) => c.quant));
    for (const q of quants) {
      const weight =
        profile.weights.find((w) => w.dtype === q) ?? profile.weights[0];
      if (!weight) continue;
      const fromRows = configs
        .filter((c) => c.quant === q)
        .map((c) => c.estimatedVramGiB);
      const fromProfile = profile.recommended
        .filter((r) => r.quant === q)
        .map((r) => r.estimatedVramGiB);
      map.set(
        q,
        canonicalRecipeTotalGiB(
          weight.weightsVramGiB,
          [...fromRows, ...(fromRows.length ? [] : fromProfile)],
          profile.contextDefault,
        ),
      );
    }
    return map;
  }, [configs, profile]);

  const configPlans = useMemo(() => {
    if (!profile) return [] as Array<InferenceNodePlan | null>;
    return configs.map((c) => {
      const recipe = recipeByQuant.get(c.quant);
      if (recipe == null || recipe <= 0) return null;
      return planForConfig(
        c,
        profile,
        recipe,
        concurrentRequests,
        avgContextTokens,
        maxContextTokens,
      );
    });
  }, [
    configs,
    profile,
    recipeByQuant,
    concurrentRequests,
    avgContextTokens,
    maxContextTokens,
  ]);

  useEffect(() => {
    if (!configPlans.length) return;
    setSelectedIdx((idx) => {
      const rank = (p: InferenceNodePlan | null | undefined) => {
        if (!p) return 999;
        if (p.kind === 'fits') return 0;
        if (p.kind === 'replicas') return 100 + p.nodeCount;
        return 500;
      };
      const current = configPlans[idx];
      if (current && rank(current) < 500) return idx;
      let bestIdx = idx;
      let bestRank = rank(current);
      configPlans.forEach((p, i) => {
        const r = rank(p);
        if (r < bestRank) {
          bestRank = r;
          bestIdx = i;
        }
      });
      return bestIdx;
    });
  }, [configPlans]);

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
  const apiOnly = modelMeta?.deployment === 'api-only' || (!configs.length && rec?.ok);
  const maxCtxOptions = contextOptions(profile?.contextDefault ?? 128_000);
  const avgCtxOptions = contextOptions(
    Math.max(avgContextTokens, Math.min(32_768, maxContextTokens)),
  ).filter((o) => Number(o.value) <= maxContextTokens);

  return (
    <>
      <div className={`${panelStyles.formColumn} ${styles.configCard}`}>
        <div className={styles.configInner}>
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

          <div className={styles.controls}>
            <div className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Формат весов
              </Text>
              <SegmentedRadioGroup
                size="l"
                value={quant}
                onUpdate={(v) => setQuant(v as QuantOption)}
                aria-label="Формат весов"
              >
                {QUANT_OPTIONS.map((o) => (
                  <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                    {o.label}
                  </SegmentedRadioGroup.Option>
                ))}
              </SegmentedRadioGroup>
            </div>
          </div>

          <div className={styles.workload}>
            <div className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Одновременные запросы
              </Text>
              <NumberInput
                size="l"
                min={1}
                max={128}
                value={concurrentRequests}
                onUpdate={(v) =>
                  setConcurrentRequests(Math.max(1, Math.round(v ?? 1)))
                }
                controlProps={{
                  'aria-label': 'Одновременные запросы',
                }}
              />
            </div>
            <div className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Средний контекст
              </Text>
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
              <Text variant="caption-2" color="secondary">
                Макс. контекст
              </Text>
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

            <div className={styles.configSection}>
            <Text variant="subheader-1" className={styles.sectionTitle}>
              GPU-конфигурации
            </Text>

            {recLoading ? (
              <Text variant="body-2" color="secondary">
                …
              </Text>
            ) : null}

            {apiOnly && !recLoading ? (
              <Text variant="body-2" color="secondary">
                Self-host недоступен для этой модели.
              </Text>
            ) : null}

            {!apiOnly && configs.length ? (
              <div className={styles.configList} role="listbox" aria-label="GPU-конфигурации">
                <div className={styles.configHead} aria-hidden="true">
                  <Text variant="caption-2" color="hint">
                    GPU-конфигурация
                  </Text>
                  <Text variant="caption-2" color="hint">
                    Формат
                  </Text>
                  <Text variant="caption-2" color="hint">
                    Использование VRAM
                  </Text>
                  <Text variant="caption-2" color="hint">
                    Запас памяти
                  </Text>
                  <Text variant="caption-2" color="hint" className={styles.configPrice}>
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
                  const load = bd?.loadBand ? loadBandLabel(bd.loadBand) : null;
                  const impossible = plan?.kind === 'impossible';
                  const badge =
                    impossible ||
                    (bd?.loadBand != null && loadAsBadge(bd.loadBand));
                  const vramLabel = impossible
                    ? formatVramUsage(bd?.totalGiB ?? c.estimatedVramGiB, bd?.capacityGiB)
                    : bd != null
                      ? formatVramUsage(bd.totalGiB, bd.capacityGiB)
                      : `~${c.estimatedVramGiB} GiB`;
                  const loadText = impossible
                    ? 'Не влезает'
                    : plan?.kind === 'replicas'
                      ? formatNodeCount(plan.nodeCount)
                      : load?.text;
                  const loadTitle = impossible
                    ? 'Не влезает'
                    : load?.text;
                  return (
                    <button
                      key={`${c.gpuFamily}-${c.gpuCount}-${c.quant}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={styles.configRow}
                      data-active={isActive ? 'true' : 'false'}
                      data-overload={impossible ? 'true' : 'false'}
                      data-replicas={plan?.kind === 'replicas' ? 'true' : 'false'}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <Text variant="body-2" ellipsis className={styles.configGpu}>
                        {c.gpuCount}× {c.gpuFamily}
                        {plan?.kind === 'replicas' ? (
                          <Text as="span" variant="caption-2" color="secondary">
                            {' '}
                            · {formatNodeCount(plan.nodeCount)}
                          </Text>
                        ) : null}
                      </Text>
                      <Text variant="body-2" color="secondary" className={styles.configQuant}>
                        {c.quant.toUpperCase()}
                      </Text>
                      <Text
                        variant="body-2"
                        color="secondary"
                        className={styles.configVram}
                        title={
                          bd?.capacityGiB != null && !impossible
                            ? `На одну ноду · свободно ${Math.max(0, Math.round((bd.capacityGiB - bd.totalGiB) * 10) / 10)} GiB`
                            : loadTitle
                        }
                      >
                        {vramLabel}
                      </Text>
                      <span className={styles.configLoad} title={loadTitle}>
                        {loadText ? (
                          badge || plan?.kind === 'replicas' ? (
                            <Label
                              size="xs"
                              theme={plan?.kind === 'replicas' ? 'info' : 'normal'}
                            >
                              {loadText}
                            </Label>
                          ) : (
                            <Text variant="caption-2" color="secondary">
                              {loadText}
                            </Text>
                          )
                        ) : null}
                      </span>
                      <Text variant="subheader-2" className={styles.configPrice}>
                        {amount != null && !impossible
                          ? `${formatQuoteAmount(amount, period).replace(/\s*₽$/, '')} ₽`
                          : '—'}
                        <Text as="span" variant="caption-2" className={styles.configPeriod}>
                          {' '}
                          / {periodShortLabel(period)}
                        </Text>
                      </Text>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {!apiOnly && vramBreakdown ? (
            <VramBreakdownCard breakdown={vramBreakdown} embedded />
          ) : null}

          {!apiOnly && selected ? (
            <div className={styles.chatBridge}>
              <Button
                component={Link}
                href={chatUrlForQuery(
                  selfHostChatPrompt({
                    model,
                    quant: selected.quant,
                    gpuFamily: selected.gpuFamily,
                    gpuCount: selected.gpuCount,
                  }),
                )}
                view="flat-secondary"
                size="m"
                prefetch
              >
                <Icon data={Sparkles} size={16} />
                Спросить ассистента про эту сборку
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
            ? 'Self-host недоступен'
            : selectedPlan?.kind === 'impossible'
              ? 'Модель не влезает на узел'
              : 'Нет котировок'
        }
      />
    </>
  );
}
