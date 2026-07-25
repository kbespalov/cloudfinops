/**
 * Unit-price gold must allowlist Cloud.ru derivedFromFlavors so correct
 * «* / оценка» answers are not graded as hallucinations.
 */
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {grade, truthFromUnitPrice} from './ground-truth';

describe('truthFromUnitPrice Cloud.ru allowlist', () => {
  it('allows Cloud.ru for vCPU without making it stats cheapest', () => {
    const t = truthFromUnitPrice('vcpu');
    assert.ok(t.allowed.has('cloud-ru'), 'Cloud.ru must be in allowed');
    assert.ok(t.allowed.has('selectel'));
    assert.equal(t.cheapestProvider, 'selectel');
    const withCloud = grade(
      [
        'Cloud.ru* 703 ₽ — оценка по flavor.',
        'Selectel 725 ₽ — min среди unit.',
        'VK Cloud, MWS Cloud, Yandex Cloud, T1 Cloud выше.',
      ].join(' '),
      t,
    );
    assert.equal(withCloud.noHalluc, true);
    assert.equal(withCloud.cheapestProviderOk, true);
    assert.ok(withCloud.recall >= 0.5);
    assert.equal(withCloud.pass, true);
  });

  it('allows Cloud.ru for RAM; unit floor stays T1', () => {
    const t = truthFromUnitPrice('ram');
    assert.ok(t.allowed.has('cloud-ru'));
    assert.equal(t.cheapestProvider, 't1-cloud');
    const withCloud = grade(
      [
        'Cloud.ru* — оценка.',
        'Среди unit метров дешевле всех T1 Cloud; далее MWS, VK, Yandex; Selectel дороже всех.',
      ].join(' '),
      t,
    );
    assert.equal(withCloud.noHalluc, true);
    assert.equal(withCloud.cheapestProviderOk, true);
    assert.equal(withCloud.pass, true);
  });
});
