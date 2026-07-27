import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  DOMAIN_CARD_AI,
  DOMAIN_CARD_GPU,
  DOMAIN_CARD_K8S,
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

  it('treats «сервер целиком / не просто карту» as GPU domain', () => {
    assert.ok(
      matchPlanningDomains('супер, а ты можешь попробовать собрать сервер целиком ? не просто карту')
        .includes('gpu'),
    );
    const prompt = buildSystemPrompt(
      'супер, а ты можешь попробовать собрать сервер целиком ? не просто карту',
      {historyText: 'Самый дешёвый H100 в месяц'},
    );
    assert.ok(prompt.includes('## GPU'));
    assert.match(prompt, /не\s+просто\s+карт|сервер целиком|cheapest-per-provider/i);
    assert.match(prompt, /ЗАПРЕЩЕНО после GPU|get_quote\(gpuModel/i);
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

  it('ice-lake SKU compare is compute-only (not S3 Ice / stack)', () => {
    const d = matchPlanningDomains(
      'Сравни с другими провайдерами: «Intel Ice Lake, 100% preemptible vCPU» (yc.compute.ice-lake-100.preemptible-vcpu) у Yandex Cloud. Категория: Compute. Найди ближайшие аналоги и сравни цены в одной таблице.',
    );
    assert.ok(d.includes('compute'));
    assert.ok(!d.includes('s3'), `unexpected s3 from ice-lake SKU: ${d.join(',')}`);
    assert.ok(!d.includes('stack'), `unexpected stack: ${d.join(',')}`);
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
    assert.match(prompt, /compare_unit_price\(ssd\)|diskMedia|блочн/i);
    assert.match(prompt, /get_quote — ТОЛЬКО одна ВМ\/GPU целиком/);
  });

  it('100 TiB block SSD ask is compute, not S3 card', () => {
    const q = 'Сколько стоит 100 ТБ SSD (блочный диск) в месяц по провайдерам?';
    const d = matchPlanningDomains(q);
    assert.ok(d.includes('compute'), d.join(','));
    assert.ok(!d.includes('s3'), `must not attach S3 card: ${d.join(',')}`);
    const prompt = buildSystemPrompt(q);
    assert.match(prompt, /Блочный диск|блочный SSD|не подставляй S3/i);
    assert.match(prompt, /volumeGiB|volumeEstimates/);
    assert.ok(!prompt.includes('## Object Storage / S3'));
  });

  it('fixed-shape VM get_quote prompt requires component matrix from parts', () => {
    const prompt = buildSystemPrompt('Сравни 4 vCPU / 16 GiB по всем провайдерам');
    assert.ok(matchPlanningDomains('Сравни 4 vCPU / 16 GiB по всем провайдерам').includes('compute'));
    assert.match(prompt, /По компонентам/);
    assert.match(prompt, /quotes\[\]\.parts|vCPU\+RAM \(flavor\)/);
    assert.match(prompt, /ДВЕ таблицы|две таблицы/i);
  });

  it('slippery storage domain cards: block / object / both', () => {
    const blockOnly = matchPlanningDomains(
      'Нужен блочный SSD 100 ТБ, не путать с S3 / объектным хранилищем',
    );
    assert.ok(blockOnly.includes('compute'), blockOnly.join(','));
    assert.ok(!blockOnly.includes('s3'), `negated S3 must not attach card: ${blockOnly.join(',')}`);

    const objectOnly = matchPlanningDomains(
      'Только Object Storage Standard 100 ТБ, блочный диск ВМ не считай',
    );
    assert.ok(objectOnly.includes('s3'), objectOnly.join(','));
    assert.ok(
      !objectOnly.includes('compute'),
      `negated block must not attach compute: ${objectOnly.join(',')}`,
    );
    const objectPrompt = buildSystemPrompt(
      'Только Object Storage Standard 100 ТБ, блочный диск ВМ не считай',
    );
    assert.ok(objectPrompt.includes('## Object Storage / S3'));
    assert.ok(!objectPrompt.includes('## vCPU / RAM / диск'));

    const both = matchPlanningDomains(
      'Сравни блочный SSD и объектное хранилище Standard на 100 ТБ в одной таблице',
    );
    assert.ok(both.includes('compute'), `both needs compute: ${both.join(',')}`);
    assert.ok(both.includes('s3'), `both needs s3: ${both.join(',')}`);

    const followUpBlock = buildSystemPrompt('а теперь то же для блочного SSD', {
      historyText: 'Сколько стоит 100 ТБ объектного хранилища Standard?',
    });
    assert.match(followUpBlock, /## vCPU \/ RAM \/ диск|блочн/i);
  });

  it('attaches stack for kubernetes workers / compose asks', () => {
    const d = matchPlanningDomains(
      'Собери самый дешёвый managed Kubernetes с worker-нодами до 100 тысяч',
    );
    assert.ok(d.includes('k8s'));
    assert.ok(d.includes('stack'));
    const prompt = buildSystemPrompt(
      'Собери самый дешёвый managed Kubernetes с worker-нодами до 100 тысяч',
    );
    assert.match(prompt, /compose_solution/);
  });

  it('workload infra ask routes to stack+gpu, not token-only ai card', () => {
    const d = matchPlanningDomains('Подбери инфраструктуру для GLM 5.2');
    assert.ok(d.includes('stack'));
    assert.ok(d.includes('gpu'));
    assert.ok(!d.includes('ai'), `token card should not replace infra: ${d.join(',')}`);
    const prompt = buildSystemPrompt('Подбери инфраструктуру для GLM 5.2');
    assert.match(prompt, /recommend_inference_infra|INTENT/);
    assert.match(prompt, /assumptions|допущен/i);
  });

  it('gpt-oss 70/30 token mix attaches AI card, not self-host GPU', () => {
    const q =
      'цена за 1 млн при паттерне 70 (input) / 30 (output) возьми gpt oss 120b';
    const d = matchPlanningDomains(q);
    assert.ok(d.includes('ai'), d.join(','));
    assert.ok(!d.includes('gpu'), `must not invent GPU rent: ${d.join(',')}`);
    const prompt = buildSystemPrompt(q);
    assert.match(prompt, /search_prices category=ai|70\/30/i);
    assert.match(prompt, /Запрещено|не подменя/i);
    assert.match(prompt, /CATALOG FACTS[\s\S]*gpt-oss-120b/);
    assert.match(prompt, /yandex|mws|cloud\.ru/);
  });

  it('static domain cards omit hardcoded catalog matrices and price anecdotes', () => {
    assert.ok(!/s-c2-m8|форм 2\/4 и 2\/6|VK:\s*2\/6/.test(DOMAIN_CARD_K8S));
    assert.ok(!/gpt-oss-120b\s*\/\s*gpt-oss-20b\s*\*\*есть\*\*/.test(DOMAIN_CARD_AI));
    assert.ok(!/Yandex,\s*MWS,\s*Cloud\.ru/.test(DOMAIN_CARD_AI));
    assert.ok(!/~\s*300\s*₽|~\s*340к/.test(DOMAIN_CARD_GPU));
  });

  it('k8s ask injects live master defaults into planning prompt', () => {
    const prompt = buildSystemPrompt('Сравни Managed Kubernetes по провайдерам');
    assert.match(prompt, /## Managed Kubernetes/);
    assert.match(prompt, /CATALOG FACTS/);
    assert.match(prompt, /yandex 2\/8/);
    assert.ok(!/s-c2-m8.*4\/8 · 4\/16/.test(prompt), 'old static matrix must be gone');
  });

  it('named model + 1M tokens stays on AI even if «инференс» appears', () => {
    const d = matchPlanningDomains('Сколько стоит инференс gpt-oss-120b за 1M токенов?');
    assert.ok(d.includes('ai'), d.join(','));
    assert.ok(!d.includes('gpu'), d.join(','));
  });

  it('core encodes intent-first modes and clarification rules', () => {
    assert.match(SYSTEM_PROMPT_CORE, /INTENT/);
    assert.match(SYSTEM_PROMPT_CORE, /Отдельная цена/);
    assert.match(SYSTEM_PROMPT_CORE, /Workload без ТЗ/);
    assert.match(SYSTEM_PROMPT_CORE, /CAPACITY \/ RPS/);
    assert.match(SYSTEM_PROMPT_CORE, /RpsPerCore|Concurrency/);
    assert.match(SYSTEM_PROMPT_CORE, /покрытие ≠ 100%|needs_clarification/);
    assert.match(SYSTEM_PROMPT_CORE, /ашка/);
    assert.match(SYSTEM_PROMPT_CORE, /PREVIEW FIRST/);
    assert.match(SYSTEM_PROMPT_CORE, /КОНФЛИКТЫ|невозмож/i);
  });

  it('attaches stack for shop / web infra asks', () => {
    const d = matchPlanningDomains('Собери инфраструктуру для небольшого интернет-магазина');
    assert.ok(d.includes('stack'), d.join(','));
  });

  it('RPS / Go capacity asks attach compute+stack and keep sizing rules', () => {
    const d = matchPlanningDomains('Тысяча RPS на Go — сколько CPU-ядер нужно?');
    assert.ok(d.includes('compute'), d.join(','));
    assert.ok(d.includes('stack'), d.join(','));
    const prompt = buildSystemPrompt('API на Go, 1000 RPS, латентность 10 мс — подбери ВМ');
    assert.match(prompt, /CAPACITY \/ RPS|RpsPerCore/);
    assert.match(prompt, /get_quote|compose/);
  });
});

describe('buildSystemPrompt size', () => {
  it('core is much smaller than full SYSTEM_PROMPT', () => {
    assert.ok(SYSTEM_PROMPT_CORE.length < 12_000);
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

describe('buildSystemPrompt catalog facts wiring', () => {
  it('GPU-only ask does not inject CATALOG FACTS', () => {
    const prompt = buildSystemPrompt('Самый дешёвый H100 в месяц');
    assert.ok(prompt.includes('## GPU'));
    assert.ok(!prompt.includes('CATALOG FACTS'));
  });

  it('eval SYSTEM_PROMPT baseline stays static (no live snapshot body)', () => {
    // Cards may mention the section name, but must not embed live rows.
    assert.ok(!/K8s masters \(catalog defaults/.test(SYSTEM_PROMPT));
    assert.ok(!/AI hosted API «/.test(SYSTEM_PROMPT));
    assert.ok(!/yandex 2\/8/.test(SYSTEM_PROMPT));
  });

  it('self-host GLM does not inject AI availability facts', () => {
    const prompt = buildSystemPrompt('Подбери инфраструктуру для GLM 5.2');
    assert.ok(!prompt.includes('CATALOG FACTS'), 'self-host should not get AI hosted snapshot');
    assert.ok(!/AI hosted API/.test(prompt));
  });

  it('history can keep k8s card while AI facts use current turn only', () => {
    const prompt = buildSystemPrompt('а теперь токены gpt-oss-120b', {
      historyText: 'Сравни Managed Kubernetes по провайдерам',
    });
    assert.match(prompt, /## Managed Kubernetes/);
    assert.match(prompt, /CATALOG FACTS/);
    assert.match(prompt, /K8s masters/);
    assert.match(prompt, /gpt-oss-120b/);
  });

  it('AI availability facts use current userText only (not history model name)', () => {
    const prompt = buildSystemPrompt('Сравни Managed Kubernetes masters', {
      historyText: 'Сколько стоит gpt-oss-120b?',
    });
    // History may still attach the AI policy card, but live availability is keyed off userText.
    assert.match(prompt, /K8s masters/);
    assert.ok(
      !/AI hosted API «gpt-oss-120b»/.test(prompt),
      'must not snapshot history model when current turn has no model',
    );
  });
});
