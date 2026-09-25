/**
 * Chat charts: explicit ```chart JSON fences plus a bar chart derived from
 * a price markdown table. The UI renders the spec with Gravity ChartKit.
 */

export type ChartKind = 'line' | 'bar' | 'area' | 'pie' | 'scatter';

export interface ChatChartSpec {
  kind: ChartKind;
  title?: string;
  xField: string;
  categories: string[];
  series: Array<{name: string; data: number[]}>;
}

export type AssistantContentPart =
  | {type: 'text'; data: {text: string}}
  | {type: 'chart'; data: ChatChartSpec};

const KINDS = new Set<ChartKind>(['line', 'bar', 'area', 'pie', 'scatter']);
const MAX_CHARTS = 3;
const MAX_CATEGORIES = 12;

const FENCE_RE = /```chart[^\n]*\n([\s\S]*?)```/g;

const CHART_REQUEST_RE =
  /график|диаграмм|гистограмм|визуализ|наглядн|нарису|\bchart|\bplot/iu;
/** «работает по графику», «график работы» — schedule, not a chart. */
const SCHEDULE_RE = /(?:^|[^\p{L}])по\s+график\p{L}*|график\p{L}*\s+работы/giu;
const CHART_REFUSAL_RE =
  /(?:^|[^\p{L}])(?:без|не\s+(?:надо|нужн\p{L}*|стро\p{L}*|рису\p{L}*))\s+(?:\p{L}+\s+)?(?:график|диаграмм|визуализ)|(?:график|диаграмм|визуализ)\p{L}*\s+не\s+(?:надо|нуж)/iu;

/** True when the user message explicitly asks for a chart. */
export function wantsChart(userText: string | null | undefined): boolean {
  if (!userText) return false;
  const text = userText.replace(SCHEDULE_RE, ' ');
  if (CHART_REFUSAL_RE.test(text)) return false;
  return CHART_REQUEST_RE.test(text);
}

/**
 * `requested: false` renders no charts: table charts are skipped and valid
 * ```chart fences are dropped instead of leaking raw JSON.
 */
export function decorateAssistantContent(
  markdown: string,
  options?: {deriveFromTables?: boolean; requested?: boolean},
): string | AssistantContentPart[] {
  const requested = options?.requested !== false;
  const derive = requested && options?.deriveFromTables !== false;
  const parts: AssistantContentPart[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let chartCount = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.type === 'text') last.data.text += text;
    else parts.push({type: 'text', data: {text}});
  };

  const pushChart = (spec: ChatChartSpec) => {
    if (chartCount >= MAX_CHARTS) return;
    const key = chartKey(spec);
    if (seen.has(key)) return;
    seen.add(key);
    chartCount += 1;
    parts.push({type: 'chart', data: spec});
  };

  for (const match of markdown.matchAll(FENCE_RE)) {
    const start = match.index ?? 0;
    pushText(markdown.slice(cursor, start));
    const spec = parseChartSpec(match[1] ?? '');
    if (!spec) pushText(match[0]);
    else if (requested) pushChart(spec);
    cursor = start + match[0].length;
  }
  pushText(markdown.slice(cursor));

  if (!requested) {
    const text = parts.map((part) => (part.type === 'text' ? part.data.text : '')).join('');
    return text === markdown ? markdown : text.replace(/\n{3,}/g, '\n\n').trim();
  }
  if (!derive) {
    return parts.some((part) => part.type === 'chart') ? parts : markdown;
  }

  const expanded: AssistantContentPart[] = [];
  for (const part of parts) {
    if (part.type !== 'text') {
      expanded.push(part);
      continue;
    }
    for (const piece of injectTableCharts(part.data.text, seen, () => chartCount < MAX_CHARTS)) {
      if (piece.type === 'text') {
        if (!piece.data.text) continue;
        const last = expanded[expanded.length - 1];
        if (last?.type === 'text') last.data.text += piece.data.text;
        else expanded.push(piece);
        continue;
      }
      const key = chartKey(piece.data);
      if (seen.has(key) || chartCount >= MAX_CHARTS) continue;
      seen.add(key);
      chartCount += 1;
      expanded.push(piece);
    }
  }

  return expanded.some((part) => part.type === 'chart') ? expanded : markdown;
}

export function parseChartSpec(raw: string): ChatChartSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.kind !== 'string' || !KINDS.has(obj.kind as ChartKind)) return null;
  if (!Array.isArray(obj.categories) || obj.categories.length < 2 || !Array.isArray(obj.series)) {
    return null;
  }
  if (!obj.categories.every((item) => typeof item === 'string' && item.trim())) return null;
  const categories = uniqueLabels(
    (obj.categories as string[]).slice(0, MAX_CATEGORIES).map((item) => item.trim()),
  );
  if (categories.length < 2) return null;

  const series: ChatChartSpec['series'] = [];
  for (const item of obj.series) {
    if (series.length === 4) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim() || !Array.isArray(row.data)) return null;
    if (row.data.length < categories.length) return null;
    const data = row.data.slice(0, categories.length).map((value) => Number(value));
    if (data.some((value) => !Number.isFinite(value))) return null;
    series.push({name: row.name.trim().slice(0, 60), data});
  }
  if (!series.length) return null;
  if (obj.kind === 'pie' && (series.length !== 1 || series[0]!.data.every((value) => value <= 0))) {
    return null;
  }

  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 120) : '';
  const xField =
    typeof obj.xField === 'string' && obj.xField.trim()
      ? obj.xField.trim().slice(0, 40)
      : 'Категория';

  return {
    kind: obj.kind as ChartKind,
    ...(title ? {title} : {}),
    xField,
    categories,
    series,
  };
}

