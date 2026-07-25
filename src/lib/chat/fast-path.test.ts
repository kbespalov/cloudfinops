import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  adaptFastPathForSurface,
  extractAllToolPayloads,
  formatFastPathAnswer,
  formatStackFastPathAnswer,
  matchFastPath,
  shouldUseFastPath,
  tryFormatAgentToolAnswer,
} from './fast-path';
import type {ChatMessage} from './gigachat';
import {runTool} from './tools';

describe('shouldUseFastPath', () => {
  it('is always on for calculator surface', () => {
    assert.equal(shouldUseFastPath({surface: 'calculator', probability: 0, random: () => 0.99}), true);
  });

  it('respects probability 0 / 1 on chat', () => {
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0, random: () => 0}), false);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 1, random: () => 0.99}), true);
  });

  it('coin-flips at 0.5 using injected RNG', () => {
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.5, random: () => 0.49}), true);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.5, random: () => 0.5}), false);
  });
});

describe('extractAllToolPayloads', () => {
  it('scopes to tools after the latest user turn', () => {
    const messages: ChatMessage[] = [
      {role: 'user', content: 'старый вопрос про S3'},
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'old-1',
            type: 'function',
            function: {name: 'search_prices', arguments: '{"query":"S3"}'},
          },
        ],
      },
      {role: 'tool', tool_call_id: 'old-1', name: 'search_prices', content: '{"rows":[{"sku":"old"}]}'},
      {role: 'user', content: 'новый стек ВМ+IP'},
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'new-1',
            type: 'function',
            function: {name: 'get_quote', arguments: '{"vcpu":8}'},
          },
        ],
      },
      {role: 'tool', tool_call_id: 'new-1', name: 'get_quote', content: '{"quotes":[{"provider":"Yandex"}]}'},
    ];
    const payloads = extractAllToolPayloads(messages);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]?.name, 'get_quote');
    assert.match(payloads[0]!.content, /Yandex/);
  });
});

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

  it('rewrites GPU search chips to get_quote on the calculator surface', () => {
    const plan = matchFastPath('Сколько стоит 1x H100 в месяц?');
    assert.ok(plan);
    assert.equal(plan.tools[0]?.name, 'search_prices');
    const adapted = adaptFastPathForSurface(plan, 'calculator', 'Сколько стоит 1x H100 в месяц?');
    assert.equal(adapted.tools[0]?.name, 'get_quote');
    assert.equal(adapted.tools[0]?.args.gpuModel, 'H100');
    assert.equal(adapted.tools[0]?.args.gpuCount, 1);
    assert.equal(
      adaptFastPathForSurface(plan, 'chat', 'Сколько стоит 1x H100 в месяц?').tools[0]?.name,
      'search_prices',
    );
  });

  it('matches block SSD via compare_unit_price (not category=storage)', () => {
    const plan = matchFastPath(
      'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?',
    );
    assert.ok(plan);
    // Exact homepage chip → disk-100tb; paraphrases → ssd-100tb.
    assert.ok(plan.id === 'disk-100tb' || plan.id === 'ssd-100tb');
    assert.equal(plan.tools[0]?.name, 'compare_unit_price');
    assert.equal(plan.tools[0]?.args.component, 'ssd');
    assert.equal(plan.tools[0]?.args.diskMedia, 'ssd');
  });

  it('matches 10 ТБ block SSD and encodes volume in plan id', () => {
    const plan = matchFastPath(
      'Сколько стоит 10 ТБ именно блочного SSD в месяц? Это не S3 и не объектка.',
    );
    assert.ok(plan);
    assert.equal(plan.id, 'ssd-10tb');
    assert.equal(plan.tools[0]?.name, 'compare_unit_price');
    assert.equal(plan.tools[0]?.args.diskMedia, 'ssd');
  });

  it('matches NVMe volume with diskMedia=nvme (not cheapest SSD)', () => {
    const plan = matchFastPath(
      '55 ТБ NVME где лучше купить у кого — блочный диск в месяц',
    );
    assert.ok(plan);
    assert.equal(plan.id, 'nvme-55tb');
    assert.equal(plan.tools[0]?.name, 'compare_unit_price');
    assert.equal(plan.tools[0]?.args.component, 'ssd');
    assert.equal(plan.tools[0]?.args.diskMedia, 'nvme');
  });

  it('does not treat S3 volume asks as block SSD', () => {
    const plan = matchFastPath('Сколько стоит 50 ТБ в объектном хранилище Standard?');
    assert.ok(plan);
    assert.notEqual(plan.tools[0]?.name, 'compare_unit_price');
    assert.equal(plan.tools[0]?.args.volumeGiB, 51200);
    assert.equal(plan.tools[0]?.args.storageClass, 'standard');
  });

  it('defaults object volume without class to Standard (not Ice)', () => {
    const plan = matchFastPath('Сколько стоит 55 ТБ в объектном хранилище в месяц?');
    assert.ok(plan);
    assert.equal(plan.id, 's3-standard-55tb');
    assert.equal(plan.tools[0]?.args.storageClass, 'standard');
    assert.equal(plan.tools[0]?.args.meterKind, 'capacity');
    assert.equal(plan.tools[0]?.args.volumeGiB, 55 * 1024);
  });

  it('does not collapse VM+IP+S3+CDN stack into S3-only fast path (agent handles it)', () => {
    assert.equal(
      matchFastPath(
        'Виртуалка тридцать два гига шестнадцать память, шестнадцать ядер. public address. + 100 ТБ S3 + 100 ТБ в месяц трафика CDN собери решение',
      ),
      null,
    );
    assert.equal(
      matchFastPath(
        'Собери решение на месяц: ВМ 16 vCPU / 32 GiB / 100 GiB SSD, 1 публичный IP, Object Storage Standard 100 ТБ, исходящий трафик CDN 100 ТБ, 1 зональный мастер Managed Kubernetes.',
      ),
      null,
    );
  });

  it('does not collapse S3+CDN volume ask into S3-only fast path', () => {
    assert.equal(
      matchFastPath('Сравни 100 ТБ S3 Standard и 100 ТБ трафика CDN по провайдерам'),
      null,
    );
  });

  it('matches budget paraphrases to fit_budget without planning LLM', () => {
    const a = matchFastPath(
      'Есть 50 тыс ₽/мес на облако — что реально взять из обычных ВМ без GPU? Без допроса.',
    );
    assert.ok(a);
    assert.equal(a.id, 'budget-50000');
    assert.equal(a.tools[0]?.name, 'fit_budget');
    assert.equal(a.tools[0]?.args.budgetMonthRub, 50_000);

    const b = matchFastPath(
      'Бюджет примерно 100 тысяч рублей в месяц — какую инфраструктуру я могу себе позволить?',
    );
    assert.ok(b);
    assert.equal(b.tools[0]?.args.budgetMonthRub, 100_000);
  });

  it('matches Qwen3 32B self-host to recommend_inference_infra', () => {
    const plan = matchFastPath(
      'Хочу поднять Qwen3 32B у себя на GPU в РФ — какую карту и сколько штук брать, с ценами?',
    );
    assert.ok(plan);
    assert.equal(plan.tools[0]?.name, 'recommend_inference_infra');
    assert.equal(plan.tools[0]?.args.model, 'Qwen3 32B');
  });

  it('matches network / GPU natural asks', () => {
    assert.equal(matchFastPath('Сравни цену внешнего белого IP в месяц.')?.id, 'public-ip');
    assert.equal(
      matchFastPath('Сколько примерно выйдет 1 ТБ исходящего трафика (egress)?')?.id,
      'egress-1tb',
    );
    assert.equal(matchFastPath('Кто отдаёт L40S и сколько стоит GPU-час?')?.id, 'l40s-hour');
    assert.equal(
      matchFastPath('Сравни конфигурацию 8×A100 по провайдерам за месяц')?.tools[0]?.name,
      'get_quote',
    );
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
    assert.match(md, /\bmin\b/);
    assert.match(md, /каталоге Cloud FinOps/);
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

  it('formats SSD volume from plan id (10 ТБ ≠ 100 ТБ)', () => {
    const md = formatFastPathAnswer('ssd-10tb', [
      {
        name: 'compare_unit_price',
        content: JSON.stringify({
          component: 'ssd',
          diskMedia: 'ssd',
          providers: [
            {providerName: 'T1 Cloud', priceMonth: 8, name: 'Дисковое пространство Basic'},
            {providerName: 'MWS Cloud', priceMonth: 10, name: 'NBS-PL2'},
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /10 ТБ SSD/);
    assert.doesNotMatch(md, /100 ТБ/);
    assert.match(md, /Basic/);
    // 10 × 1024 × 8 = 81920
    assert.match(md, /81[\s\u00a0]?920/);
  });

  it('formats NVMe volume without calling it plain SSD', () => {
    const md = formatFastPathAnswer('nvme-55tb', [
      {
        name: 'compare_unit_price',
        content: JSON.stringify({
          component: 'ssd',
          diskMedia: 'nvme',
          providers: [
            {
              providerName: 'MWS Cloud',
              priceMonth: 8.14,
              name: 'Объем диска NBS-PL2',
              diskMedia: 'NVMe',
              includedIops: 1000,
            },
            {
              providerName: 'T1 Cloud',
              priceMonth: 13.13,
              name: 'Дисковое пространство Average',
              diskMedia: 'NVMe',
              includedIops: 10000,
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /55 ТБ NVMe/);
    assert.doesNotMatch(md, /55 ТБ SSD/);
    assert.match(md, /Average/);
    assert.match(md, /NBS-PL2/);
  });

  it('labels object volumeEstimates by actual storageClass (Ice ≠ Standard)', () => {
    const md = formatFastPathAnswer('s3-agent', [
      {
        name: 'search_prices',
        content: JSON.stringify({
          applied: {storageClass: null, volumeGiB: 56320},
          volumeEstimates: [
            {
              providerName: 'Cloud.ru',
              rateGiBMonth: 0.49,
              totalMonth: 27570,
              volumeGiB: 56320,
              storageClass: 'ice',
              name: 'Объектное хранилище · Ice',
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /Ice/);
    assert.doesNotMatch(md, /Standard/);
  });

  it('formats fit_budget highlights without LLM', () => {
    const md = formatFastPathAnswer('budget-50000', [
      {
        name: 'fit_budget',
        content: JSON.stringify({
          budgetMonthRub: 50_000,
          highlights: [
            {
              provider: 'Selectel',
              shape: '8 vCPU / 32 GiB',
              count: 2,
              spendMonth: 48_000,
              utilPct: 96,
            },
            {
              provider: 'MWS Cloud',
              shape: '4 vCPU / 16 GiB',
              count: 3,
              spendMonth: 45_000,
              utilPct: 90,
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /50[\s\u00a0]?000/);
    assert.match(md, /Selectel/);
    assert.match(md, /Утилизация/);
    assert.match(md, /\bmin\b/);
  });

  it('short-circuits agent fit_budget / get_quote without alias match', () => {
    const budget = tryFormatAgentToolAnswer({
      userText: 'Что взять на семьдесят тысяч в месяц из ВМ?',
      toolPayloads: [
        {
          name: 'fit_budget',
          arguments: JSON.stringify({budgetMonthRub: 70_000, profile: 'general'}),
          content: JSON.stringify({
            budgetMonthRub: 70_000,
            highlights: [
              {
                provider: 'Cloud.ru',
                shape: '4 vCPU / 16 GiB',
                count: 2,
                spendMonth: 68_000,
                utilPct: 97,
              },
            ],
          }),
        },
      ],
    });
    assert.ok(budget);
    assert.match(budget, /70[\s\u00a0]?000/);

    const quote = tryFormatAgentToolAnswer({
      userText: 'Сравни 16 vCPU / 64 GiB / 200 GiB SSD',
      toolPayloads: [
        {
          name: 'get_quote',
          arguments: JSON.stringify({vcpu: 16, ramGiB: 64, diskGiB: 200}),
          content: JSON.stringify({
            request: {vcpu: 16, ramGiB: 64, diskGiB: 200},
            quotes: [
              {provider: 'MWS Cloud', total: 200},
              {provider: 'Selectel', total: 240},
            ],
          }),
        },
      ],
    });
    assert.ok(quote);
    assert.match(quote, /16 vCPU/);
    assert.match(quote, /MWS Cloud/);
  });

  it('does not short-circuit multi-tool agent turns with empty payloads', () => {
    assert.equal(
      tryFormatAgentToolAnswer({
        userText: 'Сравни ВМ и IP',
        toolPayloads: [
          {name: 'get_quote', content: '{}'},
          {name: 'search_prices', content: '{}'},
        ],
      }),
      null,
    );
  });

  it('stack compose helper builds parity table (last-resort only, not matchFastPath)', async () => {
    const tools = [
      {name: 'get_quote', args: {vcpu: 16, ramGiB: 32, diskGiB: 100, period: 'month'}},
      {name: 'search_prices', args: {query: 'публичный IP', category: 'network', limit: 12}},
      {
        name: 'search_prices',
        args: {
          query: 'объектное хранилище',
          category: 'storage',
          storageClass: 'standard',
          meterKind: 'capacity',
          volumeGiB: 100 * 1024,
          limit: 12,
        },
      },
      {
        name: 'search_prices',
        args: {query: 'исходящий трафик CDN', category: 'cdn', volumeGiB: 100 * 1024, limit: 12},
      },
      {
        name: 'search_prices',
        args: {query: 'Managed Kubernetes', category: 'kubernetes', limit: 12},
      },
    ];
    const payloads = [];
    for (const t of tools) {
      payloads.push({
        name: t.name,
        content: await runTool(t.name, JSON.stringify(t.args)),
        arguments: JSON.stringify(t.args),
      });
    }
    assert.equal(
      tryFormatAgentToolAnswer({
        userText: 'Собери стек ВМ+IP+S3+CDN+K8s',
        toolPayloads: payloads,
      }),
      null,
    );
    const table = formatStackFastPathAnswer(payloads);
    assert.ok(table);
    assert.match(table!, /Итого/);
    assert.match(table!, /CDN/);
    assert.match(table!, /к минимуму/);
  });
});
