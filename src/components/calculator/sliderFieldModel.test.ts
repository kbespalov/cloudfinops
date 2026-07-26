import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {bump, resolveSliderInput} from './sliderFieldModel';

const RAM = [1, 2, 4, 6, 8, 12, 16, 24, 32, 40, 48, 64];

describe('resolveSliderInput', () => {
  it('spinbutton + steps the ladder from committed value (8 → 12, not stuck on 9)', () => {
    const first = resolveSliderInput({
      raw: 9,
      committed: 8,
      displayed: 8,
      options: RAM,
      absMin: 1,
      absMax: 1024,
    });
    assert.deepEqual(first, {ok: true, next: 12, settle: true});

    // Second click must not use a stale draft=9 against committed=12.
    const second = resolveSliderInput({
      raw: 13,
      committed: 12,
      displayed: 12,
      options: RAM,
      absMin: 1,
      absMax: 1024,
    });
    assert.deepEqual(second, {ok: true, next: 16, settle: true});
  });

  it('spinbutton + from 16 goes to 24 (quote/UI stay in sync)', () => {
    const r = resolveSliderInput({
      raw: 17,
      committed: 16,
      displayed: 16,
      options: RAM,
      absMin: 1,
      absMax: 1024,
    });
    assert.deepEqual(r, {ok: true, next: 24, settle: true});
  });

  it('typed values settle without forcing edit-mode exit', () => {
    const r = resolveSliderInput({
      raw: 32,
      committed: 8,
      displayed: 8,
      options: RAM,
      absMin: 1,
      absMax: 1024,
    });
    assert.deepEqual(r, {ok: true, next: 32, settle: false});
  });

  it('bump helper walks the RAM ladder', () => {
    assert.equal(bump(RAM, 8, 1), 12);
    assert.equal(bump(RAM, 16, 1), 24);
    assert.equal(bump(RAM, 8, -1), 6);
  });
});
