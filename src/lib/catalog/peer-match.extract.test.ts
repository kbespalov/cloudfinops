/**
 * P0 extractor contracts (required hard keys, workload/route/allocation evidence).
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  assertCompletePeerFeatures,
  extractPeerFeatures,
  IncompletePeerFeaturesError,
  requiredHardDimensions,
} from './peer-match';
import {bySku} from './peer-match-p0-helpers';

describe('peer-match.extract / compute-general-workload-extractor', () => {
  it('maps unit vCPU without workloadFamily to known general (+ other hard keys)', () => {
    const f = extractPeerFeatures(bySku('cloudru.compute.cascade-lake.vcpu.synthetic'));
    assertCompletePeerFeatures(f);
    assert.deepEqual(f.hard.resourceKind, {state: 'known', value: 'vcpu'});
    assert.deepEqual(f.hard.purchaseModel, {state: 'known', value: 'on-demand'});
    // Project enum: dedicated ≡ published 100% / 1:1 share.
    assert.deepEqual(f.hard.shareFacet, {state: 'known', value: 'dedicated'});
    assert.deepEqual(f.hard.workloadClass, {state: 'known', value: 'general'});
    assert.deepEqual(f.priceDerivation, {state: 'known', value: 'derived-synthetic'});

    const mws = extractPeerFeatures(bySku('mws.compute.vcpu'));
    assert.deepEqual(mws.hard.workloadClass, {state: 'known', value: 'general'});
    assert.deepEqual(mws.priceDerivation, {state: 'known', value: 'atomic'});
  });

  it('keeps disk workloadClass n/a (not unknown)', () => {
    const f = extractPeerFeatures(bySku('cloudru.disk.ssd-nvme'));
    assert.deepEqual(f.hard.workloadClass, {state: 'not-applicable'});
    assert.deepEqual(f.hard.diskAttachment, {state: 'known', value: 'network'});
  });
});

describe('peer-match.extract / traffic + AI units', () => {
  it('extracts internet route for ingress and egress', () => {
    for (const sku of [
      'cloudru.traffic.internet.egress',
      'mws.traffic.internet.egress',
      'cloudru.traffic.internet.ingress',
      'mws.traffic.internet.ingress',
    ]) {
      const f = extractPeerFeatures(bySku(sku));
      assert.equal(f.hard.trafficRoute.state, 'known');
      if (f.hard.trafficRoute.state === 'known') {
        assert.equal(f.hard.trafficRoute.value, 'internet');
      }
    }
  });

  it('uses verified token-1M canonical unit for gpt-oss input', () => {
    const f = extractPeerFeatures(bySku('cloudru.ai.gpt-oss-120b.input'));
    assert.deepEqual(f.canonicalPriceUnit, {state: 'known', value: 'token-1M'});
    assert.equal(f.normalizationConfidence, 'verified');
  });
});

describe('peer-match.extract / completeness validation', () => {
  it('returns every required hard key for sample meters', () => {
    const samples = [
      bySku('t1.compute.a1.vcpu'),
      bySku('t1.disk.basic'),
      bySku('yc.traffic.internet.egress'),
      bySku('t1.kubernetes.master-small'),
      bySku('mws.ai.gpt-oss-120b.input'),
    ];
    for (const m of samples) {
      const f = extractPeerFeatures(m);
      assertCompletePeerFeatures(f);
      for (const key of requiredHardDimensions(f.category)) {
        assert.ok(key in f.hard, `${m.sku} missing ${key}`);
      }
    }
  });

  it('missing-required-hard-key-fails-validation', () => {
    const f = extractPeerFeatures(bySku('mws.compute.vcpu'));
    delete f.hard.purchaseModel;
    assert.throws(() => assertCompletePeerFeatures(f), (err: unknown) => {
      assert.ok(err instanceof IncompletePeerFeaturesError);
      assert.equal(err.key, 'purchaseModel');
      assert.equal(err.category, 'compute');
      return true;
    });
  });
});
