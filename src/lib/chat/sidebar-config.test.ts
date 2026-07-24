import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {sidebarConfigFromTool} from './sidebar-config';

describe('sidebarConfigFromTool', () => {
  it('maps get_quote compute args and overrides period from the page', () => {
    const payload = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 52, ramGiB: 128, diskGiB: 200, period: 'month'},
      'year',
    );
    assert.ok(payload);
    assert.equal(payload.kind, 'adhoc');
    if (payload.kind !== 'adhoc') return;
    assert.equal(payload.request.kind, 'compute');
    if (payload.request.kind !== 'compute') return;
    assert.equal(payload.request.period, 'year');
    assert.equal(payload.request.vcpu, 52);
    assert.equal(payload.request.ramGiB, 128);
    assert.match(payload.summary.line, /52 vCPU/);
  });

  it('defaults RAM to 4× vCPU when omitted', () => {
    const payload = sidebarConfigFromTool('get_quote', {vcpu: 8}, 'month');
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.ramGiB, 32);
  });

  it('maps GPU quote', () => {
    const payload = sidebarConfigFromTool(
      'get_quote',
      {gpuModel: 'H100', gpuCount: 2, vcpu: 40, ramGiB: 220},
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'gpu') return;
    assert.equal(payload.request.gpuModelMatch, 'H100');
    assert.equal(payload.request.gpuCount, 2);
    assert.match(payload.summary.line, /2× H100/);
  });

  it('maps lakehouse quote with fault-tolerant label', () => {
    const payload = sidebarConfigFromTool(
      'get_lakehouse_quote',
      {presetId: 'medium', k8sTier: 'ha'},
      'month',
    );
    assert.ok(payload && payload.kind === 'lakehouse');
    if (!payload || payload.kind !== 'lakehouse') return;
    assert.equal(payload.request.k8sTier, 'ha');
    assert.match(payload.summary.line, /отказоустойчивый/);
  });

  it('ignores unrelated tools', () => {
    assert.equal(sidebarConfigFromTool('search_prices', {query: 'H100'}, 'month'), null);
  });
});
