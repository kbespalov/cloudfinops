/**
 * Offline verification for lakehouse chat wiring (no LLM key required).
 *   npx tsx scripts/eval/verify-lakehouse-chat.ts
 */
import assert from 'node:assert/strict';
import {matchInferenceIntent} from '../../src/lib/chat/inference-intent';
import {
  LAKEHOUSE_SYSTEM_ADDENDUM,
  matchLakehouseIntent,
} from '../../src/lib/chat/lakehouse-intent';
import {
  CHAT_TOOLS,
  CHAT_TOOLS_WITH_INFERENCE,
  CHAT_TOOLS_WITH_LAKEHOUSE,
  runToolSync,
} from '../../src/lib/chat/tools';
import {quoteLakehouse} from '../../src/lib/calculator/lakehouse-quote';
import {resolveLakehouseInput} from '../../src/lib/calculator/lakehouse-presets';
import {lakehouseChatPrompt} from '../../src/lib/calculator/lakehouse-links';
import {chatUrlForQuery} from '../../src/components/home/homePrompts';
import {statusLabelForTool} from '../../src/lib/chat/stream-protocol';
import {sanitizeUserFacingAnswer} from '../../src/lib/chat/tool-call-recovery';

type Gate = 'baseline' | 'inference' | 'lakehouse';

function planTools(q: string): Gate {
  if (matchInferenceIntent(q).matched) return 'inference';
  if (matchLakehouseIntent(q).matched) return 'lakehouse';
  return 'baseline';
}

const cases: {q: string; expect: Gate}[] = [
  {q: 'Оцени лайкхаус на 75 TiB для BI-команды', expect: 'lakehouse'},
  {
    q: lakehouseChatPrompt({
      presetId: 'medium',
      lakeTiB: 75,
      hotPercent: 80,
      k8sTier: 'ha',
      etlHoursPerDay: 8,
      queryHoursPerDay: 12,
      period: 'мес',
      providerName: 'Cloud.ru',
      totalRub: 231000,
    }),
    expect: 'lakehouse',
  },
  {q: 'Сколько стоит open lakehouse на Iceberg + Trino?', expect: 'lakehouse'},
  {
    q: 'Какая инфраструктура нужна, чтобы запустить GLM 5.2 на своих GPU в РФ?',
    expect: 'inference',
  },
  {q: 'Сравни ВМ 8 vCPU / 32 GiB', expect: 'baseline'},
  {q: 'Сколько стоит объектное хранилище 50 ТБ?', expect: 'baseline'},
  {q: 'Что такое Trino?', expect: 'baseline'},
];

console.log('=== Intent gating (mirrors /api/chat) ===');
let fail = 0;
for (const c of cases) {
  const got = planTools(c.q);
  const ok = got === c.expect;
  if (!ok) fail++;
  console.log(
    `${ok ? 'OK' : 'FAIL'} expect=${c.expect} got=${got} | ${c.q.slice(0, 72)}${c.q.length > 72 ? '…' : ''}`,
  );
}

assert.equal(CHAT_TOOLS.length, 4);
assert.equal(CHAT_TOOLS_WITH_INFERENCE.length, 5);
assert.equal(CHAT_TOOLS_WITH_LAKEHOUSE.length, 5);
assert.ok(
  CHAT_TOOLS_WITH_LAKEHOUSE.some(
    (t) => (t as {function: {name: string}}).function.name === 'get_lakehouse_quote',
  ),
);
assert.ok(
  !(CHAT_TOOLS as readonly {function: {name: string}}[]).some(
    (t) => t.function.name === 'get_lakehouse_quote',
  ),
);
assert.ok(LAKEHOUSE_SYSTEM_ADDENDUM.includes('get_lakehouse_quote'));

const input = resolveLakehouseInput('medium', {
  lakeTiB: 75,
  hotPercent: 80,
  k8sTier: 'ha',
  etlHoursPerDay: 8,
  queryHoursPerDay: 12,
});
const calc = quoteLakehouse(input, 'month');
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
) as {
  best: {provider: string; total: number};
  quotes: unknown[];
  costShape: {fixedApprox: number; variableApprox: number};
  answerHint: {calculatorUrl: string};
};

assert.equal(tool.best.provider, calc.best!.providerName);
assert.equal(tool.best.total, Math.round(calc.best!.total * 100) / 100);
assert.equal(tool.quotes.length, calc.quotes.length);
assert.ok(tool.costShape.fixedApprox > 0);
assert.equal(tool.answerHint.calculatorUrl, '/calculator/lakehouse');

console.log('\n=== Tool ↔ calculator parity ===');
console.log('best', tool.best);
console.log('costShape', tool.costShape);

const basic = JSON.parse(
  runToolSync('get_lakehouse_quote', JSON.stringify({presetId: 'medium', k8sTier: 'basic'})),
) as {providerCount: number; best: {total: number}};
const ha = JSON.parse(
  runToolSync('get_lakehouse_quote', JSON.stringify({presetId: 'medium', k8sTier: 'ha'})),
) as {providerCount: number; best: {total: number}};
console.log('\n=== basic vs HA ===');
console.log('basic providers', basic.providerCount, 'best', Math.round(basic.best.total));
console.log('ha providers', ha.providerCount, 'best', Math.round(ha.best.total));
assert.ok(ha.providerCount >= 1);
assert.ok(ha.providerCount <= basic.providerCount);

const url = chatUrlForQuery(
  lakehouseChatPrompt({
    presetId: 'small',
    lakeTiB: 10,
    hotPercent: 100,
    k8sTier: 'basic',
    etlHoursPerDay: 4,
    queryHoursPerDay: 8,
    period: 'мес',
  }),
);
assert.ok(url.startsWith('/chat?'));
const q = decodeURIComponent(url.split('q=')[1] ?? '');
assert.equal(planTools(q), 'lakehouse');
console.log('\n=== Deep link gates lakehouse === OK');

assert.equal(statusLabelForTool('get_lakehouse_quote'), 'Считаю lakehouse…');
assert.ok(!sanitizeUserFacingAnswer('из `get_lakehouse_quote`').includes('get_lakehouse_quote'));

const s = JSON.parse(
  runToolSync('get_lakehouse_quote', JSON.stringify({presetId: 'small'})),
) as {best: {total: number}};
const l = JSON.parse(
  runToolSync('get_lakehouse_quote', JSON.stringify({presetId: 'large'})),
) as {best: {total: number}};
assert.ok(s.best.total < l.best.total);
console.log('\n=== S < L ===', Math.round(s.best.total), '<', Math.round(l.best.total));

if (fail) {
  console.error(`\nFAILED intent cases: ${fail}`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
