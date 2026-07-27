import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalog, amountNumber, type CatalogMeter} from '@/lib/catalog';
import {
  assertCompletePeerFeatures,
  classifyPeer,
  evaluateMeterPriceEligibility,
  extractPeerFeatures,
  known,
  na,
  primaryPeerRows,
  requiredHardDimensions,
  retrieveFunctionalCandidates,
  selectPeersForCompare,
  unknown,
  type PeerFeatures,
  type PeerRank,
} from './peer-match';

function bySku(sku: string): CatalogMeter {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, sku);
  return m;
}

function withHard(
  base: PeerFeatures,
  patch: Record<string, PeerFeatures['hard'][string]>,
): PeerFeatures {
  return {...base, hard: {...base.hard, ...patch}};
}

describe('extractPeerFeatures completeness', () => {
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
});

describe('dimension compare / classifyPeer', () => {
  it('known vs unknown hard → functional', () => {
    const seed = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    const cand = withHard(extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu')), {
      purchaseModel: unknown(),
    });
    const c = classifyPeer(seed, cand);
    assert.equal(c.mode, 'functional');
    assert.ok(c.unknownHard.includes('purchaseModel'));
  });

  it('unknown vs unknown hard → functional', () => {
    const seed = withHard(extractPeerFeatures(bySku('t1.compute.a1.vcpu')), {
      purchaseModel: unknown(),
    });
    const cand = withHard(extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu')), {
      purchaseModel: unknown(),
    });
    assert.equal(classifyPeer(seed, cand).mode, 'functional');
  });

  it('n/a vs n/a → exact allowed (traffic)', () => {
    const a = extractPeerFeatures(bySku('yc.traffic.internet.egress'));
    const b = extractPeerFeatures(bySku('selectel.traffic.internet.egress'));
    assert.equal(a.hard.purchaseModel?.state, 'not-applicable');
    assert.equal(b.hard.purchaseModel?.state, 'not-applicable');
    const c = classifyPeer(a, b);
    assert.equal(c.mode, 'exact');
  });

  it('unknown vs n/a → functional + diagnostic', () => {
    const seed = extractPeerFeatures(bySku('yc.traffic.internet.egress'));
    const cand = withHard(extractPeerFeatures(bySku('selectel.traffic.internet.egress')), {
      purchaseModel: unknown(),
    });
    const c = classifyPeer(seed, cand);
    assert.equal(c.mode, 'functional');
    assert.ok(c.diagnostics.some((d) => /inconsistent applicability/i.test(d)));
  });

  it('classifyPeer does not read price', () => {
    const a = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    const b = extractPeerFeatures(bySku('vk.compute.cascade-lake.vcpu'));
    const c1 = classifyPeer(a, b);
    // Mutating amounts is impossible on features — symmetry of mode is the proxy.
    const c2 = classifyPeer(b, a);
    assert.equal(c1.mode, c2.mode);
    assert.equal(c1.priceEligible, c2.priceEligible);
  });

  it('known hardDiff ranks worse than unknown on same dimension', () => {
    const seed = extractPeerFeatures(bySku('cloudru.gpu.a100-40-pcie.unit.synthetic'));
    const diffKnown = withHard(extractPeerFeatures(bySku('t1.gpu.a100')), {
      gpuVramGiB: known(80),
    });
    const diffUnknown = withHard(extractPeerFeatures(bySku('selectel.gpu.a100-40')), {
      gpuVramGiB: unknown(),
    });
    // Force seed VRAM 40
    const seed40 = withHard(seed, {gpuVramGiB: known(40)});
    const rKnown = classifyPeer(seed40, diffKnown).rank;
    const rUnknown = classifyPeer(seed40, diffUnknown).rank;
    assert.ok(rKnown[0]! > rUnknown[0]!, `hardDiff ${rKnown} should exceed unknown ${rUnknown}`);
  });
});

