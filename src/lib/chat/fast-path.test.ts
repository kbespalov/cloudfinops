import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  adaptFastPathForSurface,
  detectProviderFocusFollowUp,
  extractAllToolPayloads,
  formatAiTokenPairAnswer,
  formatComposeSolutionAnswer,
  formatFastPathAnswer,
  formatStackFastPathAnswer,
  matchFastPath,
  shouldUseFastPath,
  tryFormatAgentToolAnswer,
  tryRunFastPath,
} from './fast-path';
import type {ChatMessage} from './gigachat';
import {runTool, runToolSync} from './tools';

describe('shouldUseFastPath', () => {
  it('is always on for calculator surface', () => {
    assert.equal(shouldUseFastPath({surface: 'calculator', probability: 0, random: () => 0.99}), true);
  });

  it('respects probability 0 / 1 on chat', () => {
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0, random: () => 0}), false);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 1, random: () => 0.99}), true);
  });

  it('samples chat fast-path at configured probability (~20% default)', () => {
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.5, random: () => 0.49}), true);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.5, random: () => 0.5}), false);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.2, random: () => 0.19}), true);
    assert.equal(shouldUseFastPath({surface: 'chat', probability: 0.2, random: () => 0.2}), false);
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

  it('matches product-page Ice Lake SKU compare to focused compute search', () => {
    const prompt =
      'Сравни с другими провайдерами: «Intel Ice Lake, 100% preemptible vCPU» (yc.compute.ice-lake-100.preemptible-vcpu) у Yandex Cloud. Категория: Compute. Конфигурация: vCPU · 100% · Intel Ice Lake · preemptible. Платформа: Intel Ice Lake. Цена сейчас: 244,80 ₽ за vCPU · в месяц. Найди ближайшие аналоги у других провайдеров';
    const plan = matchFastPath(prompt);
    assert.ok(plan);
    assert.equal(plan.id, 'sku-compare');
    assert.equal(plan.tools[0]?.name, 'search_prices');
    assert.equal(plan.tools[0]?.args.category, 'compute');
    assert.match(String(plan.tools[0]?.args.query), /Ice Lake.*preemptible|preemptible.*Ice Lake/i);
    assert.doesNotMatch(String(plan.tools[0]?.args.query), /Сравни с другими/);
    assert.equal(plan.tools[0]?.args.nearestAnalog, true);
  });

  it('matches product-page VM flavor SKU compare to get_quote shape, not unit RAM', () => {
    const prompt =
      'Сравни с другими провайдерами: «Виртуальная машина 4vCPU/32GB RAM» (cloudru.compute.4vcpu-32gb) у Cloud.ru. Категория: Compute. Конфигурация: 4 vCPU · 32 GiB RAM · Cascade / Ice Lake. Платформа: Cascade / Ice Lake. Цена сейчас: 8 669,81 ₽ в месяц. Найди ближайшие аналоги у других провайдеров';
    const plan = matchFastPath(prompt);
    assert.ok(plan);
    assert.equal(plan.id, 'sku-compare');
    assert.equal(plan.tools[0]?.name, 'get_quote');
    assert.equal(plan.tools[0]?.args.vcpu, 4);
    assert.equal(plan.tools[0]?.args.ramGiB, 32);
    assert.equal(plan.tools[0]?.args.diskGiB, 10);
    assert.equal(plan.tools[0]?.args.period, 'month');
  });

  it('matches product-page B300 SKU compare with gpuModel + nearestAnalog', () => {
    const prompt =
      'Сравни с другими провайдерами: «NVIDIA B300 288 ГБ · ×8» (selectel.dedicated.hgx-b300-8) у Selectel. Категория: GPU. Конфигурация: 128 vCPU · 2048 GiB RAM · 8 GPU · NVIDIA B300. Цена сейчас: 8 000 000,00 ₽ конфигурация целиком (GPU+хост) · в месяц. Найди ближайшие аналоги у других провайдеров';
    const plan = matchFastPath(prompt);
    assert.ok(plan);
    assert.equal(plan.id, 'sku-compare');
    assert.equal(plan.tools[0]?.name, 'search_prices');
    assert.equal(plan.tools[0]?.args.category, 'gpu');
    assert.equal(plan.tools[0]?.args.gpuModel, 'B300');
    assert.equal(plan.tools[0]?.args.nearestAnalog, true);
    assert.match(String(plan.tools[0]?.args.query), /B300/i);
    assert.match(String(plan.tools[0]?.args.query), /hgx-b300-8/);
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

  it('matches calculator follow-up «докинь CDN +1TB» to CDN egress search', () => {
    const plan = matchFastPath('докинь CDN +1TB');
    assert.ok(plan);
    assert.equal(plan.id, 'cdn-1tb');
    assert.equal(plan.tools[0]?.name, 'search_prices');
    assert.equal(plan.tools[0]?.args.category, 'cdn');
    assert.equal(plan.tools[0]?.args.volumeGiB, 1024);
    assert.match(String(plan.tools[0]?.args.query ?? ''), /CDN/i);

    const ru = matchFastPath('добавь CDN 2 ТБ в корзину');
    assert.ok(ru);
    assert.equal(ru.id, 'cdn-2tb');
    assert.equal(ru.tools[0]?.args.volumeGiB, 2048);
  });

  it('matches conjugated «докинем / добавим CDN» (not only imperative докинь)', () => {
    for (const q of [
      'окей, давай докинем туда CDN еще',
      'докинем CDN',
      'добавим CDN 1 ТБ',
      'давайте добавим CDN',
    ]) {
      const plan = matchFastPath(q);
      assert.ok(plan, q);
      assert.match(plan.id, /^cdn-\d+tb$/);
      assert.equal(plan.tools[0]?.name, 'search_prices');
      assert.equal(plan.tools[0]?.args.category, 'cdn');
    }
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

  it('matches cheapest VM per provider to get_quote mode', () => {
    for (const q of [
      'Подбери самое экономичное вариант в каждом из провайдеров',
      'Самая дешёвая ВМ у каждого провайдера',
      'Минимальная виртуальная машина по провайдерам',
    ]) {
      const plan = matchFastPath(q);
      assert.ok(plan, q);
      assert.equal(plan.id, 'vm-cheapest-per-provider', q);
      assert.equal(plan.tools[0]?.name, 'get_quote');
      assert.equal(plan.tools[0]?.args.mode, 'cheapest-per-provider');
    }
    // Must not steal GPU cheapest queries.
    assert.notEqual(matchFastPath('Самый дешёвый H100')?.id, 'vm-cheapest-per-provider');
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

  it('formats AI tokens as input/output pair without ranking output vs input', () => {
    const md = formatAiTokenPairAnswer(
      [
        {provider: 'MWS Cloud', name: 'glm-5.2 · input', month: 178.12},
        {provider: 'MWS Cloud', name: 'glm-5.2 · output', month: 746.64},
      ],
      'glm-52-mws',
    );
    assert.ok(md);
    assert.match(md!, /Input/);
    assert.match(md!, /Output/);
    assert.match(md!, /178/);
    assert.match(md!, /746/);
    assert.doesNotMatch(md!, /\+319%/);
    assert.doesNotMatch(md!, /к минимуму/);
    assert.match(md!, /не конкурирующие позиции/);
  });

  it('ranks multi-provider AI tokens on 1M in + 1M out blend', () => {
    const md = formatAiTokenPairAnswer(
      [
        {provider: 'MWS Cloud', name: 'qwen · input', month: 100},
        {provider: 'MWS Cloud', name: 'qwen · output', month: 400},
        {provider: 'Yandex Cloud', name: 'qwen · input', month: 80},
        {provider: 'Yandex Cloud', name: 'qwen · output', month: 300},
      ],
      'qwen-36',
    );
    assert.ok(md);
    assert.match(md!, /1M in \+ 1M out/);
    assert.match(md!, /Yandex Cloud/);
    assert.match(md!, /\bmin\b/);
    assert.match(md!, /иллюстративная смесь/);
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
    assert.match(md, /По провайдерам/);
  });

  it('detects provider-focus follow-ups', () => {
    assert.deepEqual(detectProviderFocusFollowUp('покажи только cloud ru'), ['Cloud.ru']);
    assert.ok(detectProviderFocusFollowUp('а у MWS?')?.some((n) => /MWS/i.test(n)));
    assert.equal(detectProviderFocusFollowUp('Сравни 4 vCPU / 16 GiB по всем провайдерам'), null);
  });

  it('tryRunFastPath filters prior get_quote on provider-focus follow-up', async () => {
    const quoteRaw = runToolSync(
      'get_quote',
      JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100, period: 'month'}),
    );
    const messages: ChatMessage[] = [
      {role: 'user', content: 'Сравни 4 vCPU / 16 GiB по всем провайдерам'},
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: {
              name: 'get_quote',
              arguments: JSON.stringify({vcpu: 4, ramGiB: 16, diskGiB: 100}),
            },
          },
        ],
      },
      {role: 'tool', tool_call_id: 'c1', name: 'get_quote', content: quoteRaw},
      {
        role: 'assistant',
        content: 'полный ответ со всеми провайдерами',
      },
      {role: 'user', content: 'покажи только cloud ru'},
    ];
    const result = await tryRunFastPath({messages, surface: 'chat'});
    assert.ok(result);
    assert.equal(result!.fastPathId, 'quote-provider-focus');
    assert.ok(result!.finalText);
    assert.match(result!.finalText!, /Cloud\.ru/);
    assert.doesNotMatch(result!.finalText!, /MWS Cloud/);
    assert.doesNotMatch(result!.finalText!, /Selectel/);
  });

  it('filters get_quote table on follow-up «только Cloud.ru» / «а у MWS?»', () => {
    const payload = {
      name: 'get_quote',
      content: JSON.stringify({
        request: {vcpu: 4, ramGiB: 16, diskGiB: 100},
        quotes: [
          {
            provider: 'Cloud.ru',
            total: 6886.66,
            parts: [
              {label: 'ВМ: 4 vCPU · 16 GiB RAM', amount: 5744.74},
              {label: 'Диск: NVMe, 100 GiB', amount: 1141.92},
            ],
          },
          {
            provider: 'MWS Cloud',
            total: 7665.12,
            parts: [
              {label: 'CPU: 4 vCPU', amount: 3318.34},
              {label: 'RAM: 16 GiB', amount: 3533.18},
              {label: 'Диск: NVMe, 100 GiB', amount: 813.6},
            ],
          },
          {provider: 'Selectel', total: 8112.67, parts: [{label: 'CPU: 4 vCPU', amount: 2900}]},
        ],
      }),
    };
    const onlyCloud = formatFastPathAnswer('vm', [payload], 'покажи только cloud ru');
    assert.ok(onlyCloud);
    assert.match(onlyCloud!, /Cloud\.ru/);
    assert.doesNotMatch(onlyCloud!, /MWS Cloud/);
    assert.doesNotMatch(onlyCloud!, /Selectel/);
    assert.match(onlyCloud!, /уточнению|Cloud\.ru/);

    const onlyMws = formatFastPathAnswer('vm', [payload], 'а у MWS?');
    assert.ok(onlyMws);
    assert.match(onlyMws!, /MWS Cloud/);
    assert.doesNotMatch(onlyMws!, /Cloud\.ru/);
    assert.doesNotMatch(onlyMws!, /Selectel/);
  });

  it('adds component×provider matrix for fixed-shape VM quotes', () => {
    const md = formatFastPathAnswer('vm', [
      {
        name: 'get_quote',
        content: JSON.stringify({
          request: {vcpu: 4, ramGiB: 16, diskGiB: 100},
          quotes: [
            {
              provider: 'Cloud.ru',
              total: 6886.66,
              parts: [
                {label: 'ВМ: 4 vCPU · 16 GiB RAM', amount: 5744.74},
                {label: 'Диск: NVMe, 100 GiB', amount: 1141.92},
              ],
            },
            {
              provider: 'MWS Cloud',
              total: 7665.12,
              parts: [
                {label: 'CPU: 4 vCPU', amount: 3318.34},
                {label: 'RAM: 16 GiB', amount: 3533.18},
                {label: 'Диск: NVMe, 100 GiB', amount: 813.6},
              ],
            },
            {
              provider: 'Selectel',
              total: 8112.67,
              parts: [
                {label: 'CPU: 4 vCPU', amount: 2900.45},
                {label: 'RAM: 16 GiB', amount: 4218.62},
                {label: 'Диск: SSD, 100 GiB', amount: 993.6},
              ],
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /По провайдерам/);
    assert.match(md, /По компонентам/);
    assert.match(md, /vCPU\+RAM \(flavor\)/);
    assert.match(md, /\| vCPU \|/);
    assert.match(md, /\| RAM \|/);
    assert.match(md, /\| Диск \|/);
    // Flavor provider: compute filled, unit vCPU/RAM empty in that column.
    assert.match(md, /vCPU\+RAM \(flavor\).*5[\s\u00a0]?744/);
    assert.match(md, /flavor/);
  });

  it('appends short missingProviders footnotes to get_quote answers', () => {
    const md = formatFastPathAnswer('vm', [
      {
        name: 'get_quote',
        content: JSON.stringify({
          request: {gpuModel: 'H200', gpuCount: 1, vcpu: 44, ramGiB: 256, diskGiB: 100},
          quotes: [{provider: 'Selectel', total: 400000, scope: 'gpu-synthetic'}],
          missingProviders: [
            {provider: 'Yandex Cloud', reason: 'нет H200 в каталоге'},
            {provider: 'MWS Cloud Platform', reason: 'нет H200 в каталоге'},
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /Нет в сравнении/);
    assert.match(md, /Yandex Cloud — нет H200 в каталоге/);
    assert.match(md, /MWS Cloud Platform — нет H200 в каталоге/);
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
    assert.match(md, /Qwen3-Coder-Next/);
    assert.match(md, /разумный старт|Ориентир по железу/);
    assert.match(md, /Использование VRAM/);
    assert.match(md, /Запас памяти/);
    assert.match(md, /52 из 80 GiB/);
    assert.match(md, /Оптимально/);
    assert.match(md, /Малый запас/);
    assert.match(md, /Если смотреть шире|Альтернатив/);
    assert.match(md, /Hosted API/);
    assert.match(md, /На что обратить внимание|Не путать/);
    assert.match(md, /Input/);
    assert.match(md, /Output/);
    assert.match(md, /PoC \/ лёгкий agent/);
    assert.doesNotMatch(md, /confidence:\s*\*\*high\*\*/);
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

  it('includes Cloud.ru derivedFromFlavors (*) in vCPU unit table', () => {
    const md = formatFastPathAnswer('vcpu-unit', [
      {
        name: 'compare_unit_price',
        content: JSON.stringify({
          component: 'vcpu',
          providers: [
            {providerName: 'Selectel', priceMonth: 725.11},
            {providerName: 'VK Cloud', priceMonth: 819.59},
            {providerName: 'MWS Cloud', priceMonth: 829.58},
            {providerName: 'Yandex Cloud', priceMonth: 892.8},
            {providerName: 'T1 Cloud', priceMonth: 898.75},
          ],
          derivedFromFlavors: [
            {
              provider: 'cloud-ru',
              providerName: 'Cloud.ru',
              hour: 0.976,
              month: 702.72,
              method: 'оценка (*) по типичным готовым ВМ',
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /Cloud\.ru\s*\*/);
    assert.match(md, /702[,.]72/);
    assert.match(md, /Selectel/);
    assert.match(md, /T1/);
    assert.match(md, /оценка|flavor/i);
    // Cloud.ru* is cheapest → first row; Selectel still listed.
    const cloudIdx = md!.indexOf('Cloud.ru');
    const selectelIdx = md!.indexOf('Selectel');
    assert.ok(cloudIdx >= 0 && selectelIdx > cloudIdx);
    assert.doesNotMatch(md, /не\s+представлен|нет\s+в\s+каталоге/i);
  });

  it('includes Cloud.ru derivedFromFlavors (*) in RAM unit table', () => {
    const md = formatFastPathAnswer('ram-unit', [
      {
        name: 'compare_unit_price',
        content: JSON.stringify({
          component: 'ram',
          providers: [
            {providerName: 'T1 Cloud', priceMonth: 217.54},
            {providerName: 'MWS Cloud', priceMonth: 220.82},
            {providerName: 'VK Cloud', priceMonth: 222.65},
            {providerName: 'Yandex Cloud', priceMonth: 237.6},
            {providerName: 'Selectel', priceMonth: 263.66},
          ],
          derivedFromFlavors: [
            {
              provider: 'cloud-ru',
              providerName: 'Cloud.ru',
              hour: 0.2547,
              month: 183.37,
              method: 'оценка (*) по типичным готовым ВМ',
            },
          ],
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /1 GiB RAM/);
    assert.match(md, /Cloud\.ru\s*\*/);
    assert.match(md, /183[,.]37/);
    assert.match(md, /T1/);
    assert.match(md, /Selectel/);
    assert.match(md, /оценка|flavor/i);
    assert.doesNotMatch(md, /не\s+представлен|нет\s+в\s+каталоге/i);
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

  it('formats fit_budget valuePick when Cloud.ru loses util top-6', () => {
    const md = formatFastPathAnswer('budget-10000', [
      {
        name: 'fit_budget',
        content: JSON.stringify({
          budgetMonthRub: 10_000,
          highlights: [
            {
              provider: 'VK Cloud',
              shape: '2 vCPU / 8 GiB / 100 GiB SSD',
              count: 2,
              spendMonth: 9440.81,
              utilPct: 94.41,
              totalVcpu: 4,
            },
          ],
          valuePick: {
            provider: 'Cloud.ru',
            shape: '4 vCPU / 16 GiB / 100 GiB SSD',
            shapeId: '4-16',
            count: 1,
            spendMonth: 6886.66,
            utilPct: 68.87,
            leftoverMonth: 3113.34,
            totalVcpu: 4,
            unitMonth: 6886.66,
          },
        }),
      },
    ]);
    assert.ok(md);
    assert.match(md, /Cloud\.ru/);
    assert.match(md, /дешевле/i);
    assert.match(md, /остаток/);
  });

  it('does not short-circuit impossible GPU budget / HA+1 node (needs narrative)', () => {
    assert.equal(
      tryFormatAgentToolAnswer({
        userText: 'Собери три GPU-ноды с H100 до 100 тысяч рублей в месяц.',
        toolPayloads: [
          {
            name: 'search_prices',
            arguments: JSON.stringify({query: 'H100', category: 'gpu'}),
            content: JSON.stringify({providersMatched: []}),
          },
        ],
      }),
      null,
    );
    assert.equal(
      tryFormatAgentToolAnswer({
        userText: 'Собери Kubernetes с одной нодой, но чтобы он был отказоустойчивым.',
        toolPayloads: [
          {
            name: 'compose_solution',
            arguments: JSON.stringify({solutionType: 'kubernetes', requirements: {workerCount: 1}}),
            content: JSON.stringify({solutions: []}),
          },
        ],
      }),
      null,
    );
  });

  it('formats compose_solution with request summary and BOM line items', () => {
    const md = tryFormatAgentToolAnswer({
      userText: 'ВМ 44 vCPU 300 GiB, диск HDD 100, IP, S3 2 ТБ и CDN',
      toolPayloads: [
        {
          name: 'compose_solution',
          arguments: JSON.stringify({
            solutionType: 'virtual_machine',
            requirements: {
              vcpu: 44,
              ramGiB: 300,
              diskGiB: 100,
              diskMedia: 'hdd',
              publicIpCount: 1,
              storageGiB: 2048,
              cdnRequested: true,
            },
          }),
          content: JSON.stringify({
            solutionType: 'virtual_machine',
            requirementSpec: {
              solutionType: 'virtual_machine',
              quantities: {
                vcpu: 44,
                ramGiB: 300,
                diskGiB: 100,
                publicIpCount: 1,
                storageGiB: 2048,
                cdnRequested: true,
              },
              constraints: {storage: {media: 'hdd', class: 'standard'}},
              requiredRoles: [
                'compute',
                'block_storage',
                'public_ip',
                'object_storage',
                'cdn_egress',
              ],
            },
            assumptions: [{message: 'CDN без объёма — не оценён'}],
            note: 'estimatedMonthlyCostRub — ranking only; use price_solution',
            solutions: [
              {
                provider: 'mws-cloud',
                providerName: 'MWS Cloud',
                estimatedMonthlyCostRub: 108_712,
                requirementsCoverage: 0.75,
                components: [
                  {
                    role: 'compute',
                    title: '44 vCPU',
                    quantity: 1,
                    estimatedMonthlyCostRub: 40_000,
                  },
                  {
                    role: 'compute',
                    title: '300 GiB RAM',
                    quantity: 1,
                    estimatedMonthlyCostRub: 50_000,
                  },
                  {
                    role: 'block_storage',
                    title: 'HDD 100 GiB',
                    quantity: 1,
                    estimatedMonthlyCostRub: 500,
                  },
                  {
                    role: 'public_ip',
                    title: 'Публичный IPv4',
                    quantity: 1,
                    estimatedMonthlyCostRub: 200,
                  },
                  {
                    role: 'object_storage',
                    title: 'Object Storage Standard · 2048 GiB',
                    quantity: 1,
                    estimatedMonthlyCostRub: 18_012,
                  },
                ],
              },
              {
                provider: 'vk-cloud',
                providerName: 'VK Cloud',
                estimatedMonthlyCostRub: 109_014,
                requirementsCoverage: 0.75,
                components: [
                  {role: 'compute', title: '44 vCPU', estimatedMonthlyCostRub: 41_000},
                  {role: 'object_storage', title: 'S3', estimatedMonthlyCostRub: 19_000},
                ],
              },
            ],
          }),
        },
      ],
    });
    assert.ok(md);
    assert.match(md!, /Запрос \(как собрали\)/);
    assert.match(md!, /44 vCPU/);
    assert.match(md!, /300 GiB RAM/);
    assert.match(md!, /Разбивка — MWS Cloud/);
    assert.match(md!, /HDD 100 GiB/);
    assert.match(md!, /Object Storage/);
    assert.match(md!, /Публичный IPv4/);
    assert.match(md!, /Не покрыто|CDN/);
    assert.match(md!, /108[\s\u00a0]?712/);
    // GFM tables break if blank lines sit between header / separator / body.
    assert.doesNotMatch(md!, /\|\n\n\|/);
  });

  it('compose request summary reads vCPU/RAM from constraints.min*', () => {
    const md = formatComposeSolutionAnswer({
      solutionType: 'virtual_machine',
      requirementSpec: {
        solutionType: 'virtual_machine',
        quantities: {diskGiB: 100, publicIpCount: 1, storageGiB: 2048, cdnRequested: true},
        constraints: {
          minVcpu: 44,
          minRamGiB: 300,
          storage: {media: 'hdd', class: 'standard'},
        },
        requiredRoles: ['compute', 'block_storage', 'public_ip', 'object_storage'],
      },
      solutions: [
        {
          provider: 'mws-cloud',
          providerName: 'MWS Cloud',
          estimatedMonthlyCostRub: 100_000,
          components: [
            {role: 'compute', title: 'CPU: 44 vCPU', estimatedMonthlyCostRub: 36_000},
            {role: 'compute', title: 'RAM: 300 GiB', estimatedMonthlyCostRub: 60_000},
            {role: 'block_storage', title: 'Диск: HDD, 100 GiB', estimatedMonthlyCostRub: 400},
            {role: 'public_ip', title: 'Публичный IP: 1', estimatedMonthlyCostRub: 150},
            {
              role: 'object_storage',
              title: 'Object Storage · 2048 GiB',
              quantity: 2048,
              estimatedMonthlyCostRub: 5_000,
            },
          ],
        },
      ],
    });
    assert.ok(md);
    assert.match(md!, /Compute: 44 vCPU \/ 300 GiB RAM/);
    assert.match(md!, /Системный диск: 100 GiB \(HDD\)/);
    assert.match(md!, /Диск: HDD, 100 GiB/);
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
