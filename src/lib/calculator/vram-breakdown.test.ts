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

describe('vram-breakdown', () => {
  it('matches recipe total at light load (batch=1, users=1, default context)', () => {
    const b = buildVramBreakdown({
      weightsGiB: 52,
      recipeTotalGiB: 80,
      contextDefault: 262_144,
      contextTokens: 262_144,
      batchSize: 1,
      concurrentUsers: 1,
      quant: 'int4',
      gpuCount: 1,
      gpuFamily: 'H100',
      gpuMemoryGb: 80,
    });
    assert.ok(Math.abs(b.totalGiB - 80) < 1.5);
    assert.equal(b.capacityGiB, 80);
    assert.equal(b.loadBand, 'limit');
    const weights = b.parts.find((p) => p.id === 'weights')!;
    assert.ok(weights.gib >= 50);
    const sum = b.parts.reduce((s, p) => s + p.gib, 0);
    assert.ok(Math.abs(sum - b.totalGiB) < 0.6);
  });

  it('scales KV and activations linearly with batch', () => {
    const base = {
      weightsGiB: 684.53,
      recipeTotalGiB: 700,
      contextDefault: 32_768,
      contextTokens: 32_768,
      concurrentUsers: 1,
      quant: 'fp8',
      gpuCount: 8,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
    };
    const b1 = buildVramBreakdown({...base, batchSize: 1});
    const b32 = buildVramBreakdown({...base, batchSize: 32});
    const kv1 = b1.parts.find((p) => p.id === 'kv')!.gib;
    const kv32 = b32.parts.find((p) => p.id === 'kv')!.gib;
    const act1 = b1.parts.find((p) => p.id === 'activations')!.gib;
    const act32 = b32.parts.find((p) => p.id === 'activations')!.gib;
    assert.ok(Math.abs(kv32 / kv1 - 32) < 0.5);
    assert.ok(Math.abs(act32 / act1 - 32) < 0.5);
    assert.equal(
      b1.parts.find((p) => p.id === 'weights')!.gib,
      b32.parts.find((p) => p.id === 'weights')!.gib,
    );
    assert.equal(
      b1.parts.find((p) => p.id === 'overhead')!.gib,
      b32.parts.find((p) => p.id === 'overhead')!.gib,
    );
    assert.ok(b32.totalGiB > b1.totalGiB);
  });

  it('scales KV with context length, not activations', () => {
    const base = {
      weightsGiB: 100,
      recipeTotalGiB: 140,
      contextDefault: 32_768,
      batchSize: 1,
      concurrentUsers: 1,
      quant: 'fp8',
      gpuCount: 1,
      gpuFamily: 'H200',
    };
    const shortCtx = buildVramBreakdown({...base, contextTokens: 8_192});
    const longCtx = buildVramBreakdown({...base, contextTokens: 131_072});
    const kvShort = shortCtx.parts.find((p) => p.id === 'kv')!.gib;
    const kvLong = longCtx.parts.find((p) => p.id === 'kv')!.gib;
    const actShort = shortCtx.parts.find((p) => p.id === 'activations')!.gib;
    const actLong = longCtx.parts.find((p) => p.id === 'activations')!.gib;
    assert.ok(kvLong > kvShort * 3);
    assert.equal(actShort, actLong);
  });

  it('picks the tightest adequate recipe, not host capacity or comfort nodes', () => {
    // 2304 = 8×B300 SKU — ignore; fall back to weights floor at 1M ctx.
    const kimiFloor = estimateLightLoadRecipeGiB(1400, 1_000_000);
    assert.equal(canonicalRecipeTotalGiB(1400, [2304, 1128, 640], 1_000_000), kimiFloor);
    assert.equal(canonicalRecipeTotalGiB(95, [141, 160, 282]), 141);
    assert.equal(canonicalRecipeTotalGiB(52, [80, 96]), 80);
  });

  it('ignores lazy GPU-SKU catalog markers and derives need from weights', () => {
    assert.equal(looksLikeHostSkuCapacity(48, 38), true);
    assert.equal(looksLikeHostSkuCapacity(24, 20), true);
    assert.equal(looksLikeHostSkuCapacity(80, 70), true);
    assert.equal(looksLikeHostSkuCapacity(2304, 1400), true);
    assert.equal(looksLikeHostSkuCapacity(141, 95), false);
    assert.equal(looksLikeHostSkuCapacity(80, 52), false);

    const fp8 = canonicalRecipeTotalGiB(38, [48], 65_536);
    const floor = estimateLightLoadRecipeGiB(38, 65_536);
    assert.equal(fp8, floor);
    assert.ok(fp8 > 38 && fp8 < 48, `fp8 recipe should sit between weights and L40S, got ${fp8}`);

    const b = buildVramBreakdown({
      weightsGiB: 38,
      recipeTotalGiB: fp8,
      contextDefault: 65_536,
      contextTokens: 65_536,
      batchSize: 1,
      concurrentUsers: 1,
      quant: 'fp8',
      gpuCount: 1,
      gpuFamily: 'L40S',
      gpuMemoryGb: 48,
    });
    assert.equal(formatVramUsage(b.totalGiB, b.capacityGiB), `${b.totalGiB} из 48 GiB`);
    assert.ok(b.totalGiB < 48, 'must not report full card as model need');
    assert.ok((b.utilizationPct ?? 0) < 100);
    assert.notEqual(b.loadBand, 'limit');
  });

  it('keeps activations small on fat MoE recipes; same need across GPU hosts', () => {
    const recipe = canonicalRecipeTotalGiB(1400, [2304, 1128, 640], 1_000_000);
    const floor = estimateLightLoadRecipeGiB(1400, 1_000_000);
    assert.equal(recipe, floor);
    assert.ok(recipe > 1400 && recipe < 2304);

    const base = {
      weightsGiB: 1400,
      recipeTotalGiB: recipe,
      contextDefault: 1_000_000,
      contextTokens: 1_000_000,
      batchSize: 1,
      concurrentUsers: 1,
      quant: 'int4',
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

    assert.equal(b300.totalGiB, h200.totalGiB);
    assert.ok(Math.abs(b300.totalGiB - floor) < 2);
    const act = b300.parts.find((p) => p.id === 'activations')!.gib;
    const kv = b300.parts.find((p) => p.id === 'kv')!.gib;
    assert.ok(act < 50, `activations should stay modest, got ${act}`);
    assert.ok(kv > 200, `1M context should allocate meaningful KV, got ${kv}`);
    // 8×B300 has headroom vs ~1.4 TiB weights — not «Впритык» just because SKU=2304.
    assert.notEqual(b300.loadBand, 'limit');
    assert.ok((b300.utilizationPct ?? 0) < 90);
    assert.equal(h200.loadBand, 'overload');
    assert.ok((h200.utilizationPct ?? 0) > 120);
  });

  it('classifies load bands and overhead', () => {
    assert.equal(defaultGpuMemoryGiB('H200'), 141);
    assert.equal(defaultGpuMemoryGiB('B300'), 288);
    assert.equal(loadBandForUtilization(50), 'excess');
    assert.equal(loadBandForUtilization(65), 'optimal');
    assert.equal(loadBandForUtilization(80), 'tight');
    assert.equal(loadBandForUtilization(91), 'limit');
    assert.equal(loadBandForUtilization(110), 'overload');
    assert.equal(loadBandLabel('tight').text, 'Малый запас');
    assert.equal(loadBandLabel('optimal').text, 'Оптимально');
    assert.equal(loadBandLabel('excess').text, 'Большой запас');
    assert.equal(formatVramUsage(141, 160), '141 из 160 GiB');
    assert.ok(estimateOverheadGiB(684) > 8 && estimateOverheadGiB(684) < 14);
    assert.equal(formatNodeCount(1), '1 нода');
    assert.equal(formatNodeCount(2), '2 ноды');
    assert.equal(formatNodeCount(5), '5 нод');
  });

  it('plans replica nodes when concurrent sequences blow KV, not multi-node TP', () => {
    const args = {
      weightsGiB: 700,
      recipeTotalGiB: 780,
      contextDefault: 128_000,
      avgContextTokens: 64_000,
      maxContextTokens: 128_000,
      batchSize: 1,
      quant: 'fp8',
      gpuCount: 8,
      gpuFamily: 'H200',
      gpuMemoryGb: 141,
    };

    const one = planInferenceNodes({...args, concurrentUsers: 1});
    assert.equal(one.kind, 'fits');
    assert.equal(one.nodeCount, 1);
    assert.ok(one.maxUsersPerNode >= 1);

    const many = planInferenceNodes({...args, concurrentUsers: 16});
    assert.equal(many.kind, 'replicas');
    assert.ok(many.nodeCount >= 2, `expected several replicas, got ${many.nodeCount}`);
    // Avg 64k — not one dedicated node per sequence.
    assert.ok(many.nodeCount < 16, `got ${many.nodeCount} nodes for 16 seq at avg 64k`);
    assert.ok(
      (many.perNode.utilizationPct ?? 0) <= 100,
      'each replica must fit after packing',
    );
    assert.ok(many.usersPerNode * many.nodeCount >= 16);
    assert.notEqual(many.perNode.loadBand, 'overload');

    const impossible = planInferenceNodes({
      ...args,
      weightsGiB: 2000,
      recipeTotalGiB: 2100,
      concurrentUsers: 8,
    });
    assert.equal(impossible.kind, 'impossible');
    assert.equal(impossible.nodeCount, 1);
    assert.equal(impossible.maxUsersPerNode, 0);
  });

  it('marks GLM-class FP8 on 4×H200 as impossible (weights > capacity)', () => {
    const plan = planInferenceNodes({
      weightsGiB: 700,
      recipeTotalGiB: 780,
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
    assert.ok((plan.perNode.capacityGiB ?? 0) < 700);
  });
});
