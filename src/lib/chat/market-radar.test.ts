import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {marketRadar} from './market-radar';
import {CHAT_TOOLS, runToolSync} from './tools';

describe('marketRadar', () => {
  it('builds default basket snapshot with stats', () => {
    const r = marketRadar();
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'snapshot');
    assert.ok(r.basket.includes('vcpu'));
    assert.ok(r.basket.includes('gpu_h100'));
    assert.ok(r.series.length >= 5);
    const vcpu = r.series.find((s) => s.id === 'vcpu');
    assert.ok(vcpu?.stats);
    assert.ok(vcpu!.stats!.count >= 2);
    assert.ok(vcpu!.stats!.median > 0);
    assert.ok(vcpu!.providers.length >= 2);
    assert.ok(r.highlights.length >= 1);
    assert.ok(!/~\d{3,}/.test(JSON.stringify(r.series.map((s) => s.insight))));
  });

  it('supports narrow basket and outliers mode', () => {
    const r = marketRadar({basket: ['s3_standard', 'k8s_basic'], mode: 'outliers'});
    assert.equal(r.ok, true);
    assert.deepEqual(r.basket, ['s3_standard', 'k8s_basic']);
    assert.equal(r.series.length, 2);
    for (const s of r.series) {
      assert.ok(s.stats || s.insight.includes('не найден'), s.id);
    }
  });

  it('marks H100 insight as card-only caution', () => {
    const r = marketRadar({basket: ['gpu_h100']});
    const gpu = r.series[0];
    assert.ok(gpu);
    assert.match(gpu.insight, /Card-only|хост|H100/i);
  });

  it('is registered and callable via runToolSync', () => {
    assert.ok(CHAT_TOOLS.some((t) => t.function.name === 'market_radar'));
    const raw = runToolSync(
      'market_radar',
      JSON.stringify({basket: ['vcpu', 'ram'], mode: 'snapshot'}),
    );
    const parsed = JSON.parse(raw) as {ok?: boolean; series?: unknown[]};
    assert.equal(parsed.ok, true, raw);
    assert.ok(Array.isArray(parsed.series) && parsed.series.length === 2);
  });
});