function injectTableCharts(
  text: string,
  seen: Set<string>,
  canAdd: () => boolean,
): AssistantContentPart[] {
  const lines = text.split('\n');
  const parts: AssistantContentPart[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    parts.push({type: 'text', data: {text: buffer.join('\n')}});
    buffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i] ?? '')) {
      buffer.push(lines[i] ?? '');
      i += 1;
      continue;
    }
    const start = i;
    const block: string[] = [];
    while (i < lines.length && isTableLine(lines[i] ?? '')) {
      block.push(lines[i] ?? '');
      i += 1;
    }
    buffer.push(...block);
    flush();
    if (!canAdd()) continue;
    const spec = tableToChart(block, headingBefore(lines, start));
    if (!spec || seen.has(chartKey(spec))) continue;
    parts.push({type: 'chart', data: spec});
  }
  flush();
  return parts;
}

function tableToChart(block: string[], title: string | undefined): ChatChartSpec | null {
  if (block.length < 4) return null;
  if (!isSeparator(block[1] ?? '')) return null;
  const headers = splitCells(block[0] ?? '');
  const rows = block.slice(2).map(splitCells).filter((row) => row.some(Boolean));
  if (headers.length < 2 || rows.length < 2) return null;

  const width = headers.length;
  const padded = rows.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  });

  const moneyIdx = headers
    .map((header, index) => ({header, index}))
    .filter(({header, index}) => isMoneyColumn(header, padded.map((row) => row[index] ?? '')))
    .map(({index}) => index);
  if (!moneyIdx.length) return null;

  const totalIdx = moneyIdx.filter((index) => /итог|1\s*m\s*in\s*\+/i.test(headers[index] ?? ''));
  const chosen = (totalIdx.length ? totalIdx : moneyIdx).slice(0, 3);

  let catIdx = headers.findIndex((_, index) => !chosen.includes(index));
  if (catIdx < 0) catIdx = 0;

  let labels = padded.map((row) => cleanLabel(row[catIdx] ?? ''));
  if (new Set(labels).size < labels.length) {
    const extra = headers.findIndex((_, index) => index !== catIdx && !chosen.includes(index));
    if (extra >= 0) {
      labels = padded.map((row) => {
        const left = cleanLabel(row[catIdx] ?? '');
        const right = cleanLabel(row[extra] ?? '');
        return right ? `${left} · ${right}` : left;
      });
    }
  }

  const kept: Array<{label: string; values: number[]}> = [];
  for (let rowIndex = 0; rowIndex < padded.length && kept.length < MAX_CATEGORIES; rowIndex += 1) {
    const primary = parseRub(padded[rowIndex]?.[chosen[0]!] ?? '');
    if (primary == null) continue;
    const values = chosen.map((index, seriesIndex) => {
      if (seriesIndex === 0) return primary;
      return parseRub(padded[rowIndex]?.[index] ?? '') ?? 0;
    });
    const label = labels[rowIndex]?.trim();
    if (!label || /^итого$/i.test(label)) continue;
    kept.push({label, values});
  }
  if (kept.length < 2) return null;

  const categories = uniqueLabels(kept.map((row) => row.label));
  const series = chosen.map((index, seriesIndex) => ({
    name: cleanLabel(headers[index] ?? '') || '₽',
    data: kept.map((row) => row.values[seriesIndex] ?? 0),
  }));

  return {
    kind: 'bar',
    title: title || series[0]?.name || 'Сравнение',
    xField: cleanLabel(headers[catIdx] ?? '') || 'Категория',
    categories,
    series,
  };
}

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparator(line: string): boolean {
  if (!isTableLine(line)) return false;
  return splitCells(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isMoneyColumn(header: string, cells: string[]): boolean {
  if (/минимум|покрыт|утилиз/i.test(header)) return false;
  const values = cells.map(parseRub);
  const ok = values.filter((value) => value != null).length;
  if (ok < 2 || ok / cells.length < 0.6) return false;
  return (
    /₽|руб|итог|стоим|цен|input|output|мес|час|остат/i.test(header) ||
    cells.some((cell) => /₽|руб/i.test(cell))
  );
}

/** Russian catalog amounts: `108\u00a0712 ₽`, `1 234,5 ₽`. Percents and «min» are not prices. */
export function parseRub(cell: string): number | null {
  const raw = cell.trim();
  if (!raw || raw === '—' || raw === '-' || raw === '–') return null;
  if (/%/.test(raw) || /^min\b/i.test(raw)) return null;
  const cleaned = raw
    .replace(/\*\*/g, '')
    .replace(/₽/g, '')
    .replace(/руб\.?/gi, '')
    .replace(/[\s\u00a0\u202f\u2009]/g, '')
    .replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function cleanLabel(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
    .slice(0, 48);
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const base = label.trim() || '—';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function headingBefore(lines: string[], tableStart: number): string | undefined {
  for (let i = tableStart - 1; i >= Math.max(0, tableStart - 4); i -= 1) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    if (line.startsWith('|')) return undefined;
    const plain = cleanLabel(line.replace(/^#+\s*/, ''));
    return plain ? plain.slice(0, 90) : undefined;
  }
  return undefined;
}

function chartKey(spec: ChatChartSpec): string {
  const nums = spec.series.map((series) => series.data.join(',')).join('|');
  return `${spec.categories.join('\u0001')}@@${nums}`;
}
