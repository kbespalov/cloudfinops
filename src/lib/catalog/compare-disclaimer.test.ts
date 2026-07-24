import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  catalogAsOfIso,
  catalogAsOfLabel,
  catalogCompareScopeHint,
  cheapestInCatalogLine,
} from './compare-disclaimer';

describe('compare-disclaimer', () => {
  it('binds cheapest conclusion to catalog asOf and public-tariff scope', () => {
    const line = cheapestInCatalogLine({
      provider: 'Selectel',
      priceText: '100 ₽/мес',
    });
    assert.match(line, /Минимальная цена в каталоге Cloud FinOps на/);
    assert.match(line, new RegExp(catalogAsOfLabel().replace('.', '\\.')));
    assert.match(line, /\*\*Selectel\*\*/);
    assert.match(line, /Среди публичных тарифов в выборке/);
    assert.match(line, /без промо/);
    assert.doesNotMatch(line, /Самый дешёвый:/);
    assert.doesNotMatch(line, /Best offer/i);
  });

  it('marks derived winners explicitly', () => {
    const line = cheapestInCatalogLine({
      provider: 'Cloud.ru',
      priceText: '50 ₽/мес',
      derived: true,
    });
    assert.match(line, /оценка Cloud FinOps, не строка прайса провайдера/);
  });

  it('marks composed unit-sum winners without calling them synthetic SKUs', () => {
    const line = cheapestInCatalogLine({
      provider: 'Selectel',
      priceText: '200 ₽/мес',
      composed: true,
    });
    assert.match(line, /составная цена из публичных unit-ставок/);
    assert.doesNotMatch(line, /не строка прайса/);
  });

  it('exposes catalog asOf for tool payloads', () => {
    assert.match(catalogAsOfIso(), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(catalogCompareScopeHint(), /каталоге Cloud FinOps/);
  });
});
