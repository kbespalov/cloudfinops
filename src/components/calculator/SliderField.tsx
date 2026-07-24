'use client';

import {useState} from 'react';
import {Cpu, Minus, Plus} from '@gravity-ui/icons';
import {Button, Flex, HelpMark, Icon, NumberInput, Slider, Text} from '@gravity-ui/uikit';
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
  hint?: string;
  /** Mobile: show − / + around the value instead of a plain readout. */
  compactStepper?: boolean;
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

function CompactValue({
  value,
  unit,
  stepper,
  canDec,
  canInc,
  onDec,
  onInc,
  ariaLabel,
}: {
  value: number;
  unit?: string;
  stepper?: boolean;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
  ariaLabel: string;
}) {
  const readout = (
    <Text as="span" className={styles.valueText} aria-live="polite">
      {value}
      {unit ? <span className={styles.valueUnit}> {unit}</span> : null}
    </Text>
  );

  if (!stepper) {
    return <div className={styles.valueCluster}>{readout}</div>;
  }

  return (
    <div className={styles.valueCluster} data-stepper="true">
      <Button
        view="flat-secondary"
        size="s"
        pin="circle-circle"
        onClick={onDec}
        disabled={!canDec}
        aria-label={`Уменьшить: ${ariaLabel}`}
        className={styles.stepBtn}
      >
        <Icon data={Minus} size={14} />
      </Button>
      {readout}
      <Button
        view="flat-secondary"
        size="s"
        pin="circle-circle"
        onClick={onInc}
        disabled={!canInc}
        aria-label={`Увеличить: ${ariaLabel}`}
        className={styles.stepBtn}
      >
        <Icon data={Plus} size={14} />
      </Button>
    </div>
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
  hint,
  compactStepper,
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
  const [rangeError, setRangeError] = useState<string | null>(null);
  const idx = nearestIndex(options, value);
  const fieldAria = ariaLabel ?? label;

  function handleSlider(nextPos: number) {
    setRangeError(null);
    onUpdate(fromPos(nextPos, options));
  }

  function handleInput(next: number | null) {
    if (next == null || !Number.isFinite(next)) return;
    const rounded = Math.round(next);
    if (rounded < absMin || rounded > absMax) {
      // Do not silently clamp — keep previous value and surface the range.
      setRangeError(`Допустимо от ${absMin} до ${absMax}`);
      return;
    }
    setRangeError(null);
    if (rounded === value + 1) {
      onUpdate(bump(options, value, 1));
      return;
    }
    if (rounded === value - 1) {
      onUpdate(bump(options, value, -1));
      return;
    }
    // Prefer ladder steps when close; otherwise keep typed value in range.
    const nearest = nearestIn(options, rounded);
    onUpdate(Math.abs(nearest - rounded) <= Math.max(1, rounded * 0.05) ? nearest : rounded);
  }

  return (
    <div className={styles.root} data-stepper={compactStepper ? 'true' : undefined}>
      <div className={styles.head}>
        <Flex alignItems="center" gap={2} className={styles.label}>
          <Icon data={icon} size={16} className={styles.icon} />
          <Text as="span" className={styles.labelText}>
            {label}
          </Text>
          {hint ? (
            <HelpMark aria-label={`Про ${label}`} iconSize="s">
              {hint}
            </HelpMark>
          ) : null}
        </Flex>

        <CompactValue
          value={value}
          unit={unit}
          stepper={compactStepper}
          canDec={idx > 0}
          canInc={idx < options.length - 1}
          onDec={() => onUpdate(bump(options, value, -1))}
          onInc={() => onUpdate(bump(options, value, 1))}
          ariaLabel={fieldAria}
        />
      </div>

      <Slider
        key={`${absMin}-${absMax}`}
        size="s"
        min={posMin}
        max={posMax}
        step={0.01}
        marks={0}
        value={pos}
        tooltipDisplay="off"
        onUpdate={handleSlider}
        onUpdateComplete={handleSlider}
        aria-label={fieldAria}
        className={styles.slider}
      />

      {/* Wrapper owns display:none — Gravity may put className on an inner node. */}
      <div className={styles.inputWrap}>
        <NumberInput
          size="m"
          min={absMin}
          max={absMax}
          step={1}
          allowDecimal={false}
          value={value}
          onUpdate={handleInput}
          endContent={<Unit unit={unit} />}
          className={styles.input}
          validationState={rangeError ? 'invalid' : undefined}
          errorMessage={rangeError ?? undefined}
          errorPlacement="outside"
          controlProps={{'aria-label': fieldAria}}
        />
      </div>
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
  hint,
  compactStepper,
  onUpdate,
  'aria-label': ariaLabel,
}: {
  icon: IconData;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  hint?: string;
  compactStepper?: boolean;
  onUpdate: (next: number) => void;
  'aria-label'?: string;
}) {
  const safeMax = Math.max(min, max);
  const clamped = Math.min(safeMax, Math.max(min, value));
  const fieldAria = ariaLabel ?? label;

  return (
    <div className={styles.root} data-stepper={compactStepper ? 'true' : undefined}>
      <div className={styles.head}>
        <Flex alignItems="center" gap={2} className={styles.label}>
          <Icon data={icon} size={16} className={styles.icon} />
          <Text as="span" className={styles.labelText}>
            {label}
          </Text>
          {hint ? (
            <HelpMark aria-label={`Про ${label}`} iconSize="s">
              {hint}
            </HelpMark>
          ) : null}
        </Flex>

        <CompactValue
          value={clamped}
          unit={unit}
          stepper={compactStepper}
          canDec={clamped > min}
          canInc={clamped < safeMax}
          onDec={() => onUpdate(clamped - 1)}
          onInc={() => onUpdate(clamped + 1)}
          ariaLabel={fieldAria}
        />
      </div>

      <Slider
        key={`${min}-${safeMax}`}
        size="s"
        min={min}
        max={safeMax}
        step={1}
        marks={0}
        value={clamped}
        tooltipDisplay="off"
        onUpdate={(next) => onUpdate(Math.round(next))}
        aria-label={fieldAria}
        className={styles.slider}
        disabled={safeMax <= min}
      />

      <div className={styles.inputWrap}>
        <NumberInput
          size="m"
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
          controlProps={{'aria-label': fieldAria}}
        />
      </div>
    </div>
  );
}
