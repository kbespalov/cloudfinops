/**
 * Soft grader for UX scenarios — score/signals, not CI pass/fail on frozen prices.
 *
 * Optional catalogAnchor recomputes live truth via the same tools as production
 * and records cheapest/hallucination as review signals only.
 */
import {
  containsNumber,
  detectClaimedProviders,
  grade as gradeHard,
  truthFromObjectStorageVolume,
  truthFromQuote,
  truthFromSearch,
  truthFromUnitPrice,
  type ProviderId,
  type Truth,
} from './ground-truth';
import {
  SOFT_SIGNAL_RES,
  type SoftExpect,
  type SoftScenario,
} from './user-scenarios';

export type SoftGradeInput = {
  scenario: SoftScenario;
  answer: string;
  toolNames: string[];
  /** Concatenated tool args (for reviseSignals). */
  toolArgsBlob?: string;
  error?: string;
};

export type SoftGrade = {
  /** 0–1 weighted rubric score (soft; for ranking/review). */
  score: number;
  hits: string[];
  misses: string[];
  warnings: string[];
  signals: {
    toolsOk?: boolean;
    toolsAvoidHit?: boolean;
    priceSignal?: boolean;
    clarify?: boolean;
    refuseOrPartial?: boolean;
    noFullCoverageClaim?: boolean;
    assumptions?: boolean;
    breakdown?: boolean;
    forbiddenExtras?: string[];
    answerIncludesOk?: boolean;
    reviseOk?: boolean;
    catalog?: {
      anchored: boolean;
      cheapestProvider: ProviderId | null;
      cheapestPrice: number | null;
      cheapestProviderOk: boolean | null;
      cheapestPriceOk: boolean | null;
      noHalluc: boolean | null;
      hallucinated: ProviderId[];
    };
  };
  notesForReview: string;
};

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/** True only when the answer asserts full coverage (not a refusal that quotes «100%»). */
function claimsFullCoverage(answer: string): boolean {
  const clauses = answer.split(/(?<=[.!?\n])/);
  for (const clause of clauses) {
    if (!SOFT_SIGNAL_RES.coverage100.test(clause) && !/100\s*%/.test(clause)) continue;
    if (
      /не\s+могу|нельзя|невозмож|запрещ|противореч|не\s+предостав|не\s+показ|не\s+утвержд|откаж|неполн|без\s+полного|не\s+буду\s+утвержд/i.test(
        clause,
      )
    ) {
      continue;
    }
    if (/покрытие\s*100|100\s*%\s*покрыт|полное\s+покрыт|coverage\s*=?\s*1/i.test(clause)) {
      return true;
    }
  }
  return false;
}

function isForbiddenExtraPushed(answer: string, extra: string): boolean {
  const esc = extra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(esc, 'i').test(answer)) return false;
  const neg = new RegExp(
    `(не\\s+(добав|включа|буду)|не\\s+включа|без|исключ|не\\s+просил|включать\\s+не\\s+буду).{0,60}${esc}|${esc}.{0,60}(не\\s+добав|не\\s+включ|включать\\s+не\\s+буду|не\\s+буду)`,
    'i',
  );
  if (neg.test(answer)) return false;
  // Push = offering/adding as part of the BOM, not a bare mention.
  return new RegExp(
    `(добав|включи|плюс|\\+|предлагаю|также).{0,40}${esc}|${esc}.{0,40}(добав|включи|в\\s+расч[её]т)`,
    'i',
  ).test(answer);
}

function includesAllGroups(text: string, needles: string[]): {ok: boolean; missing: string[]} {
  const lower = text.toLowerCase();
  const missing: string[] = [];
  // Treat as OR-groups split by unlikely delimiter — here each entry is independent must-have
  // but for provider lists we allow soft: at least half of listed tokens.
  for (const n of needles) {
    if (!lower.includes(n.toLowerCase())) missing.push(n);
  }
  // Soft: if many tokens, require ≥50%
  if (needles.length >= 4) {
    const hit = needles.length - missing.length;
    return {ok: hit / needles.length >= 0.5, missing};
  }
  return {ok: missing.length === 0, missing};
}

