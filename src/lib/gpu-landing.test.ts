import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {catalogHrefForLanding, faqForLanding, getGpuLanding} from '@/data/gpu-landings';
import {
  buildGpuLandingStats,
  formatGpuUiAmount,
  hubGpuStats,
  matchesCatalogQuery,
  showcaseModelsForLanding,
} from '@/lib/gpu-landing';
import {catalog} from '@/lib/catalog';

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
    assert.ok(stats.cheapestSingle);
    assert.ok(h200.about.length > 180);
    assert.match(h200.about, /2024|Hopper|HBM3e/);
    assert.ok(h200.aboutFacts.some((f) => /2024/.test(f)));
    assert.equal(h200.useCases.length, 3);
    const showcase = showcaseModelsForLanding(h200);
    assert.ok(showcase.length >= 3);
    assert.ok(showcase.some((m) => /GLM/i.test(m.name)));
    assert.match(showcase[0]!.note, /×/);
    assert.match(showcase[0]!.href, /\/calculator\/self-host/);
  });

  it('curates distinct showcase shelves for H100 / A100 / L4', () => {
    const h100 = getGpuLanding('h100');
    const a100 = getGpuLanding('a100');
    const l4 = getGpuLanding('l4');
    assert.ok(h100 && a100 && l4);

    const h100Show = showcaseModelsForLanding(h100);
    assert.ok(h100Show.some((m) => m.id === 'glm-4.6-357b'));
    assert.ok(h100Show.some((m) => m.id === 'deepseek-v4-flash'));
    assert.equal(new Set(h100Show.map((m) => m.family)).size, h100Show.length);

    const a100Show = showcaseModelsForLanding(a100);
    assert.equal(a100Show[0]?.id, 'qwen3-32b');
    assert.ok(a100Show.some((m) => m.id === 'gemma-4-31b' || m.id === 'llama-3.3-70b'));

    const l4Show = showcaseModelsForLanding(l4);
    assert.equal(l4Show[0]?.id, 'qwen3-8b');
    assert.ok(l4Show.some((m) => m.id === 'granite-4.1-8b' || m.id === 'gemma-4-31b'));
    assert.ok(l4Show.length >= 4);
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

  it('attaches shared pricing FAQ to every model landing', () => {
    for (const slug of ['h200', 'h100', 'a100', 'l4', 'b300', 'hgx-h200'] as const) {
      const def = getGpuLanding(slug);
      assert.ok(def);
      const faq = faqForLanding(def);
      assert.ok(faq.some((q) => /официальные цены NVIDIA/i.test(q.question)));
      assert.ok(faq.some((q) => /отличаться от сайта провайдера/i.test(q.question)));
      assert.equal(faq[0]?.question.includes('NVIDIA'), true);
    }
  });

  it('exposes Wordstat-oriented SEO fields without changing visible H1', () => {
    const h200 = getGpuLanding('h200');
    const h100 = getGpuLanding('h100');
    assert.ok(h200 && h100);
    assert.match(h200.seoTitle, /аренда/i);
    assert.match(h200.seoTitle, /H200/i);
    assert.notEqual(h200.seoTitle, h200.title);
    assert.ok(h200.keywords.some((k) => /аренда H200/i.test(k)));
    assert.ok(h200.keywords.some((k) => /GPU сервер/i.test(k)));
    assert.ok(h100.keywords.some((k) => /H100 цена|стоимость H100/i.test(k)));
    assert.ok(h200.seoPriority >= 0.8 && h200.seoPriority <= 1);
  });

  it('does not treat NVLink as NVL and falls back when NVL slice is empty', () => {
    const nvlink = catalog.meters.find((m) => /nvlink/i.test(m.name));
    assert.ok(nvlink);
    assert.equal(matchesCatalogQuery(nvlink, 'NVL'), false);

    const nvl = getGpuLanding('h200-nvl');
    assert.ok(nvl);
    const stats = buildGpuLandingStats(nvl);
    assert.equal(stats.offerCount, 0);
    assert.equal(stats.narrowEmpty, true);
    assert.ok(stats.familyOfferCount > 0);
    assert.match(stats.catalogHref, /gpu=h200/);
    assert.doesNotMatch(stats.catalogHref, /q=NVL/);

    const hub = hubGpuStats().familyCards.find((c) => c.slug === 'h200-nvl');
    assert.ok(hub);
    assert.equal(hub.catalogHref, stats.catalogHref);
  });
});
