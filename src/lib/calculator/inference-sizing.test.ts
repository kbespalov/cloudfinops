import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {findInferenceModel} from '@/data/inference-models';
import {
  computeResidentTokens,
  resolveKvBytesPerToken,
  sizeInferenceDeployment,
} from './inference-sizing';
import {naiveWeightGiB, resolveWeightsMemory} from './weight-formats';

const glm = findInferenceModel('GLM 5.2');
assert.ok(glm, 'GLM 5.2 profile must exist');

function sizeGlm(args: {
  quant: 'fp8' | 'int4';
  gpuCount?: number;
  concurrentSessions?: number;
  averageResidentContext?: number;
  maxContextTokens?: number;
  kvCacheDtype?: 'fp8' | 'bf16';
  nodeDecodeTokPerS?: number | null;
  targetOutputTokPerSPerUser?: number;
}) {
  const variant = glm!.weights.find((w) => w.dtype === args.quant)!;
  return sizeInferenceDeployment({
    weightVariant: variant,
    totalParametersB: glm!.parameterCountB,
    activeParameterCountB: glm!.activeParameterCountB,
    attention: glm!.attention,
    kvCacheDtype: args.kvCacheDtype ?? 'fp8',
    gpuCount: args.gpuCount ?? 8,
    gpuFamily: 'H200',
    gpuMemoryGb: 141,
    nodeDecodeTokPerS: args.nodeDecodeTokPerS,
    workload: {
      concurrentSessions: args.concurrentSessions ?? 100,
      activeDecodingRequests: args.concurrentSessions ?? 100,
      averageResidentContext: args.averageResidentContext ?? 32_000,
      maxContextTokens: args.maxContextTokens ?? 128_000,
      averageOutputTokens: 0,
      residentMode: 'average',
      targetOutputTokPerSPerUser: args.targetOutputTokPerSPerUser,
    },
  });
}

describe('inference-sizing invariants', () => {
  it('INT4/NVFP4 memory is substantially below FP8 for GLM 5.2', () => {
    const fp8 = resolveWeightsMemory({
      variant: glm!.weights.find((w) => w.dtype === 'fp8')!,
      totalParametersB: 744,
      activeParameterCountB: 40,
    });
    const nvfp4 = resolveWeightsMemory({
      variant: glm!.weights.find((w) => w.dtype === 'int4')!,
      totalParametersB: 744,
      activeParameterCountB: 40,
    });
    assert.ok(fp8.weightsMemoryGiB >= 700 && fp8.weightsMemoryGiB <= 780, `fp8=${fp8.weightsMemoryGiB}`);
    assert.ok(nvfp4.weightsMemoryGiB >= 430 && nvfp4.weightsMemoryGiB <= 480, `nvfp4=${nvfp4.weightsMemoryGiB}`);
    assert.ok(
      fp8.weightsMemoryGiB - nvfp4.weightsMemoryGiB >= 200,
      `delta too small: ${fp8.weightsMemoryGiB - nvfp4.weightsMemoryGiB}`,
    );
    assert.notEqual(nvfp4.weightsMemoryGiB, 700);
    assert.ok((nvfp4.theoreticalLowerBoundGiB ?? 0) < nvfp4.weightsMemoryGiB);
    assert.equal(nvfp4.format, 'nvfp4');
    assert.equal(fp8.debug.usedActiveParamsForWeights, false);
  });

  it('changing weight format does not change KV when kv dtype is fixed', () => {
    const a = sizeGlm({quant: 'fp8', kvCacheDtype: 'fp8'});
    const b = sizeGlm({quant: 'int4', kvCacheDtype: 'fp8'});
    assert.equal(a.kvBytesPerToken, b.kvBytesPerToken);
    assert.equal(a.residentTokens, b.residentTokens);
    // Absolute KV GiB on a packed node may differ with node count; compare total KV need via debug.
    const kvA = (a.debug.taskB_kv as {kvGiBTotal: number}).kvGiBTotal;
    const kvB = (b.debug.taskB_kv as {kvGiBTotal: number}).kvGiBTotal;
    assert.ok(Math.abs(kvA - kvB) < 0.5, `kv total fp8=${kvA} nvfp4=${kvB}`);
  });

  it('changing kv dtype does not change weight memory', () => {
    const a = sizeGlm({quant: 'fp8', kvCacheDtype: 'fp8'});
    const b = sizeGlm({quant: 'fp8', kvCacheDtype: 'bf16'});
    assert.equal(a.weights.weightsMemoryGiB, b.weights.weightsMemoryGiB);
    assert.ok(b.kvBytesPerToken > a.kvBytesPerToken);
  });

  it('growing average context monotonically increases KV memory', () => {
    const short = sizeGlm({quant: 'int4', averageResidentContext: 8_000, concurrentSessions: 10});
    const long = sizeGlm({quant: 'int4', averageResidentContext: 64_000, concurrentSessions: 10});
    const kvShort = (short.debug.taskB_kv as {kvGiBTotal: number}).kvGiBTotal;
    const kvLong = (long.debug.taskB_kv as {kvGiBTotal: number}).kvGiBTotal;
    assert.ok(kvLong > kvShort * 2);
  });

  it('growing concurrency monotonically increases resident tokens', () => {
    const a = computeResidentTokens({
      mode: 'average',
      concurrentSessions: 10,
      activeDecodingRequests: 10,
      averageResidentContext: 32_000,
      maxContextTokens: 128_000,
      averageOutputTokens: 0,
      prefixCacheHitRate: 0,
    });
    const b = computeResidentTokens({
      mode: 'average',
      concurrentSessions: 100,
      activeDecodingRequests: 100,
      averageResidentContext: 32_000,
      maxContextTokens: 128_000,
      averageOutputTokens: 0,
      prefixCacheHitRate: 0,
    });
    assert.ok(b > a * 5);
  });

  it('active parameters are never used for MoE weight storage', () => {
    const withActive = resolveWeightsMemory({
      variant: glm!.weights.find((w) => w.dtype === 'fp8')!,
      totalParametersB: 744,
      activeParameterCountB: 40,
    });
    const naiveActive = naiveWeightGiB(40, 'fp8');
    assert.ok(withActive.weightsMemoryGiB > 600);
    assert.ok(naiveActive < 50);
    assert.notEqual(Math.round(withActive.weightsMemoryGiB), Math.round(naiveActive));
  });

  it('required nodes do not shrink when load increases', () => {
    const light = sizeGlm({quant: 'fp8', concurrentSessions: 4, averageResidentContext: 8_000});
    const heavy = sizeGlm({quant: 'fp8', concurrentSessions: 100, averageResidentContext: 32_000});
    if (light.kind !== 'impossible' && heavy.kind !== 'impossible') {
      assert.ok(heavy.nodeCount >= light.nodeCount);
    }
  });

  it('same model/format has identical weights across GPU topologies', () => {
    const a = sizeGlm({quant: 'int4', gpuCount: 8});
    const b = sizeGlm({quant: 'int4', gpuCount: 4});
    assert.equal(a.weights.weightsMemoryGiB, b.weights.weightsMemoryGiB);
  });

  it('node count and free VRAM are different metrics', () => {
    const s = sizeGlm({quant: 'int4', concurrentSessions: 4, averageResidentContext: 8_000});
    assert.ok('nodeCount' in s);
    assert.ok('freeReserveGiB' in s.perNode);
    assert.notEqual(s.nodeCount, s.perNode.freeReserveGiB);
  });

  it('without throughput benchmark does not invent throughput nodes', () => {
    const s = sizeGlm({quant: 'int4'});
    assert.equal(s.throughputStatus, 'insufficient_data');
    assert.equal(s.nodesForThroughput, null);
  });

  it('with throughput benchmark can raise node count', () => {
    const mem = sizeGlm({quant: 'int4', concurrentSessions: 4, averageResidentContext: 4_096});
    const thr = sizeGlm({
      quant: 'int4',
      concurrentSessions: 4,
      averageResidentContext: 4_096,
      nodeDecodeTokPerS: 50,
      targetOutputTokPerSPerUser: 40,
    });
    assert.equal(thr.throughputStatus, 'ok');
    assert.ok((thr.nodesForThroughput ?? 0) >= 3);
    assert.ok(thr.nodeCount >= mem.nodeCount);
  });
});

