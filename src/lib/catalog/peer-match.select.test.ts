/**
 * P0 selection: provider representatives, sticky seed, rank/price/sku tie-breaks.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalog} from '@/lib/catalog';
import {
  comparePeersForPick,
  primaryPeerRows,
  retrieveFunctionalCandidates,
  selectPeersForCompare,
  sameProviderCheaperExact,
  type PeerRank,
} from './peer-match';
import {bySku} from './peer-match-p0-helpers';

describe('peer-match.select / algorithm', () => {
  it('selection-closer-expensive-beats-far-cheap', () => {
    const exactExpensive = {
      rank: [0, 0, 0, 0, 0] as PeerRank,
      price: 100,
      sku: 'exact-expensive',
    };
    const functionalCheap = {
      rank: [1, 0, 0, 0, 0] as PeerRank,
      price: 1,
      sku: 'functional-cheap',
    };
    // Within a bucket we only pick among same mode; across modes exact wins via cascade.
    assert.ok(comparePeersForPick(exactExpensive, functionalCheap, true) < 0);
  });

  it('selection-equal-rank-cheapest', () => {
    const a = {rank: [0, 0, 0, 0, 0] as PeerRank, price: 12, sku: 'peer-a'};
    const b = {rank: [0, 0, 0, 0, 0] as PeerRank, price: 10, sku: 'peer-b'};
    assert.ok(comparePeersForPick(b, a, true) < 0);
  });

  it('selection-stable-sku-final-tiebreak', () => {
    const a = {rank: [0, 0, 0, 0, 0] as PeerRank, price: 10, sku: 'provider.peer-a'};
    const b = {rank: [0, 0, 0, 0, 0] as PeerRank, price: 10, sku: 'provider.peer-b'};
    assert.ok(comparePeersForPick(a, b, true) < 0);
  });

  it('selection-seed-sticky', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    assert.equal(sel.seed.meter.sku, seed.sku);
    const rows = primaryPeerRows(sel);
    assert.equal(rows[0]?.meter.sku, seed.sku);
    assert.equal(
      rows.filter((r) => r.meter.provider === seed.provider).length,
      1,
      'seed provider appears once as sticky row',
    );
    const hint = sameProviderCheaperExact(sel);
    if (hint) {
      assert.notEqual(hint.sku, seed.sku);
      assert.equal(hint.provider, seed.provider);
    }
  });
});

describe('peer-match.select / catalog regressions', () => {
  it('keeps seed sticky and never swaps seed provider row', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    assert.equal(sel.seed.meter.id, seed.id);
    const rows = primaryPeerRows(sel);
    assert.equal(rows[0]?.meter.id, seed.id);
  });

  it('cascade-lake exact excludes preemptible', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    for (const r of sel.retrieved) {
      if (r.classification.mode !== 'exact') continue;
      assert.equal(r.features.hard.purchaseModel?.state, 'known');
      if (r.features.hard.purchaseModel?.state === 'known') {
        assert.equal(r.features.hard.purchaseModel.value, 'on-demand');
      }
    }
  });

  it('seed synthetic disables price comparison eligibility', () => {
    const seed = bySku('cloudru.compute.cascade-lake.vcpu.synthetic');
    const sel = selectPeersForCompare(seed, catalog.meters);
    assert.equal(sel.seed.priceEligibility.eligible, false);
    assert.ok(sel.seed.priceEligibility.reasons.includes('derived-synthetic'));
  });

  it('retrieval stays wide (includes preemptible as functional candidates)', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const retrieved = retrieveFunctionalCandidates(seed, catalog.meters);
    assert.ok(retrieved.some((m) => /preemptible/i.test(m.sku)));
  });

  it('K8s Medium seed lists Selectel/VK Small as functional, not exactPE', () => {
    const seed = bySku('t1.kubernetes.master-medium');
    const sel = selectPeersForCompare(seed, catalog.meters);
    const rows = primaryPeerRows(sel);
    const byProv = Object.fromEntries(rows.map((r) => [r.meter.provider, r]));
    assert.ok(byProv['selectel']);
    assert.ok(byProv['vk-cloud']);
    assert.equal(byProv['selectel']?.bucket, 'functional');
    assert.equal(byProv['vk-cloud']?.bucket, 'functional');
  });
});
