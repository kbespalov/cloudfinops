import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_CORE,
  assembleSystemPrompt,
  buildSystemPrompt,
  matchPlanningDomains,
} from './system-prompt';

describe('matchPlanningDomains', () => {
  it('attaches gpu card for H100 / parity follow-ups', () => {
    assert.ok(matchPlanningDomains('Самый дешёвый H100').includes('gpu'));
    assert.ok(matchPlanningDomains('а с паритетом по конфигурации').includes('gpu'));
  });

  it('attaches s3 card for object storage / Ice', () => {
    const d = matchPlanningDomains('Сколько стоит 50 ТБ в объектном хранилище Standard?');
    assert.ok(d.includes('s3'));
    assert.ok(!d.includes('gpu'));
  });

  it('attaches k8s card for Managed Kubernetes', () => {
    assert.ok(matchPlanningDomains('Сравни Managed Kubernetes по провайдерам').includes('k8s'));
  });

  it('attaches aggregates + compute for average vCPU', () => {
    const d = matchPlanningDomains('Средняя цена 1 vCPU по провайдерам');
    assert.ok(d.includes('aggregates'));
    assert.ok(d.includes('compute'));
  });

  it('attaches stack + components for multi-SKU ask', () => {
    const d = matchPlanningDomains(
      'Собери решение: ВМ 16 vCPU, Object Storage 100 ТБ, CDN 100 ТБ, Managed Kubernetes',
    );
    assert.ok(d.includes('stack'));
    assert.ok(d.includes('s3'));
    assert.ok(d.includes('cdn'));
    assert.ok(d.includes('k8s'));
    assert.ok(d.includes('compute'));
  });

  it('keeps gpu card via historyText on short follow-up', () => {
    const prompt = buildSystemPrompt('а таблицей с паритетом', {
      historyText: 'Сравни H100 по провайдерам',
    });
    assert.ok(prompt.includes('## GPU'));
  });

  it('attaches compute for Russian word-numbers (ядрах / гигах)', () => {
    const d = matchPlanningDomains(
      'Сайт на шестнадцати ядрах и тридцати двух гигах памяти — сравни провайдеров',
    );
    assert.ok(d.includes('compute'));
  });

  it('CPU-only / Ice Lake ask is compute+aggregates, not S3 Ice or stack', () => {
    const d = matchPlanningDomains(
      'Давай начнем с CPU - хочу 32 ядра или Ice lake или Saphire',
    );
    assert.ok(d.includes('compute'));
    assert.ok(d.includes('aggregates'));
    assert.ok(!d.includes('s3'), `unexpected s3 from Ice Lake: ${d.join(',')}`);
    assert.ok(!d.includes('stack'), `unexpected stack: ${d.join(',')}`);
    const prompt = buildSystemPrompt(
      'Давай начнем с CPU - хочу 32 ядра или Ice lake или Saphire',
    );
    assert.match(prompt, /ПОШАГОВАЯ СБОРКА/);
    assert.match(prompt, /compare_unit_price\(vcpu\)/);
  });

  it('RAM-only and disk-only asks stay component-scoped (no stack)', () => {
    const ram = matchPlanningDomains('Давай начнём с RAM — сколько стоит 1 GiB памяти');
    assert.ok(ram.includes('compute'));
    assert.ok(ram.includes('aggregates'));
    assert.ok(!ram.includes('stack'));

    const disk = matchPlanningDomains('Сравни цену 1 GiB NVMe по провайдерам');
    assert.ok(disk.includes('compute'));
    assert.ok(disk.includes('aggregates'));
    assert.ok(!disk.includes('s3'));
    assert.ok(!disk.includes('stack'));

    const prompt = buildSystemPrompt('начнём с диска SSD');
    assert.match(prompt, /compare_unit_price\(ssd\)|diskMedia/);
    assert.match(prompt, /get_quote — ТОЛЬКО когда явно просят конфигурацию целиком/);
  });
});

describe('buildSystemPrompt size', () => {
  it('core is much smaller than full SYSTEM_PROMPT', () => {
    assert.ok(SYSTEM_PROMPT_CORE.length < 9000);
    assert.ok(SYSTEM_PROMPT.length > SYSTEM_PROMPT_CORE.length);
  });

  it('narrow H100 ask is smaller than full prompt', () => {
    const gated = buildSystemPrompt('Самый дешёвый H100 в месяц');
    assert.ok(gated.length < SYSTEM_PROMPT.length);
    assert.ok(gated.includes('## GPU'));
    assert.ok(!gated.includes('## Object Storage'));
    assert.ok(!gated.includes('## Managed Kubernetes'));
  });

  it('assembleSystemPrompt([]) returns core only', () => {
    assert.equal(assembleSystemPrompt([]), SYSTEM_PROMPT_CORE);
  });
});
