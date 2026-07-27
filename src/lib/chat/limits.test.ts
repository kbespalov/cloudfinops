import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  CHAT_LIMITS,
  ChatRateLimiter,
  estimateMessagesTokens,
  estimateTokens,
  reserveTokensForRequest,
} from './limits';

describe('chat limits', () => {
  it('estimates tokens high enough for Cyrillic', () => {
    const text = 'Сколько стоит H100 у Selectel?';
    assert.equal(estimateTokens(text), Math.ceil(text.length / 2));
    assert.ok(estimateTokens(text) >= 10);
  });

  it('estimates message tokens including tool_calls', () => {
    const n = estimateMessagesTokens([
      {role: 'user', content: 'abcde'}, // 3
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: {name: 'get_quote', arguments: '{"vcpu":4}'},
          },
        ],
      },
    ]);
    assert.ok(n >= 3 + estimateTokens('get_quote') + estimateTokens('{"vcpu":4}'));
  });

  it('reserves output + tool-loop buffer', () => {
    const reserved = reserveTokensForRequest(1000);
    assert.equal(reserved, 1000 + CHAT_LIMITS.maxOutputTokens + 800);
    const llmOnly = reserveTokensForRequest(1000, {llmOnly: true});
    assert.equal(
      llmOnly,
      1000 + CHAT_LIMITS.maxToolRounds * CHAT_LIMITS.maxOutputTokens + CHAT_LIMITS.maxOutputTokens,
    );
    // LLM-only reservation is much heavier (full tool-loop headroom).
    assert.ok(llmOnly > reserved * 3);
  });
});

describe('ChatRateLimiter', () => {
  it('rejects after maxRequestsPerIpPerMinute', () => {
    const lim = new ChatRateLimiter();
    const ip = '203.0.113.10';
    for (let i = 0; i < CHAT_LIMITS.maxRequestsPerIpPerMinute; i++) {
      const ok = lim.tryAcquire(ip, 1);
      assert.equal(ok.ok, true, `acquire #${i + 1}`);
    }
    const denied = lim.tryAcquire(ip, 1);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.reason, 'ip_requests');
      assert.ok(denied.retryAfterSec >= 1);
      assert.match(denied.detail, /лимит 20\/мин/i);
    }
    // Other IP still allowed.
    assert.equal(lim.tryAcquire('203.0.113.11', 1).ok, true);
  });

  it('rejects when global token budget would exceed', () => {
    const lim = new ChatRateLimiter();
    const chunk = 40_000;
    assert.equal(lim.tryAcquire('10.0.0.1', chunk).ok, true);
    assert.equal(lim.tryAcquire('10.0.0.2', chunk).ok, true);
    // 40k+40k+40k = 120k > 100k
    const denied = lim.tryAcquire('10.0.0.3', chunk);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.reason, 'global_tokens');
      assert.ok(denied.retryAfterSec >= 1);
      assert.match(denied.detail, /токен/i);
    }
    assert.equal(lim.snapshot().globalTokensUsed, 80_000);
  });

  it('llm-only reservations hit global_tokens in few turns', () => {
    const lim = new ChatRateLimiter();
    const reserved = reserveTokensForRequest(2_000, {llmOnly: true});
    // ~2000 + 6*1200 + 1200 = 10400 per turn → ~9 fits under 100k, 10th may exceed.
    let okCount = 0;
    let denied: ReturnType<ChatRateLimiter['tryAcquire']> | null = null;
    for (let i = 0; i < 20; i++) {
      const r = lim.tryAcquire(`198.51.100.${i}`, reserved);
      if (r.ok) okCount += 1;
      else {
        denied = r;
        break;
      }
    }
    assert.ok(okCount >= 8 && okCount <= 12, `expected ~9–10 ok, got ${okCount}; reserved=${reserved}`);
    assert.ok(denied && !denied.ok);
    if (denied && !denied.ok) {
      assert.equal(denied.reason, 'global_tokens');
    }
  });

  it('checks IP limit before global tokens (same IP flood)', () => {
    const lim = new ChatRateLimiter();
    const ip = '192.0.2.50';
    for (let i = 0; i < CHAT_LIMITS.maxRequestsPerIpPerMinute; i++) {
      assert.equal(lim.tryAcquire(ip, 1).ok, true);
    }
    const denied = lim.tryAcquire(ip, CHAT_LIMITS.maxGlobalTokensPerMinute);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.reason, 'ip_requests');
  });
});
