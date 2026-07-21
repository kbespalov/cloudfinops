/**
 * Client-safe catalog helpers for the Self-host Model Picker.
 * Derives lab / task / search tokens from InferenceModelProfile — no extra DB.
 */

import {INFERENCE_MODELS, type InferenceModelProfile} from '@/data/inference-models';
import {detectModelFamily, type ModelFamily} from '@/lib/calculator/model-family';
import {formatContextTokens} from '@/lib/calculator/vram-breakdown';

export type ModelTask =
  | 'coder'
  | 'reasoning'
  | 'general'
  | 'vision'
  | 'speech'
  | 'search'
  | 'rerank'
  | 'long-context'
  | 'budget';

export type LabId = ModelFamily | 'all';

export type LabInfo = {
  id: LabId;
  title: string;
  letters: string;
  count: number;
};

export type ModelPickerItem = {
  id: string;
  displayName: string;
  lab: ModelFamily;
  labTitle: string;
  tasks: ModelTask[];
  arch: 'dense' | 'moe';
  parameterCountB?: number;
  activeParameterCountB?: number;
  contextDefault: number;
  minGpuMemoryGiB: number;
  /** Lightest single-node recipe total VRAM (GiB), if any. */
  lightestRecipeGiB: number | null;
  singleGpu: boolean;
  deployment?: InferenceModelProfile['deployment'];
  aliases: string[];
  searchText: string;
  metaLine: string;
  sizeLabel: string;
  popular: boolean;
  recommended: boolean;
};

const LAB_TITLE: Record<ModelFamily, string> = {
  qwen: 'Qwen',
  glm: 'GLM',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  llama: 'Meta',
  gemma: 'Google',
  mixtral: 'Mistral',
  mistral: 'Mistral',
  'gpt-oss': 'OpenAI',
  phi: 'Phi',
  giga: 'Sber / Giga',
  ttech: 'T-Tech',
  other: 'Другие',
};

const LAB_LETTERS: Record<ModelFamily, string> = {
  qwen: 'Qw',
  glm: 'GL',
  kimi: 'Ki',
  deepseek: 'DS',
  llama: 'Me',
  gemma: 'Go',
  mixtral: 'Mi',
  mistral: 'Mi',
  'gpt-oss': 'O',
  phi: 'Ph',
  giga: 'Gi',
  ttech: 'T',
  other: 'AI',
};

/** Featured labs on the home screen (order). */
export const FEATURED_LAB_IDS: LabId[] = [
  'qwen',
  'deepseek',
  'glm',
  'giga',
  'ttech',
  'kimi',
  'llama',
  'gpt-oss',
  'all',
];

export const HOME_TASK_CHIPS: {id: ModelTask | 'vram-24' | 'vram-80' | 'single-gpu'; label: string}[] =
  [
    {id: 'coder', label: 'Для кода'},
    {id: 'reasoning', label: 'Reasoning'},
    {id: 'speech', label: 'Речь / STT'},
    {id: 'search', label: 'Поиск'},
    {id: 'rerank', label: 'Rerank'},
    {id: 'general', label: 'Универсальные'},
    {id: 'budget', label: 'Недорогой запуск'},
    {id: 'single-gpu', label: 'Одна GPU'},
  ];

export const LAB_TASK_CHIPS: {id: 'all' | ModelTask | 'dense' | 'moe'; label: string}[] = [
  {id: 'all', label: 'Все'},
  {id: 'coder', label: 'Coder'},
  {id: 'reasoning', label: 'Reasoning'},
  {id: 'speech', label: 'Речь'},
  {id: 'search', label: 'Поиск'},
  {id: 'rerank', label: 'Rerank'},
  {id: 'general', label: 'General'},
  {id: 'dense', label: 'Dense'},
  {id: 'moe', label: 'MoE'},
];

const POPULAR_IDS = new Set([
  'qwen3-coder-next',
  'deepseek-r1',
  'glm-5.2',
  'gigaam-v3',
  't-search',
  'qwen3-32b',
]);

const RECOMMENDED_IDS = new Set([
  'qwen3-coder-next',
  'deepseek-r1',
  'glm-5.2',
  'gigaam-v3',
  't-search',
  'qwen3-embedding-8b',
  'qwen3-reranker-0.6b',
]);

