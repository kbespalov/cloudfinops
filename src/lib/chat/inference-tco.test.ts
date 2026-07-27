import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {compareInferenceTco} from './inference-tco';
import {CHAT_TOOLS, runToolSync} from './tools';

describe('compareInferenceTco', () => {
  it('requires model', () => {
    const r = compareInferenceTco({model: ''});
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  it('computes hosted vs self-host TCO for gpt-oss-120b', () => {
    const r = compareInferenceTco({
      model: 'gpt-oss-120b',
      tokensPerDay: 1_000_000,
      inputShare: 0.7,
      outputShare: 0.3,
    });
    assert.equal(r.ok, true);
    assert.equal(r.assumptions.mixLabel, '70/30');
    assert.equal(r.assumptions.tokensPerMonth, 30_000_000);
    assert.ok(r.hosted.available, 'hosted API expected in catalog');
    assert.ok(r.hosted.best?.monthlyRub != null && r.hosted.best.monthlyRub > 0);
    assert.ok(r.hosted.best?.blendPerMillionRub != null);
    assert.ok(r.selfHost.available, 'self-host GPU quote expected');
    assert.ok(r.selfHost.best?.monthlyRub != null && r.selfHost.best.monthlyRub > 0);
    assert.ok(r.breakEven.tokensPerDay != null && r.breakEven.tokensPerDay > 0);
    assert.equal(r.sensitivity.length, 3);
    assert.ok(r.recommendation.length > 10);
    assert.ok(!Number.isNaN(r.hosted.best!.monthlyRub));
  });

  it('higher token volume increases hosted monthly cost', () => {
    const low = compareInferenceTco({model: 'gpt-oss-120b', tokensPerDay: 100_000});
    const high = compareInferenceTco({model: 'gpt-oss-120b', tokensPerDay: 10_000_000});
    assert.ok(low.hosted.best?.monthlyRub != null);
    assert.ok(high.hosted.best?.monthlyRub != null);
    assert.ok(high.hosted.best!.monthlyRub! > low.hosted.best!.monthlyRub!);
  });

  it('is registered in CHAT_TOOLS and runnable via runToolSync', () => {
    assert.ok(CHAT_TOOLS.some((t) => t.function.name === 'compare_inference_tco'));
    const raw = runToolSync(
      'compare_inference_tco',
      JSON.stringify({model: 'gpt-oss-120b', tokensPerDay: 500000}),
    );
    const parsed = JSON.parse(raw) as {ok?: boolean; error?: string};
    assert.equal(parsed.ok, true, raw);
  });
});
