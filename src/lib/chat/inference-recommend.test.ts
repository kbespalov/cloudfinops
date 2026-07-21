import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {findInferenceModel} from '@/data/inference-models';
import {matchInferenceIntent} from './inference-intent';
import {defaultPricedConfigIndex, recommendInferenceInfra} from './inference-recommend';
import {matchFastPath} from './fast-path';
import {CHAT_TOOLS, CHAT_TOOLS_WITH_INFERENCE, runToolSync} from './tools';

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
    // FP8 weights ~700 GiB — 4×H200 (564) must never appear as a viable node.
    assert.ok(
      !result.configs!.some((c) => c.quant === 'fp8' && c.gpuCount === 4),
      '4×H200 FP8 must be filtered (weights do not fit)',
    );
    assert.ok(
      result.configs!.some((c) => c.quant === 'fp8' && c.gpuCount === 8 && c.gpuFamily === 'H200'),
    );
    assert.ok(result.disclaimer);
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
    assert.ok(result.primaryRecommendation?.why?.includes('H100'));
    assert.ok(result.configs?.[0]?.why?.length);
    assert.ok(result.answerHint?.includes('###'));
    assert.ok(result.answerHint?.includes('Почему так'));
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
  it('keeps baseline CHAT_TOOLS at 4 schemas', () => {
    assert.equal(CHAT_TOOLS.length, 4);
    const names = CHAT_TOOLS.map((t) => t.function.name);
    assert.ok(!names.includes('recommend_inference_infra' as (typeof names)[number]));
  });

  it('adds recommend tool only in CHAT_TOOLS_WITH_INFERENCE', () => {
    assert.equal(CHAT_TOOLS_WITH_INFERENCE.length, 5);
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