function detectTasks(profile: InferenceModelProfile): ModelTask[] {
  const blob = `${profile.displayName} ${profile.aliases.join(' ')} ${profile.id}`.toLowerCase();
  const tasks = new Set<ModelTask>();
  const modality = profile.modality ?? 'llm';
  if (modality === 'speech' || /gigaam|whisper|asr|stt|speech|audio|транскриб|голос/.test(blob)) {
    tasks.add('speech');
  }
  if (modality === 'search' || /t-search|retriev|поиск/.test(blob)) tasks.add('search');
  if (modality === 'embed' || /embedding|эмбед/.test(blob)) tasks.add('search');
  if (modality === 'rerank' || /rerank|реранк/.test(blob)) tasks.add('rerank');
  if (/coder|code|devstral|coding/.test(blob)) tasks.add('coder');
  if (/\br1\b|reason|thinking|scout|maverick/.test(blob)) tasks.add('reasoning');
  if (/vision|vl|multimodal|gemma 3/.test(blob)) tasks.add('vision');
  if (profile.contextDefault >= 200_000) tasks.add('long-context');
  if (
    (profile.minGpuMemoryGiB > 0 && profile.minGpuMemoryGiB <= 48) ||
    /8b|14b|20b|24b|27b|32b|0\.6b|0\.24|0\.8/.test(blob)
  ) {
    if (profile.minGpuMemoryGiB <= 80) tasks.add('budget');
  }
  const specialized = ['coder', 'reasoning', 'vision', 'speech', 'search', 'rerank'] as const;
  if (![...specialized].some((t) => tasks.has(t))) {
    tasks.add('general');
  }
  return [...tasks];
}

function sizeLabel(profile: InferenceModelProfile): string {
  if (profile.parameterCountB == null) return '—';
  const n = profile.parameterCountB;
  if (n >= 1000) return `${Math.round(n / 100) / 10}T`;
  if (n < 1) return `${Math.round(n * 1000)}M`;
  return `${n}B`;
}

function buildMetaLine(profile: InferenceModelProfile, labTitle: string, tasks: ModelTask[]): string {
  const bits: string[] = [labTitle];
  if (tasks.includes('speech')) bits.push('Речь');
  else if (tasks.includes('search')) bits.push('Поиск');
  else if (tasks.includes('rerank')) bits.push('Rerank');
  else if (tasks.includes('coder')) bits.push('Coder');
  else if (tasks.includes('reasoning')) bits.push('Reasoning');
  else if (tasks.includes('vision')) bits.push('Vision');
  else bits.push('General');
  if (profile.arch === 'moe') bits.push('MoE');
  if (profile.activeParameterCountB != null) {
    bits.push(`${profile.activeParameterCountB}B active`);
  } else if (profile.parameterCountB != null) {
    bits.push(
      profile.parameterCountB < 1
        ? `${Math.round(profile.parameterCountB * 1000)}M`
        : `${profile.parameterCountB}B`,
    );
  }
  if ((profile.modality ?? 'llm') === 'llm') {
    bits.push(`${formatContextTokens(profile.contextDefault)} ctx`);
  }
  return bits.join(' · ');
}