describe('GLM 5.2 concrete scenario', () => {
  it('FP8 → NVFP4 frees hundreds of GiB; NVFP4 fits 8×H200 memory-only at 3.2M tokens', () => {
    const fp8 = sizeGlm({
      quant: 'fp8',
      concurrentSessions: 100,
      averageResidentContext: 32_000,
      maxContextTokens: 128_000,
    });
    const nvfp4 = sizeGlm({
      quant: 'int4',
      concurrentSessions: 100,
      averageResidentContext: 32_000,
      maxContextTokens: 128_000,
    });

    console.log('\n=== GLM 5.2 debug FP8 ===\n', JSON.stringify(fp8.debug, null, 2));
    console.log('\n=== GLM 5.2 debug NVFP4 ===\n', JSON.stringify(nvfp4.debug, null, 2));

    assert.ok(fp8.weights.weightsMemoryGiB >= 700);
    assert.ok(nvfp4.weights.weightsMemoryGiB <= 480);
    assert.ok(fp8.weights.weightsMemoryGiB - nvfp4.weights.weightsMemoryGiB >= 200);

    // ~100 × 32k ≈ 3.2M resident tokens (plus small reserve)
    assert.ok(nvfp4.residentTokens >= 3_000_000 && nvfp4.residentTokens <= 3_600_000);

    // Memory-only NVFP4 on 8×H200 should not need many replicas from KV alone.
    assert.notEqual(nvfp4.kind, 'impossible');
    assert.ok(nvfp4.nodesForModelFit === 1);
    assert.ok(
      nvfp4.nodesForKvCapacity <= 2,
      `NVFP4 kv nodes unexpected: ${nvfp4.nodesForKvCapacity}`,
    );
    // Without benchmark, do not claim a fixed throughput-driven node count.
    assert.equal(nvfp4.nodesForThroughput, null);

    // FP8 may need more KV nodes than NVFP4 because usable KV slack is smaller.
    assert.ok(fp8.nodesForKvCapacity >= nvfp4.nodesForKvCapacity);
  });

  it('FP8 on 4×H200 is impossible (weights > usable VRAM)', () => {
    const plan = sizeGlm({quant: 'fp8', gpuCount: 4, concurrentSessions: 1});
    assert.equal(plan.kind, 'impossible');
    assert.equal(plan.nodesForModelFit, 0);
  });
});

describe('KV bytes helpers', () => {
  it('prefers measured over estimated', () => {
    const r = resolveKvBytesPerToken({
      attention: {
        type: 'mla',
        kvBytesPerTokenMeasured: 90,
        kvBytesPerTokenEstimated: 200,
      },
      kvCacheDtype: 'fp8',
    });
    assert.equal(r.bytes, 90);
    assert.equal(r.source, 'measured');
  });
});