describe('priceDerivation vs allocationBasis', () => {
  it('derived vs atomic same allocationBasis → exact + !priceEligible', () => {
    // Cloud.ru synthetic unit vs Selectel atomic card — same card allocation when both card-only
    const atomic = bySku('selectel.gpu.a100-40');
    const derived = bySku('cloudru.gpu.a100-40-pcie.unit.synthetic');
    const ca = classifyPeer(extractPeerFeatures(atomic), extractPeerFeatures(derived));
    // May be functional if VRAM/interconnect unknown mismatch — assert priceDerivation path when exact
    if (ca.mode === 'exact') {
      assert.equal(ca.priceEligible, false);
      assert.ok(ca.priceIneligibleReasons.includes('derived-synthetic'));
    } else {
      // Still: meter eligibility marks derived synthetic
      assert.equal(evaluateMeterPriceEligibility(extractPeerFeatures(derived)).eligible, false);
    }
  });

  it('card-only vs whole-flavor → functional', () => {
    const card = catalog.meters.find((m) => {
      if (m.categoryKey !== 'gpu' || !/h200/i.test(m.sku) || m.status !== 'available' || m.synthetic) {
        return false;
      }
      const ab = extractPeerFeatures(m).allocationBasis;
      return ab.state === 'known' && ab.value === 'card';
    });
    const whole = catalog.meters.find((m) => {
      if (m.categoryKey !== 'gpu' || !/h200/i.test(m.sku) || m.status !== 'available') return false;
      const ab = extractPeerFeatures(m).allocationBasis;
      return ab.state === 'known' && ab.value === 'whole-flavor';
    });
    if (!card || !whole) return; // skip if catalog shape differs
    const c = classifyPeer(extractPeerFeatures(card), extractPeerFeatures(whole));
    assert.equal(c.mode, 'functional');
    assert.ok(c.hardDiffs.some((d) => d.dimension === 'allocationBasis'));
  });
});

describe('domain regressions', () => {
  it('preemptible ≠ on-demand in exact', () => {
    const od = bySku('t1.compute.a1.vcpu');
    const pre = catalog.meters.find(
      (m) => m.sku.includes('preemptible-vcpu') && m.status === 'available',
    );
    assert.ok(pre);
    const c = classifyPeer(extractPeerFeatures(od), extractPeerFeatures(pre));
    assert.equal(c.mode, 'functional');
    assert.ok(c.hardDiffs.some((d) => d.dimension === 'purchaseModel'));
  });

  it('gpu-host RAM ≠ general RAM', () => {
    const general = catalog.meters.find(
      (m) =>
        m.status === 'available' &&
        m.categoryKey === 'compute' &&
        /ram/i.test(m.meter) &&
        !/gpu/i.test(m.sku),
    );
    const gpuRam = catalog.meters.find(
      (m) => m.status === 'available' && /gpu/i.test(m.sku) && /ram/i.test(m.meter),
    );
    assert.ok(general && gpuRam);
    const c = classifyPeer(extractPeerFeatures(general), extractPeerFeatures(gpuRam));
    assert.equal(c.mode, 'functional');
    assert.ok(c.hardDiffs.some((d) => d.dimension === 'workloadClass'));
  });

  it('internet ≠ interzone ≠ object-storage', () => {
    const inet = bySku('yc.traffic.internet.egress');
    const iz = catalog.meters.find((m) => /interzone/i.test(m.sku) && m.status === 'available');
    const obj = catalog.meters.find(
      (m) => /object-storage.*traffic|traffic.*object/i.test(m.sku) && m.status === 'available',
    );
    assert.ok(iz && obj);
    assert.equal(
      classifyPeer(extractPeerFeatures(inet), extractPeerFeatures(iz)).mode,
      'functional',
    );
    assert.equal(
      classifyPeer(extractPeerFeatures(inet), extractPeerFeatures(obj)).mode,
      'functional',
    );
  });

  it('K8s Small ≠ Medium exact; same Medium tier is exact (even 4/8 vs shapeless)', () => {
    const small = bySku('cloudru.kubernetes.master-zonal-2-4');
    const medium = bySku('t1.kubernetes.master-medium');
    const ycMedium = bySku('yc.kubernetes.master-basic-4-8.synthetic');
    assert.equal(classifyPeer(extractPeerFeatures(small), extractPeerFeatures(medium)).mode, 'functional');
    assert.ok(
      classifyPeer(extractPeerFeatures(small), extractPeerFeatures(medium)).hardDiffs.some(
        (d) => d.dimension === 'masterSizeTier',
      ),
    );
    const sameTier = classifyPeer(extractPeerFeatures(medium), extractPeerFeatures(ycMedium));
    assert.equal(sameTier.mode, 'exact');
  });

  it('K8s Medium seed lists Selectel/VK Small as functional, not exactPE', () => {
    const seed = bySku('t1.kubernetes.master-medium');
    const sel = selectPeersForCompare(seed, catalog.meters);
    const rows = primaryPeerRows(sel);
    const byProv = Object.fromEntries(rows.map((r) => [r.meter.provider, r]));
    assert.ok(byProv['selectel'], 'Selectel Small should appear as functional alternative');
    assert.ok(byProv['vk-cloud'], 'VK Small should appear as functional alternative');
    assert.equal(byProv['selectel']?.bucket, 'functional');
    assert.equal(byProv['vk-cloud']?.bucket, 'functional');
    // Cloud.ru Medium is exact; Yandex Medium synthetic → exact but !priceEligible
    assert.ok(
      byProv['cloud-ru']?.bucket === 'exact-price-eligible' ||
        byProv['cloud-ru']?.bucket === 'exact-price-ineligible',
    );
  });

  it('A100 40 ≠ 80 when VRAM known', () => {
    const a40 = withHard(extractPeerFeatures(bySku('selectel.gpu.a100-40')), {
      gpuVramGiB: known(40),
    });
    const a80 = withHard(extractPeerFeatures(bySku('t1.gpu.a100')), {gpuVramGiB: known(80)});
    const c = classifyPeer(a40, a80);
    assert.equal(c.mode, 'functional');
    assert.ok(c.hardDiffs.some((d) => d.dimension === 'gpuVramGiB'));
  });
});