function buildSearchText(profile: InferenceModelProfile, labTitle: string, tasks: ModelTask[]): string {
  const parts = [
    profile.displayName,
    profile.id,
    ...profile.aliases,
    labTitle,
    profile.arch,
    profile.modality ?? 'llm',
    ...tasks,
    profile.parameterCountB != null ? `${profile.parameterCountB}b` : '',
    profile.activeParameterCountB != null ? `${profile.activeParameterCountB}b active` : '',
    formatContextTokens(profile.contextDefault),
    profile.contextDefault >= 200_000 ? 'long context большой контекст' : '',
    tasks.includes('coder') ? 'для кода code coding' : '',
    tasks.includes('reasoning') ? 'reasoning рассуждения' : '',
    tasks.includes('speech') ? 'речь asr stt транскрибация голос audio speech' : '',
    tasks.includes('search') ? 'поиск search retrieval embedding эмбеддинг' : '',
    tasks.includes('rerank') ? 'rerank реранкер ranking' : '',
    tasks.includes('budget') ? 'недорогой бюджет cheap' : '',
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function toItem(profile: InferenceModelProfile): ModelPickerItem {
  const lab = detectModelFamily(profile.displayName);
  const labTitle = LAB_TITLE[lab];
  const tasks = detectTasks(profile);
  const recipes = profile.recommended ?? [];
  const lightest = recipes.length
    ? Math.min(...recipes.map((r) => r.estimatedVramGiB))
    : null;
  const singleGpu = recipes.some((r) => r.gpuCount === 1);
  return {
    id: profile.id,
    displayName: profile.displayName,
    lab,
    labTitle,
    tasks,
    arch: profile.arch,
    parameterCountB: profile.parameterCountB,
    activeParameterCountB: profile.activeParameterCountB,
    contextDefault: profile.contextDefault,
    minGpuMemoryGiB: profile.minGpuMemoryGiB,
    lightestRecipeGiB: lightest,
    singleGpu,
    deployment: profile.deployment,
    aliases: profile.aliases,
    searchText: buildSearchText(profile, labTitle, tasks),
    metaLine: buildMetaLine(profile, labTitle, tasks),
    sizeLabel: sizeLabel(profile),
    popular: POPULAR_IDS.has(profile.id),
    recommended: RECOMMENDED_IDS.has(profile.id),
  };
}

let _catalog: ModelPickerItem[] | null = null;

export function getModelPickerCatalog(): ModelPickerItem[] {
  if (!_catalog) _catalog = INFERENCE_MODELS.map(toItem);
  return _catalog;
}

export function getLabInfos(catalog: ModelPickerItem[] = getModelPickerCatalog()): LabInfo[] {
  const counts = new Map<ModelFamily, number>();
  for (const m of catalog) {
    counts.set(m.lab, (counts.get(m.lab) ?? 0) + 1);
  }
  const labs: LabInfo[] = FEATURED_LAB_IDS.map((id): LabInfo => {
    if (id === 'all') {
      return {id: 'all', title: 'Все лаборатории', letters: 'Все', count: catalog.length};
    }
    return {
      id,
      title: LAB_TITLE[id],
      letters: LAB_LETTERS[id],
      count: counts.get(id) ?? 0,
    };
  }).filter((l) => l.id === 'all' || l.count > 0);

  return labs;
}

export function labTitle(id: LabId): string {
  if (id === 'all') return 'Все лаборатории';
  return LAB_TITLE[id];
}

export type QuickFilterId =
  | ModelTask
  | 'vram-24'
  | 'vram-48'
  | 'vram-80'
  | 'vram-160'
  | 'single-gpu'
  | 'dense'
  | 'moe';

export function matchesQuickFilter(item: ModelPickerItem, filter: QuickFilterId): boolean {
  switch (filter) {
    case 'coder':
    case 'reasoning':
    case 'general':
    case 'vision':
    case 'speech':
    case 'search':
    case 'rerank':
    case 'long-context':
    case 'budget':
      return item.tasks.includes(filter);
    case 'dense':
      return item.arch === 'dense';
    case 'moe':
      return item.arch === 'moe';
    case 'single-gpu':
      return item.singleGpu;
    case 'vram-24':
      return (item.lightestRecipeGiB ?? item.minGpuMemoryGiB) <= 24;
    case 'vram-48':
      return (item.lightestRecipeGiB ?? item.minGpuMemoryGiB) <= 48;
    case 'vram-80':
      return (item.lightestRecipeGiB ?? item.minGpuMemoryGiB) <= 80;
    case 'vram-160':
      return (item.lightestRecipeGiB ?? item.minGpuMemoryGiB) >= 160;
    default:
      return true;
  }
}

export function searchModels(
  query: string,
  catalog: ModelPickerItem[] = getModelPickerCatalog(),
): ModelPickerItem[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return catalog;
  const tokens = q.split(' ').filter(Boolean);
  return catalog.filter((item) => tokens.every((t) => item.searchText.includes(t)));
}

export function filterByLab(items: ModelPickerItem[], lab: LabId): ModelPickerItem[] {
  if (lab === 'all') return items;
  return items.filter((m) => m.lab === lab);
}

export function sortLabModels(items: ModelPickerItem[]): ModelPickerItem[] {
  return [...items].sort((a, b) => {
    const score = (m: ModelPickerItem) =>
      (m.recommended ? 4 : 0) + (m.popular ? 2 : 0) + (m.deployment === 'self-host' ? 1 : 0);
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.displayName.localeCompare(b.displayName, 'en');
  });
}

export function recommendedModels(
  catalog: ModelPickerItem[] = getModelPickerCatalog(),
  limit = 5,
): ModelPickerItem[] {
  const preferred = catalog.filter((m) => m.recommended || m.popular);
  const rest = catalog.filter((m) => !preferred.includes(m));
  return sortLabModels([...preferred, ...rest]).slice(0, limit);
}

const RECENT_KEY = 'cloudfinops.selfhost.recentModels';
const RECENT_MAX = 5;

export function loadRecentModelIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecentModelId(id: string): string[] {
  if (typeof window === 'undefined') return [];
  const next = [id, ...loadRecentModelIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function resolveRecentModels(
  ids: string[],
  catalog: ModelPickerItem[] = getModelPickerCatalog(),
): ModelPickerItem[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is ModelPickerItem => Boolean(m));
}

/** Highlight first case-insensitive match of query tokens in text. */
export function highlightMatch(text: string, query: string): {before: string; match: string; after: string} | null {
  const q = query.trim().split(/\s+/)[0];
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  };
}

export function closedFieldMeta(item: ModelPickerItem): string {
  const bits: string[] = [item.labTitle];
  if (item.tasks.includes('coder')) bits.push('Coder');
  else if (item.tasks.includes('reasoning')) bits.push('Reasoning');
  else if (item.tasks.includes('vision')) bits.push('Vision');
  if (item.parameterCountB != null) bits.push(`${item.sizeLabel} параметров`);
  if (item.activeParameterCountB != null) {
    bits.push(`${item.activeParameterCountB}B активных`);
  }
  bits.push(`${formatContextTokens(item.contextDefault)} токенов`);
  return bits.join(' · ');
}

export function findCatalogItemByDisplayName(
  displayName: string,
  catalog: ModelPickerItem[] = getModelPickerCatalog(),
): ModelPickerItem | null {
  return catalog.find((m) => m.displayName === displayName) ?? null;
}
