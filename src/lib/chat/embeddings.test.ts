import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  cosineSimilarity,
  decodeVector,
  encodeVector,
  reciprocalRankFusion,
} from './embeddings';

describe('embeddings helpers', () => {
  it('round-trips float32 vectors through base64', () => {
    const src = Float32Array.from([0.1, -0.25, 0.5, 1]);
    const back = decodeVector(encodeVector(src), 4);
    assert.equal(back.length, 4);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(back[i] - src[i]) < 1e-6);
  });

  it('computes cosine similarity', () => {
    const a = Float32Array.from([1, 0, 0]);
    const b = Float32Array.from([1, 0, 0]);
    const c = Float32Array.from([0, 1, 0]);
    assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-6);
    assert.ok(Math.abs(cosineSimilarity(a, c)) < 1e-6);
  });

  it('fuses ranks with RRF', () => {
    const scores = reciprocalRankFusion(
      [
        ['a', 'b', 'c'],
        ['b', 'a', 'd'],
      ],
      60,
    );
    assert.ok((scores.get('b') ?? 0) > (scores.get('c') ?? 0));
    assert.ok((scores.get('a') ?? 0) > (scores.get('d') ?? 0));
  });
});
