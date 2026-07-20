'use client';

import {useEffect, useMemo, useState} from 'react';
import {
  Card,
  Divider,
  Flex,
  Icon,
  Label,
  SegmentedRadioGroup,
  Select,
  Text,
} from '@gravity-ui/uikit';
import {FaceRobot, Gpu} from '@gravity-ui/icons';
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
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {CalculatorSidebar} from './CalculatorSidebar';
import {ModelFamilyMark} from './ModelFamilyMark';
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

type ConfigPick = NonNullable<InferenceRecommendResult['configs']>[number];

function monthToPeriod(month: number | null | undefined, period: PeriodMode): number | null {
  if (month == null || !Number.isFinite(month)) return null;
  if (period === 'month') return month;
  if (period === 'year') return month * 12;
  return month / 720;
}

function modelOptions() {
  return INFERENCE_MODELS.map((m) => ({
    value: m.displayName,
    content: m.displayName,
  }));
}

function roleLabel(index: number): string {
  if (index === 0) return 'Минимум';
  if (index === 1) return 'Рекомендуемая';
  return 'Ещё';
}

function ModelOptionRow({name, size = 20}: {name: string; size?: number}) {
  return (
    <Flex alignItems="center" gap={2} className={styles.modelOption}>
      <ModelFamilyMark name={name} size={size} />
      <Text variant="body-2" ellipsis>
        {name}
      </Text>
    </Flex>
  );
}

export function InferenceCalculatorPanel({period}: {period: PeriodMode}) {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [quant, setQuant] = useState<QuantOption>('auto');
  const [rec, setRec] = useState<InferenceRecommendResult | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

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
        // Prefer first config with a catalog quote (e.g. skip unpriced B300 → H200).
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
  const selected: ConfigPick | null = configs[selectedIdx] ?? configs[0] ?? null;

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
      // Keep 80GB vs 94GB H100 (and similar) aligned with recommend quotes.
      gpuMemoryGb: selected.host?.gpuMemoryGb ?? null,
    };
  }, [selected, period]);

  const {result, loading: quoteLoading} = useAdhocQuote(quoteRequest);

  const modelMeta = rec?.model;
  const paramsLabel =
    modelMeta?.parameterCountB == null
      ? null
      : modelMeta.activeParameterCountB != null
        ? `${modelMeta.parameterCountB}B · ${modelMeta.activeParameterCountB}B act`
        : `${modelMeta.parameterCountB}B`;

  const apiOnly = modelMeta?.deployment === 'api-only' || (!configs.length && rec?.ok);

  return (
    <>
      <Card type="container" view="outlined" size="l" className={styles.configCard}>
        <Flex direction="column" gap={4} className={styles.configInner}>
          <div className={styles.fieldStack}>
            <label className={styles.field}>
              <Flex alignItems="center" gap={2} wrap className={styles.fieldHead}>
                <Icon data={FaceRobot} size={14} className={styles.fieldIcon} />
                <Text variant="body-2" color="complementary">
                  Модель
                </Text>
                {paramsLabel ? (
                  <Label size="xs" theme="unknown">
                    {paramsLabel}
                  </Label>
                ) : null}
                {modelMeta?.deployment === 'api-only' ? (
                  <Label size="xs" theme="danger">
                    API-only
                  </Label>
                ) : null}
                {modelMeta?.deployment === 'weights-pending' ? (
                  <Label size="xs" theme="warning">
                    веса скоро
                  </Label>
                ) : null}
              </Flex>
              <Select
                size="m"
                filterable
                width="max"
                value={[model]}
                options={modelOptions()}
                onUpdate={(v) => setModel(v[0] ?? DEFAULT_MODEL)}
                getOptionHeight={() => 32}
                renderOption={(option) => (
                  <ModelOptionRow name={String(option.value ?? option.content)} size={18} />
                )}
                renderSelectedOption={(option) => (
                  <ModelOptionRow name={String(option.value ?? option.content)} size={16} />
                )}
              />
            </label>

            <div className={styles.field}>
              <Text variant="body-2" color="complementary">
                Квант
              </Text>
              <SegmentedRadioGroup
                size="m"
                width="max"
                value={quant}
                onUpdate={(v) => setQuant(v as QuantOption)}
                aria-label="Квантизация"
              >
                {QUANT_OPTIONS.map((o) => (
                  <SegmentedRadioGroup.Option key={o.value} value={o.value}>
                    {o.label}
                  </SegmentedRadioGroup.Option>
                ))}
              </SegmentedRadioGroup>
            </div>
          </div>

          <Divider />

          <div className={styles.configSection}>
            <Flex alignItems="center" gap={2}>
              <Icon data={Gpu} size={16} />
              <Text variant="subheader-2">GPU</Text>
            </Flex>

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
              <div className={styles.configList} role="listbox" aria-label="Конфигурации GPU">
                {configs.slice(0, 4).map((c, i) => {
                  const isActive = selectedIdx === i;
                  const amount = monthToPeriod(c.best?.totalMonth, period);
                  return (
                    <button
                      key={`${c.gpuFamily}-${c.gpuCount}-${c.quant}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={styles.configRow}
                      data-active={isActive ? 'true' : 'false'}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <span className={styles.configMain}>
                        <Label
                          size="xs"
                          theme={i === 0 ? 'info' : i === 1 ? 'success' : 'normal'}
                        >
                          {roleLabel(i)}
                        </Label>
                        <Text variant="body-2">
                          {c.gpuCount}× {c.gpuFamily} · {c.quant.toUpperCase()}
                        </Text>
                        <Text variant="caption-2" color="secondary">
                          ~{c.estimatedVramGiB} GiB
                        </Text>
                      </span>
                      <Text variant="subheader-2" className={styles.configPrice}>
                        {amount != null
                          ? `${formatQuoteAmount(amount, period).replace(/\s*₽$/, '')} ₽`
                          : '—'}
                        <span className={styles.configPeriod}>
                          {' '}
                          / {periodShortLabel(period)}
                        </span>
                      </Text>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Flex>
      </Card>

      <CalculatorSidebar
        period={period}
        result={apiOnly ? null : result}
        loading={recLoading || quoteLoading}
        eyebrow="Лучшее предложение"
        emptyHint={apiOnly ? 'Self-host недоступен' : 'Нет котировок'}
      />
    </>
  );
}
