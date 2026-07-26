'use client';

import Link from 'next/link';
import {useMemo, useState} from 'react';
import {
  Button,
  HelpMark,
  Icon,
  Label,
  SegmentedRadioGroup,
  Text,
} from '@gravity-ui/uikit';
import {
  Archive,
  Circles4Square,
  Clock,
  Cpu,
  Database,
  Layers3Diagonal,
  Pulse,
  Server,
  Sparkles,
} from '@gravity-ui/icons';
import {CalculatorSidebar} from '@/components/calculator/CalculatorSidebar';
import {SliderField} from '@/components/calculator/SliderField';
import {chatUrlForQuery} from '@/components/home/homePrompts';
import {lakehouseChatPrompt} from '@/lib/calculator/lakehouse-links';
import {
  LAKEHOUSE_PRESETS,
  lakehousePresetById,
  type LakehouseNodePool,
  type LakehouseSize,
} from '@/lib/calculator/lakehouse-presets';
import {
  formatGiBCapacity,
  formatRuNumber,
  periodShortLabel,
  type CostPartId,
  type PeriodMode,
  type ViewProviderQuote,
} from '@/lib/calculator/quote-view';
import {useLakehouseQuote} from '@/lib/calculator/useLakehouseQuote';
import panelStyles from './CalculatorPanel.module.css';
import styles from './LakehouseCalculatorPanel.module.css';

const LAKE_STEPS = [5, 10, 25, 50, 75, 100, 150, 250, 500, 750, 1000];
const HOT_STEPS = [20, 30, 40, 50, 60, 70, 80, 90, 100];
const HOUR_STEPS = [2, 4, 6, 8, 10, 12, 16, 20, 24];

/** How much text fits on a Hot/Cold segment at the given share. */
function splitLabelMode(percent: number): 'full' | 'short' | 'hidden' {
  if (percent >= 22) return 'full';
  if (percent >= 10) return 'short';
  return 'hidden';
}

