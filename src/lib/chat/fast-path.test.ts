import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {formatFastPathAnswer, matchFastPath} from './fast-path';

describe('matchFastPath', () => {
  it('matches exact homepage chip prompts', () => {
    const plan = matchFastPath(
      'Сравни ВМ 8 vCPU / 32 GiB / 100 ГБ SSD на месяц по провайдерам',
    );
    assert.ok(plan);
    assert.equal(plan.id, 'vm');
    assert.equal(plan.tools[0]?.name, 'get_quote');
  });

  it('matches H100 chip and routes to search_prices with gpuModel', () => {
    const plan = matchFastPath('Самый дешёвый H100 в месяц');
    assert.ok(plan);
    assert.equal(plan.tools[0]?.name, 'search_prices');
    assert.equal(plan.tools[0]?.args.gpuModel, 'H100');
  });

  it('matches block SSD via compare_unit_price (not category=storage)', () => {
    const plan = matchFastPath(
      'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    );
    assert.ok(plan);
    assert.equal(plan.tools[0]?.name, 'compare_unit_price');
    assert.equal(plan.tools[0]?.args.component, 'ssd');
  });

  it('matches S3 50TB with volumeGiB', () => {
    const plan = matchFastPath('Сколько стоит 50 ТБ в объектном хранилище Standard?');
    assert.ok(plan);
    assert.equal(plan.tools[0]?.args.volumeGiB, 51200);
    assert.equal(plan.tools[0]?.args.storageClass, 'standard');
  });

  it('does not match unrelated free-form questions', () => {
    assert.equal(matchFastPath('Расскажи про FinOps в двух словах'), null);
    assert.equal(matchFastPath('Что такое preemptible?'), null);
  });

  it('formats get_quote payload without LLM', () => {
    const md = formatFastPathAnswer('vm', [
      {
        name: 'get_quote',
        content: JSON.stringify({
          request: {vcpu: 8, ramGiB: 32, diskGiB: 100},
          quotes: [
            {provider: 'Cloud.ru', total: 100},
            {provider: 'MWS Cloud', total: 120},
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /Cloud\.ru/);
    assert.match(md, /best/);
    assert.match(md, /\+20%/);
  });
});
