import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {suggestSavings, type SavingsLever, type SuggestSavingsResult} from './suggest-savings';
import {CHAT_TOOLS, runToolSync} from './tools';

function assertLeverInvariants(levers: SavingsLever[], baselineMonthly: number): void {
  for (const lever of levers) {
    assert.ok(lever.saveMonthlyRub >= 50, `${lever.id}: save too small`);
    assert.ok(lever.newMonthlyRub < lever.baselineMonthlyRub, `${lever.id}: not cheaper`);
    assert.ok(
      Math.abs(lever.baselineMonthlyRub - baselineMonthly) < 0.02,
      `${lever.id}: baseline drift`,
    );
    assert.ok(
      Math.abs(lever.saveMonthlyRub - (lever.baselineMonthlyRub - lever.newMonthlyRub)) < 0.02,
      `${lever.id}: save ≠ baseline − new`,
    );
    const pct = Math.round((lever.saveMonthlyRub / lever.baselineMonthlyRub) * 1000) / 10;
    assert.equal(lever.savePct, pct, `${lever.id}: savePct`);
    assert.ok(['safe', 'caution', 'breaking'].includes(lever.risk), lever.risk);
    assert.ok(lever.title.length > 3);
    assert.ok(lever.riskNote.length > 5);
    assert.ok(lever.assumption.length > 3);
    assert.ok(lever.provider.length > 1);
  }
  for (let i = 1; i < levers.length; i++) {
    assert.ok(
      levers[i - 1]!.saveMonthlyRub >= levers[i]!.saveMonthlyRub,
      'levers must be sorted by save desc',
    );
  }
}

function leverIds(r: SuggestSavingsResult): string[] {
  return r.levers.map((l) => l.id);
}

