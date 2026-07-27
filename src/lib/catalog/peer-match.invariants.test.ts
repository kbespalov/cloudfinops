/**
 * P0 invariants: symmetry, catalog-order independence, exact/functional partition.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalog} from '@/lib/catalog';
import {classifyPeer, extractPeerFeatures, selectPeersForCompare} from './peer-match';
import {bySku, classifyPair} from './peer-match-p0-helpers';

describe('peer-match.invariants', () => {
  it('classification-symmetry (traffic-internet-vs-interzone)', () => {
    const a = extractPeerFeatures(bySku('cloudru.traffic.internet.egress'));
    const b = extractPeerFeatures(bySku('mws.traffic.interzone.egress'));
    const ab = classifyPeer(a, b);
    const ba = classifyPeer(b, a);
    assert.equal(ab.mode, ba.mode);
    assert.equal(ab.priceEligible, ba.priceEligible);
    assert.deepEqual(
      new Set(ab.hardDiffs.map((d) => d.dimension)),
      new Set(ba.hardDiffs.map((d) => d.dimension)),
    );
  });

  it('catalog-order-independence', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const a = selectPeersForCompare(seed, catalog.meters);
    const rev = [...catalog.meters].reverse();
    const b = selectPeersForCompare(seed, rev);
    assert.deepEqual(
      a.providerSelections.map((p) => [
        p.provider,
        p.exactPriceEligible?.meter.sku ?? null,
        p.exactPriceIneligible?.meter.sku ?? null,
        p.functional?.meter.sku ?? null,
      ]),
      b.providerSelections.map((p) => [
        p.provider,
        p.exactPriceEligible?.meter.sku ?? null,
        p.exactPriceIneligible?.meter.sku ?? null,
        p.functional?.meter.sku ?? null,
      ]),
    );
  });

  it('partition-before-provider-dedup', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    const exact = new Set(
      sel.retrieved.filter((r) => r.classification.mode === 'exact').map((r) => r.meter.id),
    );
    const func = new Set(
      sel.retrieved.filter((r) => r.classification.mode === 'functional').map((r) => r.meter.id),
    );
    for (const id of exact) assert.equal(func.has(id), false);
    assert.equal(exact.size + func.size, sel.retrieved.length);
  });

  it('classifyPeer does not read price (swap + artificial amount)', () => {
    const {classification: c1} = classifyPair(
      'cloudru.ai.gpt-oss-120b.input',
      'mws.ai.gpt-oss-120b.input',
    );
    const a = extractPeerFeatures(bySku('cloudru.ai.gpt-oss-120b.input'));
    const b = extractPeerFeatures(bySku('mws.ai.gpt-oss-120b.input'));
    const c2 = classifyPeer(b, a);
    assert.equal(c1.mode, c2.mode);
    assert.equal(c1.priceEligible, c2.priceEligible);
  });
});
