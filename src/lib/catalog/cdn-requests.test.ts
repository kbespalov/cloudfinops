/**
 * CDN request meters must compare on one pack (10k), not native 10k vs 100k.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  amountNumber,
  billingUnitLabel,
  catalog,
  isRequestMeter,
  meterPriceLabel,
  requestBillingPackSize,
} from '@/lib/catalog';

function meter(sku: string) {
  const m = catalog.meters.find((x) => x.sku === sku);
  assert.ok(m, `missing ${sku}`);
  return m;
}

describe('CDN request pack normalization', () => {
  it('treats CDN request SKUs as request meters', () => {
    assert.equal(isRequestMeter(meter('t1.cdn.requests')), true);
    assert.equal(isRequestMeter(meter('yc.cdn.requests')), true);
  });

  it('keeps native pack sizes but displays ₽ / 10 000 requests', () => {
    assert.equal(requestBillingPackSize(meter('t1.cdn.requests')), 10_000);
    assert.equal(requestBillingPackSize(meter('yc.cdn.requests')), 100_000);

    const t1 = amountNumber(meter('t1.cdn.requests'), 'unit');
    const yc = amountNumber(meter('yc.cdn.requests'), 'unit');
    assert.ok(t1 != null && yc != null);
    // T1: 0.8174 ₽ / 10k; Yandex: 1 ₽ / 100k → 0.10 ₽ / 10k
    assert.ok(Math.abs(t1! - 0.8174) < 1e-4, `T1 got ${t1}`);
    assert.ok(Math.abs(yc! - 0.1) < 1e-4, `Yandex got ${yc}`);
    // Per-request: Yandex cheaper (~0.00001 vs ~0.000082)
    assert.ok(yc! < t1!, 'Yandex must be cheaper per 10k after normalization');
  });

  it('labels params and price hint with the common 10k pack', () => {
    for (const sku of ['t1.cdn.requests', 'yc.cdn.requests']) {
      const m = meter(sku);
      assert.equal(billingUnitLabel(m), '10 тыс. запросов');
      assert.equal(meterPriceLabel(m, 'month'), 'за 10 000 запросов');
    }
  });

  it('does not invent MWS CDN request or resource meters (public price is egress-only)', () => {
    const mws = catalog.meters.filter((m) => m.provider === 'mws-cloud' && m.categoryKey === 'cdn');
    assert.ok(mws.some((m) => m.meter === 'cdn.traffic.egress'));
    assert.equal(
      mws.some((m) => m.meter === 'cdn.requests' || m.meter === 'cdn.resource'),
      false,
    );
  });
});