function nearestIn(options: number[], value: number): number {
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

type Footprint = {nodes: number; vcpu: number; ramGiB: number};

function sumPools(pools: LakehouseNodePool[]): Footprint {
  return pools.reduce<Footprint>(
    (acc, p) => ({
      nodes: acc.nodes + p.count,
      vcpu: acc.vcpu + p.count * p.vcpu,
      ramGiB: acc.ramGiB + p.count * p.ramGiB,
    }),
    {nodes: 0, vcpu: 0, ramGiB: 0},
  );
}

const PART_LABEL: Partial<Record<CostPartId, string>> = {
  storage: 'Object Storage',
  k8s: 'Kubernetes master',
  platform: 'Platform (24/7)',
  etl: 'ETL / Spark',
  query: 'Query / Trino',
};

/** Interpret the best quote: which line dominates the bill. */
function dominantInsight(best: ViewProviderQuote | null): {title: string} | null {
  if (!best || best.total <= 0 || best.parts.length === 0) return null;
  const top = [...best.parts].sort((a, b) => b.amount - a.amount)[0]!;
  const share = Math.round((top.amount / best.total) * 100);
  const label = PART_LABEL[top.id] ?? 'Прочее';
  return {title: `Крупнейшая статья — ${label} (${share}%)`};
}

export function LakehouseCalculatorPanel({period}: {period: PeriodMode}) {
  const [presetId, setPresetId] = useState<LakehouseSize>('medium');
  const base = lakehousePresetById(presetId);

  const [lakeTiB, setLakeTiB] = useState(base.lakeTiB);
  const [hotPercent, setHotPercent] = useState(base.hotPercent);
  const [k8sTier, setK8sTier] = useState<'basic' | 'ha'>(base.k8sTier);
  const [etlHoursPerDay, setEtlHoursPerDay] = useState(base.etl.hoursPerDay);
  const [queryHoursPerDay, setQueryHoursPerDay] = useState(base.query.hoursPerDay);

  function applyPreset(id: LakehouseSize) {
    const next = lakehousePresetById(id);
    setPresetId(id);
    setLakeTiB(nearestIn(LAKE_STEPS, next.lakeTiB));
    setHotPercent(nearestIn(HOT_STEPS, next.hotPercent));
    setK8sTier(next.k8sTier);
    setEtlHoursPerDay(nearestIn(HOUR_STEPS, next.etl.hoursPerDay));
    setQueryHoursPerDay(nearestIn(HOUR_STEPS, next.query.hoursPerDay));
  }

  const request = useMemo(
    () => ({
      period,
      presetId,
      lakeTiB,
      hotPercent,
      k8sTier,
      etlHoursPerDay,
      queryHoursPerDay,
    }),
    [period, presetId, lakeTiB, hotPercent, k8sTier, etlHoursPerDay, queryHoursPerDay],
  );

  const {result, loading} = useLakehouseQuote(request);

  const coldPercent = Math.max(0, 100 - hotPercent);
  const totalGiB = lakeTiB * 1024;
  const hotGiB = Math.round((totalGiB * hotPercent) / 100);
  const coldGiB = totalGiB - hotGiB;

  const peak = sumPools([base.platform, base.etl, base.query]);
  const insight = dominantInsight(result?.best ?? null);
  const etlDutyPct = Math.round((etlHoursPerDay / 24) * 100);
  const queryDutyPct = Math.round((queryHoursPerDay / 24) * 100);

  return (
    <>
      <div className={`${panelStyles.formColumn} ${styles.configCard}`}>
        <div className={styles.configInner}>
          <section className={styles.fieldGroup} aria-label="Размер Lakehouse">
            {/* Compact first band — matches VM/LLM topSlot start (no H3 before controls). */}
            <div className={styles.presetHead}>
              <Text as="span" className={styles.presetHeadLabel}>
                Размер
              </Text>
              <HelpMark aria-label="Про пресеты" iconSize="s">
                Пресет задаёт объём озера и типовой DIY-стек: Managed Kubernetes +
                worker-ВМ под Airflow/catalog, Spark ETL и Trino. Дальше можно крутить
                объём, hot/cold и duty-cycle.
              </HelpMark>
            </div>
            <div className={styles.presetGrid} role="radiogroup" aria-label="Пресет S M L">
              {LAKEHOUSE_PRESETS.map((preset) => {
                const active = preset.id === presetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={styles.presetCard}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => applyPreset(preset.id)}
                  >
                    <div className={styles.presetTitle}>
                      <span className={styles.presetName}>{preset.title}</span>
                      <Label
                        size="xs"
                        theme="unknown"
                        className={styles.presetBadge}
                      >
                        {preset.shortTitle}
                      </Label>
                    </div>
                    <span className={styles.presetSubtitle}>{preset.subtitle}</span>
                    <span className={styles.presetAudience}>{preset.audience}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.fieldGroup} aria-label="Object Storage">
            <div className={styles.groupHead}>
              <Text as="h3" className={styles.groupTitle}>
                Object Storage
              </Text>
              <HelpMark aria-label="Про hot и cold" iconSize="s">
                Горячие (hot/standard) — рабочий набор Iceberg, по которому ходят
                Trino/Spark. Cold — lifecycle для редко читаемых данных: raw-слой
                (сырые данные из источников), история и старые снапшоты. У cold
                выше задержка и цена извлечения — горячие таблицы туда не кладут.
              </HelpMark>
            </div>
            <div className={styles.controlsStack}>
              <SliderField
                align="form"
                icon={Database}
                label="Объём озера"
                value={lakeTiB}
                options={LAKE_STEPS}
                unit="TiB"
                hint={`≈ ${formatGiBCapacity(lakeTiB * 1024)}`}
                compactStepper
                onUpdate={setLakeTiB}
                aria-label="Объём озера в TiB"
              />
              <SliderField
                align="form"
                icon={Archive}
                label="Горячие данные (hot)"
                value={hotPercent}
                options={HOT_STEPS}
                unit="%"
                hint={
                  coldPercent > 0
                    ? `Остальные ${coldPercent}% — cold: raw-слой, история, снапшоты`
                    : 'Всё озеро в hot-классе (standard)'
                }
                compactStepper
                onUpdate={setHotPercent}
                aria-label="Доля горячих данных в hot-классе"
              />
              <div className={styles.splitBlock}>
                <div
                  className={styles.splitBar}
                  role="img"
                  aria-label={`Hot ${formatGiBCapacity(hotGiB)} · ${hotPercent}%, Cold ${formatGiBCapacity(coldGiB)} · ${coldPercent}%`}
                >
                  <span
                    className={styles.splitSeg}
                    data-kind="hot"
                    data-label={splitLabelMode(hotPercent)}
                    style={{flexGrow: hotPercent || 0.01}}
                  >
                    <span className={styles.splitLabelFull}>
                      Hot · {formatGiBCapacity(hotGiB)}
                    </span>
                    <span className={styles.splitLabelShort}>{hotPercent}%</span>
                  </span>
                  {coldPercent > 0 ? (
                    <span
                      className={styles.splitSeg}
                      data-kind="cold"
                      data-label={splitLabelMode(coldPercent)}
                      style={{flexGrow: coldPercent}}
                    >
                      <span className={styles.splitLabelFull}>
                        Cold · {formatGiBCapacity(coldGiB)}
                      </span>
                      <span className={styles.splitLabelShort}>{coldPercent}%</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section
            className={`${styles.fieldGroup} ${styles.fieldGroupDivided}`}
            aria-label="Kubernetes и нагрузка"
          >
            <div className={styles.groupHead}>
              <Text as="h3" className={styles.groupTitle}>
                Kubernetes и нагрузка
              </Text>
            </div>
            <div className={styles.controlsStack}>
              <div className={styles.tierRow}>
                <div className={styles.tierLabel}>
                  <Icon data={Circles4Square} size={16} className={styles.tierLabelIcon} />
                  <span className={styles.tierLabelText}>Managed Kubernetes master</span>
                </div>
                <div className={styles.tierControl}>
                  <SegmentedRadioGroup
                    size="m"
                    value={k8sTier}
                    onUpdate={(v) => setK8sTier(v as 'basic' | 'ha')}
                    aria-label="Тип master Kubernetes"
                  >
                    <SegmentedRadioGroup.Option value="basic">
                      Базовый
                    </SegmentedRadioGroup.Option>
                    <SegmentedRadioGroup.Option value="ha">
                      Отказоустойчивый
                    </SegmentedRadioGroup.Option>
                  </SegmentedRadioGroup>
                </div>
              </div>
              <SliderField
                align="form"
                icon={Clock}
                label="ETL / Spark"
                value={etlHoursPerDay}
                options={HOUR_STEPS}
                unit="ч/день"
                hint={`Duty-cycle ${etlDutyPct}% суток — основной рычаг экономии на ETL.`}
                compactStepper
                onUpdate={setEtlHoursPerDay}
                aria-label="Часы работы ETL в сутки"
              />
              <SliderField
                align="form"
                icon={Pulse}
                label="Query / Trino"
                value={queryHoursPerDay}
                options={HOUR_STEPS}
                unit="ч/день"
                hint={`Duty-cycle ${queryDutyPct}% суток — вне окна SQL-пул можно гасить.`}
                compactStepper
                onUpdate={setQueryHoursPerDay}
                aria-label="Часы работы Query в сутки"
              />
            </div>
          </section>

          <section
            className={`${styles.fieldGroup} ${styles.fieldGroupDivided}`}
            aria-label="Кластер под пиком"
          >
            <div className={styles.groupHead}>
              <Text as="h3" className={styles.groupTitle}>
                Кластер под пиком
              </Text>
              <HelpMark aria-label="Про состав" iconSize="s">
                Публичные тарифы: Object Storage + master Managed Kubernetes + worker
                ВМ. Airflow, Iceberg catalog, Spark и Trino — софт на нодах, не
                отдельные PaaS SKU. Пик — когда активны все пулы; счёт зависит от
                duty-cycle.
              </HelpMark>
            </div>
            <div className={styles.footprintGrid}>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Server} size={13} />
                  <span className={styles.footprintLabel}>Ноды</span>
                </span>
                <span className={styles.footprintValue}>{peak.nodes}</span>
              </div>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Cpu} size={13} />
                  <span className={styles.footprintLabel}>vCPU</span>
                </span>
                <span className={styles.footprintValue}>{peak.vcpu}</span>
              </div>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Layers3Diagonal} size={13} />
                  <span className={styles.footprintLabel}>RAM</span>
                </span>
                <span className={styles.footprintValue}>
                  {formatRuNumber(peak.ramGiB)} GiB
                </span>
              </div>
            </div>
            {insight ? (
              <div className={styles.insight}>
                <Icon data={Pulse} size={14} className={styles.insightIcon} />
                <span className={styles.insightText}>{insight.title}</span>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <CalculatorSidebar
        period={period}
        result={result}
        loading={loading}
        emptyHint="Для выбранной конфигурации lakehouse предложения не собрались"
        bestPriceHint="Для выбранной конфигурации DIY lakehouse среди предложений в каталоге с Object Storage и Managed Kubernetes. Расчёт по публичным тарифам без индивидуальных скидок и промоакций."
        bestPriceBadge="Минимальная цена в каталоге"
        extras={
          <div className={styles.chatBridge}>
            <Button
              component={Link}
              href={chatUrlForQuery(
                lakehouseChatPrompt({
                  presetId,
                  lakeTiB,
                  hotPercent,
                  k8sTier,
                  etlHoursPerDay,
                  queryHoursPerDay,
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
              Спросить ассистента
            </Button>
          </div>
        }
      />
    </>
  );
}
