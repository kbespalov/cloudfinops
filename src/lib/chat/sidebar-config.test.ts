import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  applySidebarConfig,
  mergeSidebarPatch,
  normalizeSidebarFields,
  parseSidebarDiskMedia,
  sidebarConfigFromTool,
  sidebarConfigFromToolResult,
} from './sidebar-config';

describe('parseSidebarDiskMedia', () => {
  it('recognizes hdd / ssd / nvme and Russian aliases', () => {
    assert.deepEqual(parseSidebarDiskMedia('hdd'), {diskMedia: 'hdd', explicit: true});
    assert.deepEqual(parseSidebarDiskMedia('ХДД'), {diskMedia: 'hdd', explicit: true});
    assert.deepEqual(parseSidebarDiskMedia('network-hdd'), {diskMedia: 'hdd', explicit: true});
    assert.deepEqual(parseSidebarDiskMedia('ssd'), {
      diskMedia: 'ssd',
      preferNvme: false,
      explicit: true,
    });
    assert.deepEqual(parseSidebarDiskMedia('ССД'), {
      diskMedia: 'ssd',
      preferNvme: false,
      explicit: true,
    });
    assert.deepEqual(parseSidebarDiskMedia('nvme'), {
      diskMedia: 'ssd',
      preferNvme: true,
      explicit: true,
    });
    assert.deepEqual(parseSidebarDiskMedia('НВМЕ'), {
      diskMedia: 'ssd',
      preferNvme: true,
      explicit: true,
    });
  });

  it('returns non-explicit for empty or unknown media', () => {
    assert.equal(parseSidebarDiskMedia(undefined).explicit, false);
    assert.equal(parseSidebarDiskMedia('').explicit, false);
    assert.equal(parseSidebarDiskMedia('optical').explicit, false);
  });
});

