import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mergeSidebarPatch, sidebarConfigFromTool} from './sidebar-config';

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

  it('maps compose_solution virtual_machine like get_quote', () => {
    const payload = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'virtual_machine',
        requirements: {vcpu: 8, ramGiB: 32, diskGiB: 100},
      },
      'year',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.vcpu, 8);
    assert.equal(payload.request.ramGiB, 32);
    assert.equal(payload.request.period, 'year');
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

  it('maps CDN search_prices to an adhoc-patch for the basket', () => {
    const payload = sidebarConfigFromTool(
      'search_prices',
      {query: 'исходящий трафик CDN', category: 'cdn', volumeGiB: 1024},
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc-patch');
    if (!payload || payload.kind !== 'adhoc-patch') return;
    assert.equal(payload.patch.cdnEgressGiB, 1024);
    assert.match(payload.summary.line, /CDN egress/);
  });

  it('merges CDN patch into an existing compute basket', () => {
    const base = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 52, ramGiB: 128, diskGiB: 100},
      'month',
    );
    const patch = sidebarConfigFromTool(
      'search_prices',
      {category: 'cdn', volumeGiB: 1024},
      'month',
    );
    assert.ok(base && base.kind === 'adhoc' && patch && patch.kind === 'adhoc-patch');
    if (!base || base.kind !== 'adhoc' || !patch || patch.kind !== 'adhoc-patch') return;
    const merged = mergeSidebarPatch(base, patch, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.cdnEgressGiB, 1024);
    assert.equal(merged.request.vcpu, 52);
    assert.match(merged.summary.line, /52 vCPU/);
    assert.match(merged.summary.line, /CDN egress/);
  });

  it('accumulates repeated CDN patches and seeds a VM when basket is empty', () => {
    const patch = sidebarConfigFromTool(
      'search_prices',
      {category: 'cdn', volumeGiB: 1024},
      'month',
    );
    assert.ok(patch && patch.kind === 'adhoc-patch');
    if (!patch || patch.kind !== 'adhoc-patch') return;

    const seeded = mergeSidebarPatch(null, patch, 'month');
    assert.ok(seeded && seeded.kind === 'adhoc');
    if (!seeded || seeded.kind !== 'adhoc' || seeded.request.kind !== 'compute') return;
    assert.equal(seeded.request.cdnEgressGiB, 1024);
    assert.equal(seeded.request.vcpu, 8);

    const again = mergeSidebarPatch(seeded, patch, 'month');
    assert.ok(again && again.kind === 'adhoc');
    if (!again || again.kind !== 'adhoc' || again.request.kind !== 'compute') return;
    assert.equal(again.request.cdnEgressGiB, 2048);
  });

  it('ignores unrelated search_prices', () => {
    assert.equal(sidebarConfigFromTool('search_prices', {query: 'H100'}, 'month'), null);
  });
});
