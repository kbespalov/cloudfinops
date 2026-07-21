'use client';

import {Text} from '@gravity-ui/uikit';
import {
  formatContextTokens,
  formatVramUsage,
  loadBandLabel,
  vramPartTone,
  type VramBreakdown,
} from '@/lib/calculator/vram-breakdown';
import styles from './VramBreakdownCard.module.css';

function formatGiB(n: number): string {
  if (n >= 100) return `${Math.round(n * 10) / 10}`;
  return String(n);
}

export function VramBreakdownCard({
  breakdown,
  embedded = false,
}: {
  breakdown: VramBreakdown;
  embedded?: boolean;
}) {
  const total = breakdown.parts.reduce((s, p) => s + p.gib, 0) || breakdown.totalGiB;
  const load = breakdown.loadBand ? loadBandLabel(breakdown.loadBand) : null;
  const Root = embedded ? 'section' : 'div';
  const capacity = breakdown.capacityGiB;
  const summary = formatVramUsage(breakdown.totalGiB, capacity);
  const freeGiB =
    capacity != null ? Math.max(0, Math.round((capacity - breakdown.totalGiB) * 10) / 10) : null;

  return (
    <Root className={embedded ? styles.embedded : styles.card}>
      <div className={styles.head}>
        <Text variant="subheader-1">Использование видеопамяти</Text>
        <Text variant="body-2" color="secondary">
          {summary}
          {load ? ` · ${load.text}` : ''}
          {freeGiB != null && capacity != null && freeGiB > 0 ? ` · свободно ${freeGiB} GiB` : ''}
        </Text>
        {load?.hint ? (
          <Text variant="caption-2" color="hint">
            {load.hint}
          </Text>
        ) : null}
        <Text variant="caption-2" color="hint">
          {breakdown.quant.toUpperCase()} · batch {breakdown.batchSize} ·{' '}
          {breakdown.concurrentUsers} польз. · контекст{' '}
          {formatContextTokens(breakdown.contextTokens)}
        </Text>
      </div>

      <div className={styles.barTrack} role="img" aria-label="Распределение видеопамяти">
        {breakdown.parts.map((part) => {
          const pct = total > 0 ? (part.gib / total) * 100 : 0;
          return (
            <span
              key={part.id}
              className={styles.segment}
              data-tone={vramPartTone(part.id)}
              style={{flexGrow: Math.max(pct, part.gib > 0 ? 1.5 : 0), flexBasis: 0}}
              title={`${part.label}: ${formatGiB(part.gib)} GiB`}
            />
          );
        })}
      </div>

      <Text variant="caption-2" color="secondary" className={styles.legendLine}>
        {breakdown.parts
          .map((part) => {
            const short =
              part.id === 'weights'
                ? 'Веса'
                : part.id === 'kv'
                  ? 'KV'
                  : part.id === 'activations'
                    ? 'Акт.'
                    : 'Оверхед';
            return `${short} ${formatGiB(part.gib)}`;
          })
          .join(' · ')}{' '}
        GiB
      </Text>
    </Root>
  );
}
