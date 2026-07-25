import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {runToolSync} from './tools';

describe('get_quote compute defaults', () => {
  it('defaults omitted RAM to 4×vCPU (not 1 GiB)', () => {
    const raw = runToolSync('get_quote', JSON.stringify({vcpu: 32, period: 'month'}));
    const data = JSON.parse(raw) as {
      request?: {vcpu?: number; ramGiB?: number; diskGiB?: number};
      error?: string;
    };
    assert.equal(data.error, undefined);
    assert.equal(data.request?.vcpu, 32);
    assert.equal(data.request?.ramGiB, 128);
    assert.equal(data.request?.diskGiB, 100);
  });

  it('keeps explicit RAM when provided', () => {
    const raw = runToolSync(
      'get_quote',
      JSON.stringify({vcpu: 32, ramGiB: 64, diskGiB: 200, period: 'month'}),
    );
    const data = JSON.parse(raw) as {
      request?: {vcpu?: number; ramGiB?: number; diskGiB?: number};
    };
    assert.equal(data.request?.vcpu, 32);
    assert.equal(data.request?.ramGiB, 64);
    assert.equal(data.request?.diskGiB, 200);
  });
});
