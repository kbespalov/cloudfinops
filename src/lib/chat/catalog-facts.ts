/**
 * Live catalog shape / availability hints for the planning prompt.
 * Prices must still come from tool results — this block never embeds ₽ totals.
 */

import {pickK8sMasterMeter} from '@/lib/calculator/lakehouse-quote';
import {
  CALCULATOR_PROVIDER_IDS,
  type CalculatorProviderId,
} from '@/lib/calculator/quote-view';
import {
  catalog,
  extractAiModelKey,
  extractAiTokenDirection,
  isAiTokenMeter,
  meterNativeName,
  type CatalogMeter,
} from '@/lib/catalog';
import {
  aiModelMatchesNeedle,
  compactAiModelId,
  detectAiModelNeedle,
} from '@/lib/chat/search';

const PROVIDER_SHORT: Record<CalculatorProviderId, string> = {
  'yandex-cloud': 'yandex',
  'vk-cloud': 'vk',
  'cloud-ru': 'cloud.ru',
  't1-cloud': 't1',
  selectel: 'selectel',
  'mws-cloud': 'mws',
};

function k8sMasterShapeLabel(meter: CatalogMeter): string {
  const vcpu = Number(meter.dimensions.vcpu);
  const ram = Number(meter.dimensions.ramGiB ?? meter.dimensions.ramGb);
  const host =
    meterNativeName(meter) ||
    (typeof meter.dimensions.hostType === 'string' ? meter.dimensions.hostType : '');
  const shaped =
    Number.isFinite(vcpu) && vcpu > 0 && Number.isFinite(ram) && ram > 0
      ? `${vcpu}/${ram}`
      : null;
  const cls = String(meter.dimensions.comparabilityClass || '');
  if (cls === 'native-fixed' && !shaped) return 'native-fixed';
  if (shaped && host && !shaped.includes(host) && host.length < 24) {
    return `${shaped} ${host}`;
  }
  if (shaped) return shaped;
  if (host) return host;
  return 'native-fixed';
}

function buildK8sFactsLine(): string {
  const parts: string[] = [];
  for (const id of CALCULATOR_PROVIDER_IDS) {
    const picked = pickK8sMasterMeter(id, 'basic');
    if (!picked) {
      parts.push(`${PROVIDER_SHORT[id]} — нет`);
      continue;
    }
    parts.push(`${PROVIDER_SHORT[id]} ${k8sMasterShapeLabel(picked.meter)}`);
  }
  return `K8s masters (catalog defaults, basic): ${parts.join('; ')}. Workers ≠ master; не цена мастера: 0₽ cluster fee / unit vCPU·RAM; native-fixed — не утверждай чужие формы.`;
}

type AiProviderPresence = {
  provider: CalculatorProviderId;
  input: boolean;
  output: boolean;
};

/**
 * Prefer compact modelId equality / key-prefix so gpt-oss-20b never inherits
 * gpt-oss-120b via naive substring includes.
 */
function meterMatchesNamedAiModel(modelNeedle: string, meter: CatalogMeter): boolean {
  const key = extractAiModelKey(meter);
  const n = compactAiModelId(modelNeedle);
  if (!n) return false;
  if (key) {
    const k = compactAiModelId(key);
    return k === n || k.startsWith(n);
  }
  return aiModelMatchesNeedle(modelNeedle, meter, `${meter.name} ${meter.sku}`);
}

function hostedAiProvidersForModel(modelNeedle: string): AiProviderPresence[] {
  const rows: AiProviderPresence[] = [];
  for (const id of CALCULATOR_PROVIDER_IDS) {
    let input = false;
    let output = false;
    for (const meter of catalog.meters) {
      if (meter.provider !== id) continue;
      if (meter.categoryKey !== 'ai' || meter.status !== 'available') continue;
      if (!isAiTokenMeter(meter)) continue;
      if (!meterMatchesNamedAiModel(modelNeedle, meter)) continue;
      const dir = extractAiTokenDirection(meter);
      if (dir === 'input') input = true;
      if (dir === 'output') output = true;
    }
    if (input || output) rows.push({provider: id, input, output});
  }
  return rows;
}

function buildAiFactsLine(userText: string): string | null {
  const model = detectAiModelNeedle(userText);
  if (!model) return null;
  const providers = hostedAiProvidersForModel(model);
  if (providers.length === 0) {
    return `AI hosted API «${model}»: в каталоге нет. Не подменяй соседней моделью без tool.`;
  }
  const labels = providers.map((p) => {
    const io =
      p.input && p.output ? 'input+output' : p.input ? 'input' : p.output ? 'output' : '?';
    return `${PROVIDER_SHORT[p.provider]} (${io})`;
  });
  return `AI hosted API «${model}»: ${labels.join(', ')}. aiModel в tool = «${model}»; цены — только из search_prices.`;
}

/**
 * Compact live catalog addendum for matched planning domains.
 * Returns null when nothing relevant to inject.
 */
export function buildCatalogFactsAddendum(
  domains: readonly string[],
  userText: string,
): string | null {
  const lines: string[] = [];
  if (domains.includes('k8s')) {
    lines.push(buildK8sFactsLine());
  }
  if (domains.includes('ai')) {
    const ai = buildAiFactsLine(userText);
    if (ai) lines.push(ai);
  }
  if (!lines.length) return null;
  return `## CATALOG FACTS (live, shapes/availability only — цены только из tools)\n- ${lines.join('\n- ')}`;
}
