import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalog,
  extractOpenWeights,
  isAiTokenMeter,
  isOpenWeightAiMeter,
} from '@/lib/catalog';
import {canSelfHostAiMeter} from '@/lib/catalog/skuComparePrompt';

describe('AI openWeights dimension', () => {
  it('marks every AI model-token meter openWeights true|false (no missing)', () => {
    const modelTokens = catalog.meters.filter(
      (m) => m.categoryKey === 'ai' && isAiTokenMeter(m) && m.dimensions.modelId,
    );
    assert.ok(modelTokens.length >= 70);
    const missing = modelTokens.filter((m) => extractOpenWeights(m) == null);
    assert.deepEqual(
      missing.map((m) => m.sku),
      [],
      'AI model token SKUs must set dimensions.openWeights',
    );
  });

  it('keeps proprietary Alice / YandexGPT / GigaChat closed', () => {
    for (const id of ['alice-ai-llm', 'alice-ai-llm-flash', 'yandexgpt-pro-5', 'gigachat-2-max']) {
      const meters = catalog.meters.filter((m) => m.dimensions.modelId === id);
      assert.ok(meters.length, `expected SKUs for ${id}`);
      for (const m of meters) {
        assert.equal(extractOpenWeights(m), false, m.sku);
        assert.equal(canSelfHostAiMeter(m), false, m.sku);
      }
    }
  });

  it('keeps Qwen / GLM / gpt-oss open for Развернуть CTA', () => {
    for (const id of ['qwen3.6-35b-a3b', 'glm-5.2', 'gpt-oss-120b']) {
      const meters = catalog.meters.filter((m) => m.dimensions.modelId === id);
      assert.ok(meters.length, `expected SKUs for ${id}`);
      for (const m of meters) {
        assert.equal(extractOpenWeights(m), true, m.sku);
        assert.equal(isOpenWeightAiMeter(m), true, m.sku);
        assert.equal(canSelfHostAiMeter(m), true, m.sku);
      }
    }
  });
});
