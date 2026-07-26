import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  formatFastPathAnswer,
  matchFastPath,
  tryFormatAgentToolAnswer,
} from '@/lib/chat/fast-path';
import {runToolSync} from '@/lib/chat/tools';
import {buildSkuComparePrompt} from '@/lib/catalog/skuComparePrompt';
import {catalog} from '@/lib/catalog';

describe('Cloud.ru 4vCPU/32GB product CTA', () => {
  it('routes to get_quote and formats a full-VM table without unit RAM', () => {
    const meter = catalog.meters.find((m) => m.sku === 'cloudru.compute.4vcpu-32gb');
    assert.ok(meter);
    const prompt = buildSkuComparePrompt(meter, 'month');
    const plan = matchFastPath(prompt);
    assert.ok(plan);
    assert.equal(plan.id, 'sku-compare');
    assert.equal(plan.tools[0]?.name, 'get_quote');
    assert.equal(plan.tools[0]?.args.vcpu, 4);
    assert.equal(plan.tools[0]?.args.ramGiB, 32);

    const argsJson = JSON.stringify(plan.tools[0]!.args);
    const raw = runToolSync('get_quote', argsJson);
    const data = JSON.parse(raw);
    assert.ok((data.quotes?.length ?? 0) >= 4, 'expected multi-provider quotes');
    for (const q of data.quotes) {
      assert.ok(q.total > 1000, `${q.provider} total too small for a VM: ${q.total}`);
    }

    const mdDirect = formatFastPathAnswer('sku-compare', [
      {name: 'get_quote', content: raw},
    ]);
    assert.ok(mdDirect);
    assert.match(mdDirect!, /4\s*vCPU|32\s*GiB/i);
    assert.doesNotMatch(mdDirect!, /GiB-RAM|preemptible RAM|GPU V100|gpu-v100/i);
    assert.match(mdDirect!, /Cloud\.ru/);
    assert.match(mdDirect!, /Selectel|Yandex|VK|MWS|T1/);

    const mdAgent = tryFormatAgentToolAnswer({
      userText: prompt,
      toolPayloads: [
        {
          name: 'get_quote',
          arguments: argsJson,
          content: raw,
        },
      ],
    });
    assert.ok(mdAgent);
    assert.doesNotMatch(mdAgent!, /GiB-RAM|preemptible RAM|GPU V100/i);
  });
});
