import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  CALCULATOR_PROVIDER_IDS,
  formatHostConfigLabel,
  formatPlatformLabel,
  formatQuoteAmount,
  formatRamGiB,
  partTone,
  periodShortLabel,
  scopeLabel,
  toSlimPresetQuote,
  type ViewPresetQuote,
} from '@/lib/calculator/quote-view';

describe('quote-view helpers', () => {
  it('scopeLabel covers all quote scopes', () => {
    assert.equal(scopeLabel('compute'), 'vCPU + RAM + диск');
    assert.equal(scopeLabel('gpu-only'), 'только GPU');
    assert.equal(scopeLabel('bundle'), 'vCPU + RAM + GPU');
    assert.equal(scopeLabel('gpu-synthetic'), 'GPU + сборка хоста');
  });

  it('periodShortLabel covers all periods', () => {
    assert.equal(periodShortLabel('unit'), 'час');
    assert.equal(periodShortLabel('month'), 'мес');
    assert.equal(periodShortLabel('year'), 'год');
  });

  it('formatQuoteAmount uses 2 decimals for hour and 0 for month/year', () => {
    const hour = formatQuoteAmount(12.345, 'unit');
    const month = formatQuoteAmount(12345.6, 'month');
    const year = formatQuoteAmount(123456.7, 'year');
    assert.match(hour, /₽/);
    assert.match(month, /₽/);
    assert.match(year, /₽/);
    // Hour keeps kopecks; month/year round to whole rubles.
    assert.match(hour, /,\d{2}/);
    assert.doesNotMatch(month.replace(/\s/g, ''), /,\d{2}₽/);
  });

  it('partTone maps cost parts to visual tones', () => {
    assert.equal(partTone('vcpu'), 'info');
    assert.equal(partTone('ram'), 'utility');
    assert.equal(partTone('disk'), 'success');
    assert.equal(partTone('gpu'), 'warning');
    assert.equal(partTone('bundle'), 'warning');
  });

  it('formatRamGiB switches to TiB at 1024 GiB', () => {
    assert.equal(formatRamGiB(72), '72 GiB');
    assert.equal(formatRamGiB(1024), '1 TiB');
    assert.equal(formatRamGiB(2048), '2 TiB');
    assert.equal(formatRamGiB(1536), '1.5 TiB');
  });

  it('formatPlatformLabel prefers native and maps family ids', () => {
    assert.equal(formatPlatformLabel('intel-ice-lake'), 'Intel Ice Lake');
    assert.equal(formatPlatformLabel('intel-sapphire-rapids'), 'Intel Sapphire Rapids');
    assert.equal(formatPlatformLabel('intel-ice-lake', 'Intel Ice Lake'), 'Intel Ice Lake');
    assert.equal(formatPlatformLabel('unknown'), null);
    assert.equal(formatPlatformLabel(null), null);
  });

  it('formatHostConfigLabel builds GPU host lines', () => {
    assert.equal(
      formatHostConfigLabel({
        scope: 'gpu-synthetic',
        vcpu: 20,
        ramGiB: 110,
        diskGiB: 100,
        diskLabel: 'SSD',
        platformLabel: 'Intel Ice Lake',
      }),
      '20 vCPU · 110 GiB · 100 GiB SSD · Intel Ice Lake',
    );
    assert.equal(
      formatHostConfigLabel({scope: 'gpu-only'}),
      'только GPU',
    );
    assert.equal(
      formatHostConfigLabel({
        scope: 'gpu-only',
        vcpu: 8,
        ramGiB: 32,
      }),
      '8 vCPU · 32 GiB · только GPU',
    );
  });

  it('CALCULATOR_PROVIDER_IDS lists six providers', () => {
    assert.equal(CALCULATOR_PROVIDER_IDS.length, 6);
    assert.ok(CALCULATOR_PROVIDER_IDS.includes('yandex-cloud'));
    assert.ok(CALCULATOR_PROVIDER_IDS.includes('mws-cloud'));
  });

  it('toSlimPresetQuote drops parts/notes but keeps totals', () => {
    const full: ViewPresetQuote = {
      presetId: 'x',
      quotes: [
        {
          provider: 'cloud-ru',
          providerName: 'Cloud.ru',
          total: 100,
          scope: 'bundle',
          parts: [{id: 'bundle', label: 'all', amount: 100}],
          note: 'n',
        },
      ],
      alternateQuotes: [],
      best: {
        provider: 'cloud-ru',
        providerName: 'Cloud.ru',
        total: 100,
        scope: 'bundle',
        parts: [{id: 'bundle', label: 'all', amount: 100}],
        note: 'n',
      },
    };
    const slim = toSlimPresetQuote(full);
    assert.equal(slim.quoteCount, 1);
    assert.equal(slim.best?.total, 100);
    assert.ok(!('parts' in slim.quotes[0]!));
  });
});
