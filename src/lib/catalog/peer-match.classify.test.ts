/**
 * P0 concrete catalog pairs (Cloud.ru × MWS + clones).
 * Dimension names / K8s shape policy adapted to project enums (see comments).
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {amountNumber} from '@/lib/catalog';
import {
  classifyPeer,
  extractPeerFeatures,
  known,
  unknown,
  type PeerClassification,
} from './peer-match';
import {bySku, classifyPair, cloneMeter} from './peer-match-p0-helpers';

function assertMode(
  id: string,
  c: PeerClassification,
  mode: 'exact' | 'functional',
  priceEligible: boolean,
) {
  assert.equal(c.mode, mode, `${id}: mode`);
  assert.equal(c.priceEligible, priceEligible, `${id}: priceEligible`);
}

function hasHard(c: PeerClassification, dim: string) {
  return c.hardDiffs.some((d) => d.dimension === dim);
}

function hasSoft(c: PeerClassification, dim: string) {
  return c.softDiffs.some((d) => d.dimension === dim);
}

describe('peer-match.classify / AI', () => {
  it('ai-same-model-input-exact', () => {
    const {classification: c, candidateFeatures} = classifyPair(
      'cloudru.ai.gpt-oss-120b.input',
      'mws.ai.gpt-oss-120b.input',
    );
    assertMode('ai-same-model-input-exact', c, 'exact', true);
    assert.deepEqual(c.hardDiffs, []);
    assert.deepEqual(c.unknownHard, []);
    assert.deepEqual(candidateFeatures.canonicalPriceUnit, {
      state: 'known',
      value: 'token-1M',
    });
  });

  it('ai-input-output-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.ai.gpt-oss-120b.input',
      'mws.ai.gpt-oss-120b.output',
    );
    assertMode('ai-input-output-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'tokenDirection'));
  });

  it('ai-price-spread-does-not-affect-classification', () => {
    const base = classifyPair('cloudru.ai.gpt-oss-120b.input', 'mws.ai.gpt-oss-120b.input');
    const expensive = cloneMeter(bySku('mws.ai.gpt-oss-120b.input'), {
      'amount.month': 3000,
      'amount.unit': 3000 / 720,
    });
    const spread = classifyPeer(
      extractPeerFeatures(bySku('cloudru.ai.gpt-oss-120b.input')),
      extractPeerFeatures(expensive),
    );
    assert.equal(spread.mode, base.classification.mode);
    assert.equal(spread.priceEligible, base.classification.priceEligible);
    assert.deepEqual(
      spread.hardDiffs.map((d) => d.dimension),
      base.classification.hardDiffs.map((d) => d.dimension),
    );
  });

  it('ai-inferred-normalization-exact-no-price', () => {
    const {classification: c} = classifyPair(
      'cloudru.ai.gpt-oss-120b.input',
      'mws.ai.gpt-oss-120b.input',
      {featurePatch: {normalizationConfidence: 'inferred'}},
    );
    assertMode('ai-inferred-normalization-exact-no-price', c, 'exact', false);
    assert.ok(c.priceIneligibleReasons.includes('normalization-unverified'));
  });
});

describe('peer-match.classify / Kubernetes', () => {
  it('k8s-shapeless-fixed: same Small tier is exact (shape soft in project P0)', () => {
    // Spec draft expected functional+unknown shape; frozen contract uses masterSizeTier.
    const {classification: c} = classifyPair(
      'cloudru.kubernetes.master-zonal-2-4',
      'mws.kubernetes.master-basic',
    );
    assertMode('k8s-shapeless-fixed', c, 'exact', true);
    assert.deepEqual(c.hardDiffs, []);
    assert.deepEqual(c.unknownHard, []);
  });

  it('k8s-shape-mismatch-functional (Small vs Medium tier)', () => {
    const {classification: c} = classifyPair(
      'cloudru.kubernetes.master-zonal-2-4',
      'cloudru.kubernetes.master-zonal-4-8',
    );
    assertMode('k8s-shape-mismatch-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'masterSizeTier'));
    assert.ok(hasSoft(c, 'vCpuPerMaster') || hasSoft(c, 'ramPerMaster'));
  });

  it('k8s-topology-and-count-mismatch', () => {
    const {classification: c} = classifyPair(
      'cloudru.kubernetes.master-zonal-2-4',
      'cloudru.kubernetes.master-ha-2-4.synthetic',
    );
    assertMode('k8s-topology-and-count-mismatch', c, 'functional', false);
    assert.ok(hasHard(c, 'k8sTopology'));
    assert.ok(hasHard(c, 'masterCount'));
  });

  it('k8s-same-shape-clone-exact', () => {
    const clone = cloneMeter(bySku('cloudru.kubernetes.master-zonal-2-4'), {
      sku: 'test-provider.kubernetes.master-zonal-2-4',
      _provider: 'test-provider',
    });
    const {classification: c} = classifyPair(
      'cloudru.kubernetes.master-zonal-2-4',
      clone,
    );
    assertMode('k8s-same-shape-clone-exact', c, 'exact', true);
    assert.deepEqual(c.hardDiffs, []);
    assert.deepEqual(c.unknownHard, []);
  });
});

describe('peer-match.classify / traffic', () => {
  it('traffic-internet-compute-exact', () => {
    const {classification: c, seedFeatures} = classifyPair(
      'cloudru.traffic.internet.egress',
      'mws.traffic.internet.egress',
    );
    assertMode('traffic-internet-compute-exact', c, 'exact', true);
    assert.deepEqual(seedFeatures.hard.trafficRoute, {state: 'known', value: 'internet'});
  });

  it('traffic-internet-vs-interzone-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.traffic.internet.egress',
      'mws.traffic.interzone.egress',
    );
    assertMode('traffic-internet-vs-interzone-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'trafficRoute'));
  });

  it('traffic-compute-vs-object-storage-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.traffic.internet.egress',
      'mws.object-storage.traffic.egress',
    );
    assertMode('traffic-compute-vs-object-storage-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'trafficRoute'));
  });

  it('traffic-object-storage-exact', () => {
    const {classification: c, seedFeatures} = classifyPair(
      'cloudru.object-storage.traffic.egress',
      'mws.object-storage.traffic.egress',
    );
    assertMode('traffic-object-storage-exact', c, 'exact', true);
    assert.deepEqual(seedFeatures.hard.trafficRoute, {
      state: 'known',
      value: 'object-storage',
    });
  });

  it('traffic-free-ingress-exact', () => {
    const {classification: c, seed, candidate} = classifyPair(
      'cloudru.traffic.internet.ingress',
      'mws.traffic.internet.ingress',
    );
    assertMode('traffic-free-ingress-exact', c, 'exact', true);
    assert.equal(amountNumber(seed, 'month'), 0);
    assert.equal(amountNumber(candidate, 'month'), 0);
  });
});

describe('peer-match.classify / disk', () => {
  it('disk-network-nvme-exact-with-soft-diffs', () => {
    const {classification: c} = classifyPair('cloudru.disk.ssd-nvme', 'mws.disk.nbs-pl2');
    assertMode('disk-network-nvme-exact-with-soft-diffs', c, 'exact', true);
    assert.deepEqual(c.hardDiffs, []);
    assert.ok(
      hasSoft(c, 'performanceTier') ||
        hasSoft(c, 'includedIops') ||
        hasSoft(c, 'iopsChargedSeparately'),
    );
  });

  it('disk-local-vs-network-functional', () => {
    const {classification: c} = classifyPair('cloudru.disk.ssd-nvme', 'mws.disk.nbs-pl2', {
      candidatePatch: {'dimensions.storageTopology': 'local'},
    });
    assertMode('disk-local-vs-network-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'diskAttachment'));
  });

  it('disk-unknown-attachment-functional', () => {
    // Clearing topology still leaves network evidence in sku/name (nbs) — force unknown.
    const seedF = extractPeerFeatures(bySku('cloudru.disk.ssd-nvme'));
    const candF = extractPeerFeatures(bySku('mws.disk.nbs-pl2'));
    candF.hard.diskAttachment = unknown();
    const forced = classifyPeer(seedF, candF);
    assertMode('disk-unknown-attachment-functional', forced, 'functional', false);
    assert.ok(forced.unknownHard.includes('diskAttachment'));
  });

  it('disk-capacity-vs-iops-functional', () => {
    const {classification: c} = classifyPair('mws.disk.nbs-pl2', 'mws.disk.nbs-pl2-iops');
    assertMode('disk-capacity-vs-iops-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'diskBillingKind') || c.priceIneligibleReasons.includes('canonical-unit-mismatch'));
  });
});

describe('peer-match.classify / object-storage', () => {
  it('object-put-source-pack-mismatch-still-exact', () => {
    const {classification: c, seedFeatures, candidateFeatures} = classifyPair(
      'cloudru.object-storage.standard.requests.put',
      'mws.object-storage.standard.requests.put',
    );
    assertMode('object-put-source-pack-mismatch-still-exact', c, 'exact', true);
    assert.ok(
      seedFeatures.sourcePackSize != null &&
        candidateFeatures.sourcePackSize != null &&
        seedFeatures.sourcePackSize !== candidateFeatures.sourcePackSize,
    );
    assert.deepEqual(seedFeatures.canonicalPriceUnit, {
      state: 'known',
      value: 'request-10k',
    });
  });

  it('object-put-vs-get-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.object-storage.standard.requests.put',
      'mws.object-storage.standard.requests.get',
    );
    assertMode('object-put-vs-get-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'storageOperation'));
  });

  it('object-inferred-normalization-no-price', () => {
    const {classification: c} = classifyPair(
      'cloudru.object-storage.standard.requests.put',
      'mws.object-storage.standard.requests.put',
      {featurePatch: {normalizationConfidence: 'inferred'}},
    );
    assertMode('object-inferred-normalization-no-price', c, 'exact', false);
    assert.ok(c.priceIneligibleReasons.includes('normalization-unverified'));
  });
});

describe('peer-match.classify / CDN', () => {
  it('cdn-egress-exact', () => {
    const {classification: c, seedFeatures} = classifyPair(
      'cloudru.cdn.traffic.egress',
      'mws.cdn.traffic.egress',
    );
    assertMode('cdn-egress-exact', c, 'exact', true);
    assert.deepEqual(seedFeatures.hard.cdnDirection, {state: 'known', value: 'egress'});
  });

  it('cdn-egress-vs-ingress-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.cdn.traffic.egress',
      'mws.cdn.traffic.ingress',
    );
    assertMode('cdn-egress-vs-ingress-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'cdnDirection'));
  });

  it('cdn-bidirectional-vs-egress-functional', () => {
    const seedF = extractPeerFeatures(bySku('cloudru.cdn.traffic.egress'));
    const candF = extractPeerFeatures(bySku('mws.cdn.traffic.egress'));
    candF.hard.cdnDirection = known('bidirectional');
    const c = classifyPeer(seedF, candF);
    assertMode('cdn-bidirectional-vs-egress-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'cdnDirection'));
  });
});

describe('peer-match.classify / compute', () => {
  it('compute-synthetic-vs-atomic-exact-no-price', () => {
    const {classification: c} = classifyPair(
      'cloudru.compute.cascade-lake.vcpu.synthetic',
      'mws.compute.vcpu',
    );
    assertMode('compute-synthetic-vs-atomic-exact-no-price', c, 'exact', false);
    assert.ok(hasSoft(c, 'cpuPlatform'));
    assert.ok(c.priceIneligibleReasons.includes('derived-synthetic'));
  });

  it('compute-on-demand-vs-preemptible-functional', () => {
    const {classification: c} = classifyPair('mws.compute.vcpu', 'mws.compute.vcpu', {
      candidatePatch: {
        sku: 'test-provider.compute.preemptible-vcpu',
        'dimensions.purchaseModel': 'preemptible',
        purchaseModel: 'preemptible',
        _provider: 'test-provider',
      },
    });
    assertMode('compute-on-demand-vs-preemptible-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'purchaseModel'));
  });

  it('compute-gpu-host-vs-general-functional', () => {
    const {classification: c} = classifyPair('mws.compute.vcpu', 'mws.compute.vcpu', {
      candidatePatch: {
        sku: 'test-provider.compute.gpu-h100.vcpu',
        'dimensions.workloadFamily': 'gpu-host',
        _provider: 'test-provider',
      },
    });
    assertMode('compute-gpu-host-vs-general-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'workloadClass'));
  });
});

describe('peer-match.classify / GPU', () => {
  it('gpu-a100-40-vs-80-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.gpu.a100-40-pcie.unit.synthetic',
      'cloudru.gpu.a100-80-pcie.unit.synthetic',
    );
    assertMode('gpu-a100-40-vs-80-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'gpuVramGiB'));
  });

  it('gpu-pcie-vs-nvlink-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.gpu.h100-80-pcie.unit.synthetic',
      'cloudru.gpu.h100-80-nvlink.unit.synthetic',
    );
    assertMode('gpu-pcie-vs-nvlink-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'gpuInterconnect'));
  });

  it('gpu-known-vram-vs-unknown-interconnect-functional', () => {
    // MWS YAML has gpuMemoryGb=80 but no interconnect → unknown hard, not VRAM.
    const {classification: c} = classifyPair(
      'cloudru.gpu.a100-80-pcie.unit.synthetic',
      'mws.gpu.a100-80',
    );
    assertMode('gpu-known-vram-vs-unknown-interconnect', c, 'functional', false);
    assert.ok(c.unknownHard.includes('gpuInterconnect') || hasHard(c, 'gpuInterconnect'));
  });

  it('gpu-card-vs-whole-flavor-functional', () => {
    const {classification: c} = classifyPair(
      'cloudru.gpu.h100-80-pcie.unit.synthetic',
      'cloudru.gpu.h100-80-pcie-1',
    );
    assertMode('gpu-card-vs-whole-flavor-functional', c, 'functional', false);
    assert.ok(hasHard(c, 'allocationBasis'));
  });
});

describe('peer-match.classify / dimension lattice', () => {
  it('dimension-known-vs-unknown', () => {
    const seed = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    const cand = extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu'));
    cand.hard.purchaseModel = unknown();
    const c = classifyPeer(seed, cand);
    assert.equal(c.mode, 'functional');
    assert.ok(c.unknownHard.includes('purchaseModel'));
  });

  it('dimension-unknown-vs-unknown', () => {
    const seed = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    const cand = extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu'));
    seed.hard.purchaseModel = unknown();
    cand.hard.purchaseModel = unknown();
    assert.equal(classifyPeer(seed, cand).mode, 'functional');
  });

  it('dimension-na-vs-na', () => {
    const a = extractPeerFeatures(bySku('yc.traffic.internet.egress'));
    const b = extractPeerFeatures(bySku('selectel.traffic.internet.egress'));
    assert.equal(a.hard.purchaseModel?.state, 'not-applicable');
    assert.equal(b.hard.purchaseModel?.state, 'not-applicable');
    assert.equal(classifyPeer(a, b).mode, 'exact');
  });

  it('dimension-known-vs-na', () => {
    const seed = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    const cand = extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu'));
    cand.hard.purchaseModel = {state: 'not-applicable'};
    const c = classifyPeer(seed, cand);
    assert.ok(hasHard(c, 'purchaseModel'));
    assert.ok(c.diagnostics.some((d) => /extractor-bug/i.test(d)));
  });

  it('dimension-unknown-vs-na', () => {
    const seed = extractPeerFeatures(bySku('yc.traffic.internet.egress'));
    const cand = extractPeerFeatures(bySku('selectel.traffic.internet.egress'));
    cand.hard.purchaseModel = unknown();
    const c = classifyPeer(seed, cand);
    assert.equal(c.mode, 'functional');
    assert.ok(c.diagnostics.some((d) => /inconsistent applicability/i.test(d)));
  });
});
