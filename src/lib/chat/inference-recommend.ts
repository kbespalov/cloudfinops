/**
 * Deterministic model → GPU config → RU cloud prices.
 * Invoked only via gated tool / fast-path — never loaded into every chat turn.
 */

import {quotePreset, listGpuPresets} from '@/lib/calculator/quote';
import type {GpuPreset} from '@/lib/calculator/presets';
import {
  buildVramBreakdown,
  canonicalRecipeTotalGiB,
} from '@/lib/calculator/vram-breakdown';
import {searchPricesDetailed} from './search';
import {
  findInferenceModel,
  type InferenceDtype,
  type InferenceGpuRec,
  type InferenceModelProfile,
} from '@/data/inference-models';
import type {
  InferenceConfigRow,
  InferenceRecommendResult,
} from './inference-recommend-view';

export type {
  InferenceConfigQuote,
  InferenceConfigRow,
  InferenceRecommendResult,
} from './inference-recommend-view';
export {defaultPricedConfigIndex} from './inference-recommend-view';

export type InferenceRecommendArgs = {
  model: string;
  quant?: InferenceDtype | 'auto';
  maxConfigs?: number;
};

function round(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function pickRecs(
  profile: InferenceModelProfile,
  quant: InferenceDtype | 'auto' | undefined,
): InferenceGpuRec[] {
  const wanted = quant && quant !== 'auto' ? quant : null;
  const filtered = wanted
    ? profile.recommended.filter((r) => r.quant === wanted)
    : profile.recommended;
  return (filtered.length ? filtered : profile.recommended).slice();
}

type AssumedGpuHost = {
  vcpu: number;
  ramGiB: number;
  diskGiB: number;
  source: string;
  interconnect?: string;
  dedicated: boolean;
  unitOnly: boolean;
  gpuMemoryGb?: number | null;
};

/**
 * Exact family token match only.
 * Substring checks are unsafe: «L40S».includes(«L4») and «A100».includes(«A10»).
 */
function presetMatchesGpuFamily(presetMatch: string, family: string): boolean {
  return presetMatch.trim().toLowerCase() === family.trim().toLowerCase();
}

function defaultGpuHost(
  gpuFamily: string,
  gpuCount: number,
  interconnect?: string,
): AssumedGpuHost | null {
  const candidates = listGpuPresets().filter(
    (p) => p.gpuCount === gpuCount && presetMatchesGpuFamily(p.gpuModelMatch, gpuFamily),
  );
  if (!candidates.length) return null;

  const wantLink = (interconnect || '').toLowerCase();
  const family = gpuFamily.toUpperCase();
  const ranked = candidates.slice().sort((a, b) => {
    const aLink = `${a.gpuInterconnect || ''} ${a.title}`.toLowerCase();
    const bLink = `${b.gpuInterconnect || ''} ${b.title}`.toLowerCase();
    const aMatch = wantLink && aLink.includes(wantLink) ? 0 : 1;
    const bMatch = wantLink && bLink.includes(wantLink) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    // Prefer dedicated / flavor hosts over bare GPU-unit rows.
    const aKind = a.dedicated ? 0 : a.vcpu != null && a.ramGiB != null ? 1 : 2;
    const bKind = b.dedicated ? 0 : b.vcpu != null && b.ramGiB != null ? 1 : 2;
    if (aKind !== bKind) return aKind - bKind;
    // H100 shelf default is 80GB PCIe — Cloud.ru also has a sole-offer 94GB tier.
    if (family === 'H100') {
      const a80 = a.gpuMemoryGb === 80 ? 0 : 1;
      const b80 = b.gpuMemoryGb === 80 ? 0 : 1;
      if (a80 !== b80) return a80 - b80;
    }
    const aRu = a.shapeSource === 'cloud-ru' ? 0 : 1;
    const bRu = b.shapeSource === 'cloud-ru' ? 0 : 1;
    if (aRu !== bRu) return aRu - bRu;
    return (a.vcpu ?? 0) - (b.vcpu ?? 0);
  });
  const chosen = ranked[0]!;
  if (chosen.dedicated) {
    return {
      vcpu: 0,
      ramGiB: 0,
      diskGiB: 0,
      source: chosen.shapeSource ?? 'catalog',
      interconnect: chosen.gpuInterconnect || interconnect,
      dedicated: true,
      unitOnly: false,
      gpuMemoryGb: chosen.gpuMemoryGb ?? null,
    };
  }
  if (chosen.vcpu == null || chosen.ramGiB == null) {
    // Unit GPU (e.g. Selectel RTX 6000 Pro) — quote GPU-only; host billed separately.
    return {
      vcpu: 0,
      ramGiB: 0,
      diskGiB: 0,
      source: chosen.shapeSource ?? 'catalog',
      interconnect: chosen.gpuInterconnect || interconnect,
      dedicated: false,
      unitOnly: true,
      gpuMemoryGb: chosen.gpuMemoryGb ?? null,
    };
  }
  return {
    vcpu: chosen.vcpu,
    ramGiB: chosen.ramGiB,
    diskGiB: chosen.diskGiB ?? 100,
    source: chosen.shapeSource ?? 'catalog',
    interconnect: chosen.gpuInterconnect || interconnect,
    dedicated: false,
    unitOnly: false,
    gpuMemoryGb: chosen.gpuMemoryGb ?? null,
  };
}

function buildConfigWhy(
  profile: InferenceModelProfile,
  rec: InferenceGpuRec,
  bestProvider: string | null,
  isPrimary: boolean,
): string {
  const weight = profile.weights.find((w) => w.dtype === rec.quant);
  const weightBit =
    weight != null
      ? `веса ~${weight.weightsVramGiB} GiB в ${rec.quant.toUpperCase()}`
      : `квант ${rec.quant.toUpperCase()}`;
  const sizeBit =
    profile.parameterCountB == null
      ? profile.parameterCountNote ?? 'размер параметров не раскрыт'
      : profile.activeParameterCountB != null
        ? `${profile.parameterCountB}B MoE (~${profile.activeParameterCountB}B active)`
        : `${profile.parameterCountB}B`;
  const cards =
    rec.gpuCount === 1
      ? `одной ${rec.gpuFamily} хватает под ${weightBit}`
      : `${rec.gpuCount}×${rec.gpuFamily}: суммарно ~${rec.estimatedVramGiB} GiB под ${weightBit}`;
  const role = isPrimary
    ? profile.deployment === 'weights-pending'
      ? 'Ориентир узла (веса ещё не вышли / cluster-scale)'
      : 'Стартовый минимум из базы'
    : 'Альтернатива (дороже/запас по VRAM или другой quant)';
  const priceBit = bestProvider
    ? `среди паритетных узлов в каталоге сейчас дешевле у ${bestProvider}`
    : 'в каталоге нет полной паритетной цены на этот shape';
  const noteBit = rec.notes ? ` ${rec.notes}` : '';
  return `${role}: ${sizeBit} → ${cards}; ${priceBit}.${noteBit}`.trim();
}

function quoteConfig(
  profile: InferenceModelProfile,
  rec: InferenceGpuRec,
  isPrimary: boolean,
): InferenceConfigRow {
  const host = defaultGpuHost(rec.gpuFamily, rec.gpuCount, rec.interconnect);
  const dedicated = Boolean(host?.dedicated);
  const unitOnly = Boolean(host?.unitOnly);
  const hostless = dedicated || unitOnly;
  const preset: GpuPreset = {
    id: `inference-${rec.gpuFamily}-${rec.gpuCount}-${rec.quant}`,
    kind: 'gpu',
    title: `${rec.gpuFamily} ×${rec.gpuCount}`,
    subtitle: 'Inference recommender',
    gpuModelMatch: rec.gpuFamily,
    gpuCount: rec.gpuCount,
    vcpu: hostless ? undefined : host?.vcpu,
    ramGiB: hostless ? undefined : host?.ramGiB,
    diskGiB: hostless ? undefined : (host?.diskGiB ?? 100),
    gpuInterconnect: rec.interconnect ?? host?.interconnect ?? null,
    dedicated: dedicated || undefined,
    gpuMemoryGb: host?.gpuMemoryGb ?? null,
  };

  const result = quotePreset(preset, 'month');
  const quotes = [...result.quotes, ...result.alternateQuotes]
    .map((q) => ({
      provider: q.providerName,
      totalMonth: round(q.total),
      scope: q.scope,
      note: q.note,
    }))
    .filter((q) => q.totalMonth != null)
    .sort((a, b) => (a.totalMonth as number) - (b.totalMonth as number));

  const best = quotes[0]
    ? {provider: quotes[0].provider, totalMonth: quotes[0].totalMonth}
    : null;

  const weight =
    profile.weights.find((w) => w.dtype === rec.quant) ?? profile.weights[0];
  const recipeEstimates = profile.recommended
    .filter((r) => r.quant === rec.quant)
    .map((r) => r.estimatedVramGiB);
  const vramBreakdown = weight
    ? buildVramBreakdown({
        weightsGiB: weight.weightsVramGiB,
        recipeTotalGiB: canonicalRecipeTotalGiB(weight.weightsVramGiB, recipeEstimates.length
          ? recipeEstimates
          : [rec.estimatedVramGiB]),
        contextDefault: profile.contextDefault,
        contextTokens: profile.contextDefault,
        batchSize: 1,
        concurrentUsers: 1,
        quant: rec.quant,
        gpuCount: rec.gpuCount,
        gpuFamily: rec.gpuFamily,
        gpuMemoryGb: host?.gpuMemoryGb ?? null,
      })
    : undefined;

  return {
    gpuFamily: rec.gpuFamily,
    gpuCount: rec.gpuCount,
    quant: rec.quant,
    interconnect: rec.interconnect,
    estimatedVramGiB: rec.estimatedVramGiB,
    vramBreakdown,
    notes: rec.notes,
    why: buildConfigWhy(profile, rec, best?.provider ?? null, isPrimary),
    assumedHost: !host
      ? null
      : dedicated
        ? `Dedicated GPU-узел (форма: ${host.source})`
        : unitOnly
          ? `GPU-only тариф (vCPU/RAM отдельно; источник формы: ${host.source})`
          : `${host.vcpu} vCPU + ${host.ramGiB} GiB RAM + ${host.diskGiB} GiB диск (форма: ${host.source})`,
    host: !host
      ? null
      : {
          vcpu: host.vcpu,
          ramGiB: host.ramGiB,
          diskGiB: host.diskGiB,
          unitOnly,
          dedicated,
          gpuMemoryGb: host.gpuMemoryGb ?? null,
        },
    best,
    quotes: quotes.slice(0, 8),
  };
}

function tokenDirectionFromLabel(label: string): 'input' | 'output' | null {
  if (/\binput\b|вход/i.test(label)) return 'input';
  if (/\boutput\b|выход/i.test(label)) return 'output';
  return null;
}

/** Family-only needles match sibling SKUs (Qwen→Coder-Next, DeepSeek→V4 Flash). */
function isBroadHostedKey(key: string): boolean {
  return /^(qwen|glm|deepseek|llama|mistral|gemma|kimi|phi|mixtral|gpt-oss|devstral)$/i.test(
    key.trim(),
  );
}

function hostedAlternative(profile: InferenceModelProfile) {
  const keys = [
    ...(profile.hostedCatalogKeys ?? []),
    profile.displayName,
    profile.id,
  ].filter((k): k is string => Boolean(k) && !isBroadHostedKey(k));
  let best:
    | ReturnType<typeof searchPricesDetailed>
    | undefined;
  let usedKey = keys[0] ?? profile.displayName;
  for (const key of keys) {
    const hit = searchPricesDetailed({
      query: key,
      category: 'ai',
      aiModel: key,
      limit: 24,
    });
    if (!hit.totalMatches || !hit.providers.length) continue;
    best = hit;
    usedKey = key;
    break;
  }
  if (!best) return undefined;

  const providersMatched = best.providers.map((p) => {
    const rows = best!.rows.filter((r) => r.providerName === p.providerName);
    let inputMonth: number | null = null;
    let outputMonth: number | null = null;
    for (const row of rows) {
      const dir = tokenDirectionFromLabel(`${row.name} ${row.config}`);
      if (dir === 'input' && inputMonth == null) inputMonth = round(row.month);
      if (dir === 'output' && outputMonth == null) outputMonth = round(row.month);
    }
    return {
      provider: p.providerName,
      offerings: p.count,
      cheapestMonth: round(p.cheapest.month),
      label: p.cheapest.name,
      inputMonth,
      outputMonth,
    };
  });

  return {
    query: usedKey,
    providersMatched,
    note:
      'Hosted API той же modelId: всегда разделяй input и output (и cache, если есть). Не подставляй Qwen3-Coder-480B / другие модели. ₽/1M ≠ ₽/мес GPU. Selectel FMC = ресурсы, не токены. Точка безубыточности — по смеси input/output и реальному tok/s узла, не «аренда ÷ только input».',
  };
}

export function recommendInferenceInfra(args: InferenceRecommendArgs): InferenceRecommendResult {
  const raw = typeof args.model === 'string' ? args.model.trim() : '';
  if (!raw) {
    return {ok: false, error: 'Укажите model (например «GLM 5.2»).'};
  }

  const profile = findInferenceModel(raw);
  if (!profile) {
    return {
      ok: false,
      notFound: true,
      error: `Модель «${raw}» нет в базе self-host рекомендаций. Уточните название или спросите цены hosted AI / GPU отдельно.`,
      disclaimer:
        'Не выдумывай VRAM и число GPU. Можно предложить search_prices по AI/GPU без вымышленных требований к памяти.',
    };
  }

  const deployment = profile.deployment ?? 'self-host';
  const modelMeta = {
    id: profile.id,
    displayName: profile.displayName,
    arch: profile.arch,
    parameterCountB: profile.parameterCountB,
    activeParameterCountB: profile.activeParameterCountB,
    parameterCountNote: profile.parameterCountNote,
    deployment,
    confidence: profile.confidence,
    contextDefault: profile.contextDefault,
  };

  if (deployment === 'api-only') {
    return {
      ok: true,
      model: modelMeta,
      selectedQuant: 'mixed',
      primaryRecommendation: null,
      configs: [],
      answerHint:
        'Модель API-only: нет публичных весов. Объясни, что self-host невозможен; предложи hosted/API и при желании соседние open-weight (Qwen3.6 / ожидаемый Qwen3.8). Не выдумывай число GPU.',
      hostedAlternative: hostedAlternative(profile),
      caveats: profile.caveats,
      disclaimer:
        'Параметры и VRAM для закрытых Max-моделей не раскрыты вендором. Не подставляй вымышленные GPU-конфиги.',
    };
  }

  const maxConfigs = Math.min(Math.max(args.maxConfigs ?? 5, 1), 5);
  const recs = pickRecs(profile, args.quant).slice(0, maxConfigs);
  const configs = recs.map((rec, i) => quoteConfig(profile, rec, i === 0));
  const primary = configs[0] ?? null;

  const quants = new Set(configs.map((c) => c.quant));
  const selectedQuant: InferenceDtype | 'mixed' =
    quants.size === 1 ? ([...quants][0] as InferenceDtype) : 'mixed';

  const fatHint =
    deployment === 'weights-pending' || (profile.parameterCountB != null && profile.parameterCountB >= 1000)
      ? ' Это cluster-scale модель: явно скажи, что 8×GPU в таблице — ориентир узла/TCO из каталога РФ, а не «поставь и готово»; для production часто нужен multi-node (у Kimi K3 официально ≥64 accelerators). Сравни с hosted API.'
      : '';

  return {
    ok: true,
    model: modelMeta,
    selectedQuant,
    primaryRecommendation: primary
      ? {
          gpuFamily: primary.gpuFamily,
          gpuCount: primary.gpuCount,
          quant: primary.quant,
          bestProvider: primary.best?.provider ?? null,
          bestMonth: primary.best?.totalMonth ?? null,
          why: primary.why,
        }
      : null,
    configs,
    answerHint:
      'Формат ответа (markdown): ### Self-host: {модель}; строка метаданных (параметры · ctx · confidence); ### Почему так (2–4 коротких предложения); ### Цены узлов + таблица configs[]; ### Альтернативы (буллеты по configs[1+], кратко); ### Hosted API (input/output отдельно, если есть); ### Оговорки (буллеты). Не лей всё в один абзац.' +
      fatHint,
    hostedAlternative: hostedAlternative(profile),
    caveats: profile.caveats,
    disclaimer:
      'Оценки VRAM и конфиги — инженерные ориентиры (не SLA). Цены GPU — из каталога Cloud FinOps (НДС вкл., месяц = 720 ч). Сравнивай self-host TCO с hosted API, если он есть. Не подменяй configs[] вызовом get_quote на 8×GPU.',
  };
}
