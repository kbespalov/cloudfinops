import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {planFromHomeChipId} from '@/lib/chat/fast-path';
import {HOME_EXAMPLES, chatUrlForExample, chatUrlForQuery} from './homePrompts';

describe('homePrompts deep links', () => {
  it('chatUrlForQuery keeps free-text links without fp', () => {
    const url = chatUrlForQuery('Сравни ВМ 8 vCPU');
    assert.match(url, /^\/chat\?q=/);
    assert.doesNotMatch(url, /[?&]fp=/);
  });

  it('chatUrlForExample attaches typed fp id for chips', () => {
    const example = HOME_EXAMPLES.find((e) => e.id === 'vm');
    assert.ok(example);
    const url = chatUrlForExample(example!);
    assert.match(url, /[?&]fp=vm(?:&|$)/);
    assert.match(url, /[?&]q=/);
  });

  it('every HOME_EXAMPLES chip has unique id, fp deep-link, and server plan', () => {
    const ids = new Set<string>();
    for (const example of HOME_EXAMPLES) {
      assert.ok(example.id, `missing id for ${example.label}`);
      assert.equal(ids.has(example.id), false, `duplicate chip id ${example.id}`);
      ids.add(example.id);

      const url = chatUrlForExample(example);
      const params = new URL(url, 'https://cloudfinops.ru').searchParams;
      assert.equal(params.get('fp'), example.id);
      assert.equal(params.get('q'), example.prompt);

      const plan = planFromHomeChipId(example.id);
      assert.ok(plan, `no server plan for chip ${example.id}`);
      assert.equal(plan!.id, example.id);
      assert.ok(plan!.tools.length >= 1, `empty tools for chip ${example.id}`);
    }
  });
});
