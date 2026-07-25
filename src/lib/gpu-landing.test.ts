import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalogHrefForLanding, getGpuLanding} from '@/data/gpu-landings';
import {buildGpuLandingStats, formatGpuUiAmount, hubGpuStats} from '@/lib/gpu-landing';

describe('gpu landings', () => {
  it('builds catalog deep-links with gpu facet', () => {
    assert.equal(
      catalogHrefForLanding({gpuFacet: 'h100'}),
      '/catalog?category=gpu&gpu=h100',
    );
    assert.equal(
      catalogHrefForLanding({gpuFacet: 'h200', catalogQuery: 'NVL'}),
      '/catalog?category=gpu&gpu=h200&q=NVL',
    );
  });

  it('resolves featured model pages', () => {
    const h200 = getGpuLanding('h200');
    assert.ok(h200);
    assert.equal(h200.gpuFacet, 'h200');
    const stats = buildGpuLandingStats(h200);
    assert.ok(stats.offerCount > 0);
    assert.match(stats.catalogHref, /category=gpu/);
    assert.match(stats.catalogHref, /gpu=h200/);
  });

  it('hub stats expose family cards without throwing', () => {
    const hub = hubGpuStats();
    assert.ok(hub.gpuOfferCount > 0);
    assert.ok(hub.familyCards.some((c) => c.slug === 'h100' && c.offerCount > 0));
    assert.ok(hub.familyCards.some((c) => c.slug === 'l40s'));
  });

  it('resolves L40S landing separately from L4', () => {
    const l40s = getGpuLanding('l40s');
    assert.ok(l40s);
    assert.equal(l40s.gpuFacet, 'l40s');
    assert.match(catalogHrefForLanding(l40s), /gpu=l40s/);
    const stats = buildGpuLandingStats(l40s);
    assert.ok(stats.offerCount > 0);
  });

  it('formats landing prices for UI (2 dp hour, whole month)', () => {
    assert.equal(formatGpuUiAmount(440.7534, 'unit'), '440,75 ₽');
    assert.equal(formatGpuUiAmount(13.8, 'unit'), '13,80 ₽');
    assert.equal(formatGpuUiAmount(8_000_000, 'month'), '8 000 000 ₽');
  });
});
