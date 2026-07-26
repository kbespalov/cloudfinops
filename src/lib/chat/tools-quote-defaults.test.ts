import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {runToolSync} from './tools';
import {
  applySidebarConfig,
  sidebarConfigFromTool,
  sidebarConfigFromToolResult,
} from './sidebar-config';

describe('get_quote compute defaults', () => {
  it('defaults omitted RAM to 4×vCPU (not 1 GiB)', () => {
    const raw = runToolSync('get_quote', JSON.stringify({vcpu: 32, period: 'month'}));
    const data = JSON.parse(raw) as {
      request?: {vcpu?: number; ramGiB?: number; diskGiB?: number; publicIpCount?: number};
      error?: string;
    };
    assert.equal(data.error, undefined);
    assert.equal(data.request?.vcpu, 32);
    assert.equal(data.request?.ramGiB, 128);
    assert.equal(data.request?.diskGiB, 100);
    assert.equal(data.request?.publicIpCount, 0);
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

  it('does not invent public IP; chat and sidebar share the same basket shape', () => {
    const args = {vcpu: 4, ramGiB: 16, period: 'month' as const};
    const raw = runToolSync('get_quote', JSON.stringify(args));
    const data = JSON.parse(raw) as {
      request?: {publicIpCount?: number; diskGiB?: number};
      quotes?: {provider: string; total: number; parts: {label: string}[]}[];
      note?: string;
    };
    assert.equal(data.request?.publicIpCount, 0);
    assert.equal(data.request?.diskGiB, 100);
    assert.match(data.note ?? '', /Публичный IP не включён/);
    assert.ok(data.quotes?.length);
    for (const q of data.quotes ?? []) {
      assert.ok(
        !q.parts.some((p) => /публичн/i.test(p.label)),
        `${q.provider} should not include public IP`,
      );
    }

    const sidebar = sidebarConfigFromTool('get_quote', args, 'month');
    assert.ok(sidebar && sidebar.kind === 'adhoc');
    if (!sidebar || sidebar.kind !== 'adhoc' || sidebar.request.kind !== 'compute') return;
    assert.equal(sidebar.request.publicIpCount, 0);
    assert.equal(sidebar.request.diskGiB, data.request?.diskGiB);
    assert.equal(sidebar.request.vcpu, 4);
    assert.equal(sidebar.request.ramGiB, 16);
  });

  it('passes diskMedia=hdd into request so the sidebar can switch from NVMe/SSD', () => {
    const raw = runToolSync(
      'get_quote',
      JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'hdd'}),
    );
    const data = JSON.parse(raw) as {
      request: {diskMedia?: string; preferNvme?: boolean};
      quotes: {parts: {label: string}[]}[];
    };
    assert.equal(data.request.diskMedia, 'hdd');
    assert.notEqual(data.request.preferNvme, true);
    const diskLabel = data.quotes[0]?.parts.find((p) =>
      /диск|disk|hdd|ssd|nvme/i.test(p.label),
    )?.label;
    assert.ok(diskLabel);
    assert.match(diskLabel!, /HDD|hdd/i);

    const sidebar = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'hdd'},
      'month',
    );
    assert.ok(sidebar && sidebar.kind === 'adhoc');
    if (!sidebar || sidebar.kind !== 'adhoc' || sidebar.request.kind !== 'compute') return;
    assert.equal(sidebar.request.diskMedia, 'hdd');
    assert.match(sidebar.summary.line, /HDD/);
  });

  it('passes diskMedia=nvme with preferNvme for sidebar NVMe label', () => {
    const raw = runToolSync(
      'get_quote',
      JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'nvme'}),
    );
    const data = JSON.parse(raw) as {
      request: {diskMedia?: string; preferNvme?: boolean};
    };
    assert.equal(data.request.diskMedia, 'nvme');
    assert.equal(data.request.preferNvme, true);

    const sidebar = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'nvme'},
      'month',
    );
    assert.ok(sidebar && sidebar.kind === 'adhoc');
    if (!sidebar || sidebar.kind !== 'adhoc' || sidebar.request.kind !== 'compute') return;
    assert.equal(sidebar.request.preferNvme, true);
    assert.match(sidebar.summary.line, /NVMe/);
  });

  it('HDD disk line is cheaper than SSD for the same shape (catalog sanity)', () => {
    const hdd = JSON.parse(
      runToolSync(
        'get_quote',
        JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'hdd', period: 'month'}),
      ),
    ) as {quotes: {provider: string; parts: {label: string; amount: number}[]}[]};
    const ssd = JSON.parse(
      runToolSync(
        'get_quote',
        JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'ssd', period: 'month'}),
      ),
    ) as {quotes: {provider: string; parts: {label: string; amount: number}[]}[]};

    const diskAmount = (
      quotes: {provider: string; parts: {label: string; amount: number}[]}[],
      provider: string,
    ) =>
      quotes
        .find((q) => q.provider === provider)
        ?.parts.find((p) => /диск|disk|hdd|ssd|nvme/i.test(p.label))?.amount;

    // Pick a provider that publishes both HDD and SSD boot tiers.
    const provider =
      hdd.quotes.find((q) => diskAmount(hdd.quotes, q.provider) != null)?.provider ?? '';
    const hddDisk = diskAmount(hdd.quotes, provider);
    const ssdDisk = diskAmount(ssd.quotes, provider);
    assert.ok(provider && hddDisk != null && ssdDisk != null);
    assert.ok(
      hddDisk! < ssdDisk!,
      `${provider}: expected HDD ${hddDisk} < SSD ${ssdDisk}`,
    );
  });

  it('tool-result request syncs HDD into sidebar after NVMe args path', () => {
    const nvmeArgs = sidebarConfigFromTool(
      'get_quote',
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'nvme'},
      'month',
    );
    const toolJson = runToolSync(
      'get_quote',
      JSON.stringify({
        vcpu: 32,
        ramGiB: 64,
        diskGiB: 100,
        diskMedia: 'hdd',
        publicIpCount: 1,
        period: 'month',
      }),
    );
    const fromResult = sidebarConfigFromToolResult('get_quote', toolJson, 'month');
    assert.ok(nvmeArgs && fromResult);
    const merged = applySidebarConfig(nvmeArgs, fromResult!, 'month');
    assert.ok(merged && merged.kind === 'adhoc');
    if (!merged || merged.kind !== 'adhoc' || merged.request.kind !== 'compute') return;
    assert.equal(merged.request.diskMedia, 'hdd');
    assert.match(merged.summary.line, /HDD/);
  });

  it('includes public IP in get_quote totals when requested', () => {
    const without = JSON.parse(
      runToolSync('get_quote', JSON.stringify({vcpu: 4, ramGiB: 16, period: 'month'})),
    ) as {best?: {total: number | null}; quotes?: {parts: {label: string}[]}[]};
    const withIp = JSON.parse(
      runToolSync(
        'get_quote',
        JSON.stringify({vcpu: 4, ramGiB: 16, publicIpCount: 1, period: 'month'}),
      ),
    ) as {
      request?: {publicIpCount?: number};
      best?: {total: number | null};
      quotes?: {parts: {label: string}[]}[];
      note?: string;
    };
    assert.equal(withIp.request?.publicIpCount, 1);
    assert.match(withIp.note ?? '', /публичный IP ×1/i);
    assert.ok(withIp.quotes?.[0]?.parts.some((p) => /публичн/i.test(p.label)));
    if (without.best?.total != null && withIp.best?.total != null) {
      assert.ok(withIp.best.total > without.best.total);
    }
  });
});
