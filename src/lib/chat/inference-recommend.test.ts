import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {findInferenceModel, INFERENCE_MODELS} from '@/data/inference-models';
import {getModelPickerCatalog} from '@/lib/calculator/model-picker-catalog';
import {listGpuPresets, quotePreset, toViewQuote} from '@/lib/calculator/quote';
import {matchInferenceIntent} from './inference-intent';
import {defaultPricedConfigIndex, recommendInferenceInfra} from './inference-recommend';
import {matchFastPath} from './fast-path';
import {CHAT_TOOLS, CHAT_TOOLS_WITH_INFERENCE, runToolSync} from './tools';

/** Max primary-quote provider count among published exact-count host shapes. */
function maxPublishedHostCoverage(
  gpuFamily: string,
  gpuCount: number,
  gpuMemoryGb: number | null | undefined,
): number {
  const pool = listGpuPresets().filter(
    (p) =>
      p.gpuModelMatch === gpuFamily &&
      p.gpuCount === gpuCount &&
      p.vcpu != null &&
      p.ramGiB != null &&
      !p.dedicated,
  );
  let max = 0;
  for (const p of pool) {
    const n = toViewQuote(
      quotePreset(
        {
          id: `cov-${gpuFamily}-${gpuCount}-${p.vcpu}-${p.ramGiB}`,
          kind: 'gpu',
          title: 'cov',
          subtitle: 'cov',
          gpuModelMatch: gpuFamily,
          gpuCount,
          vcpu: p.vcpu,
          ramGiB: p.ramGiB,
          diskGiB: p.diskGiB ?? 100,
          gpuMemoryGb: gpuMemoryGb ?? p.gpuMemoryGb ?? null,
        },
        'month',
      ),
    ).quotes.length;
    if (n > max) max = n;
  }
  return max;
}

describe('inference model KB', () => {
  it('resolves GLM 5.2 aliases', () => {
    assert.equal(findInferenceModel('GLM 5.2')?.id, 'glm-5.2');
    assert.equal(findInferenceModel('glm-5.2')?.id, 'glm-5.2');
  });

  it('resolves Qwen3 32B', () => {
    assert.equal(findInferenceModel('qwen3-32b')?.id, 'qwen3-32b');
  });

  it('resolves fat-model aliases (Kimi K3, Qwen 3.7/3.8)', () => {
    assert.equal(findInferenceModel('кимика 3')?.id, 'kimi-k3');
    assert.equal(findInferenceModel('kimi k3')?.id, 'kimi-k3');
    assert.equal(findInferenceModel('химика три')?.id, 'kimi-k3');
    assert.equal(findInferenceModel('химика 3')?.id, 'kimi-k3');
    assert.equal(findInferenceModel('развернуть химика три self-host')?.id, 'kimi-k3');
    assert.equal(findInferenceModel('квен 3.7')?.id, 'qwen-3.7');
    assert.equal(findInferenceModel('qwen 3.8')?.id, 'qwen-3.8');
  });

  it('does not confuse Qwen3-Coder-Next with Coder-480B', () => {
    assert.equal(findInferenceModel('Qwen3-Coder-Next')?.id, 'qwen3-coder-next');
    assert.equal(
      findInferenceModel(
        'Какая GPU-инфраструктура нужна, чтобы развернуть «Qwen3-Coder-Next» self-host',
      )?.id,
      'qwen3-coder-next',
    );
    assert.equal(findInferenceModel('qwen3-coder-480b-a35b')?.id, 'qwen3-coder-480b');
  });

  it('resolves popular July-2026 self-host models without collisions', () => {
    assert.equal(findInferenceModel('Llama 4 Scout')?.id, 'llama-4-scout');
    assert.equal(findInferenceModel('llama 4')?.id, 'llama-4-scout');
    assert.equal(findInferenceModel('Llama 4 Maverick')?.id, 'llama-4-maverick');
    assert.equal(findInferenceModel('DeepSeek R1')?.id, 'deepseek-r1');
    assert.equal(findInferenceModel('DeepSeek R1 Distill 32B')?.id, 'deepseek-r1-distill-32b');
    assert.equal(findInferenceModel('deepseek r1 32b')?.id, 'deepseek-r1-distill-32b');
    assert.equal(findInferenceModel('gpt-oss-20b')?.id, 'gpt-oss-20b');
    assert.equal(findInferenceModel('gpt-oss-120b')?.id, 'gpt-oss-120b');
    assert.equal(findInferenceModel('GPT-УСС')?.id, 'gpt-oss-120b');
    assert.equal(findInferenceModel('gpt vss')?.id, 'gpt-oss-120b');
    assert.equal(findInferenceModel('Devstral Small 24B')?.id, 'devstral-small-24b');
    assert.equal(findInferenceModel('Devstral 2')?.id, 'devstral-2-123b');
    assert.equal(findInferenceModel('Phi-4')?.id, 'phi-4');
    assert.equal(findInferenceModel('Qwen3 8B')?.id, 'qwen3-8b');
    assert.equal(findInferenceModel('deepseek')?.id, 'deepseek-v4-flash');
    assert.equal(findInferenceModel('DeepSeek V4 Flash')?.id, 'deepseek-v4-flash');
    assert.equal(findInferenceModel('DeepSeek V4 Pro')?.id, 'deepseek-v4-pro');
    assert.equal(findInferenceModel('Gemma 4')?.id, 'gemma-4-31b');
    assert.equal(findInferenceModel('Qwen 3.5')?.id, 'qwen3.5-122b-a10b');
    assert.equal(findInferenceModel('MiniMax M3')?.id, 'minimax-m3');
    assert.equal(findInferenceModel('Nemotron 3 Super')?.id, 'nemotron-3-super');
    assert.equal(findInferenceModel('Granite 4.1')?.id, 'granite-4.1-8b');
  });

  it('resolves speech / T-Search / rerank profiles', () => {
    assert.equal(findInferenceModel('GigaAM-v3')?.id, 'gigaam-v3');
    assert.equal(findInferenceModel('гигаам')?.id, 'gigaam-v3');
    assert.equal(findInferenceModel('Whisper large-v3-turbo')?.id, 'whisper-large-v3-turbo');
    assert.equal(findInferenceModel('T-Search')?.id, 't-search');
    assert.equal(findInferenceModel('Qwen3-Embedding-8B')?.id, 'qwen3-embedding-8b');
    assert.equal(findInferenceModel('реранкер')?.id, 'qwen3-reranker-0.6b');
  });
});

