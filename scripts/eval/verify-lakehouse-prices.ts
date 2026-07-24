/**
 * Offline price integrity for lakehouse quotes (no LLM).
 *   npx tsx scripts/eval/verify-lakehouse-prices.ts
 */
import assert from 'node:assert/strict';
import {amountNumber} from '../../src/lib/catalog';
import {resolveLakehouseInput} from '../../src/lib/calculator/lakehouse-presets';
import {
  pickObjectStorageCapacity,
  pickK8sMasterMeter,
  quoteLakehouse,
} from '../../src/lib/calculator/lakehouse-quote';
import {quotePreset} from '../../src/lib/calculator/quote';
import type {ComputePreset} from '../../src/lib/calculator/presets';
import {runToolSync} from '../../src/lib/chat/tools';

function duty(h: number) {
  return h / 24;
}

function poolCost(
  provider: string,
  pool: {count: number; vcpu: number; ramGiB: number; diskGiB: number; hoursPerDay: number},
) {
  if (pool.count <= 0) return 0;
  const preset: ComputePreset = {
    id: `chk-${pool.vcpu}-${pool.ramGiB}`,
    kind: 'compute',
    family: 'general',
    title: `${pool.vcpu}/${pool.ramGiB}`,
    subtitle: '',
    vcpu: pool.vcpu,
    ramGiB: pool.ramGiB,
    diskGiB: pool.diskGiB,
    diskMedia: 'ssd',
    purchaseModel: 'on-demand',
    vcpuShare: '100%',
  };
  const q = quotePreset(preset, 'month').quotes.find((x) => x.provider === provider);
  assert.ok(q, `no VM quote for ${provider}`);
  return q.total * pool.count * duty(pool.hoursPerDay);
}

const cases = [
  {label: 'S-basic', input: resolveLakehouseInput('small', {k8sTier: 'basic'})},
  {label: 'M-ha', input: resolveLakehouseInput('medium', {k8sTier: 'ha'})},
  {label: 'L-ha', input: resolveLakehouseInput('large', {k8sTier: 'ha'})},
] as const;

console.log('=== Independent recompute vs quoteLakehouse ===');
for (const c of cases) {
  const view = quoteLakehouse(c.input, 'month');
  assert.ok(view.best, c.label);
  console.log(
    `\n${c.label}: providers=${view.quotes.length} best=${view.best.providerName} ${Math.round(view.best.total)}₽`,
  );
  for (const q of view.quotes) {
    const std = pickObjectStorageCapacity(q.provider, 'standard');
    assert.ok(std, q.provider);
    const totalGiB = Math.round(c.input.lakeTiB * 1024);
    const wantCold = Math.round((totalGiB * (100 - c.input.hotPercent)) / 100);
    const cold = wantCold > 0 ? pickObjectStorageCapacity(q.provider, 'cold') : null;
    const coldGiB = cold ? wantCold : 0;
    const hotGiB = totalGiB - coldGiB;
    const hotRate = amountNumber(std, 'month')!;
    const coldRate = cold ? amountNumber(cold, 'month')! : 0;
    const storage = hotGiB * hotRate + coldGiB * coldRate;

    const k8s = pickK8sMasterMeter(q.provider, c.input.k8sTier);
    assert.ok(k8s, `${q.provider} k8s`);
    const k8sAmt = amountNumber(k8s.meter, 'month')!;

    const platform = poolCost(q.provider, {...c.input.platform, hoursPerDay: 24});
    const etl = poolCost(q.provider, c.input.etl);
    const query = poolCost(q.provider, c.input.query);
    const expected = storage + k8sAmt + platform + etl + query;
    const delta = Math.abs(expected - q.total);
    assert.ok(
      delta < 0.05,
      `${q.provider} delta ${delta}: expected ${expected} got ${q.total}`,
    );

    const partsSum = q.parts.reduce((s, p) => s + p.amount, 0);
    assert.ok(Math.abs(partsSum - q.total) < 0.05, 'parts sum');
    assert.ok(!q.note || !q.note.includes('cold-класса'), 'no cold note');

    console.log(
      `  OK ${q.providerName.padEnd(14)} ${Math.round(q.total).toLocaleString('ru-RU').padStart(10)}  ` +
        `stor=${Math.round(storage)} k8s=${Math.round(k8sAmt)} plat=${Math.round(platform)} etl=${Math.round(etl)} sql=${Math.round(query)}` +
        (k8s.synthetic ? ' *syn' : ''),
    );
  }
}

const s = quoteLakehouse(resolveLakehouseInput('small'), 'month');
const m = quoteLakehouse(resolveLakehouseInput('medium'), 'month');
const l = quoteLakehouse(resolveLakehouseInput('large'), 'month');
assert.ok(s.best!.total < m.best!.total && m.best!.total < l.best!.total);
console.log(
  '\n=== S < M < L ===',
  Math.round(s.best!.total),
  Math.round(m.best!.total),
  Math.round(l.best!.total),
);

const basic = quoteLakehouse(resolveLakehouseInput('medium', {k8sTier: 'basic'}), 'month');
const ha = quoteLakehouse(resolveLakehouseInput('medium', {k8sTier: 'ha'}), 'month');
const crB = basic.quotes.find((q) => q.provider === 'cloud-ru')!;
const crH = ha.quotes.find((q) => q.provider === 'cloud-ru')!;
assert.ok(crH.total > crB.total);
assert.ok(!ha.quotes.some((q) => q.provider === 't1-cloud'), 'T1 dropped on HA');
console.log(
  '=== Cloud.ru HA > basic ===',
  Math.round(crB.total),
  '→',
  Math.round(crH.total),
  `(+${Math.round(crH.total - crB.total)})`,
);

// Tool ↔ engine parity
const tool = JSON.parse(
  runToolSync(
    'get_lakehouse_quote',
    JSON.stringify({
      presetId: 'medium',
      lakeTiB: 75,
      hotPercent: 80,
      k8sTier: 'ha',
      etlHoursPerDay: 8,
      queryHoursPerDay: 12,
      period: 'month',
    }),
  ),
) as {best: {provider: string; total: number}; quotes: {provider: string; total: number}[]};
assert.equal(tool.best.provider, m.best!.providerName);
assert.equal(tool.best.total, Math.round(m.best!.total * 100) / 100);
assert.equal(tool.quotes.length, m.quotes.length);
console.log('=== tool ↔ calculator parity === OK', tool.best);

console.log('\nALL PRICE CHECKS PASSED');
