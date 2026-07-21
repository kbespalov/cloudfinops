'use client';

import {useEffect, useMemo, useState} from 'react';
import {
  Label,
  NumberInput,
  SegmentedRadioGroup,
  Select,
  Text,
} from '@gravity-ui/uikit';
import {INFERENCE_MODELS, type InferenceDtype} from '@/data/inference-models';
import {
  defaultPricedConfigIndex,
  type InferenceRecommendResult,
} from '@/lib/chat/inference-recommend-view';
import {
  formatQuoteAmount,
  periodShortLabel,
  type PeriodMode,
} from '@/lib/calculator/quote-view';
import {
  buildVramBreakdown,
  canonicalRecipeTotalGiB,
  CONTEXT_LENGTH_OPTIONS,
  formatContextTokens,
  formatVramUsage,
  loadBandLabel,
  type VramBreakdown,
  type VramLoadBand,
} from '@/lib/calculator/vram-breakdown';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {CalculatorSidebar} from './CalculatorSidebar';
import {ModelPicker} from './ModelPicker';
import {VramBreakdownCard} from './VramBreakdownCard';
import panelStyles from './CalculatorPanel.module.css';
import styles from './InferenceCalculatorPanel.module.css';

type QuantOption = InferenceDtype | 'auto';

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

function breakdownForConfig(
  config: ConfigPick,
  profile: (typeof INFERENCE_MODELS)[number],
  recipeTotalGiB: number,
  batchSize: number,
  concurrentUsers: number,
  contextTokens: number,
): VramBreakdown | null {
  const weight =
    profile.weights.find((w) => w.dtype === config.quant) ?? profile.weights[0];
  if (!weight) return null;
  return buildVramBreakdown({
    weightsGiB: weight.weightsVramGiB,
    recipeTotalGiB,
    contextDefault: profile.contextDefault,
    contextTokens,
    batchSize,
    concurrentUsers,
    quant: config.quant,
    gpuCount: config.gpuCount,
    gpuFamily: config.gpuFamily,
    gpuMemoryGb: config.host?.gpuMemoryGb ?? null,
  });
}

export function InferenceCalculatorPanel({period}: {period: PeriodMode}) {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [quant, setQuant] = useState<QuantOption>('auto');
  const [batchSize, setBatchSize] = useState(1);
  const [concurrentUsers, setConcurrentUsers] = useState(1);
  const [contextTokens, setContextTokens] = useState(32_768);
  const [rec, setRec] = useState<InferenceRecommendResult | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const profile = useMemo(
    () => INFERENCE_MODELS.find((m) => m.displayName === model) ?? null,
    [model],
  );

  useEffect(() => {
    if (profile?.contextDefault) setContextTokens(profile.contextDefault);
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
        canonicalRecipeTotalGiB(weight.weightsVramGiB, [
          ...fromRows,
          ...(fromRows.length ? [] : fromProfile),
        ]),
      );
    }
    return map;
  }, [configs, profile]);

  const configBreakdowns = useMemo(() => {
    if (!profile) return [] as Array<VramBreakdown | null>;
    return configs.map((c) => {
      const recipe = recipeByQuant.get(c.quant);
      if (recipe == null || recipe <= 0) return null;
      return breakdownForConfig(
        c,
        profile,
        recipe,
        batchSize,
        concurrentUsers,
        contextTokens,
      );
    });
  }, [configs, profile, recipeByQuant, batchSize, concurrentUsers, contextTokens]);

  useEffect(() => {
    if (!configBreakdowns.length) return;
    setSelectedIdx((idx) => {
      const current = configBreakdowns[idx];
      if (current && (current.utilizationPct == null || current.utilizationPct <= 100)) {
        return idx;
      }
      const fitIdx = configBreakdowns.findIndex(
        (b) => b != null && (b.utilizationPct == null || b.utilizationPct <= 100),
      );
      return fitIdx >= 0 ? fitIdx : idx;
    });
  }, [configBreakdowns]);

  const selected: ConfigPick | null = configs[selectedIdx] ?? configs[0] ?? null;
  const vramBreakdown = configBreakdowns[selectedIdx] ?? null;

  const quoteRequest = useMemo(() => {
    if (!selected) return null;
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
  }, [selected, period]);

  const {result, loading: quoteLoading} = useAdhocQuote(quoteRequest);

  const modelMeta = rec?.model;
  const apiOnly = modelMeta?.deployment === 'api-only' || (!configs.length && rec?.ok);
  const ctxOptions = contextOptions(profile?.contextDefault ?? 32_768);

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
                Batch size
              </Text>
              <NumberInput
                size="l"
                min={1}
                max={256}
                value={batchSize}
                onUpdate={(v) => setBatchSize(Math.max(1, Math.round(v ?? 1)))}
                controlProps={{'aria-label': 'Batch size'}}
              />
            </div>
            <div className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Пользователи
              </Text>
              <NumberInput
                size="l"
                min={1}
                max={64}
                value={concurrentUsers}
                onUpdate={(v) => setConcurrentUsers(Math.max(1, Math.round(v ?? 1)))}
                controlProps={{'aria-label': 'Одновременные пользователи'}}
              />
            </div>
            <div className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Контекст
              </Text>
              <Select
                size="l"
                width="max"
                value={[String(contextTokens)]}
                options={ctxOptions}
                onUpdate={(v) => {
                  const n = Number(v[0]);
                  if (Number.isFinite(n) && n > 0) setContextTokens(n);
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
                  const amount = monthToPeriod(c.best?.totalMonth, period);
                  const bd = configBreakdowns[i];
                  const load = bd?.loadBand ? loadBandLabel(bd.loadBand) : null;
                  const overload = bd?.loadBand === 'overload';
                  const badge = bd?.loadBand != null && loadAsBadge(bd.loadBand);
                  const vramLabel =
                    bd?.totalGiB != null
                      ? formatVramUsage(bd.totalGiB, bd.capacityGiB)
                      : `~${c.estimatedVramGiB} GiB`;
                  return (
                    <button
                      key={`${c.gpuFamily}-${c.gpuCount}-${c.quant}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={styles.configRow}
                      data-active={isActive ? 'true' : 'false'}
                      data-overload={overload ? 'true' : 'false'}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <Text variant="body-2" ellipsis className={styles.configGpu}>
                        {c.gpuCount}× {c.gpuFamily}
                      </Text>
                      <Text variant="body-2" color="secondary" className={styles.configQuant}>
                        {c.quant.toUpperCase()}
                      </Text>
                      <Text
                        variant="body-2"
                        color="secondary"
                        className={styles.configVram}
                        title={
                          bd?.capacityGiB != null
                            ? `Свободно ${Math.max(0, Math.round((bd.capacityGiB - bd.totalGiB) * 10) / 10)} GiB`
                            : undefined
                        }
                      >
                        {vramLabel}
                      </Text>
                      <span className={styles.configLoad} title={load?.hint}>
                        {load ? (
                          badge ? (
                            <Label size="xs" theme="normal">
                              {load.text}
                            </Label>
                          ) : (
                            <Text variant="caption-2" color="secondary">
                              {load.text}
                            </Text>
                          )
                        ) : null}
                      </span>
                      <Text variant="subheader-2" className={styles.configPrice}>
                        {amount != null
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
        </div>
      </div>

      <CalculatorSidebar
        period={period}
        result={apiOnly ? null : result}
        loading={recLoading || quoteLoading}
        emptyHint={apiOnly ? 'Self-host недоступен' : 'Нет котировок'}
      />
    </>
  );
}
