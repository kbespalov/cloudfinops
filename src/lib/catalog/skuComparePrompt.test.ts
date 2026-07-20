import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {chatUrlForQuery} from '@/components/home/homePrompts';
import {catalog, type CatalogMeter} from '@/lib/catalog';
import {
  aiModelLabelForPrompt,
  buildSkuComparePrompt,
  buildSkuSelfHostPrompt,
  canSelfHostAiMeter,
} from '@/lib/catalog/skuComparePrompt';

function fixtureMeter(overrides: Partial<CatalogMeter> = {}): CatalogMeter {
  return {
    id: 'test.vcpu',
    sku: 'yandex.compute.ice-lake.vcpu',
    name: 'Ice Lake 100% vCPU',
    meter: 'compute.vcpu',
    status: 'available',
    pricingMode: 'unit',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    layer: 'iaas',
    service: 'compute',
    category: 'compute',
    categoryKey: 'compute',
    region: 'ru-central1',
    effectiveFrom: null,
    checkedAt: '2026-07-17',
    sourceRefs: [],
    dimensions: {guaranteedVcpuShare: '100%'},
    notes: null,
    priceProvenance: null,
    unitQuantity: 'vCPU',
    unitPeriod: 'hour',
    nativeAmount: '1.2345',
    nativeVat: 'included',
    normalizedAmount: '1.2345',
    normalizedPeriod: 'hour',
    normalizedVat: 'included',
    currency: 'RUB',
    cpuPlatformFamily: 'ice-lake',
    purchaseModel: 'on-demand',
    comparableTier: null,
    synthetic: false,
    ...overrides,
  };
}

describe('buildSkuComparePrompt', () => {
  it('anchors SKU, provider, category and asks for nearest analogs', () => {
    const prompt = buildSkuComparePrompt(fixtureMeter(), 'month');

    assert.match(prompt, /Сравни с другими провайдерами/);
    assert.match(prompt, /yandex\.compute\.ice-lake\.vcpu/);
    assert.match(prompt, /Yandex Cloud/);
    assert.match(prompt, /Категория: Compute/);
    assert.match(prompt, /Ice Lake|ice-lake/i);
    assert.match(prompt, /Цена сейчас:/);
    assert.match(prompt, /ближайшие аналоги/);
    assert.match(prompt, /одной таблице/);
  });

  it('mentions missing price when amount is absent', () => {
    const prompt = buildSkuComparePrompt(
      fixtureMeter({
        nativeAmount: null,
        normalizedAmount: null,
      }),
      'month',
    );

    assert.match(prompt, /цена в каталоге не указана/);
  });

  it('includes disk IOPS base/max when dimensions are present', () => {
    const prompt = buildSkuComparePrompt(
      fixtureMeter({
        sku: 'selectel.disk.fast-ssd-v2-iops',
        name: 'Дополнительные IOPS быстрого SSD v2',
        meter: 'storage.block.iops',
        category: 'iaas.storage.block',
        categoryKey: 'compute',
        provider: 'selectel',
        providerName: 'Selectel',
        unitQuantity: 'IOPS',
        dimensions: {
          diskType: 'fast-ssd-v2',
          includedIops: 25000,
          maximumIops: 75000,
          iopsChargedSeparately: true,
        },
      }),
      'unit',
    );

    assert.match(prompt, /IOPS диска: база 25\s?000/);
    assert.match(prompt, /макс\. 75\s?000/);
    assert.match(prompt, /сверх базы/);
  });

  it('describes fixed IOPS without implying a separate IOPS rate', () => {
    const prompt = buildSkuComparePrompt(
      fixtureMeter({
        sku: 't1.disk.basic',
        name: 'Дисковое пространство Basic',
        meter: 'storage.block.capacity',
        category: 'iaas.storage.block',
        categoryKey: 'compute',
        provider: 't1-cloud',
        providerName: 'T1 Cloud',
        unitQuantity: 'GiB',
        dimensions: {
          diskType: 'basic',
          includedIops: 3000,
          maximumIops: 3000,
          iopsChargedSeparately: false,
        },
      }),
      'unit',
    );

    assert.match(prompt, /фиксировано до 3\s?000/);
    assert.doesNotMatch(prompt, /сверх базы/);
  });

  it('builds a chat deeplink that encodes the full prompt', () => {
    const meter = catalog.meters.find((m) => m.provider === 'yandex-cloud') ?? catalog.meters[0]!;
    const prompt = buildSkuComparePrompt(meter, 'month');
    const url = chatUrlForQuery(prompt);

    assert.ok(url.startsWith('/chat?q='));
    const q = decodeURIComponent(url.slice('/chat?q='.length));
    assert.equal(q, prompt);
    assert.match(q, new RegExp(meter.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

describe('buildSkuSelfHostPrompt', () => {
  it('allows self-host CTA only for open-weight AI meters', () => {
    const open = fixtureMeter({
      categoryKey: 'ai',
      category: 'ai.inference',
      sku: 'cloudru.ai.qwen3.6-35b-a3b.input',
      name: 'Qwen3.6-35B-A3B · input',
      meter: 'ai.tokens.input',
      unitQuantity: '1M-token',
      dimensions: {
        modelFamily: 'Qwen3.6-35B-A3B',
        modelId: 'qwen3.6-35b-a3b',
        parameterCountB: 35,
        activeParameterCountB: 3,
        tokenDirection: 'input',
        openWeights: true,
      },
    });
    const closed = fixtureMeter({
      categoryKey: 'ai',
      category: 'ai.inference',
      sku: 'yandex.ai.alice-ai-llm.input',
      name: 'Alice AI LLM · input',
      meter: 'ai.tokens.input',
      unitQuantity: '1M-token',
      dimensions: {
        modelFamily: 'Alice AI LLM',
        modelId: 'alice-ai-llm',
        openWeights: false,
        tokenDirection: 'input',
      },
    });

    assert.equal(canSelfHostAiMeter(open), true);
    assert.equal(canSelfHostAiMeter(closed), false);
    assert.equal(aiModelLabelForPrompt(open), 'Qwen3.6-35B-A3B');

    const prompt = buildSkuSelfHostPrompt(open);
    assert.match(prompt, /развернуть «Qwen3\.6-35B-A3B» \(35B · 3B active\)/);
    assert.match(prompt, /self-host \/ dedicated/);
    assert.match(prompt, /число карт/);
    assert.match(prompt, /hosted API|токенам/i);
    assert.doesNotMatch(prompt, /1M ток/);

    const url = chatUrlForQuery(prompt);
    assert.ok(url.startsWith('/chat?q='));
    assert.equal(decodeURIComponent(url.slice('/chat?q='.length)), prompt);
  });

  it('does not treat compute meters as AI self-host CTAs', () => {
    assert.equal(canSelfHostAiMeter(fixtureMeter()), false);
  });
});
