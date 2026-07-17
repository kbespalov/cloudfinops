import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  formatQuoteAmount,
  partTone,
  periodShortLabel,
  scopeLabel,
} from '@/lib/calculator/quote-view';

describe('quote-view helpers', () => {
  it('scopeLabel covers all quote scopes', () => {
    assert.equal(scopeLabel('compute'), 'vCPU + RAM + диск');
    assert.equal(scopeLabel('gpu-only'), 'только GPU');
    assert.equal(scopeLabel('bundle'), 'vCPU + RAM + GPU');
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
});
