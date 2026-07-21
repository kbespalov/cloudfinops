import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  buildVramBreakdown,
  canonicalRecipeTotalGiB,
  defaultGpuMemoryGiB,
  estimateOverheadGiB,
  formatVramUsage,
  loadBandForUtilization,
  loadBandLabel,
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
    assert.equal(canonicalRecipeTotalGiB(1400, [2304, 1128, 640]), 2304);
    assert.equal(canonicalRecipeTotalGiB(95, [141, 160, 282]), 141);
    assert.equal(canonicalRecipeTotalGiB(52, [80, 96]), 80);
  });

  it('keeps activations small on fat MoE recipes; same need across GPU hosts', () => {
    const recipe = canonicalRecipeTotalGiB(1400, [2304, 1128, 640]);
    assert.equal(recipe, 2304);

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
    assert.ok(Math.abs(b300.totalGiB - 2304) < 2);
    const act = b300.parts.find((p) => p.id === 'activations')!.gib;
    const kv = b300.parts.find((p) => p.id === 'kv')!.gib;
    assert.ok(act < 50, `activations should stay modest, got ${act}`);
    assert.ok(kv > 500, `most surplus should be KV at 1M context, got ${kv}`);
    assert.equal(b300.loadBand, 'limit');
    assert.equal(h200.loadBand, 'overload');
    assert.ok((h200.utilizationPct ?? 0) > 180);
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
  });
});
