import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalog} from '@/lib/catalog';
import {canFindSimilar} from '@/lib/catalog/find-similar';
import {compareSimilarPeers} from './similar-peers';
import {CHAT_TOOLS, runToolSync} from './tools';

describe('compare_similar_peers', () => {
  it('is registered in baseline CHAT_TOOLS', () => {
    assert.ok(
      (CHAT_TOOLS as readonly {function: {name: string}}[])
        .map((t) => t.function.name)
        .includes('compare_similar_peers'),
    );
  });

  it('returns peers around a find-similar seed', () => {
    const seed = catalog.meters.find(
      (m) => m.status === 'available' && m.categoryKey === 'kubernetes' && canFindSimilar(m),
    );
    assert.ok(seed, 'expected a kubernetes seed');
    const out = compareSimilarPeers({sku: seed.sku, mode: 'peers'});
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.mode, 'peers');
    assert.ok(out.peers.length >= 1);
    assert.equal(out.seed.sku, seed.sku);
    assert.ok(out.banner);
  });

  it('lists anomaly groups above spread threshold', () => {
    const out = compareSimilarPeers({mode: 'anomalies', minSpreadPct: 50, limit: 5});
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.mode, 'anomalies');
    assert.ok(Array.isArray(out.groups));
    for (const g of out.groups) {
      const func = g.functionalSpreadPct as number | null;
      const exact = g.exactPESpreadPct as number | null;
      assert.ok((func != null && func >= 50) || (exact != null && exact >= 50));
    }
  });

  it('runs via runToolSync', () => {
    const raw = runToolSync(
      'compare_similar_peers',
      JSON.stringify({mode: 'anomalies', minSpreadPct: 80, limit: 3}),
    );
    const parsed = JSON.parse(raw) as {ok: boolean; mode: string; groups: unknown[]};
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mode, 'anomalies');
    assert.ok(Array.isArray(parsed.groups));
  });
});
