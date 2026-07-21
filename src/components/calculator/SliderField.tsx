'use client';

import {Cpu} from '@gravity-ui/icons';
import {Flex, Icon, NumberInput, Slider, Text} from '@gravity-ui/uikit';
import styles from './SliderField.module.css';

type IconData = typeof Cpu;

type SliderFieldProps = {
  icon: IconData;
  label: string;
  value: number;
  options: number[];
  /** Fixed absolute scale so family switches visibly move the thumb. */
  scaleMin?: number;
  scaleMax?: number;
  unit?: string;
  onUpdate: (next: number) => void;
  'aria-label'?: string;
};

function nearestIn(options: number[], value: number): number {
  if (!options.length) return value;
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

function nearestIndex(options: number[], value: number): number {
  const nearest = nearestIn(options, value);
  return Math.max(0, options.indexOf(nearest));
}

function bump(options: number[], value: number, delta: number): number {
  const idx = nearestIndex(options, value);
  const next = Math.min(options.length - 1, Math.max(0, idx + delta));
  return options[next] ?? value;
}

function toPos(value: number): number {
  return Math.log2(Math.max(value, 1));
}

function fromPos(pos: number, options: number[]): number {
  return nearestIn(options, 2 ** pos);
}

function Unit({unit}: {unit?: string}) {
  if (!unit) return null;
  return (
    <Text variant="caption-1" color="secondary" className={styles.unit}>
      {unit}
    </Text>
  );
}

export function SliderField({
  icon,
  label,
  value,
  options,
  scaleMin,
  scaleMax,
  unit,
  onUpdate,
  'aria-label': ariaLabel,
}: SliderFieldProps) {
  const minOpt = options[0] ?? 1;
  const maxOpt = options[options.length - 1] ?? minOpt;
  const clamped = nearestIn(options, value);
  const absMin = scaleMin ?? minOpt;
  const absMax = scaleMax ?? maxOpt;
  const posMin = toPos(absMin);
  const posMax = toPos(absMax);
  const pos = Math.min(posMax, Math.max(posMin, toPos(clamped)));

  function handleSlider(nextPos: number) {
    onUpdate(fromPos(nextPos, options));
  }

  function handleInput(next: number | null) {
    if (next == null || !Number.isFinite(next)) return;
    if (next === value + 1) {
      onUpdate(bump(options, value, 1));
      return;
    }
    if (next === value - 1) {
      onUpdate(bump(options, value, -1));
      return;
    }
    onUpdate(nearestIn(options, next));
  }

  return (
    <div className={styles.root}>
      <Flex alignItems="center" gap={2} className={styles.label}>
        <Icon data={icon} size={16} className={styles.icon} />
        <Text variant="body-1" ellipsis>
          {label}
        </Text>
      </Flex>

      <Slider
        key={`${absMin}-${absMax}`}
        size="m"
        min={posMin}
        max={posMax}
        step={0.01}
        marks={0}
        value={pos}
        tooltipDisplay="off"
        onUpdate={handleSlider}
        onUpdateComplete={handleSlider}
        aria-label={ariaLabel ?? label}
        className={styles.slider}
      />

      <NumberInput
        size="m"
        hiddenControls
        min={minOpt}
        max={maxOpt}
        step={1}
        allowDecimal={false}
        value={clamped}
        onUpdate={handleInput}
        endContent={<Unit unit={unit} />}
        className={styles.input}
        controlProps={{'aria-label': ariaLabel ?? label}}
      />
    </div>
  );
}

/** Continuous integer slider (e.g. public IP 0…N). */
export function IntegerSliderField({
  icon,
  label,
  value,
  min,
  max,
  unit,
  onUpdate,
  'aria-label': ariaLabel,
}: {
  icon: IconData;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onUpdate: (next: number) => void;
  'aria-label'?: string;
}) {
  const safeMax = Math.max(min, max);
  const clamped = Math.min(safeMax, Math.max(min, value));

  return (
    <div className={styles.root}>
      <Flex alignItems="center" gap={2} className={styles.label}>
        <Icon data={icon} size={16} className={styles.icon} />
        <Text variant="body-1" ellipsis>
          {label}
        </Text>
      </Flex>

      <Slider
        key={`${min}-${safeMax}`}
        size="m"
        min={min}
        max={safeMax}
        step={1}
        marks={0}
        value={clamped}
        tooltipDisplay="off"
        onUpdate={(next) => onUpdate(Math.round(next))}
        aria-label={ariaLabel ?? label}
        className={styles.slider}
        disabled={safeMax <= min}
      />

      <NumberInput
        size="m"
        hiddenControls
        min={min}
        max={safeMax}
        step={1}
        allowDecimal={false}
        value={clamped}
        onUpdate={(next) => {
          if (next == null || !Number.isFinite(next)) return;
          onUpdate(Math.min(safeMax, Math.max(min, Math.round(next))));
        }}
        endContent={<Unit unit={unit} />}
        className={styles.input}
        controlProps={{'aria-label': ariaLabel ?? label}}
      />
    </div>
  );
}