describe('suggestSavings', () => {
  it('requires shape', () => {
    const r = suggestSavings({});
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  it('rejects incomplete VM shape (vcpu without ram)', () => {
    const r = suggestSavings({vcpu: 8});
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /vcpu\+ramGiB|gpuModel/i);
  });

  it('rejects ram without vcpu', () => {
    const r = suggestSavings({ramGiB: 32});
    assert.equal(r.ok, false);
  });

  it('returns ranked levers for a VM with public IP', () => {
    const r = suggestSavings({
      vcpu: 8,
      ramGiB: 32,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 1,
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.baseline);
    assert.ok(r.baseline!.monthlyRub > 0);
    assert.equal(r.baseline!.publicIpCount, 1);
    assert.equal(r.baseline!.diskMedia, 'ssd');
    assert.equal(r.baseline!.purchaseModel, 'on-demand');
    assert.ok(r.levers.length >= 1, `expected levers, got ${r.levers.length}`);
    assert.ok(leverIds(r).includes('drop-public-ip'));
    assertLeverInvariants(r.levers, r.baseline!.monthlyRub);
  });

  it('chat suggestion shape 8/32 + IP surfaces drop-ip and at least one more lever', () => {
    // Mirrors CHAT_SUGGESTIONS id=suggest-savings-8-32
    const r = suggestSavings({
      vcpu: 8,
      ramGiB: 32,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 1,
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(leverIds(r).includes('drop-public-ip'));
    // Besides IP, expect disk/preemptible/provider/shrink family.
    assert.ok(
      r.levers.some((l) =>
        ['ssd-to-hdd', 'preemptible', 'switch-provider', 'shrink-boot-disk'].includes(l.id),
      ),
      leverIds(r).join(','),
    );
    const ip = r.levers.find((l) => l.id === 'drop-public-ip')!;
    assert.equal(ip.risk, 'caution');
    assert.match(ip.title, /IP/);
  });

  it('without public IP does not emit drop-public-ip', () => {
    const r = suggestSavings({
      vcpu: 4,
      ramGiB: 16,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(!leverIds(r).includes('drop-public-ip'));
    assertLeverInvariants(r.levers, r.baseline!.monthlyRub);
  });

  it('nvme baseline can suggest SSD downgrade', () => {
    const r = suggestSavings({
      vcpu: 4,
      ramGiB: 16,
      diskGiB: 100,
      diskMedia: 'nvme',
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.baseline!.diskMedia, 'nvme');
    assert.ok(
      leverIds(r).includes('nvme-to-ssd') ||
        leverIds(r).includes('preemptible') ||
        leverIds(r).includes('switch-provider'),
      leverIds(r).join(','),
    );
    if (leverIds(r).includes('nvme-to-ssd')) {
      const l = r.levers.find((x) => x.id === 'nvme-to-ssd')!;
      assert.equal(l.risk, 'caution');
    }
    // SSD→HDD only applies to ssd baseline
    assert.ok(!leverIds(r).includes('ssd-to-hdd'));
  });

  it('ssd baseline may suggest breaking HDD downgrade', () => {
    const r = suggestSavings({
      vcpu: 8,
      ramGiB: 16,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    if (leverIds(r).includes('ssd-to-hdd')) {
      const l = r.levers.find((x) => x.id === 'ssd-to-hdd')!;
      assert.equal(l.risk, 'breaking');
      assert.match(l.riskNote, /IO|БД|неприемлем/i);
    }
  });

  it('hdd baseline does not suggest ssd-to-hdd or nvme-to-ssd', () => {
    const r = suggestSavings({
      vcpu: 4,
      ramGiB: 8,
      diskGiB: 100,
      diskMedia: 'hdd',
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.baseline!.diskMedia, 'hdd');
    assert.ok(!leverIds(r).includes('ssd-to-hdd'));
    assert.ok(!leverIds(r).includes('nvme-to-ssd'));
  });

  it('shrink-boot-disk only when diskGiB ≥ 100', () => {
    const fat = suggestSavings({
      vcpu: 2,
      ramGiB: 4,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 0,
    });
    const thin = suggestSavings({
      vcpu: 2,
      ramGiB: 4,
      diskGiB: 40,
      diskMedia: 'ssd',
      publicIpCount: 0,
    });
    assert.equal(fat.ok, true, fat.error);
    assert.equal(thin.ok, true, thin.error);
    assert.ok(!leverIds(thin).includes('shrink-boot-disk'));
    // Fat disk often yields shrink; if catalog pricing equal, skip soft assert.
    if (leverIds(fat).includes('shrink-boot-disk')) {
      const l = fat.levers.find((x) => x.id === 'shrink-boot-disk')!;
      assert.equal(l.risk, 'safe');
      assert.match(l.title, /40/);
    }
  });

  it('preemptible lever is marked breaking when present', () => {
    const r = suggestSavings({
      vcpu: 16,
      ramGiB: 64,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    const pre = r.levers.find((l) => l.id === 'preemptible');
    if (pre) {
      assert.equal(pre.risk, 'breaking');
      assert.match(pre.riskNote, /прерыв|checkpoint|HA/i);
    }
  });

  it('provider focus pins baseline to that provider when quotable', () => {
    const r = suggestSavings({
      vcpu: 4,
      ramGiB: 16,
      diskGiB: 100,
      diskMedia: 'ssd',
      publicIpCount: 1,
      provider: 'Yandex',
    });
    assert.equal(r.ok, true, r.error);
    assert.match(r.baseline!.provider, /yandex/i);
    // switch-provider should point away from focused baseline if cheaper exists
    const sw = r.levers.find((l) => l.id === 'switch-provider');
    if (sw) {
      assert.ok(!/yandex/i.test(sw.provider), sw.provider);
      assert.ok(sw.newMonthlyRub < r.baseline!.monthlyRub);
    }
  });

  it('GPU H100 host yields savings levers without disk-media swaps', () => {
    const r = suggestSavings({
      gpuModel: 'H100',
      gpuCount: 1,
      diskGiB: 100,
      publicIpCount: 0,
    });
    assert.equal(r.ok, true, r.error);
    assert.ok(r.baseline);
    assert.ok(r.baseline!.monthlyRub > 10_000, `H100 baseline too cheap: ${r.baseline!.monthlyRub}`);
    assert.match(r.baseline!.shape, /H100/i);
    assert.equal(r.baseline!.diskMedia, null);
    assert.ok(!leverIds(r).includes('nvme-to-ssd'));
    assert.ok(!leverIds(r).includes('ssd-to-hdd'));
    assert.ok(!leverIds(r).includes('shrink-boot-disk'));
    assertLeverInvariants(r.levers, r.baseline!.monthlyRub);
  });

  it('multi-IP title mentions count', () => {
    const r = suggestSavings({
      vcpu: 2,
      ramGiB: 8,
      diskGiB: 100,
      publicIpCount: 3,
    });
    assert.equal(r.ok, true, r.error);
    const ip = r.levers.find((l) => l.id === 'drop-public-ip');
    if (ip) assert.match(ip.title, /×\s*3|×3/);
    assert.equal(r.baseline!.publicIpCount, 3);
  });

  it('negative publicIpCount clamps to zero', () => {
    const r = suggestSavings({
      vcpu: 2,
      ramGiB: 4,
      diskGiB: 40,
      publicIpCount: -2,
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.baseline!.publicIpCount, 0);
    assert.ok(!leverIds(r).includes('drop-public-ip'));
  });

  it('defaults disk to 100 GiB SSD when omitted', () => {
    const r = suggestSavings({vcpu: 4, ramGiB: 8});
    assert.equal(r.ok, true, r.error);
    assert.match(r.baseline!.shape, /100 GiB SSD/i);
    assert.equal(r.baseline!.diskMedia, 'ssd');
  });

  it('synthetic shape matrix always returns ok with invariant levers', () => {
    const shapes = [
      {vcpu: 2, ramGiB: 4, diskGiB: 40, diskMedia: 'ssd' as const, publicIpCount: 0},
      {vcpu: 2, ramGiB: 8, diskGiB: 100, diskMedia: 'ssd' as const, publicIpCount: 1},
      {vcpu: 4, ramGiB: 16, diskGiB: 100, diskMedia: 'nvme' as const, publicIpCount: 0},
      {vcpu: 8, ramGiB: 32, diskGiB: 200, diskMedia: 'ssd' as const, publicIpCount: 2},
      {vcpu: 16, ramGiB: 32, diskGiB: 100, diskMedia: 'hdd' as const, publicIpCount: 0},
      {vcpu: 32, ramGiB: 64, diskGiB: 100, diskMedia: 'ssd' as const, publicIpCount: 1},
    ];
    for (const shape of shapes) {
      const r = suggestSavings(shape);
      assert.equal(r.ok, true, `${JSON.stringify(shape)} → ${r.error}`);
      assert.ok(r.baseline!.monthlyRub > 0, JSON.stringify(shape));
      assert.ok(r.levers.length <= 8);
      assertLeverInvariants(r.levers, r.baseline!.monthlyRub);
      // Never invent negative savings
      assert.ok(r.levers.every((l) => l.saveMonthlyRub > 0));
    }
  });

  it('note warns levers are mutually exclusive', () => {
    const r = suggestSavings({vcpu: 8, ramGiB: 32, publicIpCount: 1});
    assert.equal(r.ok, true, r.error);
    assert.match(r.note, /взаимоисключающ|не складывай/i);
    assert.equal(r.currency, 'RUB');
    assert.equal(r.vatIncluded, true);
    assert.ok(r.catalogAsOf.length >= 8);
  });

  it('is registered and callable via runToolSync', () => {
    assert.ok(CHAT_TOOLS.some((t) => t.function.name === 'suggest_savings'));
    const raw = runToolSync(
      'suggest_savings',
      JSON.stringify({vcpu: 2, ramGiB: 4, diskGiB: 40, publicIpCount: 1}),
    );
    const parsed = JSON.parse(raw) as SuggestSavingsResult;
    assert.equal(parsed.ok, true, raw);
    assert.ok(Array.isArray(parsed.levers));
  });

  it('runToolSync chat-suggestion payload yields drop-ip for 8/32', () => {
    const raw = runToolSync(
      'suggest_savings',
      JSON.stringify({
        vcpu: 8,
        ramGiB: 32,
        diskGiB: 100,
        diskMedia: 'ssd',
        publicIpCount: 1,
      }),
    );
    const parsed = JSON.parse(raw) as SuggestSavingsResult;
    assert.equal(parsed.ok, true, raw);
    assert.ok(parsed.levers.some((l) => l.id === 'drop-public-ip'));
    assert.ok(parsed.baseline!.monthlyRub > parsed.levers[0]!.newMonthlyRub);
  });

  it('keeps tool payload compact for the model', () => {
    const r = suggestSavings({
      vcpu: 16,
      ramGiB: 64,
      diskGiB: 200,
      diskMedia: 'nvme',
      publicIpCount: 2,
    });
    const json = JSON.stringify(r);
    assert.ok(json.length < 8_000, `payload too large: ${json.length}`);
    assert.ok(r.levers.length <= 8);
  });
});
