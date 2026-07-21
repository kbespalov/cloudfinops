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

  it('formats recommend_inference_infra with readable markdown sections', () => {
    const md = formatFastPathAnswer('coder-next-infra', [
      {
        name: 'recommend_inference_infra',
        content: JSON.stringify({
          ok: true,
          model: {
            displayName: 'Qwen3-Coder-Next',
            parameterCountB: 80,
            activeParameterCountB: 3,
            confidence: 'high',
            contextDefault: 262144,
            deployment: 'self-host',
          },
          primaryRecommendation: {
            why: 'Стартовый минимум: 1×H100 INT4.',
          },
          configs: [
            {
              gpuFamily: 'H100',
              gpuCount: 1,
              quant: 'int4',
              estimatedVramGiB: 80,
              notes: 'PoC / лёгкий agent.',
              why: 'long why ignored when notes present',
              best: {provider: 'Selectel', totalMonth: 340000},
              quotes: [],
              assumedHost: null,
              vramBreakdown: {
                totalGiB: 52,
                capacityGiB: 80,
                loadBand: 'optimal',
              },
            },
            {
              gpuFamily: 'H200',
              gpuCount: 1,
              quant: 'fp8',
              estimatedVramGiB: 141,
              notes: 'Минимум без INT4.',
              why: 'alt why',
              best: {provider: 'T1 Cloud', totalMonth: 500000},
              quotes: [],
              assumedHost: null,
              vramBreakdown: {
                totalGiB: 95,
                capacityGiB: 141,
                loadBand: 'tight',
              },
            },
          ],
          hostedAlternative: {
            providersMatched: [
              {
                provider: 'Cloud.ru',
                cheapestMonth: 122,
                inputMonth: 122,
                outputMonth: 244,
              },
            ],
          },
          caveats: ['Не путать с Coder-480B.'],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /### Self-host: Qwen3-Coder-Next/);
    assert.match(md, /### Почему так/);
    assert.match(md, /### Цены узлов/);
    assert.match(md, /Использование VRAM/);
    assert.match(md, /Запас памяти/);
    assert.match(md, /52 из 80 GiB/);
    assert.match(md, /Оптимально/);
    assert.match(md, /Малый запас/);
    assert.match(md, /### Альтернативы/);
    assert.match(md, /### Hosted API/);
    assert.match(md, /### Оговорки/);
    assert.match(md, /Input/);
    assert.match(md, /Output/);
    assert.match(md, /PoC \/ лёгкий agent/);
    assert.match(md, /Открыть в калькуляторе/);
    assert.match(md, /\/calculator\/self-host\?model=Qwen3-Coder-Next/);
  });
});
