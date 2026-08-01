/**
 * Structural + honesty audit of the generated catalog.
 *
 * Usage:
 *   npx tsx scripts/eval/audit-catalog-prices.ts
 *   npx tsx scripts/eval/audit-catalog-prices.ts --json
 *
 * Exit 1 if any critical issue is found.
 */
import {catalog, amountNumber} from '../../src/lib/catalog';

type Issue = {level: 'critical' | 'warn'; code: string; id: string; detail: string};

const today = new Date('2026-08-01'); // pin for reproducible CI; bump with catalog asOf
const issues: Issue[] = [];

function add(level: Issue['level'], code: string, id: string, detail: string) {
  issues.push({level, code, id, detail});
}

for (const m of catalog.meters) {
  if (!m.sourceRefs?.length) {
    add('critical', 'no-source', m.id, 'meter has no sourceRefs');
  }
  if (!m.checkedAt) {
    add('critical', 'no-checkedAt', m.id, 'meter has no checkedAt');
  }

  if (m.pricingMode === 'status-only' || m.pricingMode === 'tiered') continue;

  if (m.nativeVat === 'excluded') {
    if (m.normalizedVat !== 'included' || m.normalizedAmount == null) {
      add('critical', 'vat-excluded-no-norm', m.id, 'native VAT excluded without included normalized amount');
    }
  }

  if (['unit', 'bundle', 'fixed'].includes(m.pricingMode)) {
    if (m.nativeAmount == null && m.normalizedAmount == null) {
      add('critical', 'amount-missing', m.id, 'priced meter has no amount');
    }
    const n = Number(m.normalizedAmount ?? m.nativeAmount);
    if (Number.isFinite(n) && n === 0 && !(m.notes || '').trim()) {
      add('critical', 'zero-without-notes', m.id, '0 ₽ rate without notes — looks like a freebie without provenance');
    }
  }

  if (m.synthetic) {
    if (!m.name.includes('*') && !m.sku.includes('.synthetic')) {
      add('warn', 'synthetic-unmarked', m.id, 'synthetic without * in name or .synthetic in sku');
    }
  }

  const promoUntil = m.dimensions?.promoUntil as string | undefined;
  const futureFrom = (m.dimensions?.futureRateFrom || m.dimensions?.upcomingAmountFrom) as
    | string
    | undefined;
  if (promoUntil) {
    const end = new Date(promoUntil);
    if (end < today) {
      add(
        'critical',
        'stale-promo',
        m.id,
        `promoUntil ${promoUntil} is in the past — flip rate to futureAmount / futureHourlyAmount`,
      );
    }
  }
  if (futureFrom) {
    const from = new Date(futureFrom);
    if (from <= today) {
      add(
        'critical',
        'stale-future-rate',
        m.id,
        `futureRateFrom/upcomingAmountFrom ${futureFrom} is due or past — flip into pricing.rate`,
      );
    }
  }
  if (m.effectiveFrom) {
    const from = new Date(m.effectiveFrom);
    if (from > today) {
      add(
        'warn',
        'future-effective-as-available',
        m.id,
        `effectiveFrom ${m.effectiveFrom} is in the future but status=${m.status} — UI may look like current price`,
      );
    }
  }
  // futureRateFrom / futureHourlyAmount in dimensions is enough — do not require
  // user-facing notes to advertise upcoming list changes or promos.

  // Sanity: amountNumber should resolve for non-status meters with amounts
  if (['unit', 'bundle', 'fixed'].includes(m.pricingMode)) {
    const a = amountNumber(m, 'unit');
    if (a == null && Number(m.nativeAmount) !== 0) {
      add('warn', 'amountNumber-null', m.id, 'amountNumber(unit) returned null for priced meter');
    }
  }
}

const critical = issues.filter((i) => i.level === 'critical');
const warn = issues.filter((i) => i.level === 'warn');

const summary = {
  asOf: catalog.asOf,
  meters: catalog.meters.length,
  synthetic: catalog.meters.filter((m) => m.synthetic).length,
  critical: critical.length,
  warn: warn.length,
  byCode: Object.fromEntries(
    [...new Set(issues.map((i) => i.code))].map((code) => [
      code,
      issues.filter((i) => i.code === code).length,
    ]),
  ),
};

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify({summary, issues}, null, 2));
} else {
  console.log('=== catalog price audit ===');
  console.log(
    `asOf=${summary.asOf} meters=${summary.meters} synthetic=${summary.synthetic} critical=${summary.critical} warn=${summary.warn}`,
  );
  if (Object.keys(summary.byCode).length) {
    console.log('by code:', summary.byCode);
  }
  for (const i of critical) {
    console.log(`CRITICAL [${i.code}] ${i.id}: ${i.detail}`);
  }
  for (const i of warn.slice(0, 40)) {
    console.log(`WARN [${i.code}] ${i.id}: ${i.detail}`);
  }
  if (warn.length > 40) console.log(`… +${warn.length - 40} more warnings`);
  if (critical.length === 0) console.log('OK: no critical issues');
}

process.exit(critical.length ? 1 : 0);
