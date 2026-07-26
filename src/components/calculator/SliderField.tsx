'use client';

import {useEffect, useState} from 'react';
import {Cpu, Minus, Plus} from '@gravity-ui/icons';
import {Button, Flex, HelpMark, Icon, NumberInput, Slider, Text} from '@gravity-ui/uikit';
import {bump, nearestIn, nearestIndex, resolveSliderInput} from './sliderFieldModel';
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
  /**
   * form — wider left-column grid (label ~192px, track grows, input ~152px).
   * Used by Lakehouse; default keeps VM/inference density.
   */
  align?: 'default' | 'form';
  onUpdate: (next: number) => void;
  'aria-label'?: string;
};

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
  align = 'default',
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
  /** Local draft so clearing/retyping (e.g. 8 → 128) is not blocked by min/max. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const idx = nearestIndex(options, value);
  const fieldAria = ariaLabel ?? label;
  const inputValue = editing ? draft : value;
  const displayed =
    editing && draft != null && Number.isFinite(draft) ? Math.round(draft) : value;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function handleSlider(nextPos: number) {
    setRangeError(null);
    setEditing(false);
    onUpdate(fromPos(nextPos, options));
  }

  function handleInput(next: number | null) {
    if (next == null || !Number.isFinite(next)) {
      // Empty / partial clear while typing — keep parent value until blur/commit.
      setEditing(true);
      setDraft(next);
      setRangeError(null);
      return;
    }
    const resolved = resolveSliderInput({
      raw: next,
      committed: value,
      displayed,
      options,
      absMin,
      absMax,
    });
    if (!resolved.ok) {
      setEditing(true);
      setDraft(next);
      setRangeError(`Допустимо от ${absMin} до ${absMax}`);
      return;
    }
    setRangeError(null);
    if (resolved.settle) {
      // Spinbuttons: show the ladder step immediately (avoid draft=9 while value=12).
      setEditing(false);
      setDraft(resolved.next);
      onUpdate(resolved.next);
      return;
    }
    setEditing(true);
    setDraft(next);
    onUpdate(resolved.next);
  }

  function handleBlur() {
    if (!editing) return;
    if (draft == null || !Number.isFinite(draft)) {
      setDraft(value);
      setRangeError(null);
      setEditing(false);
      return;
    }
    const rounded = Math.round(draft);
    if (rounded < absMin || rounded > absMax) {
      setDraft(value);
      setRangeError(`Допустимо от ${absMin} до ${absMax}`);
      setEditing(false);
      return;
    }
    // Spinbutton already committed the ladder step; draft may still be the ±1 echo.
    if (Math.abs(rounded - value) === 1) {
      setDraft(value);
      setRangeError(null);
      setEditing(false);
      return;
    }
    const resolved = resolveSliderInput({
      raw: rounded,
      committed: value,
      displayed: value,
      options,
      absMin,
      absMax,
    });
    if (!resolved.ok) {
      setDraft(value);
      setRangeError(`Допустимо от ${absMin} до ${absMax}`);
    } else {
      setRangeError(null);
      setDraft(resolved.next);
      onUpdate(resolved.next);
    }
    setEditing(false);
  }

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.root}${align === 'form' ? ` ${styles.rootForm}` : ''}`}
        data-stepper={compactStepper ? 'true' : undefined}
        data-align={align}
      >
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
          size="m"
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
            size="l"
            // No min/max here: Gravity clamps on blur and blocks retyping (8 → 128).
            // Range is enforced in handleInput / handleBlur instead.
            step={1}
            allowDecimal={false}
            value={inputValue}
            onUpdate={handleInput}
            onBlur={handleBlur}
            endContent={<Unit unit={unit} />}
            className={styles.input}
            validationState={rangeError ? 'invalid' : undefined}
            errorMessage={rangeError ?? undefined}
            errorPlacement="outside"
            controlProps={{
              'aria-label': fieldAria,
              'aria-valuemin': absMin,
              'aria-valuemax': absMax,
            }}
          />
        </div>
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(clamped);
  const inputValue = editing ? draft : clamped;

  useEffect(() => {
    if (!editing) setDraft(clamped);
  }, [clamped, editing]);

  return (
    <div className={styles.shell}>
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
          size="m"
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
            size="l"
            step={1}
            allowDecimal={false}
            value={inputValue}
            onUpdate={(next) => {
              if (next == null || !Number.isFinite(next)) {
                setEditing(true);
                setDraft(next);
                return;
              }
              const rounded = Math.round(next);
              if (rounded < min || rounded > safeMax) {
                setEditing(true);
                setDraft(next);
                return;
              }
              // Settle immediately so ± arrows never leave a stale draft.
              setEditing(false);
              setDraft(rounded);
              onUpdate(rounded);
            }}
            onBlur={() => {
              if (!editing) return;
              if (draft == null || !Number.isFinite(draft)) {
                setDraft(clamped);
              } else {
                const next = Math.min(safeMax, Math.max(min, Math.round(draft)));
                setDraft(next);
                onUpdate(next);
              }
              setEditing(false);
            }}
            endContent={<Unit unit={unit} />}
            className={styles.input}
            controlProps={{
              'aria-label': fieldAria,
              'aria-valuemin': min,
              'aria-valuemax': safeMax,
            }}
          />
        </div>
      </div>
    </div>
  );
}