describe('normalizeSidebarFields', () => {
  it('maps compose aliases to canonical basket fields', () => {
    const n = normalizeSidebarFields({
      workerVcpu: 8,
      workerRamGiB: 32,
      objectStorageGiB: 150 * 1024,
      egressGiB: 0,
      cdnRequested: true,
      workload: 'medium',
    });
    assert.equal(n.vcpu, 8);
    assert.equal(n.ramGiB, 32);
    assert.equal(n.lakeTiB, 150);
    assert.equal(n.objectStorageGiB, 150 * 1024);
    assert.equal(n.cdnEgressGiB, 1024);
    assert.equal(n.presetId, 'medium');
  });

  it('maps diskMedia hdd / nvme aliases', () => {
    assert.equal(normalizeSidebarFields({diskMedia: 'hdd'}).diskMedia, 'hdd');
    assert.equal(normalizeSidebarFields({diskMedia: 'nvme'}).diskMedia, 'nvme');
    assert.equal(normalizeSidebarFields({diskMedia: 'nvme'}).preferNvme, true);
  });

  it('maps preferNvme flag and blockStorageGiB / egressGiB aliases', () => {
    const fromFlag = normalizeSidebarFields({preferNvme: true, blockStorageGiB: 200, egressGiB: 100});
    assert.equal(fromFlag.diskMedia, 'nvme');
    assert.equal(fromFlag.preferNvme, true);
    assert.equal(fromFlag.diskGiB, 200);
    assert.equal(fromFlag.internetEgressGiB, 100);
  });
});

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

  it('does not invent a public IP for get_quote (sync with chat totals)', () => {
    const payload = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 16},
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.publicIpCount, 0);
    assert.equal(payload.request.diskGiB, 100);
    assert.doesNotMatch(payload.summary.line, /IP/);
  });

  it('passes through publicIpCount when the tool requests it', () => {
    const payload = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 16, diskGiB: 100, publicIpCount: 1},
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.publicIpCount, 1);
    assert.match(payload.summary.line, /IP ×1/);
  });

  it('forwards publicIpCount from compose_solution requirements', () => {
    const payload = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'web_application',
        requirements: {vcpu: 2, ramGiB: 4, diskGiB: 50, publicIpCount: 1},
      },
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.publicIpCount, 1);
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

  it('maps compose_solution lakehouse objectStorageGiB → sidebar lakeTiB (75→150)', () => {
    const payload = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'lakehouse',
        requirements: {
          workload: 'medium',
          objectStorageGiB: 150 * 1024,
          k8sTier: 'ha',
        },
      },
      'month',
    );
    assert.ok(payload && payload.kind === 'lakehouse');
    if (!payload || payload.kind !== 'lakehouse') return;
    assert.equal(payload.request.lakeTiB, 150);
    assert.equal(payload.request.presetId, 'medium');
    assert.match(payload.summary.line, /150 TiB/);
  });

  it('maps get_lakehouse_quote lakeTiB override for sidebar re-render', () => {
    const payload = sidebarConfigFromTool(
      'get_lakehouse_quote',
      {presetId: 'medium', lakeTiB: 150, k8sTier: 'ha'},
      'month',
    );
    assert.ok(payload && payload.kind === 'lakehouse');
    if (!payload || payload.kind !== 'lakehouse') return;
    assert.equal(payload.request.lakeTiB, 150);
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
    assert.equal(payload.mode, 'add');
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

describe('applySidebarConfig merge basket', () => {
  it('keeps CDN when a later get_quote only changes RAM', () => {
    const vm = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 16, diskGiB: 100},
      'month',
    );
    assert.ok(vm && vm.kind === 'adhoc');
    if (!vm || vm.kind !== 'adhoc') return;

    const withCdn = applySidebarConfig(
      vm,
      {
        kind: 'adhoc-patch',
        mode: 'add',
        patch: {cdnEgressGiB: 1024},
        summary: {line: 'CDN'},
      },
      'month',
    );
    assert.ok(withCdn && withCdn.kind === 'adhoc');
    if (!withCdn || withCdn.kind !== 'adhoc' || withCdn.request.kind !== 'compute') return;
    assert.equal(withCdn.request.cdnEgressGiB, 1024);

    const ramBump = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 32, diskGiB: 100},
      'month',
    );
    assert.ok(ramBump && ramBump.kind === 'adhoc');
    if (!ramBump || ramBump.kind !== 'adhoc') return;

    const merged = applySidebarConfig(withCdn, ramBump, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.ramGiB, 32);
    assert.equal(merged.request.cdnEgressGiB, 1024);
    assert.match(merged.summary.line, /CDN egress/);
  });

  it('merges IP patch after CDN without wiping either', () => {
    let basket = applySidebarConfig(
      null,
      sidebarConfigFromTool('get_quote', {vcpu: 4, ramGiB: 16}, 'month')!,
      'month',
    );
    basket = applySidebarConfig(
      basket,
      {
        kind: 'adhoc-patch',
        mode: 'add',
        patch: {cdnEgressGiB: 1024},
        summary: {line: 'CDN'},
      },
      'month',
    );
    basket = applySidebarConfig(
      basket,
      {
        kind: 'adhoc-patch',
        mode: 'set',
        patch: {publicIpCount: 1},
        summary: {line: 'IP'},
      },
      'month',
    );
    assert.ok(basket && basket.kind === 'adhoc');
    if (!basket || basket.kind !== 'adhoc' || basket.request.kind !== 'compute') return;
    assert.equal(basket.request.cdnEgressGiB, 1024);
    assert.equal(basket.request.publicIpCount, 1);
    assert.equal(basket.request.vcpu, 4);
  });

  it('updates lakehouse 75→150 TiB via applySidebarConfig', () => {
    const first = sidebarConfigFromTool(
      'get_lakehouse_quote',
      {presetId: 'medium', lakeTiB: 75, k8sTier: 'ha'},
      'month',
    );
    const second = sidebarConfigFromTool(
      'get_lakehouse_quote',
      {presetId: 'medium', lakeTiB: 150, k8sTier: 'ha'},
      'month',
    );
    assert.ok(first && second);
    const merged = applySidebarConfig(first, second!, 'month');
    assert.ok(merged && merged.kind === 'lakehouse');
    if (!merged || merged.kind !== 'lakehouse') return;
    assert.equal(merged.request.lakeTiB, 150);
    assert.match(merged.summary.line, /150 TiB/);
  });

  it('maps S3 + internet egress into compute summary', () => {
    const payload = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'virtual_machine',
        requirements: {
          vcpu: 8,
          ramGiB: 32,
          diskGiB: 100,
          objectStorageGiB: 2048,
          egressGiB: 512,
        },
      },
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.objectStorageGiB, 2048);
    assert.equal(payload.request.internetEgressGiB, 512);
    assert.match(payload.summary.line, /S3/);
    assert.match(payload.summary.line, /Internet egress/);
  });

  it('switches sidebar diskMedia NVMe/SSD → HDD on follow-up', () => {
    const nvme = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'nvme', publicIpCount: 1},
      'month',
    );
    assert.ok(nvme && nvme.kind === 'adhoc');
    if (!nvme || nvme.kind !== 'adhoc' || nvme.request.kind !== 'compute') return;
    assert.equal(nvme.request.preferNvme, true);
    assert.match(nvme.summary.line, /NVMe/);

    const hdd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'hdd', publicIpCount: 1},
      'month',
    );
    assert.ok(hdd && hdd.kind === 'adhoc');
    if (!hdd || hdd.kind !== 'adhoc') return;

    const merged = applySidebarConfig(nvme, hdd, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'hdd');
    assert.equal(merged.request.preferNvme, undefined);
    assert.match(merged.summary.line, /HDD/);
    assert.doesNotMatch(merged.summary.line, /NVMe/);
  });

  it('keeps HDD when a later get_quote omits diskMedia', () => {
    const hdd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'hdd'},
      'month',
    );
    const ramOnly = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 128, diskGiB: 100},
      'month',
    );
    assert.ok(hdd && ramOnly);
    const merged = applySidebarConfig(hdd, ramOnly!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'hdd');
    assert.equal(merged.request.ramGiB, 128);
  });

  it('switches sidebar HDD → SSD and clears preferNvme', () => {
    const hdd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 8, ramGiB: 32, diskGiB: 100, diskMedia: 'hdd'},
      'month',
    );
    const ssd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 8, ramGiB: 32, diskGiB: 100, diskMedia: 'ssd'},
      'month',
    );
    assert.ok(hdd && ssd);
    const merged = applySidebarConfig(hdd, ssd!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'ssd');
    assert.equal(merged.request.preferNvme, undefined);
    assert.match(merged.summary.line, /SSD/);
    assert.doesNotMatch(merged.summary.line, /HDD|NVMe/);
  });

  it('switches sidebar HDD → NVMe via diskMedia=nvme', () => {
    const hdd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 8, ramGiB: 32, diskGiB: 100, diskMedia: 'hdd'},
      'month',
    );
    const nvme = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 8, ramGiB: 32, diskGiB: 100, diskMedia: 'nvme'},
      'month',
    );
    assert.ok(hdd && nvme);
    const merged = applySidebarConfig(hdd, nvme!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'ssd');
    assert.equal(merged.request.preferNvme, true);
    assert.match(merged.summary.line, /NVMe/);
  });

  it('keeps NVMe when a later get_quote omits diskMedia', () => {
    const nvme = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 16, ramGiB: 64, diskGiB: 100, diskMedia: 'nvme'},
      'month',
    );
    const vcpuOnly = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100},
      'month',
    );
    assert.ok(nvme && vcpuOnly);
    const merged = applySidebarConfig(nvme, vcpuOnly!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.vcpu, 32);
    assert.equal(merged.request.preferNvme, true);
    assert.match(merged.summary.line, /NVMe/);
  });

  it('applies diskMedia via adhoc-patch without wiping CDN', () => {
    let basket = applySidebarConfig(
      null,
      sidebarConfigFromTool(
        'get_quote',
        {vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'nvme'},
        'month',
      )!,
      'month',
    );
    basket = applySidebarConfig(
      basket,
      {
        kind: 'adhoc-patch',
        mode: 'add',
        patch: {cdnEgressGiB: 2048},
        summary: {line: 'CDN'},
      },
      'month',
    );
    basket = applySidebarConfig(
      basket,
      {
        kind: 'adhoc-patch',
        mode: 'set',
        patch: {diskMedia: 'hdd'},
        summary: {line: 'HDD'},
      },
      'month',
    );
    assert.ok(basket && basket.kind === 'adhoc');
    if (!basket || basket.kind !== 'adhoc' || basket.request.kind !== 'compute') return;
    assert.equal(basket.request.diskMedia, 'hdd');
    assert.equal(basket.request.preferNvme, undefined);
    assert.equal(basket.request.cdnEgressGiB, 2048);
    assert.match(basket.summary.line, /HDD/);
    assert.match(basket.summary.line, /CDN egress/);
  });

  it('preserves S3 + internet egress when switching disk media', () => {
    const withExtras = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'virtual_machine',
        requirements: {
          vcpu: 8,
          ramGiB: 32,
          diskGiB: 100,
          diskMedia: 'ssd',
          objectStorageGiB: 4096,
          egressGiB: 256,
        },
      },
      'month',
    );
    const hdd = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 8, ramGiB: 32, diskGiB: 100, diskMedia: 'hdd'},
      'month',
    );
    assert.ok(withExtras && hdd);
    const merged = applySidebarConfig(withExtras, hdd!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'hdd');
    assert.equal(merged.request.objectStorageGiB, 4096);
    assert.equal(merged.request.internetEgressGiB, 256);
    assert.match(merged.summary.line, /HDD/);
    assert.match(merged.summary.line, /S3/);
    assert.match(merged.summary.line, /Internet egress/);
  });

  it('maps compose_solution diskMedia=hdd into summary', () => {
    const payload = sidebarConfigFromTool(
      'compose_solution',
      {
        solutionType: 'virtual_machine',
        requirements: {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'hdd', publicIpCount: 1},
      },
      'month',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.diskMedia, 'hdd');
    assert.match(payload.summary.line, /HDD 100 GiB/);
    assert.match(payload.summary.line, /IP ×1/);
  });

  it('patch mode=set replaces CDN volume; mode=add accumulates', () => {
    const base = applySidebarConfig(
      null,
      sidebarConfigFromTool('get_quote', {vcpu: 4, ramGiB: 16}, 'month')!,
      'month',
    );
    const added = applySidebarConfig(
      base,
      {
        kind: 'adhoc-patch',
        mode: 'add',
        patch: {cdnEgressGiB: 1024},
        summary: {line: 'CDN'},
      },
      'month',
    );
    const set = applySidebarConfig(
      added,
      {
        kind: 'adhoc-patch',
        mode: 'set',
        patch: {cdnEgressGiB: 512},
        summary: {line: 'CDN'},
      },
      'month',
    );
    assert.ok(set && set.kind === 'adhoc');
    if (!set || set.kind !== 'adhoc' || set.request.kind !== 'compute') return;
    assert.equal(set.request.cdnEgressGiB, 512);

    const again = applySidebarConfig(
      set,
      {
        kind: 'adhoc-patch',
        mode: 'add',
        patch: {cdnEgressGiB: 512},
        summary: {line: 'CDN'},
      },
      'month',
    );
    assert.ok(again && again.kind === 'adhoc');
    if (!again || again.kind !== 'adhoc' || again.request.kind !== 'compute') return;
    assert.equal(again.request.cdnEgressGiB, 1024);
  });
});

