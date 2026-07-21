'use client';

import {Text} from '@gravity-ui/uikit';
import {
  bottleneckLabel,
  formatFreeOnNode,
} from '@/lib/calculator/inference-sizing';
import {
  vramPartTone,
  type VramPartId,
  type VramBreakdown,
} from '@/lib/calculator/vram-breakdown';
import styles from './VramBreakdownCard.module.css';

function formatGiB(n: number): string {
  if (n >= 100) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}

const PART_SHORT: Record<VramPartId, string> = {
  weights: 'Веса',
  kv: 'Кэш',
  activations: 'Акт',
  overhead: 'Оверх',
};

export function VramBreakdownCard({
  breakdown,
  embedded = false,
}: {
  breakdown: VramBreakdown;
  embedded?: boolean;
}) {
  const sizing = breakdown.sizing;
  const budget = sizing?.perNode;
  const partsSum = breakdown.parts.reduce((s, p) => s + p.gib, 0);
  const used = partsSum > 0 ? partsSum : breakdown.totalGiB;
  const Root = embedded ? 'section' : 'div';
  const capacity = budget?.rawVramGiB ?? breakdown.capacityGiB;
  const usable = budget?.usableVramGiB ?? capacity;
  const freeGiB =
    budget != null
      ? budget.freeReserveGiB
      : capacity != null
        ? Math.max(0, Math.round((capacity - used) * 10) / 10)
        : null;
  const scale =
    usable != null && usable > 0 ? Math.max(usable, used) : used;

  const legendItems = [
    ...breakdown.parts
      .filter((p) => p.gib > 0)
      .map((p) => ({
        id: p.id,
        label: PART_SHORT[p.id],
        gib: p.gib,
        tone: vramPartTone(p.id),
      })),
    ...(freeGiB != null && freeGiB > 0
      ? [{id: 'free' as const, label: 'Своб', gib: freeGiB, tone: 'free' as const}]
      : []),
  ];

  return (
    <Root className={embedded ? styles.embedded : styles.card}>
      <div className={styles.head}>
        <Text variant="subheader-1">Использование видеопамяти</Text>
      </div>

      <div
        className={styles.barTrack}
        role="img"
        aria-label={legendItems
          .map((item) => `${item.label} ${formatGiB(item.gib)} GiB`)
          .join(', ')}
      >
        {breakdown.parts.map((part) => {
          if (part.gib <= 0 || scale <= 0) return null;
          const pct = (part.gib / scale) * 100;
          return (
            <span
              key={part.id}
              className={styles.segment}
              data-tone={vramPartTone(part.id)}
              style={{width: `${pct}%`}}
              title={`${part.label}: ${formatGiB(part.gib)} GiB`}
            />
          );
        })}
        {freeGiB != null && freeGiB > 0 && scale > 0 ? (
          <span
            className={styles.segment}
            data-tone="free"
            style={{width: `${(freeGiB / scale) * 100}%`}}
            title={`Свободно: ${formatGiB(freeGiB)} GiB`}
          />
        ) : null}
      </div>

      <ul className={styles.legend}>
        {legendItems.map((item) => (
          <li key={item.id} className={styles.legendItem}>
            <span className={styles.swatch} data-tone={item.tone} aria-hidden />
            <Text as="span" variant="caption-2" color="secondary">
              {item.label} {formatGiB(item.gib)} GiB
            </Text>
          </li>
        ))}
      </ul>

      {sizing && budget ? (
        <div className={styles.debug}>
          <Text variant="caption-2" color="hint">
            Raw {formatGiB(budget.rawVramGiB)} · usable {formatGiB(budget.usableVramGiB)} (
            {Math.round(budget.gpuMemoryUtilization * 100)}%) · weights{' '}
            {formatGiB(budget.weightsGiB)} · runtime{' '}
            {formatGiB(budget.modelRuntimeMemoryGiB)} · KV {formatGiB(budget.kvCacheGiB)} ·{' '}
            {formatFreeOnNode(budget)}
          </Text>
          <Text variant="caption-2" color="hint">
            {bottleneckLabel(sizing.bottleneck)} · nodes {sizing.nodeCount} (fit{' '}
            {sizing.nodesForModelFit} / kv {sizing.nodesForKvCapacity}
            {sizing.nodesForThroughput != null
              ? ` / thr ${sizing.nodesForThroughput}`
              : ' / thr n/a'}
            ) · {sizing.weightFormatLabel} + KV {sizing.kvCacheDtype.toUpperCase()} ·{' '}
            {(sizing.residentTokens / 1e6).toFixed(2)}M tokens · {sizing.confidence}
            {sizing.throughputStatus === 'insufficient_data'
              ? ' · нет бенчмарка throughput'
              : ''}
          </Text>
        </div>
      ) : null}
    </Root>
  );
}
