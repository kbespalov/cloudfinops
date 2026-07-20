'use client';

import {useEffect, useMemo, useState} from 'react';
import {Flex, Label, Select, Text} from '@gravity-ui/uikit';
import {INFERENCE_MODELS, type InferenceDtype} from '@/data/inference-models';
import type {InferenceRecommendResult} from '@/lib/chat/inference-recommend';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import {useAdhocQuote} from '@/lib/calculator/useAdhocQuote';
import {CalculatorSidebar} from './CalculatorSidebar';
import styles from './InferenceCalculatorPanel.module.css';

type QuantOption = InferenceDtype | 'auto';

const QUANT_OPTIONS: {value: QuantOption; content: string}[] = [
  {value: 'auto', content: 'Auto'},
  {value: 'int4', content: 'INT4'},
  {value: 'fp8', content: 'FP8'},
  {value: 'bf16', content: 'BF16'},
  {value: 'int8', content: 'INT8'},
];

const DEFAULT_MODEL = 'Qwen3-Coder-Next';

type ConfigPick = NonNullable<InferenceRecommendResult['configs']>[number];

function formatRub(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU').format(Math.round(n));
}

function modelOptions() {
  return INFERENCE_MODELS.map((m) => ({
    value: m.displayName,
    content: m.displayName,
  }));
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
      maxConfigs: '5',
    });
    fetch(`/api/calculator/inference?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`inference ${res.status}`);
        return res.json() as Promise<InferenceRecommendResult>;
      })
      .then((data) => {
        if (cancelled) return;
        setRec(data);
        setSelectedIdx(0);
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
    const unitOnly = selected.host?.unitOnly;
    return {
      kind: 'gpu' as const,
      period,
      gpuModelMatch: selected.gpuFamily,
      gpuCount: selected.gpuCount,
      gpuInterconnect: selected.interconnect ?? null,
      vcpu: unitOnly ? undefined : selected.host?.vcpu,
      ramGiB: unitOnly ? undefined : selected.host?.ramGiB,
      diskGiB: unitOnly ? undefined : (selected.host?.diskGiB ?? 100),
    };
  }, [selected, period]);

  const {result, loading: quoteLoading} = useAdhocQuote(quoteRequest);

  const modelMeta = rec?.model;
  const paramsLabel =
    modelMeta?.parameterCountB == null
      ? null
      : modelMeta.activeParameterCountB != null
        ? `${modelMeta.parameterCountB}B / ${modelMeta.activeParameterCountB}B active`
        : `${modelMeta.parameterCountB}B`;

  const hosted = rec?.hostedAlternative;
  const apiOnly = modelMeta?.deployment === 'api-only' || (!configs.length && rec?.ok);

  const configSubtitle = selected
    ? `${selected.gpuCount}×${selected.gpuFamily} · ${selected.quant.toUpperCase()}`
    : undefined;

  const hostedExtra = hosted?.providersMatched?.length ? (
    <div className={styles.block} style={{padding: 16}}>
      <Text variant="subheader-2">Hosted API · ₽ / 1M</Text>
      <table className={styles.hostedTable}>
        <thead>
          <tr>
            <th>
              <Text variant="caption-2" color="secondary">
                Провайдер
              </Text>
            </th>
            <th>
              <Text variant="caption-2" color="secondary">
                Input
              </Text>
            </th>
            <th>
              <Text variant="caption-2" color="secondary">
                Output
              </Text>
            </th>
          </tr>
        </thead>
        <tbody>
          {hosted.providersMatched.slice(0, 5).map((p) => (
            <tr key={p.provider}>
              <td>
                <Text variant="body-2">{p.provider}</Text>
              </td>
              <td>
                <Text variant="body-2">{formatRub(p.inputMonth ?? p.cheapestMonth)}</Text>
              </td>
              <td>
                <Text variant="body-2">{formatRub(p.outputMonth)}</Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  return (
    <>
      <div className={styles.root}>
        <section className={styles.block}>
          <Text variant="subheader-2">Модель</Text>

          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Модель
              </Text>
              <Select
                size="l"
                filterable
                value={[model]}
                options={modelOptions()}
                onUpdate={(v) => setModel(v[0] ?? DEFAULT_MODEL)}
              />
            </label>
            <label className={styles.field}>
              <Text variant="caption-2" color="secondary">
                Квант
              </Text>
              <Select
                size="l"
                value={[quant]}
                options={QUANT_OPTIONS}
                onUpdate={(v) => setQuant((v[0] as QuantOption) ?? 'auto')}
              />
            </label>
          </div>

          {modelMeta ? (
            <div className={styles.metaRow}>
              {paramsLabel ? <Text variant="body-2">{paramsLabel}</Text> : null}
              {modelMeta.deployment === 'api-only' ? (
                <Label size="s" theme="danger">
                  API-only
                </Label>
              ) : modelMeta.deployment === 'weights-pending' ? (
                <Label size="s" theme="warning">
                  веса скоро
                </Label>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className={styles.block}>
          <Text variant="subheader-2">GPU</Text>

          {recLoading ? <Text variant="body-2">…</Text> : null}

          {apiOnly && !recLoading ? (
            <Text variant="body-2">Self-host недоступен — смотрите Hosted API.</Text>
          ) : null}

          {!apiOnly && configs.length ? (
            <div className={styles.configGrid}>
              {configs.slice(0, 4).map((c, i) => {
                const isActive = selectedIdx === i;
                const month = c.best?.totalMonth;
                const role = i === 0 ? 'Минимум' : i === 1 ? 'Рекомендуемая' : 'Ещё';
                return (
                  <button
                    key={`${c.gpuFamily}-${c.gpuCount}-${c.quant}-${i}`}
                    type="button"
                    className={styles.configCard}
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => setSelectedIdx(i)}
                  >
                    <Flex justifyContent="space-between" alignItems="center" gap={2}>
                      <Label size="xs" theme={i === 0 ? 'info' : i === 1 ? 'success' : 'utility'}>
                        {role}
                      </Label>
                      <Text variant="caption-2" color="secondary">
                        ~{c.estimatedVramGiB} GiB
                      </Text>
                    </Flex>
                    <Text variant="subheader-2">
                      {c.gpuCount}× {c.gpuFamily} · {c.quant.toUpperCase()}
                    </Text>
                    <Flex alignItems="baseline" gap={1} className={styles.configPrice}>
                      <Text variant="header-1">
                        {month != null ? `${formatRub(month)} ₽` : '—'}
                      </Text>
                      <Text variant="body-2" color="secondary">
                        / мес
                      </Text>
                    </Flex>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      <CalculatorSidebar
        period={period}
        result={apiOnly ? null : result}
        loading={recLoading || quoteLoading}
        eyebrow={modelMeta?.displayName}
        subtitle={configSubtitle}
        emptyHint={apiOnly ? 'Только Hosted API' : 'Нет котировок'}
        extras={hostedExtra}
      />
    </>
  );
}