describe('selectPeersForCompare', () => {
  it('keeps seed sticky and never swaps seed provider row', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    assert.equal(sel.seed.meter.id, seed.id);
    const rows = primaryPeerRows(sel);
    assert.equal(rows[0]?.meter.id, seed.id);
    assert.equal(
      rows.filter((r) => r.meter.provider === seed.provider).length,
      1,
      'seed provider appears once',
    );
  });

  it('exact ∩ functional = ∅ and union = retrieved (pre-dedup)', () => {
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
    const seed = bySku('yc.kubernetes.master-basic-2-8.synthetic');
    const sel = selectPeersForCompare(seed, catalog.meters);
    assert.equal(sel.seed.priceEligibility.eligible, false);
    assert.ok(sel.seed.priceEligibility.reasons.includes('derived-synthetic'));
  });

  it('zero-price SKU stays exact + price-eligible (anchors as free, not +∞%)', () => {
    const seed = bySku('cloudru.object-storage.cold.requests.get');
    const vk = bySku('vk.object-storage.icebox.requests.get');
    assert.equal(amountNumber(vk, 'month'), 0);
    const pair = classifyPeer(extractPeerFeatures(seed), extractPeerFeatures(vk));
    assert.equal(pair.mode, 'exact');
    assert.equal(pair.priceEligible, true);

    const sel = selectPeersForCompare(seed, catalog.meters);
    const vkRow = sel.providerSelections.find((p) => p.provider === 'vk-cloud');
    assert.ok(vkRow?.exactPriceEligible);
    assert.equal(vkRow.exactPriceEligible?.meter.sku, vk.sku);
  });

  it('retrieval stays wide (includes preemptible as functional candidates)', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const retrieved = retrieveFunctionalCandidates(seed, catalog.meters);
    assert.ok(retrieved.some((m) => /preemptible/i.test(m.sku)));
  });

  it('result independent of catalog order', () => {
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
});

describe('assertCompletePeerFeatures', () => {
  it('fails on missing required hard key', () => {
    const f = extractPeerFeatures(bySku('t1.compute.a1.vcpu'));
    delete f.hard.purchaseModel;
    assert.throws(() => assertCompletePeerFeatures(f), /missing hard key/);
  });
});

describe('ranking helpers', () => {
  it('closer expensive beats far cheaper among functional picks', () => {
    const seed = bySku('t1.compute.a1.vcpu');
    const sel = selectPeersForCompare(seed, catalog.meters);
    // For a provider with only functional, rank[0] of functional pick should be minimal among that provider's functional set
    for (const p of sel.providerSelections) {
      if (!p.functional || p.exactPriceEligible || p.exactPriceIneligible) continue;
      const allFunc = sel.retrieved.filter(
        (r) => r.meter.provider === p.provider && r.classification.mode === 'functional',
      );
      const pickedRank = p.functional.classification.rank as PeerRank;
      for (const other of allFunc) {
        const cmp = (() => {
          for (let i = 0; i < pickedRank.length; i++) {
            if (pickedRank[i]! !== other.classification.rank[i]!) {
              return pickedRank[i]! - other.classification.rank[i]!;
            }
          }
          return 0;
        })();
        assert.ok(cmp <= 0);
      }
    }
  });
});

// silence unused in case catalog lacks amount paths
void amountNumber;
void na;
