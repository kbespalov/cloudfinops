'use client';

import {useMemo, useState} from 'react';
import {
  Flex,
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
} from '@gravity-ui/icons';
import {CalculatorSidebar} from '@/components/calculator/CalculatorSidebar';
import {SliderField} from '@/components/calculator/SliderField';
import {
  LAKEHOUSE_PRESETS,
  lakehousePresetById,
  type LakehouseNodePool,
  type LakehouseSize,
} from '@/lib/calculator/lakehouse-presets';
import {
  formatGiBCapacity,
  formatRuNumber,
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
  const configSummary = {
    line: `${lakeTiB} TiB · hot ${hotPercent}% · K8s ${k8sTier === 'ha' ? 'HA' : 'basic'} · ETL ${etlHoursPerDay}ч · SQL ${queryHoursPerDay}ч`,
  };

  const peak = sumPools([base.platform, base.etl, base.query]);
  const insight = dominantInsight(result?.best ?? null);
  const etlDutyPct = Math.round((etlHoursPerDay / 24) * 100);
  const queryDutyPct = Math.round((queryHoursPerDay / 24) * 100);

  return (
    <>
      <div className={`${panelStyles.formColumn} ${styles.configCard}`}>
        <div className={styles.configInner}>
          <section className={styles.fieldGroup} aria-label="Пресет размера">
            <Flex alignItems="center" gap={2}>
              <Text as="h3" className={styles.groupTitle}>
                Размер lakehouse
              </Text>
              <HelpMark aria-label="Про пресеты" iconSize="s">
                Пресет задаёт объём озера и типовой DIY-стек: Managed Kubernetes +
                worker-ВМ под Airflow/catalog, Spark ETL и Trino. Дальше можно крутить
                объём, hot/cold и duty-cycle.
              </HelpMark>
            </Flex>
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
                      <Text variant="subheader-2">{preset.title}</Text>
                      <Label size="xs" theme={active ? 'info' : 'unknown'}>
                        {preset.shortTitle}
                      </Label>
                    </div>
                    <Text variant="body-2">{preset.subtitle}</Text>
                    <Text variant="caption-2" color="secondary">
                      {preset.audience}
                    </Text>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.fieldGroup} aria-label="Хранилище">
            <Flex alignItems="center" gap={2}>
              <Text as="h3" className={styles.groupTitle}>
                Object Storage
              </Text>
              <HelpMark aria-label="Про hot и cold" iconSize="s">
                Рабочий набор Iceberg (по нему ходят Trino/Spark) всегда держат в
                hot-классе (standard). Cold — это lifecycle для редко читаемых данных:
                сырьё landing-зоны, историчные партиции, старые снапшоты. У cold выше
                задержка и цена извлечения, у части классов есть минимальный срок
                хранения — активные таблицы туда не кладут.
              </HelpMark>
            </Flex>
            <SliderField
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
              icon={Archive}
              label="Активные данные (hot)"
              value={hotPercent}
              options={HOT_STEPS}
              unit="%"
              hint={
                coldPercent > 0
                  ? `Остальные ${coldPercent}% — архив в cold-классе (редко читаемое: сырьё, история, снапшоты)`
                  : 'Всё озеро в hot-классе (standard)'
              }
              compactStepper
              onUpdate={setHotPercent}
              aria-label="Доля активных данных в hot-классе"
            />
            <div
              className={styles.splitBar}
              role="img"
              aria-label={`Активные ${hotPercent}%, архив ${coldPercent}%`}
            >
              <span className={styles.splitHot} style={{flexGrow: hotPercent}} />
              {coldPercent > 0 ? (
                <span className={styles.splitCold} style={{flexGrow: coldPercent}} />
              ) : null}
            </div>
            <div className={styles.splitLegend}>
              <span className={styles.splitLegendItem}>
                <span className={styles.splitSwatch} data-kind="hot" />
                <Text variant="caption-2" color="secondary">
                  Активные (hot) · {formatGiBCapacity(hotGiB)}
                </Text>
              </span>
              {coldGiB > 0 ? (
                <span className={styles.splitLegendItem}>
                  <span className={styles.splitSwatch} data-kind="cold" />
                  <Text variant="caption-2" color="secondary">
                    Архив (cold) · {formatGiBCapacity(coldGiB)}
                  </Text>
                </span>
              ) : null}
            </div>
          </section>

          <section className={styles.fieldGroup} aria-label="Кластер">
            <Text as="h3" className={styles.groupTitle}>
              Kubernetes и нагрузка
            </Text>
            <div className={styles.tierRow}>
              <Flex alignItems="center" gap={2}>
                <Icon data={Circles4Square} size={16} />
                <Text variant="body-1">Managed Kubernetes master</Text>
              </Flex>
              <SegmentedRadioGroup
                size="l"
                value={k8sTier}
                onUpdate={(v) => setK8sTier(v as 'basic' | 'ha')}
                aria-label="Тип master Kubernetes"
              >
                <SegmentedRadioGroup.Option value="basic">Basic</SegmentedRadioGroup.Option>
                <SegmentedRadioGroup.Option value="ha">HA</SegmentedRadioGroup.Option>
              </SegmentedRadioGroup>
              {k8sTier === 'ha' ? (
                <Text variant="caption-2" color="secondary">
                  HA-мастер есть не у всех — провайдеры без него в сравнении не участвуют.
                </Text>
              ) : null}
            </div>
            <SliderField
              icon={Clock}
              label="ETL / Spark"
              value={etlHoursPerDay}
              options={HOUR_STEPS}
              unit="ч/день"
              hint={`Активен ${etlHoursPerDay}/24 ч — платите за ${etlDutyPct}% времени. Duty-cycle — главный рычаг экономии.`}
              compactStepper
              onUpdate={setEtlHoursPerDay}
              aria-label="Часы работы ETL в сутки"
            />
            <SliderField
              icon={Pulse}
              label="Query / Trino"
              value={queryHoursPerDay}
              options={HOUR_STEPS}
              unit="ч/день"
              hint={`Активен ${queryHoursPerDay}/24 ч — платите за ${queryDutyPct}% времени. Вне окна пул можно гасить.`}
              compactStepper
              onUpdate={setQueryHoursPerDay}
              aria-label="Часы работы Query в сутки"
            />
          </section>

          <section className={styles.fieldGroup} aria-label="Состав платформы">
            <Flex alignItems="center" gap={2}>
              <Text as="h3" className={styles.groupTitle}>
                Кластер под пиком
              </Text>
              <HelpMark aria-label="Про состав" iconSize="s">
                Считаем публичные тарифы: Object Storage + master Managed Kubernetes +
                обычные ВМ как worker-ноды. Airflow, Iceberg catalog, Spark и Trino —
                софт на этих нодах, отдельными PaaS SKU не тарифицируем. Пик — когда
                одновременно активны все пулы; счёт зависит от duty-cycle.
              </HelpMark>
            </Flex>
            <div className={styles.footprintGrid}>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Server} size={13} />
                  <Text variant="caption-2">Ноды</Text>
                </span>
                <Text className={styles.footprintValue}>{peak.nodes}</Text>
              </div>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Cpu} size={13} />
                  <Text variant="caption-2">vCPU</Text>
                </span>
                <Text className={styles.footprintValue}>{peak.vcpu}</Text>
              </div>
              <div className={styles.footprintChip}>
                <span className={styles.footprintHead}>
                  <Icon data={Layers3Diagonal} size={13} />
                  <Text variant="caption-2">RAM</Text>
                </span>
                <Text className={styles.footprintValue}>
                  {formatRuNumber(peak.ramGiB)} GiB
                </Text>
              </div>
            </div>
            {insight ? (
              <div className={styles.insight}>
                <Icon data={Pulse} size={16} />
                <Text variant="body-2">{insight.title}</Text>
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
        configSummary={configSummary}
        bestPriceHint="Самый дешёвый DIY lakehouse среди провайдеров с Object Storage и Managed Kubernetes в каталоге"
        bestPriceBadge="Лучшая цена"
      />
    </>
  );
}
