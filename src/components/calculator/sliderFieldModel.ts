/** Pure ladder helpers for SliderField — kept separate for unit tests. */

export function nearestIn(options: number[], value: number): number {
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

export function nearestIndex(options: number[], value: number): number {
  const nearest = nearestIn(options, value);
  return Math.max(0, options.indexOf(nearest));
}

export function bump(options: number[], value: number, delta: number): number {
  const idx = nearestIndex(options, value);
  const next = Math.min(options.length - 1, Math.max(0, idx + delta));
  return options[next] ?? value;
}

export type SliderCommit =
  | {ok: false}
  | {
      ok: true;
      /** Value to push to parent state. */
      next: number;
      /**
       * true — NumberInput spinbuttons (±1): leave edit mode and show `next`.
       * false — free typing: keep draft so multi-digit entry still works.
       */
      settle: boolean;
    };

/**
 * Resolve a NumberInput onUpdate payload against the discrete ladder.
 * `displayed` is what the field currently shows (draft while editing, else committed).
 * Spinbuttons must step from the committed ladder position, not from a stale draft.
 */
export function resolveSliderInput(args: {
  raw: number;
  committed: number;
  displayed: number;
  options: number[];
  absMin: number;
  absMax: number;
}): SliderCommit {
  const rounded = Math.round(args.raw);
  if (rounded < args.absMin || rounded > args.absMax) return {ok: false};

  if (rounded === args.displayed + 1) {
    return {ok: true, next: bump(args.options, args.committed, 1), settle: true};
  }
  if (rounded === args.displayed - 1) {
    return {ok: true, next: bump(args.options, args.committed, -1), settle: true};
  }

  const nearest = nearestIn(args.options, rounded);
  const next =
    Math.abs(nearest - rounded) <= Math.max(1, rounded * 0.05) ? nearest : rounded;
  return {ok: true, next, settle: false};
}