describe('sidebarConfigFromToolResult', () => {
  it('reads resolved lakehouse request from tool result JSON', () => {
    const payload = sidebarConfigFromToolResult(
      'get_lakehouse_quote',
      JSON.stringify({
        request: {presetId: 'medium', lakeTiB: 150, hotPercent: 80, k8sTier: 'ha'},
      }),
      'month',
    );
    assert.ok(payload && payload.kind === 'lakehouse');
    if (!payload || payload.kind !== 'lakehouse') return;
    assert.equal(payload.request.lakeTiB, 150);
  });

  it('reads compose requirementSpec storageGiB for lakehouse', () => {
    const payload = sidebarConfigFromToolResult(
      'compose_solution',
      JSON.stringify({
        requirementSpec: {
          solutionType: 'lakehouse',
          quantities: {storageGiB: 150 * 1024},
          extras: {workload: 'medium'},
          constraints: {k8sTier: 'ha'},
        },
      }),
      'month',
    );
    assert.ok(payload && payload.kind === 'lakehouse');
    if (!payload || payload.kind !== 'lakehouse') return;
    assert.equal(payload.request.lakeTiB, 150);
  });

  it('reads get_quote request.diskMedia=hdd from tool result (second sidebar_config sync)', () => {
    const payload = sidebarConfigFromToolResult(
      'get_quote',
      JSON.stringify({
        request: {
          kind: 'compute',
          vcpu: 32,
          ramGiB: 64,
          diskGiB: 100,
          diskMedia: 'hdd',
          preferNvme: false,
          publicIpCount: 1,
          period: 'month',
        },
      }),
      'year',
    );
    assert.ok(payload && payload.kind === 'adhoc');
    if (!payload || payload.kind !== 'adhoc' || payload.request.kind !== 'compute') return;
    assert.equal(payload.request.period, 'year');
    assert.equal(payload.request.diskMedia, 'hdd');
    assert.equal(payload.request.preferNvme, undefined);
    assert.match(payload.summary.line, /HDD/);
  });

  it('applies tool-result HDD onto previous NVMe basket (chat follow-up path)', () => {
    const nvme = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'nvme', publicIpCount: 1},
      'month',
    );
    const fromResult = sidebarConfigFromToolResult(
      'get_quote',
      JSON.stringify({
        request: {
          vcpu: 32,
          ramGiB: 64,
          diskGiB: 100,
          diskMedia: 'hdd',
          publicIpCount: 1,
        },
      }),
      'month',
    );
    assert.ok(nvme && fromResult);
    const merged = applySidebarConfig(nvme, fromResult!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'hdd');
    assert.equal(merged.request.preferNvme, undefined);
    assert.equal(merged.request.publicIpCount, 1);
    assert.match(merged.summary.line, /HDD 100 GiB/);
  });
});
