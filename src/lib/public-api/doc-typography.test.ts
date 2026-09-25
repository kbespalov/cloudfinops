import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {endpoints} from '@/components/api/api-reference';
import {documentationPage} from './discovery';
import {plainText, typograph} from './doc-typography';

const NBSP = '\u00a0';

describe('typograph', () => {
  it('binds short words to the next word, including chains', () => {
    assert.equal(typograph('рассчитывать и сравнивать'), `рассчитывать и${NBSP}сравнивать`);
    assert.equal(typograph('ставки и в каталоге'), `ставки и${NBSP}в${NBSP}каталоге`);
    assert.equal(typograph('Для compute и GPU'), `Для${NBSP}compute и${NBSP}GPU`);
  });

  it('keeps a dash off the line start and a number with its unit', () => {
    assert.equal(typograph('фильтры — через И'), `фильтры${NBSP}— через И`);
    assert.equal(typograph('за 720 часов'), `за${NBSP}720${NBSP}часов`);
  });

  it('leaves longer words and Latin alone', () => {
    assert.equal(typograph('REST API позволяет изучать'), 'REST API позволяет изучать');
  });
});

describe('plainText', () => {
  it('strips code backticks for meta descriptions', () => {
    assert.equal(plainText('задайте `units=token`'), 'задайте units=token');
    const products = endpoints.find(e => e.id === 'products')!;
    assert.match(products.description, /`/);
    assert.doesNotMatch(documentationPage('products')!.description, /`/);
    assert.doesNotMatch(documentationPage('mcp-products')!.description, /`/);
  });
});
