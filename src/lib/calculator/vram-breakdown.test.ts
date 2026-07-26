import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildVramBreakdown,
  canonicalRecipeTotalGiB,
  defaultGpuMemoryGiB,
  estimateLightLoadRecipeGiB,
  estimateOverheadGiB,
  formatNodeCount,
  formatVramUsage,
  loadBandForUtilization,
  loadBandLabel,
  looksLikeHostSkuCapacity,
  planInferenceNodes,
} from './vram-breakdown';

describe('vram-breakdown façade', () => {
  it('keeps weights stable and scales KV with concurrency', () => {
    const base = {
      weightsGiB: 450,
      contextDefault: 128_000,
      avgContextTokens: 32_000,
      maxContextTokens: 128_000,
      batchSize: 1,
      quant: 'int4',
      gpuCount: 8,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
      totalParametersB: 744,
      attention: {type: 'mla' as const, kvBytesPerTokenEstimated: 120},
    };
    const b1 = buildVramBreakdown({...base, concurrentUsers: 1});
    const b10 = buildVramBreakdown({...base, concurrentUsers: 10});
    assert.equal(
      b1.parts.find((p) => p.id === 'weights')!.gib,
      b10.parts.find((p) => p.id === 'weights')!.gib,
    );
    assert.ok(b10.parts.find((p) => p.id === 'kv')!.gib > b1.parts.find((p) => p.id === 'kv')!.gib);
  });

  it('scales KV with context length, not weight bytes', () => {
    const base = {
      weightsGiB: 40,
      contextDefault: 32_768,
      batchSize: 1,
      concurrentUsers: 4,
      quant: 'int4',
      gpuCount: 1,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
      totalParametersB: 70,
      attention: {
        type: 'gqa' as const,
        numLayers: 80,
        numKvHeads: 8,
        headDim: 128,
      },
    };
    const shortCtx = buildVramBreakdown({...base, avgContextTokens: 8_192, maxContextTokens: 32_768});
    const longCtx = buildVramBreakdown({...base, avgContextTokens: 131_072, maxContextTokens: 131_072});
    const kvShort = shortCtx.parts.find((p) => p.id === 'kv')!.gib;
    const kvLong = longCtx.parts.find((p) => p.id === 'kv')!.gib;
    assert.ok(kvShort >= 1, `short KV should be visible GiB, got ${kvShort}`);
    assert.ok(kvLong > kvShort * 2, `long=${kvLong} short=${kvShort}`);
    assert.equal(
      shortCtx.parts.find((p) => p.id === 'weights')!.gib,
      longCtx.parts.find((p) => p.id === 'weights')!.gib,
    );
  });

  it('raising max context above average increases KV (p95 blend)', () => {
    const base = {
      weightsGiB: 40,
      contextDefault: 128_000,
      batchSize: 1,
      concurrentUsers: 4,
      quant: 'int4',
      gpuCount: 1,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
      avgContextTokens: 32_768,
      attention: {
        type: 'gqa' as const,
        numLayers: 80,
        numKvHeads: 8,
        headDim: 128,
      },
    };
    const tightMax = buildVramBreakdown({...base, maxContextTokens: 32_768});
    const wideMax = buildVramBreakdown({...base, maxContextTokens: 131_072});
    const kvTight = tightMax.parts.find((p) => p.id === 'kv')!.gib;
    const kvWide = wideMax.parts.find((p) => p.id === 'kv')!.gib;
    assert.ok(kvWide > kvTight, `max context should lift KV: wide=${kvWide} tight=${kvTight}`);
  });

  it('picks the tightest adequate recipe, not host capacity', () => {
    const kimiFloor = estimateLightLoadRecipeGiB(1400, 1_000_000);
    assert.equal(canonicalRecipeTotalGiB(1400, [2304, 1128, 640], 1_000_000), kimiFloor);
    assert.equal(canonicalRecipeTotalGiB(95, [141, 160, 282]), 141);
    assert.equal(canonicalRecipeTotalGiB(52, [80, 96]), 80);
  });

  it('ignores lazy GPU-SKU catalog markers', () => {
    assert.equal(looksLikeHostSkuCapacity(48, 38), true);
    assert.equal(looksLikeHostSkuCapacity(2304, 1400), true);
    assert.equal(looksLikeHostSkuCapacity(141, 95), false);
    const fp8 = canonicalRecipeTotalGiB(38, [48], 65_536);
    const floor = estimateLightLoadRecipeGiB(38, 65_536);
    assert.equal(fp8, floor);
  });

  it('same weight need across GPU hosts; overload when capacity insufficient', () => {
    const base = {
      weightsGiB: 1400,
      contextDefault: 1_000_000,
      avgContextTokens: 64_000,
      maxContextTokens: 1_000_000,
      batchSize: 1,
      concurrentUsers: 1,
      quant: 'int4',
      attention: {type: 'mla' as const, kvBytesPerTokenEstimated: 100},
    };
    const b300 = buildVramBreakdown({
      ...base,
      gpuCount: 8,
      gpuFamily: 'B300',
      gpuMemoryGb: 288,
    });
    const h200 = buildVramBreakdown({
      ...base,
      gpuCount: 8,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
    });
    assert.equal(
      b300.parts.find((p) => p.id === 'weights')!.gib,
      h200.parts.find((p) => p.id === 'weights')!.gib,
    );
    assert.equal(h200.loadBand, 'overload');
  });

  it('classifies load bands and formats helpers', () => {
    assert.equal(defaultGpuMemoryGiB('H200'), 141);
    assert.equal(defaultGpuMemoryGiB('B300'), 288);
    assert.equal(loadBandForUtilization(50), 'excess');
    assert.equal(loadBandForUtilization(110), 'overload');
    assert.equal(loadBandLabel('tight').text, 'Малый запас');
    assert.equal(formatVramUsage(141, 160), '141 из 160 GiB');
    assert.ok(estimateOverheadGiB(684) > 8 && estimateOverheadGiB(684) < 30);
    assert.equal(formatNodeCount(1), '1 нода');
    assert.equal(formatNodeCount(2), '2 ноды');
    assert.equal(formatNodeCount(5), '5 нод');
  });

  it('plans replica nodes from KV capacity, not concurrency alone', () => {
    const args = {
      weightsGiB: 743,
      contextDefault: 128_000,
      avgContextTokens: 64_000,
      maxContextTokens: 128_000,
      batchSize: 1,
      quant: 'fp8',
      gpuCount: 8,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
      totalParametersB: 744,
      attention: {type: 'mla' as const, kvBytesPerTokenEstimated: 120},
    };

    const one = planInferenceNodes({...args, concurrentUsers: 1});
    assert.ok(one.kind === 'fits' || one.kind === 'replicas');
    assert.ok(one.sizing.nodesForThroughput == null);

    const many = planInferenceNodes({...args, concurrentUsers: 64});
    assert.ok(many.nodeCount >= one.nodeCount);
    assert.ok(many.nodeCount < 64, `must not be 1 node per session, got ${many.nodeCount}`);
  });

  it('marks GLM-class FP8 on 4×H200 as impossible (weights > capacity)', () => {
    const plan = planInferenceNodes({
      weightsGiB: 743,
      contextDefault: 128_000,
      avgContextTokens: 32_768,
      maxContextTokens: 128_000,
      batchSize: 1,
      concurrentUsers: 8,
      quant: 'fp8',
      gpuCount: 4,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
    });
    assert.equal(plan.kind, 'impossible');
    assert.ok((plan.perNode.capacityGiB ?? 0) < 743);
  });
});
