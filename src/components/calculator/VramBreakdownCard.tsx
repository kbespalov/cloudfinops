'use client';

import {Text, Tooltip} from '@gravity-ui/uikit';
import {
  formatVramUsage,
  vramPartTone,
  type VramPartId,
  type VramBreakdown,
} from '@/lib/calculator/vram-breakdown';
import styles from './VramBreakdownCard.module.css';

function formatGiB(n: number): string {
  const rounded = n >= 100 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: rounded >= 100 ? 1 : 2,
  }).format(rounded);
}

function formatShare(gib: number, scale: number): string {
  if (scale <= 0) return '0%';
  const pct = (gib / scale) * 100;
  if (pct > 0 && pct < 0.1) return '<0,1%';
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${String(rounded).replace('.', ',')}%`;
}

const PART_ORDER: VramPartId[] = ['weights', 'kv', 'activations', 'overhead'];

const PART_LABEL: Record<VramPartId, string> = {
  weights: 'Веса модели',
  kv: 'KV cache',
  activations: 'Активации',
  overhead: 'Служебная память',
};

const PART_HINT: Record<VramPartId, string> = {
  weights: 'Память под веса модели в выбранном формате',
  kv: 'KV cache для текущей нагрузки (вход + выход в длине последовательности)',
  activations: 'Рабочая память активаций на один forward-pass',
  overhead: 'Память runtime, CUDA-контекста, буферов, коммуникаций и других служебных структур',
};

function formatPartAmount(
  id: VramPartId,
  gib: number,
  breakdown: VramBreakdown,
): {display: string; tipExtra?: string} {
  if (id !== 'kv') {
    return {display: `${formatGiB(gib)}\u00a0GiB`};
  }
  if (gib > 0) {
    return {display: `${formatGiB(gib)}\u00a0GiB`};
  }
  const sizing = breakdown.sizing;
  if (sizing && sizing.kvBytesPerToken > 0 && sizing.residentTokens > 0) {
    // Rounded below display precision, but calculation exists.
    return {
      display: '<0,01\u00a0GiB',
      tipExtra: `Оценка: ${sizing.residentTokens.toLocaleString('ru-RU')} ток. × ${sizing.kvBytesPerToken}\u00a0B/токен`,
    };
  }
  if (sizing?.kvBytesPerTokenSource === 'fallback' && gib === 0) {
    return {
      display: 'нет оценки',
      tipExtra:
        'Для оценки нужны архитектура модели, длина последовательности, параллелизм и параметры runtime',
    };
  }
  return {
    display: 'нет оценки',
    tipExtra:
      'Для оценки нужны архитектура модели, длина последовательности, параллелизм и параметры runtime',
  };
}

export function VramBreakdownCard({
  breakdown,
  embedded = false,
}: {
  breakdown: VramBreakdown;
  embedded?: boolean;
}) {
  const byId = new Map(breakdown.parts.map((p) => [p.id, p.gib]));
  const orderedParts = PART_ORDER.map((id) => ({
    id,
    label: PART_LABEL[id],
    gib: byId.get(id) ?? 0,
    tone: vramPartTone(id),
  }));
  const partsSum = orderedParts.reduce((s, p) => s + Math.max(0, p.gib), 0);
  const used = partsSum > 0 ? partsSum : breakdown.totalGiB;
  const Root = embedded ? 'section' : 'div';
  const capacity = breakdown.capacityGiB;
  const freeGiB =
    capacity != null ? Math.max(0, Math.round((capacity - used) * 10) / 10) : null;
  const scale = capacity != null && capacity > 0 ? Math.max(capacity, used) : used;
  const utilPct =
    capacity != null && capacity > 0
      ? Math.round((used / capacity) * 1000) / 10
      : breakdown.utilizationPct;

  const legendItems = [
    ...orderedParts,
    ...(freeGiB != null
      ? [{id: 'free' as const, label: 'Свободно', gib: freeGiB, tone: 'free' as const}]
      : []),
  ];

  return (
    <Root className={embedded ? styles.embedded : styles.card}>
      <div className={styles.head}>
        <Text as="h3" variant="subheader-1" className={styles.title}>
          Использование VRAM на одну ноду
        </Text>
        <div className={styles.headMeta}>
          <Text variant="body-2" color="secondary">
            {formatVramUsage(used, capacity)}
          </Text>
          {utilPct != null ? (
            <Text variant="caption-2" color="hint" className={styles.headPct}>
              {new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 1}).format(utilPct)}%
              занято
            </Text>
          ) : null}
        </div>
      </div>

      <div
        className={styles.barTrack}
        role="img"
        aria-label={legendItems
          .filter((item) => item.gib > 0)
          .map((item) => `${item.label} ${formatGiB(item.gib)} GiB`)
          .join(', ')}
      >
        {orderedParts.map((part) => {
          if (part.gib <= 0 || scale <= 0) return null;
          const pct = Math.max((part.gib / scale) * 100, part.gib > 0 ? 0.8 : 0);
          const amount = formatPartAmount(part.id, part.gib, breakdown);
          return (
            <Tooltip
              key={part.id}
              content={`${part.label}: ${amount.display} · ${formatShare(part.gib, scale)}. ${PART_HINT[part.id]}${amount.tipExtra ? `. ${amount.tipExtra}` : ''}`}
              openDelay={150}
            >
              <span
                className={styles.segment}
                data-tone={part.tone}
                style={{width: `${pct}%`}}
                tabIndex={0}
              />
            </Tooltip>
          );
        })}
        {freeGiB != null && freeGiB > 0 && scale > 0 ? (
          <Tooltip
            content={`Свободно: ${formatGiB(freeGiB)}\u00a0GiB · ${formatShare(freeGiB, scale)}`}
            openDelay={150}
          >
            <span
              className={styles.segment}
              data-tone="free"
              style={{width: `${(freeGiB / scale) * 100}%`}}
              tabIndex={0}
            />
          </Tooltip>
        ) : null}
      </div>

      <ul className={styles.legend}>
        {legendItems.map((item) => {
          const amount =
            item.id === 'free'
              ? {display: `${formatGiB(item.gib)}\u00a0GiB` as string, tipExtra: undefined}
              : formatPartAmount(item.id, item.gib, breakdown);
          const tip =
            item.id === 'free'
              ? `Свободно: ${amount.display} · ${formatShare(item.gib, scale)}`
              : `${item.label}: ${amount.display}${item.gib > 0 ? ` · ${formatShare(item.gib, scale)}` : ''}. ${PART_HINT[item.id]}${amount.tipExtra ? `. ${amount.tipExtra}` : ''}`;
          return (
            <Tooltip key={item.id} content={tip} openDelay={150}>
              <li className={styles.legendItem} tabIndex={0}>
                <span className={styles.swatch} data-tone={item.tone} aria-hidden />
                <Text as="span" variant="caption-2" color="secondary" className={styles.legendLabel}>
                  {item.label}
                </Text>
                <Text as="span" variant="caption-2" color="hint" className={styles.legendAmount}>
                  {amount.display}
                </Text>
              </li>
            </Tooltip>
          );
        })}
      </ul>
    </Root>
  );
}