function resolveCatalogTruth(expect: SoftExpect): Truth | null {
  const anchor = expect.catalogAnchor;
  if (!anchor || anchor === 'none') return null;
  const p = expect.anchorParams ?? {};
  try {
    if (anchor === 'unit') {
      const component = (p.component as 'vcpu' | 'ram' | 'ssd') ?? 'vcpu';
      return truthFromUnitPrice(component);
    }
    if (anchor === 'quote') {
      return truthFromQuote(p);
    }
    if (anchor === 'search') {
      if (typeof p.volumeGiB === 'number' && typeof p.storageClass === 'string') {
        return truthFromObjectStorageVolume({
          storageClass: p.storageClass,
          volumeGiB: p.volumeGiB,
          query: typeof p.query === 'string' ? p.query : undefined,
        });
      }
      return truthFromSearch(p, 'month');
    }
  } catch (err) {
    console.warn('[soft-grade] catalogAnchor failed:', err);
  }
  return null;
}

function mark(
  hits: string[],
  misses: string[],
  ok: boolean,
  hitMsg: string,
  missMsg: string,
): void {
  if (ok) hits.push(hitMsg);
  else misses.push(missMsg);
}

export function softGrade(input: SoftGradeInput): SoftGrade {
  const {scenario, answer, toolNames, toolArgsBlob = '', error} = input;
  const expect = scenario.expect ?? {};
  const hits: string[] = [];
  const misses: string[] = [];
  const warnings: string[] = [];
  const signals: SoftGrade['signals'] = {};

  if (error) {
    misses.push(`run error: ${error}`);
    return {
      score: 0,
      hits,
      misses,
      warnings,
      signals,
      notesForReview: scenario.notes ?? 'Run failed — not reviewable.',
    };
  }

  if (!answer.trim()) {
    misses.push('empty answer');
  } else {
    hits.push('non-empty answer');
  }

  // Tools — if the rubric expects clarification and the answer clarifies, missing
  // tools is a warning (correct short ask), not a hard miss.
  // Revise signals first — used to soften toolsAny on follow-ups that correctly narrate the change.
  let reviseOkEarly: boolean | undefined;
  if (expect.reviseSignals?.length) {
    const blob = `${answer}\n${toolArgsBlob}`;
    const sig = expect.reviseSignals.join('|');
    const wantsCdnGone = expect.reviseSignals.some((s) => /cdn/i.test(s));
    const wantsHdd = expect.reviseSignals.some((s) => /hdd/i.test(s));
    const wantsYandexOut = expect.reviseSignals.some((s) => /yandex|яндекс/i.test(s));
    reviseOkEarly = wantsCdnGone
      ? !/\bcdn_egress\b|\bcdn\b/i.test(toolArgsBlob) &&
        (!/\bcdn\b/i.test(answer) || /убрал|исключ|без\s+cdn|не\s+включа/i.test(answer))
      : wantsHdd
        ? includesAny(blob, expect.reviseSignals) ||
          /diskMedia["']?\s*:\s*["']?hdd|"media"\s*:\s*"hdd"|block_storage.*hdd|\bhdd\b/i.test(blob) ||
          /замен\w*\s+ssd\s+на\s+hdd|ssd\s*→\s*hdd|на\s+hdd/i.test(answer)
        : wantsYandexOut
          ? !detectClaimedProviders(answer).has('yandex-cloud') ||
            /исключ\w*.{0,40}(?:yandex|яндекс)|(?:yandex|яндекс).{0,40}исключ/i.test(answer)
          : includesAny(blob, expect.reviseSignals);
  }

  if (expect.toolsAny?.length) {
    const toolsOk = expect.toolsAny.some((t) => toolNames.includes(t));
    signals.toolsOk = toolsOk;
    const clarifyOk =
      expect.mustClarify &&
      (SOFT_SIGNAL_RES.clarify.test(answer) || /\?/.test(answer));
    if (toolsOk) hits.push(`tool fired (${expect.toolsAny.join('|')})`);
    else if (clarifyOk || reviseOkEarly) {
      hits.push(reviseOkEarly ? 'revise narrated (tools soft)' : 'clarify-first (tools deferred)');
      warnings.push(`no expected tool (${expect.toolsAny.join('|')})`);
    } else misses.push(`no expected tool (${expect.toolsAny.join('|')})`);
  }
  if (expect.toolsAvoid?.length) {
    const bad = expect.toolsAvoid.filter((t) => toolNames.includes(t));
    signals.toolsAvoidHit = bad.length > 0;
    if (bad.length) warnings.push(`avoided tool used: ${bad.join(', ')}`);
    else hits.push('no avoided tools');
  }

  // Price signal for price/quote intents
  const wantsPrice =
    scenario.intent.includes('price') ||
    scenario.intent.includes('quote') ||
    scenario.intent.includes('compare') ||
    scenario.intent.includes('budget') ||
    expect.catalogAnchor != null;
  if (wantsPrice && !expect.mustClarify) {
    const priceSignal = SOFT_SIGNAL_RES.price.test(answer) || /\d[\d\s.,]{2,}/.test(answer);
    signals.priceSignal = priceSignal;
    if (priceSignal) hits.push('price-like signal');
    else if (!expect.mustRefuseOrPartial) warnings.push('weak/no price signal');
  }

  if (expect.mustClarify) {
    const clarify =
      SOFT_SIGNAL_RES.clarify.test(answer) ||
      /\?/.test(answer) ||
      /компромисс|trade-?off|с\s+одной\s+сторон|если\s+важн|зависит\s+от/i.test(answer) ||
      // Preview with explicit defaults counts as resolving ambiguity without a quiz.
      (SOFT_SIGNAL_RES.assume.test(answer) &&
        (expect.mustExposeAssumptions || /принято\s+по\s+умолчанию|предварительн/i.test(answer)));
    signals.clarify = clarify;
    mark(hits, misses, clarify, 'clarifies / asks', 'expected clarification missing');
  }

  if (expect.mustRefuseOrPartial) {
    const refuse = SOFT_SIGNAL_RES.partial.test(answer);
    signals.refuseOrPartial = refuse;
    mark(hits, misses, refuse, 'refuse/partial/caveat', 'expected refuse/partial language missing');
  }

  if (expect.mustNotClaimFullCoverage) {
    const claims100 = claimsFullCoverage(answer);
    signals.noFullCoverageClaim = !claims100;
    mark(
      hits,
      misses,
      !claims100,
      'did not claim 100% coverage',
      'incorrectly claims 100% coverage',
    );
  }

  if (expect.mustExposeAssumptions) {
    const assumptions = SOFT_SIGNAL_RES.assume.test(answer);
    signals.assumptions = assumptions;
    if (assumptions) hits.push('exposes assumptions');
    else warnings.push('assumptions not explicit');
  }

  if (expect.mustShowBreakdown) {
    const breakdown = SOFT_SIGNAL_RES.breakdown.test(answer) || /\|/.test(answer);
    signals.breakdown = breakdown;
    if (breakdown) hits.push('breakdown/table');
    else warnings.push('no clear cost breakdown');
  }

  if (expect.forbiddenExtras?.length) {
    const pushed = expect.forbiddenExtras.filter((x) => isForbiddenExtraPushed(answer, x));
    signals.forbiddenExtras = pushed;
    if (pushed.length) misses.push(`forbidden extras pushed: ${pushed.join(', ')}`);
    else hits.push('no forbidden extras');
  }

  if (expect.answerIncludes?.length) {
    const {ok, missing} = includesAllGroups(answer, expect.answerIncludes);
    signals.answerIncludesOk = ok;
    if (ok) hits.push('answerIncludes ok');
    else warnings.push(`answerIncludes missing: ${missing.slice(0, 6).join(', ')}`);
  }

  if (expect.reviseSignals?.length) {
    const reviseOk = Boolean(reviseOkEarly);
    signals.reviseOk = reviseOk;
    mark(
      hits,
      misses,
      reviseOk,
      'revise signal present',
      `revise signal missing (${expect.reviseSignals.join('|')})`,
    );
  }

  // Live catalog anchor (signal only)
  if (expect.catalogAnchor && expect.catalogAnchor !== 'none') {
    const truth = resolveCatalogTruth(expect);
    if (truth) {
      const hard = gradeHard(answer, truth);
      const claimed = detectClaimedProviders(answer);
      signals.catalog = {
        anchored: true,
        cheapestProvider: truth.cheapestProvider,
        cheapestPrice: truth.cheapestPrice,
        cheapestProviderOk: truth.cheapestProvider ? hard.cheapestProviderOk : null,
        cheapestPriceOk: truth.cheapestPrice != null ? containsNumber(answer, truth.cheapestPrice) : null,
        noHalluc: hard.noHalluc,
        hallucinated: hard.hallucinated,
      };
      if (truth.allowed.size === 0) {
        // Empty catalog hit: refuse/partial is success; naming providers only OK with disclaimer.
        if (SOFT_SIGNAL_RES.partial.test(answer)) {
          hits.push('catalog: empty + refuse/partial');
        } else if (hard.hallucinated.length) {
          warnings.push(`catalog empty but providers named: ${hard.hallucinated.join(', ')}`);
        } else {
          hits.push('catalog: empty, no false claims');
        }
      } else if (hard.noHalluc) {
        hits.push('catalog: no hallucinated providers');
      } else {
        misses.push(`catalog: hallucinated ${hard.hallucinated.join(', ')}`);
      }
      if (truth.cheapestProvider) {
        if (hard.cheapestProviderOk) hits.push(`catalog: mentions cheapest (${truth.cheapestProvider})`);
        else warnings.push(`catalog: cheapest ${truth.cheapestProvider} not mentioned`);
      }
      if (claimed.size === 0 && truth.allowed.size > 0) {
        warnings.push('catalog: no provider names detected in answer');
      }
    } else {
      signals.catalog = {
        anchored: false,
        cheapestProvider: null,
        cheapestPrice: null,
        cheapestProviderOk: null,
        cheapestPriceOk: null,
        noHalluc: null,
        hallucinated: [],
      };
      warnings.push('catalogAnchor could not resolve live truth');
    }
  }

  // Score: hits weighted vs misses; warnings lightly penalize
  const hitW = hits.length;
  const missW = misses.length * 1.5;
  // Warnings are soft review signals — keep them lighter than misses so a solid
  // answer with 1–2 nits still lands near «4/5» (0.8+).
  const warnW = warnings.length * 0.2;
  const raw = hitW + missW + warnW;
  const score = raw === 0 ? 0 : Math.max(0, Math.min(1, hitW / raw));

  const notesForReview = [
    scenario.notes,
    misses.length ? `misses: ${misses.join('; ')}` : null,
    warnings.length ? `warnings: ${warnings.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {score, hits, misses, warnings, signals, notesForReview};
}

/** Compare soft signals between two graded rows (cross-validation). */
export function compareSoftGrades(
  a: SoftGrade,
  b: SoftGrade,
): {scoreDelta: number; signalAgreement: number; disagreements: string[]} {
  const keys = [
    'toolsOk',
    'clarify',
    'refuseOrPartial',
    'noFullCoverageClaim',
    'assumptions',
    'breakdown',
    'answerIncludesOk',
    'reviseOk',
  ] as const;
  let agree = 0;
  let total = 0;
  const disagreements: string[] = [];
  for (const k of keys) {
    const av = a.signals[k];
    const bv = b.signals[k];
    if (av === undefined && bv === undefined) continue;
    total++;
    if (av === bv) agree++;
    else disagreements.push(`${k}: ${String(av)} vs ${String(bv)}`);
  }
  const ca = a.signals.catalog?.cheapestProviderOk;
  const cb = b.signals.catalog?.cheapestProviderOk;
  if (ca !== undefined || cb !== undefined) {
    total++;
    if (ca === cb) agree++;
    else disagreements.push(`catalog.cheapestProviderOk: ${String(ca)} vs ${String(cb)}`);
  }
  return {
    scoreDelta: Math.abs(a.score - b.score),
    signalAgreement: total ? agree / total : 1,
    disagreements,
  };
}
