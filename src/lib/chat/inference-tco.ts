/**
 * Hosted API vs self-host GPU TCO with break-even on token volume.
 * Reuses recommend_inference_infra + catalog AI token rates — no invented prices.
 */

import {recommendInferenceInfra} from './inference-recommend';
import {blendTokenPricePerMillion} from './search';
import type {InferenceDtype} from '@/data/inference-models';

export type InferenceTcoArgs = {
  model: string;
  /** Total mixed tokens per day (input+output). Default 1_000_000. */
  tokensPerDay?: number;
  /** Share of input tokens 0–1. Default 0.7. */
  inputShare?: number;
  /** Share of output tokens 0–1. Default 0.3. */
  outputShare?: number;
  /** Billing days in a month. Default 30. */
  daysPerMonth?: number;
  quant?: InferenceDtype | 'auto';
};

export type InferenceTcoHostedRow = {
  provider: string;
  inputPerMillionRub: number | null;
  outputPerMillionRub: number | null;
  blendPerMillionRub: number | null;
  monthlyRub: number | null;
  vsSelfHostDeltaRub: number | null;
  cheaperThanSelfHost: boolean | null;
};

export type InferenceTcoResult = {
  ok: boolean;
  model: string;
  assumptions: {
    tokensPerDay: number;
    inputShare: number;
    outputShare: number;
    daysPerMonth: number;
    tokensPerMonth: number;
    mixLabel: string;
  };
  selfHost: {
    available: boolean;
    best: {
      provider: string;
      monthlyRub: number;
      gpuFamily: string;
      gpuCount: number;
      quant: string;
      why: string;
    } | null;
    configsSampled: number;
    note: string;
  };
  hosted: {
    available: boolean;
    rows: InferenceTcoHostedRow[];
    best: InferenceTcoHostedRow | null;
    note: string;
  };
  breakEven: {
    /** Daily mixed tokens where cheapest hosted API ≈ cheapest self-host GPU. */
    tokensPerDay: number | null;
    tokensPerMonth: number | null;
    basis: string;
  };
  sensitivity: Array<{
    label: string;
    tokensPerDay: number;
    hostedMonthlyRub: number | null;
    selfHostMonthlyRub: number | null;
    winner: 'hosted' | 'self-host' | 'tie' | 'unknown';
  }>;
  recommendation: string;
  currency: 'RUB';
  vatIncluded: true;
  note: string;
  error?: string;
};

