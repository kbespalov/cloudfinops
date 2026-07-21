import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  formatInferenceLoadBandCell,
  formatInferenceVramCell,
  parseSelfHostQuant,
  resolveSelfHostModelDisplayName,
  selfHostCalculatorCtaMarkdown,
  selfHostCalculatorUrl,
  selfHostChatPrompt,
} from './self-host-links';
import type {InferenceVramSummary} from './self-host-links';

describe('self-host-links', () => {
  it('builds calculator deep links with model and optional quant', () => {
    assert.equal(
      selfHostCalculatorUrl({model: 'T-Search'}),
      '/calculator/self-host?model=T-Search',
    );
    assert.equal(
      selfHostCalculatorUrl({model: 'T-Search', quant: 'fp8'}),
      '/calculator/self-host?model=T-Search&quant=fp8',
    );
    assert.equal(
      selfHostCalculatorUrl({model: 'T-Search', quant: 'auto'}),
      '/calculator/self-host?model=T-Search',
    );
  });

  it('resolves model aliases and parses quant', () => {
    assert.equal(resolveSelfHostModelDisplayName('t-search'), 'T-Search');
    assert.equal(resolveSelfHostModelDisplayName('нет такой'), null);
    assert.equal(parseSelfHostQuant('FP8'), 'fp8');
    assert.equal(parseSelfHostQuant('nope'), 'auto');
  });

  it('builds chat prompt for selected build', () => {
    const prompt = selfHostChatPrompt({
      model: 'T-Search',
      quant: 'fp8',
      gpuFamily: 'L40S',
      gpuCount: 1,
    });
    assert.match(prompt, /T-Search/);
    assert.match(prompt, /1×L40S/);
    assert.match(prompt, /FP8/);
    assert.match(prompt, /self-host/i);
  });

  it('formats VRAM / load band cells like the calculator table', () => {
    const bd = {
      totalGiB: 43,
      capacityGiB: 48,
      loadBand: 'tight',
    } satisfies InferenceVramSummary;
    assert.equal(formatInferenceVramCell(bd), '43 из 48 GiB');
    assert.equal(formatInferenceLoadBandCell(bd), 'Малый запас');
    assert.equal(formatInferenceVramCell(null, 80), '~80 GiB');
  });

  it('emits markdown CTA with deep link', () => {
    const md = selfHostCalculatorCtaMarkdown({model: 'GLM 5.2', quant: 'int4'});
    assert.match(md, /Открыть в калькуляторе/);
    assert.match(md, /model=GLM\+5\.2|model=GLM%205\.2/);
    assert.match(md, /quant=int4/);
  });
});
