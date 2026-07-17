import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  CHAT_LIMITS,
  estimateTokens,
  reserveTokensForRequest,
} from './limits';

describe('chat limits', () => {
  it('estimates tokens high enough for Cyrillic', () => {
    const text = 'Сколько стоит H100 у Selectel?';
    assert.equal(estimateTokens(text), Math.ceil(text.length / 2));
    assert.ok(estimateTokens(text) >= 10);
  });

  it('reserves output + tool-loop buffer', () => {
    const reserved = reserveTokensForRequest(1000);
    assert.equal(reserved, 1000 + CHAT_LIMITS.maxOutputTokens + 1600);
  });
});