function round2(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function clampShare(n: number | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function winnerOf(
  hosted: number | null,
  selfHost: number | null,
): 'hosted' | 'self-host' | 'tie' | 'unknown' {
  if (hosted == null || selfHost == null) return 'unknown';
  const d = hosted - selfHost;
  if (Math.abs(d) < 1) return 'tie';
  return d < 0 ? 'hosted' : 'self-host';
}

export function compareInferenceTco(args: InferenceTcoArgs): InferenceTcoResult {
  const model = args.model?.trim();
  if (!model) {
    return {
      ok: false,
      model: '',
      assumptions: {
        tokensPerDay: 0,
        inputShare: 0.7,
        outputShare: 0.3,
        daysPerMonth: 30,
        tokensPerMonth: 0,
        mixLabel: '70/30',
      },
      selfHost: {available: false, best: null, configsSampled: 0, note: ''},
      hosted: {available: false, rows: [], best: null, note: ''},
      breakEven: {tokensPerDay: null, tokensPerMonth: null, basis: ''},
      sensitivity: [],
      recommendation: '',
      currency: 'RUB',
      vatIncluded: true,
      note: '',
      error: 'Укажи model (например gpt-oss-120b или GLM 5.2).',
    };
  }

  const inputShare = clampShare(args.inputShare, 0.7);
  const outputShare = clampShare(args.outputShare, 0.3);
  const shareSum = inputShare + outputShare;
  const normIn = shareSum > 0 ? inputShare / shareSum : 0.7;
  const normOut = shareSum > 0 ? outputShare / shareSum : 0.3;
  const tokensPerDay =
    args.tokensPerDay && args.tokensPerDay > 0 ? Math.round(args.tokensPerDay) : 1_000_000;
  const daysPerMonth =
    args.daysPerMonth && args.daysPerMonth > 0 && args.daysPerMonth <= 31
      ? args.daysPerMonth
      : 30;
  const tokensPerMonth = tokensPerDay * daysPerMonth;
  const mixLabel = `${Math.round(normIn * 100)}/${Math.round(normOut * 100)}`;
  const shares = {inputShare: normIn, outputShare: normOut};

  const infra = recommendInferenceInfra({
    model,
    quant: args.quant ?? 'auto',
    maxConfigs: 4,
  });

  const pricedConfigs = (infra.configs ?? []).filter(
    (c) => c.best?.totalMonth != null && c.best.totalMonth > 0,
  );
  const bestConfig = [...pricedConfigs].sort(
    (a, b) => (a.best!.totalMonth ?? Infinity) - (b.best!.totalMonth ?? Infinity),
  )[0];
  const selfHostMonth = bestConfig?.best?.totalMonth ?? null;

  const hostedRows: InferenceTcoHostedRow[] = [];
  const matched = infra.hostedAlternative?.providersMatched ?? [];
  for (const p of matched) {
    const input = p.inputMonth ?? null;
    const output = p.outputMonth ?? null;
    const blend =
      input != null && output != null
        ? round2(blendTokenPricePerMillion(input, output, shares))
        : input != null
          ? round2(input)
          : output != null
            ? round2(output)
            : null;
    const monthly =
      blend != null ? round2((tokensPerMonth / 1_000_000) * blend) : null;
    const delta =
      monthly != null && selfHostMonth != null ? round2(monthly - selfHostMonth) : null;
    hostedRows.push({
      provider: p.provider,
      inputPerMillionRub: round2(input),
      outputPerMillionRub: round2(output),
      blendPerMillionRub: blend,
      monthlyRub: monthly,
      vsSelfHostDeltaRub: delta,
      cheaperThanSelfHost:
        monthly != null && selfHostMonth != null ? monthly < selfHostMonth : null,
    });
  }
  hostedRows.sort(
    (a, b) => (a.monthlyRub ?? Infinity) - (b.monthlyRub ?? Infinity),
  );
  const bestHosted = hostedRows.find((r) => r.monthlyRub != null) ?? null;

  let breakEvenTokensPerDay: number | null = null;
  let breakEvenTokensPerMonth: number | null = null;
  let breakEvenBasis = '';
  if (
    selfHostMonth != null &&
    bestHosted?.blendPerMillionRub != null &&
    bestHosted.blendPerMillionRub > 0
  ) {
    breakEvenTokensPerDay = Math.round(
      (selfHostMonth * 1_000_000) / (daysPerMonth * bestHosted.blendPerMillionRub),
    );
    breakEvenTokensPerMonth = breakEvenTokensPerDay * daysPerMonth;
    breakEvenBasis = `self-host ${bestConfig!.best!.provider} ${bestConfig!.gpuCount}×${bestConfig!.gpuFamily} (${selfHostMonth} ₽/мес) vs hosted ${bestHosted.provider} @ ${bestHosted.blendPerMillionRub} ₽/1M (${mixLabel})`;
  }

  const sensitivityFactors = [
    {label: '−30% нагрузка', factor: 0.7},
    {label: 'базовая нагрузка', factor: 1},
    {label: '+30% нагрузка', factor: 1.3},
  ];
  const sensitivity = sensitivityFactors.map(({label, factor}) => {
    const tpd = Math.round(tokensPerDay * factor);
    const tpm = tpd * daysPerMonth;
    const hostedMonthly =
      bestHosted?.blendPerMillionRub != null
        ? round2((tpm / 1_000_000) * bestHosted.blendPerMillionRub)
        : null;
    return {
      label,
      tokensPerDay: tpd,
      hostedMonthlyRub: hostedMonthly,
      selfHostMonthlyRub: round2(selfHostMonth),
      winner: winnerOf(hostedMonthly, selfHostMonth),
    };
  });

  const w = winnerOf(bestHosted?.monthlyRub ?? null, selfHostMonth);
  let recommendation = '';
  if (!infra.ok && !bestHosted) {
    recommendation =
      infra.disclaimer ||
      'Модель не найдена в профиле self-host и нет hosted API в каталоге — уточни имя модели.';
  } else if (w === 'hosted') {
    recommendation = `При ${tokensPerDay.toLocaleString('ru-RU')} tok/день (${mixLabel}) дешевле Hosted API (${bestHosted!.provider}). Self-host выгоднее примерно с ${breakEvenTokensPerDay?.toLocaleString('ru-RU') ?? '—'} tok/день.`;
  } else if (w === 'self-host') {
    recommendation = `При ${tokensPerDay.toLocaleString('ru-RU')} tok/день (${mixLabel}) дешевле self-host GPU (${bestConfig!.best!.provider}, ${bestConfig!.gpuCount}×${bestConfig!.gpuFamily}). Hosted API выгоднее ниже ~${breakEvenTokensPerDay?.toLocaleString('ru-RU') ?? '—'} tok/день.`;
  } else if (w === 'tie') {
    recommendation = 'Hosted API и self-host почти равны на этой нагрузке — смотри operational trade-offs (ops, latency, vendor lock).';
  } else if (bestHosted && !selfHostMonth) {
    recommendation = 'Есть Hosted API; self-host конфиг не удалось оценить из каталога GPU.';
  } else if (selfHostMonth && !bestHosted) {
    recommendation = 'Есть оценка self-host GPU; Hosted API для модели в каталоге не найден — не утверждай тариф токенов.';
  } else {
    recommendation = 'Недостаточно данных для выбора — проверь model / наличие в каталоге.';
  }

  return {
    ok: Boolean(bestHosted || selfHostMonth),
    model: infra.model?.displayName || model,
    assumptions: {
      tokensPerDay,
      inputShare: normIn,
      outputShare: normOut,
      daysPerMonth,
      tokensPerMonth,
      mixLabel,
    },
    selfHost: {
      available: selfHostMonth != null,
      best: bestConfig?.best
        ? {
            provider: bestConfig.best.provider,
            monthlyRub: round2(bestConfig.best.totalMonth)!,
            gpuFamily: bestConfig.gpuFamily,
            gpuCount: bestConfig.gpuCount,
            quant: bestConfig.quant,
            why: bestConfig.why,
          }
        : null,
      configsSampled: pricedConfigs.length,
      note: 'Self-host = аренда GPU-хоста 24/7 (месяц=720ч). Duty-cycle/batch не учтены — пометь assumption, если нагрузка не круглосуточная.',
    },
    hosted: {
      available: bestHosted != null,
      rows: hostedRows.slice(0, 8),
      best: bestHosted,
      note: 'Hosted = ₽/1M × объём; input/output смешаны по shares. Не сравнивай сырой ₽/1M с ₽/мес GPU без перевода в месячный объём.',
    },
    breakEven: {
      tokensPerDay: breakEvenTokensPerDay,
      tokensPerMonth: breakEvenTokensPerMonth,
      basis: breakEvenBasis,
    },
    sensitivity,
    recommendation,
    currency: 'RUB',
    vatIncluded: true,
    note: 'Цены только из каталога (recommend_inference_infra + AI token meters). НДС вкл. Явно пиши assumptions (mix, tok/день, 24/7 GPU).',
  };
}
