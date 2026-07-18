import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  extractJsonObjects,
  looksLikeToolCallLeak,
  recoverToolCallsFromContent,
  resolveToolCalls,
} from './tool-call-recovery';

const LEAK_FROM_SCREENSHOT = `We will call search_prices. We need to actually call the tool. We need to use the tool. Let's call search_prices. We need to actually produce a tool call. Now call. Now actual call: Let's call search_prices with query "Kubernetes". We need to produce JSON tool call. Okay. Now actual. Let's do it. Now. Okay, I'm going to call:

Now call. We need to output tool call JSON. Okay. Now: Let's do it. Now final. Okay, I will produce the tool call. Now. We need to output:

{
"query": "Kubernetes",
"category": null,
"filters": null,
"page": null,
"pageSize": null
}`;

describe('tool-call-recovery', () => {
  it('detects gpt-oss English tool-planning leak', () => {
    assert.equal(looksLikeToolCallLeak(LEAK_FROM_SCREENSHOT), true);
  });

  it('does not flag a normal Russian answer', () => {
    const answer =
      'В каталоге Kubernetes у российских провайдеров тарифицируется отдельно от ВМ. Уточните, нужен managed K8s или worker-ноды.';
    assert.equal(looksLikeToolCallLeak(answer), false);
  });

  it('extracts JSON objects and strips null/unknown keys', () => {
    const objects = extractJsonObjects(LEAK_FROM_SCREENSHOT);
    assert.equal(objects.length, 1);
    const recovered = recoverToolCallsFromContent(LEAK_FROM_SCREENSHOT);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].function.name, 'search_prices');
    assert.deepEqual(JSON.parse(recovered[0].function.arguments), {query: 'Kubernetes'});
  });

  it('recovers query from prose when JSON is missing', () => {
    const text =
      'We need to call search_prices with query "H100". Now produce tool call JSON.';
    const recovered = recoverToolCallsFromContent(text);
    assert.equal(recovered.length, 1);
    assert.deepEqual(JSON.parse(recovered[0].function.arguments), {query: 'H100'});
  });

  it('resolveToolCalls prefers native tool_calls', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: 'We will call search_prices',
      tool_calls: [
        {
          id: '1',
          type: 'function',
          function: {name: 'search_prices', arguments: '{"query":"K8s"}'},
        },
      ],
    });
    assert.equal(resolved.kind, 'tools');
    if (resolved.kind === 'tools') {
      assert.equal(resolved.recoveredFromLeak, false);
      assert.equal(resolved.toolCalls[0].function.arguments, '{"query":"K8s"}');
    }
  });

  it('resolveToolCalls recovers leak into tools', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: LEAK_FROM_SCREENSHOT,
    });
    assert.equal(resolved.kind, 'tools');
    if (resolved.kind === 'tools') {
      assert.equal(resolved.recoveredFromLeak, true);
      assert.equal(resolved.toolCalls[0].function.name, 'search_prices');
    }
  });

  it('resolveToolCalls marks unrecoverable leak', () => {
    const resolved = resolveToolCalls({
      role: 'assistant',
      content: 'We need to actually call the tool. Let us produce a tool call now. Final call.',
    });
    assert.equal(resolved.kind, 'leak_unrecoverable');
  });
});