describe('matchInferenceIntent', () => {
  it('matches self-host GLM questions', () => {
    const intent = matchInferenceIntent(
      'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    );
    assert.equal(intent.matched, true);
    assert.ok(intent.modelQuery);
  });

  it('does not match token-price GLM questions', () => {
    const intent = matchInferenceIntent('Сколько стоит GLM 5.2 у MWS за 1M токенов?');
    assert.equal(intent.matched, false);
  });

  it('does not match ordinary H100 price questions', () => {
    const intent = matchInferenceIntent('Самый дешёвый H100 в месяц');
    assert.equal(intent.matched, false);
  });

  it('does not match VM compare', () => {
    const intent = matchInferenceIntent(
      'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    );
    assert.equal(intent.matched, false);
  });

  it('does not steal ordinary infra / k8s / budget asks onto the recommender', () => {
    const negatives = [
      'Развернуть кластер Kubernetes на 3 нодах',
      'Какая инфраструктура нужна для сайта на 1С?',
      'Сколько стоит аренда H200 у Selectel?',
      'Средняя цена vCPU по провайдерам',
      'Бюджет 100000 ₽/мес — что можно позволить?',
      'Сравни цены AI API / токенов по провайдерам',
      'Сравни Managed Kubernetes по провайдерам',
    ];
    for (const q of negatives) {
      assert.equal(matchInferenceIntent(q).matched, false, q);
    }
  });

  it('still matches Coder-Next / VRAM / сколько GPU asks', () => {
    assert.equal(
      matchInferenceIntent(
        'Какая GPU-инфраструктура нужна, чтобы развернуть «Qwen3-Coder-Next» self-host',
      ).matched,
      true,
    );
    assert.equal(matchInferenceIntent('Сколько GPU нужно для Qwen 3.8').matched, true);
    assert.equal(matchInferenceIntent('VRAM для Llama 70B').matched, true);
  });
});

describe('recommendInferenceInfra', () => {
  it('returns GPU configs with RU quotes for GLM 5.2', () => {
    const result = recommendInferenceInfra({model: 'GLM 5.2', maxConfigs: 3});
    assert.equal(result.ok, true);
    assert.equal(result.notFound, undefined);
    assert.ok(result.configs?.length);
    assert.ok(result.configs!.some((c) => c.gpuFamily.includes('H200')));
    // FP8 weights ~743 GiB — 4×H200 (564) must never appear as a viable node.
    assert.ok(
      !result.configs!.some((c) => c.quant === 'fp8' && c.gpuCount === 4),
      '4×H200 FP8 must be filtered (weights do not fit)',
    );
    assert.ok(
      result.configs!.some((c) => c.quant === 'fp8' && c.gpuCount === 8 && c.gpuFamily === 'H200'),
    );
    assert.ok(result.disclaimer);
  });

  it('keeps Selectel+T1+VK on GLM 5.2 8×H200 (parity host, not Selectel-only 96/960)', () => {
    const result = recommendInferenceInfra({model: 'GLM 5.2', maxConfigs: 3});
    assert.equal(result.ok, true);
    const h200x8 = result.configs?.filter((c) => c.gpuFamily === 'H200' && c.gpuCount === 8);
    assert.ok(h200x8?.length, 'expected 8×H200 configs');
    for (const c of h200x8!) {
      assert.equal(c.host?.vcpu, 240, `${c.quant}: parity host vCPU`);
      assert.equal(c.host?.ramGiB, 2048, `${c.quant}: parity host RAM`);
      const providers = new Set((c.quotes ?? []).map((q) => q.provider));
      assert.ok(providers.has('Selectel'), `${c.quant}: Selectel missing — ${[...providers]}`);
      assert.ok(providers.has('T1 Cloud'), `${c.quant}: T1 missing — ${[...providers]}`);
      assert.ok(providers.has('VK Cloud'), `${c.quant}: VK missing — ${[...providers]}`);
      assert.ok(providers.size >= 3, `${c.quant}: expected ≥3 providers`);
    }
  });

  it('resolves JLM typo alias to GLM 5.2', () => {
    assert.equal(findInferenceModel('JLM 5.2')?.id, 'glm-5.2');
    assert.equal(findInferenceModel('jlm-5.2')?.id, 'glm-5.2');
  });

  it('keeps multi-provider coverage on Qwen3 32B ladder (A100/L40S/L4)', () => {
    const result = recommendInferenceInfra({model: 'Qwen3 32B', maxConfigs: 3});
    assert.equal(result.ok, true);
    assert.ok(result.configs?.length);
    const allProviders = new Set(
      result.configs!.flatMap((c) => (c.quotes ?? []).map((q) => q.provider)),
    );
    assert.ok(allProviders.size >= 3, `expected ≥3 providers across configs, got ${[...allProviders]}`);
    assert.ok(
      result.configs!.some((c) => (c.quotes?.length ?? 0) >= 2),
      'at least one config should compare 2+ providers',
    );
  });

  it('sidebar-style adhoc quote matches recommend providers for GLM 8×H200', () => {
    const result = recommendInferenceInfra({model: 'GLM 5.2', maxConfigs: 1});
    assert.equal(result.ok, true);
    const c = result.configs?.[0];
    assert.ok(c?.host && !c.host.unitOnly && !c.host.dedicated);
    const view = toViewQuote(
      quotePreset(
        {
          id: 'adhoc-glm-h200',
          kind: 'gpu',
          title: 'adhoc',
          subtitle: 'adhoc',
          gpuModelMatch: c!.gpuFamily,
          gpuCount: c!.gpuCount,
          vcpu: c!.host!.vcpu,
          ramGiB: c!.host!.ramGiB,
          diskGiB: c!.host!.diskGiB ?? 100,
          gpuMemoryGb: c!.host!.gpuMemoryGb ?? null,
        },
        'month',
      ),
    );
    const recommendNames = new Set((c!.quotes ?? []).map((q) => q.provider));
    const adhocNames = new Set(view.quotes.map((q) => q.providerName));
    assert.deepEqual([...adhocNames].sort(), [...recommendNames].sort());
  });

  it('recommends single H100 for gpt-oss-120b, not 8×', () => {
    const result = recommendInferenceInfra({model: 'gpt-oss-120b', maxConfigs: 4});
    assert.equal(result.ok, true);
    assert.equal(result.primaryRecommendation?.gpuCount, 1);
    assert.equal(result.primaryRecommendation?.gpuFamily, 'H100');
    assert.ok(result.configs?.every((c) => c.gpuCount <= 2));
    assert.ok(!result.configs?.some((c) => c.gpuCount >= 8));
  });

  it('attaches a short why to each config', () => {
    const result = recommendInferenceInfra({model: 'gpt-oss-120b', maxConfigs: 2});
    assert.equal(result.ok, true);
    assert.ok(result.primaryRecommendation?.why?.includes('H100'));
    assert.ok(result.configs?.[0]?.why?.length);
    assert.ok(result.answerHint?.includes('короткий лид') || result.answerHint?.includes('человеку'));
    assert.ok(result.answerHint?.includes('/calculator/self-host?'));
    assert.ok(result.answerHint?.includes('Запас памяти'));
  });

  it('returns notFound for unknown models', () => {
    const result = recommendInferenceInfra({model: 'TotallyFakeModel-99B'});
    assert.equal(result.ok, false);
    assert.equal(result.notFound, true);
  });

  it('marks Qwen 3.7 as api-only without inventing GPU configs', () => {
    const result = recommendInferenceInfra({model: 'квен 3.7'});
    assert.equal(result.ok, true);
    assert.equal(result.model?.deployment, 'api-only');
    assert.equal(result.configs?.length, 0);
    assert.equal(result.primaryRecommendation, null);
    assert.ok(result.answerHint?.toLowerCase().includes('api'));
    // Broad «Qwen» must not invent Coder-Next / 3.6 as a Hosted API analog.
    const hostedLabels =
      result.hostedAlternative?.providersMatched.map((p) => p.label ?? '').join(' ') ?? '';
    assert.equal(result.hostedAlternative, undefined);
    assert.doesNotMatch(hostedLabels, /Coder-Next|3\.6|qwen3-32b/i);
  });

  it('prices L40S primary for Mistral/Devstral (L4 must not steal L40S host)', () => {
    for (const model of ['Mistral Small 24B', 'Devstral Small 24B']) {
      const result = recommendInferenceInfra({model, maxConfigs: 3});
      assert.equal(result.ok, true, model);
      assert.equal(result.primaryRecommendation?.gpuFamily, 'L40S', model);
      assert.ok(
        result.primaryRecommendation?.bestMonth != null,
        `${model}: L40S primary must be priced`,
      );
      assert.equal(result.configs?.[0]?.host?.ramGiB, 112, `${model}: L40S host is 16/112`);
      assert.notEqual(result.configs?.[0]?.host?.ramGiB, 72, `${model}: L4 16/72 must not win`);
    }
  });

  it('does not attach sibling DeepSeek SKUs as R1 hosted alternative', () => {
    const result = recommendInferenceInfra({model: 'DeepSeek R1', maxConfigs: 2});
    assert.equal(result.ok, true);
    const hostedLabels =
      result.hostedAlternative?.providersMatched.map((p) => p.label ?? '').join(' ') ?? '';
    assert.doesNotMatch(hostedLabels, /v4 flash|V4/i);
  });

  it('keeps R1 Distill hosted keys specific (not full R1 / bare deepseek)', () => {
    const profile = findInferenceModel('DeepSeek R1 Distill 32B');
    assert.ok(profile);
    const keys = profile.hostedCatalogKeys ?? [];
    assert.ok(keys.some((k) => /distill/i.test(k)));
    assert.ok(!keys.some((k) => /^deepseek r1$/i.test(k.trim())));
    assert.ok(!keys.some((k) => /^deepseek$/i.test(k.trim())));
    const result = recommendInferenceInfra({model: 'DeepSeek R1 Distill 32B', maxConfigs: 2});
    assert.equal(result.ok, true);
    const hostedLabels =
      result.hostedAlternative?.providersMatched.map((p) => p.label ?? '').join(' ') ?? '';
    assert.doesNotMatch(hostedLabels, /v4 flash|V3\.2|v3\.2/i);
  });

  it('exposes gpuMemoryGb on host for sidebar re-quote parity', () => {
    const result = recommendInferenceInfra({model: 'gpt-oss-120b', maxConfigs: 2});
    assert.equal(result.ok, true);
    const h100 = result.configs?.find((c) => c.gpuFamily === 'H100' && c.gpuCount === 1);
    assert.ok(h100?.host, 'expected H100 host shape');
    assert.equal(h100?.host?.gpuMemoryGb, 80);
  });

  it('sizes Kimi K3 as cluster-scale with B300 primary, not a fake single-GPU recipe', () => {
    const result = recommendInferenceInfra({model: 'кимика 3', maxConfigs: 3});
    assert.equal(result.ok, true);
    assert.equal(result.model?.parameterCountB, 2800);
    assert.equal(result.model?.deployment, 'weights-pending');
    assert.equal(result.primaryRecommendation?.gpuFamily, 'B300');
    assert.equal(result.primaryRecommendation?.gpuCount, 8);
    assert.equal(result.configs?.[0]?.host?.dedicated, true);
    assert.ok(result.configs?.[0]?.best?.totalMonth != null, 'dedicated B300 must quote');
    assert.equal(defaultPricedConfigIndex(result.configs ?? []), 0);
    assert.ok(!result.configs?.some((c) => c.gpuCount === 1));
    assert.ok(result.answerHint?.includes('64') || result.caveats?.some((c) => c.includes('64')));
  });

  it('defaultPricedConfigIndex skips unpriced rows', () => {
    assert.equal(
      defaultPricedConfigIndex([
        {best: null},
        {best: {totalMonth: 1_000_000}},
        {best: {totalMonth: 500_000}},
      ]),
      1,
    );
    assert.equal(defaultPricedConfigIndex([{best: null}, {best: null}]), 0);
  });

  it('includes Qwen 3.8 as weights-pending fat MoE', () => {
    const result = recommendInferenceInfra({model: 'qwen 3.8', maxConfigs: 2});
    assert.equal(result.ok, true);
    assert.equal(result.model?.parameterCountB, 2400);
    assert.equal(result.model?.deployment, 'weights-pending');
    assert.ok(result.configs?.length);
  });

  it('quotes Qwen3-Coder-480B 4×H200 as full node, not GPU-only', () => {
    const result = recommendInferenceInfra({
      model: 'Qwen3 Coder 480B',
      quant: 'fp8',
      maxConfigs: 5,
    });
    assert.equal(result.ok, true);
    const h100 = result.configs?.find((c) => c.gpuFamily === 'H100' && c.gpuCount === 8);
    const h200 = result.configs?.find((c) => c.gpuFamily === 'H200' && c.gpuCount === 4);
    assert.ok(h100?.host && !h100.host.unitOnly);
    assert.equal(h100?.host?.vcpu, 160);
    assert.equal(h100?.host?.ramGiB, 1488);
    // Selectel GPU Line publishes 4× H200 @ 48 vCPU / 480 GiB (not a scaled VK 1×).
    assert.ok(h200?.host && !h200.host.unitOnly, '4×H200 must assume a full host');
    assert.equal(h200?.host?.vcpu, 48);
    assert.equal(h200?.host?.ramGiB, 480);
    assert.ok((h200?.best?.totalMonth ?? 0) > 1_690_000, 'must include host above card-only floor');
    assert.ok(
      (h200?.best?.totalMonth ?? 0) < (h100?.best?.totalMonth ?? 0),
      '4×H200 full node should still undercut 8×H100',
    );
    assert.ok(h200?.quotes.every((q) => q.scope !== 'gpu-only'));
  });

  it('sizes Qwen3-Coder-Next on 1–2×GPU ladder, not 8×H100 from 480B', () => {
    const result = recommendInferenceInfra({model: 'Qwen3-Coder-Next', maxConfigs: 5});
    assert.equal(result.ok, true);
    assert.equal(result.model?.id, 'qwen3-coder-next');
    assert.equal(result.model?.parameterCountB, 80);
    assert.equal(result.model?.activeParameterCountB, 3);
    assert.equal(result.model?.contextDefault, 262_144);
    assert.equal(result.primaryRecommendation?.gpuCount, 1);
    assert.equal(result.primaryRecommendation?.gpuFamily, 'H100');
    assert.equal(result.primaryRecommendation?.quant, 'int4');
    assert.ok(result.configs?.some((c) => c.gpuFamily === 'H200' && c.gpuCount === 1 && c.quant === 'fp8'));
    assert.ok(result.configs?.some((c) => c.gpuFamily === 'H100' && c.gpuCount === 2 && c.quant === 'fp8'));
    assert.ok(!result.configs?.some((c) => c.gpuCount >= 8));
    const hosted = result.hostedAlternative?.providersMatched?.[0];
    assert.ok(hosted?.provider === 'Cloud.ru');
    assert.ok(hosted?.inputMonth != null || hosted?.cheapestMonth != null);
    assert.ok(result.hostedAlternative?.note?.includes('input'));
  });

  it('keeps explicit quant filter (no silent fallback to Auto recipes)', () => {
    const bf16 = recommendInferenceInfra({
      model: 'Qwen3-Coder-Next',
      quant: 'bf16',
      maxConfigs: 5,
    });
    assert.equal(bf16.ok, true);
    assert.ok(bf16.configs?.length);
    assert.ok(bf16.configs?.every((c) => c.quant === 'bf16'));
    assert.ok(!bf16.configs?.some((c) => c.quant === 'int4' || c.quant === 'fp8'));

    const int8 = recommendInferenceInfra({
      model: 'Qwen3-Coder-Next',
      quant: 'int8',
      maxConfigs: 5,
    });
    assert.equal(int8.ok, true);
    assert.equal(int8.configs?.length ?? 0, 0);
  });

  it('is reachable via runToolSync', () => {
    const raw = runToolSync(
      'recommend_inference_infra',
      JSON.stringify({model: 'Qwen3 32B', maxConfigs: 2}),
    );
    const parsed = JSON.parse(raw) as {ok: boolean; configs?: unknown[]};
    assert.equal(parsed.ok, true);
    assert.ok(parsed.configs?.length);
  });
});

describe('gated tools latency contract', () => {
  it('keeps gated recommend tool out of baseline CHAT_TOOLS', () => {
    // Baseline = 6 primitives + 4 shortcuts (search_prices/get_quote/compare_unit_price/fit_budget).
    assert.equal(CHAT_TOOLS.length, 10);
    const names = CHAT_TOOLS.map((t) => t.function.name);
    assert.ok(!names.includes('recommend_inference_infra' as (typeof names)[number]));
    assert.ok(names.includes('compose_solution'));
    assert.ok(names.includes('search_catalog'));
  });

  it('adds recommend tool only in CHAT_TOOLS_WITH_INFERENCE', () => {
    assert.equal(CHAT_TOOLS_WITH_INFERENCE.length, 11);
    const names = CHAT_TOOLS_WITH_INFERENCE.map(
      (t) => (t as {function: {name: string}}).function.name,
    );
    assert.ok(names.includes('recommend_inference_infra'));
  });
});

describe('fast-path inference chips', () => {
  it('routes GLM infra chip to recommend_inference_infra', () => {
    const plan = matchFastPath(
      'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    );
    assert.ok(plan);
    assert.equal(plan!.tools[0]?.name, 'recommend_inference_infra');
  });

  it('routes Kimi K3 / Qwen 3.8 / Coder-Next infra chips to recommend_inference_infra', () => {
    const kimi = matchFastPath(
      'Какая инфраструктура нужна, чтобы развернуть Kimi K3 self-host в РФ?',
    );
    assert.equal(kimi?.tools[0]?.name, 'recommend_inference_infra');
    assert.equal((kimi?.tools[0]?.args as {model?: string})?.model, 'Kimi K3');

    const qwen = matchFastPath(
      'Какая инфраструктура нужна, чтобы развернуть Qwen 3.8 self-host в РФ?',
    );
    assert.equal(qwen?.tools[0]?.name, 'recommend_inference_infra');
    assert.equal((qwen?.tools[0]?.args as {model?: string})?.model, 'Qwen 3.8');

    const coder = matchFastPath(
      'Какая инфраструктура нужна, чтобы развернуть Qwen3-Coder-Next self-host в РФ?',
    );
    assert.equal(coder?.tools[0]?.name, 'recommend_inference_infra');
    assert.equal((coder?.tools[0]?.args as {model?: string})?.model, 'Qwen3-Coder-Next');
  });

  it('does not route Kimi K3 phrasing into K2.6 fast-path', () => {
    for (const q of [
      'развернуть kimi k3',
      'инфраструктура для kimi k3',
      'Kimi K3 GPU',
      'развернуть химика три',
      'self-host химика 3',
    ]) {
      const plan = matchFastPath(q);
      assert.equal(plan?.tools[0]?.name, 'recommend_inference_infra', q);
      assert.equal((plan?.tools[0]?.args as {model?: string})?.model, 'Kimi K3', q);
    }

    const k26 = matchFastPath('развернуть kimi на своих GPU');
    assert.equal(k26?.tools[0]?.name, 'recommend_inference_infra');
    assert.equal((k26?.tools[0]?.args as {model?: string})?.model, 'Kimi K2.6');
  });

  it('routes budget chip to fit_budget', () => {
    const plan = matchFastPath('Бюджет 100 000 ₽/мес — что можно позволить?');
    assert.equal(plan?.tools[0]?.name, 'fit_budget');
    assert.equal((plan?.tools[0]?.args as {budgetMonthRub?: number})?.budgetMonthRub, 100_000);
  });

  it('keeps GLM token chip on search_prices', () => {
    const plan = matchFastPath('Сколько стоит GLM 5.2 у MWS за 1M токенов?');
    assert.ok(plan);
    assert.equal(plan!.tools[0]?.name, 'search_prices');
  });
});

describe('inference catalog host coverage', () => {
  it('popular / recommended models stay priced with multi-provider hosts where catalog allows', () => {
    const focus = getModelPickerCatalog().filter(
      (m) => (m.popular || m.recommended) && m.deployment !== 'api-only',
    );
    assert.ok(focus.length >= 6, `expected popular/recommended self-host set, got ${focus.length}`);

    for (const item of focus) {
      const result = recommendInferenceInfra({model: item.displayName, maxConfigs: 5});
      assert.equal(result.ok, true, item.displayName);
      assert.ok(result.configs?.length, `${item.displayName}: no configs`);

      for (const c of result.configs!) {
        const providers = (c.quotes ?? []).map((q) => q.provider);
        const label = `${item.displayName} ${c.gpuCount}×${c.gpuFamily} ${c.quant}`;
        // Dedicated / GPU-only rows may be single-provider; full hosts must quote.
        if (c.host?.dedicated || c.host?.unitOnly) {
          assert.ok(providers.length >= 1, `${label}: unpriced`);
          continue;
        }
        assert.ok(providers.length >= 1, `${label}: unpriced full host`);
        assert.ok(c.host?.vcpu && c.host.ramGiB, `${label}: missing host shape`);

        // H200×8 must keep the VK parity shelf (Selectel+T1+VK).
        if (c.gpuFamily === 'H200' && c.gpuCount === 8) {
          assert.equal(c.host.vcpu, 240, `${label}: expected 240/2048 parity host`);
          assert.equal(c.host.ramGiB, 2048, `${label}: expected 240/2048 parity host`);
          assert.ok(providers.includes('Selectel'), `${label}: Selectel missing`);
          assert.ok(providers.includes('T1 Cloud'), `${label}: T1 missing`);
          assert.ok(providers.includes('VK Cloud'), `${label}: VK missing`);
        }
      }
    }
  });

  it('never picks a published host with worse provider coverage than another exact shape', () => {
    const selfHost = INFERENCE_MODELS.filter((m) => (m.deployment ?? 'self-host') !== 'api-only');
    const gaps: string[] = [];

    for (const profile of selfHost) {
      const result = recommendInferenceInfra({model: profile.displayName, maxConfigs: 5});
      if (!result.ok || !result.configs?.length) continue;

      for (const c of result.configs) {
        const host = c.host;
        if (!host || host.unitOnly || host.dedicated || !host.vcpu || !host.ramGiB) continue;
        const got = c.quotes?.length ?? 0;
        const max = maxPublishedHostCoverage(c.gpuFamily, c.gpuCount, host.gpuMemoryGb);
        if (max > got) {
          gaps.push(
            `${profile.displayName} ${c.gpuCount}×${c.gpuFamily} ${c.quant}: host ${host.vcpu}/${host.ramGiB} → ${got} providers < max ${max}`,
          );
        }
      }
    }

    assert.deepEqual(gaps, [], gaps.join('\n'));
  });
});
