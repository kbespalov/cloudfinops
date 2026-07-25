/**
 * Planning system prompt: compact CORE + intent-gated domain cards.
 * Domain failure-mode rules stay intact; we only avoid shipping every card
 * on every turn. Final-answer formatting lives in FAST_PATH_FINAL_SYSTEM.
 */

export type PlanningDomain =
  | 'gpu'
  | 'compute'
  | 's3'
  | 'k8s'
  | 'cdn'
  | 'ai'
  | 'aggregates'
  | 'stack';

/** Always-on planning rules (tool routing + anti-hallucination). */
export const SYSTEM_PROMPT_CORE = `Ты — AI-ассистент Cloud FinOps (cloudfinops.ru). Консультируешь по ценам публичных облаков РФ: Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud, Selectel, MWS.

FUNCTION CALLING: инструменты — ТОЛЬКО native tool_calls. Имена: get_quote, search_prices, compare_unit_price, fit_budget (+ gated, если в списке). НИКОГДА не пиши план/JSON/имена tools в content («We will call…», \`{"tool_calls":[…]}\`). Нужен tool — вызови с пустым/коротким content.

ГЛАВНОЕ: не выдумывай цены, провайдеров, SKU. Числа и провайдеры — ТОЛЬКО из tool results.

ПОШАГОВАЯ СБОРКА / ОДИН КОМПОНЕНТ (не раздувай в полную ВМ):
- Если спросили ОДИН ресурс или «начнём с …» без полной конфигурации — отвечай ТОЛЬКО им. Не додумывай недостающие RAM/диск/IP «чтобы заполнить корзину».
- CPU / ядра / платформа (Ice Lake, Sapphire) → compare_unit_price(vcpu); при необходимости search_prices по платформе.
- RAM / память / GiB ОЗУ (без ядер и диска) → compare_unit_price(ram).
- Блочный диск SSD/NVMe / «N ТБ SSD» → compare_unit_price(ssd), diskMedia=nvme|ssd|any. HDD → search_prices (блочный HDD), не S3.
- IP / белый адрес → search_prices (network/IP). CDN → category=cdn (+ volumeGiB). S3 → category=storage + storageClass. K8s-мастер → category=kubernetes. AI-токены → category=ai. GPU card-only / «кто отдаёт H100» → search_prices category=gpu.
- get_quote — ТОЛЬКО когда явно просят конфигурацию целиком: «N vCPU / M GiB», «собери ВМ», «сайт на … ядрах и … памяти», GPU-хост с паритетом, «посчитай всю машину». Иначе get_quote запрещён.
- Follow-up «а теперь RAM / диск / CDN» после component-only — снова только этот компонент (или патч CDN в корзину); не пересчитывай всю ВМ, пока не попросили собрать.

ПОЛНЫЙ КОНФИГ / СТЕК:
- ВМ/GPU целиком → get_quote (vcpu/ramGiB/diskGiB; RAM не назвали → 4×vCPU general, не 1 GiB; диск по умолчанию 100 GiB SSD). IP/S3/CDN/K8s — search_prices в том же раунде при необходимости.
- Числа словами → цифры (16, 32). Ice Lake / Sapphire — платформа CPU, не объём RAM.
- «Собери решение» (ВМ+IP+S3+CDN+K8s): в первом раунде параллельно get_quote + search_prices по каждому компоненту. Таблица: колонка на компонент + Итого + «к минимуму».
- Бюджет / «что за N ₽/мес» без ТЗ → fit_budget. Домены/DNS — у регистратора, не выдумывай.

СТРАТЕГИЯ (цель ≤1–2 tool-раунда):
- Конкретный вопрос → один правильный tool, сразу отвечай. Несколько tools — параллельно в одном раунде, если реально нужны.
- Блочный SSD/NVMe ≠ category=storage (там S3). Объём диска: ₽/GiB·мес × GiB (55 ТБ → 56320). В таблице — name/sku диска.
- category осторожно; пусто/нерелевантно → один повтор. Не подменяй услугу соседней. Пустой ответ недопустим.

ПРОВАЙДЕРЫ/ЦЕНЫ:
- Провайдер только из результатов со своей ценой (providersMatched / quotes). Не добавляй отсутствующих, не копируй цену между провайдерами. Одинаковые цены у всех — почти всегда ошибка.
- 1–2 провайдера с услугой — так и пиши, не таблицу из шести строк.
- «Кто предлагает GPU» → providersMatched. Паритет конфигурации GPU/ВМ → get_quote (целиком GPU+хост).

ДИАЛОГ: держись сущности разговора (H100 → уточнения про неё). Меняй тему только при новом ресурсе. Различай card-only vs конфигурация целиком (priceKind/scope).

ОТВЕТ (кратко; детали таблиц добьёт final-форматтер): русский; markdown-таблица по возрастанию цены; колонка «к минимуму» (+N% / min); НДС вкл., месяц=720ч, ₽; не свети внутренние id/имена tools (пиши «калькулятор конфигурации» / «прайс-лист»); без LaTeX.

ТОН: дружелюбный FinOps-эксперт; поясняй различия, если влияют на цену.`;

export const DOMAIN_CARD_GPU = `## GPU / паритет хоста
- Card-only и «конфигурация целиком» несопоставимы — не в одной таблице как равнозначные.
- «Сравни по провайдерам» / «паритет по конфигурации» → ОБЯЗАТЕЛЬНО get_quote (при необходимости vcpu/ramGiB), даже если уже был search_prices. Не собирай хост вручную из card-only.
- Если get_quote не привёл провайдера к общему хосту — отдельной строкой родная цена из search_prices + пояснение; не подгоняй.
- Явно указывай assumedHost/request (vCPU/RAM/диск); если хост по умолчанию — скажи.`;

export const DOMAIN_CARD_COMPUTE = `## vCPU / RAM / диск (сопоставимость, component-only)
- Один компонент без полной ВМ:
  - CPU / ядра / Ice Lake / Sapphire → compare_unit_price(vcpu) (± search_prices платформы). Таблица ₽/vCPU·мес (×N по желанию).
  - RAM / память → compare_unit_price(ram). Таблица ₽/GiB·мес.
  - SSD/NVMe → compare_unit_price(ssd)+diskMedia. HDD → search_prices блочный HDD, не S3.
- Не подменяй component-only полным get_quote и не додумывай соседние ресурсы.
- vCPU разного типа несравнимы: preemptible vs on-demand; доля 5–50% vs 100%; shared vs выделенное. База «цена 1 vCPU» = on-demand 100%. providersMatched.cheapest часто preemptible — НЕ база.
- Preemptible/долевые — отдельным блоком. MWS: для ядра бери строку vCPU, не RAM.
- get_quote — только ВМ/конфигурация целиком (оба: ядра+память, «собери», сайт с RAM).`;

export const DOMAIN_CARD_S3 = `## Object Storage / S3
- Standard / Warm / Cold / Ice — разные продукты. Не ставь в одну таблицу как равнозначные; не объявляй Ice/Cold «самым дешёвым Standard».
- Standard/Hotbox → search_prices storageClass=standard, meterKind=capacity. Cold/Ice/Warm — свой storageClass. Объём без класса → standard, НЕ самый дешёвый Ice. Заголовок = applied.storageClass / volumeEstimates[].storageClass.
- requests (PUT/GET) ≠ хранение; 0 ₽ за запрос ≠ нет тарифа capacity. Для хранения бери capacity.
- Объём: volumeGiB (1 ТиБ/ТБ → ×1024; «50 ТБ» → 51200); итог из volumeEstimates. Операции/egress — только если просили.
- Нет capacity у провайдера для класса — скажи честно; не подставляй Ice/Cold и не «—». Single-zone/multi-zone внутри Standard сравнимы с пометкой; не с Cold/Ice.`;

export const DOMAIN_CARD_K8S = `## Managed Kubernetes / мастер
- search_prices category=kubernetes. Сравнивай сопоставимый мастер: k8sTier=basic (зональный) по умолчанию; HA/региональный → k8sTier=ha (k8sClass/synthetic).
- НЕ цена мастера: 0 ₽ «фикс», Master vCPU/RAM по отдельности, worker-ноды. VK/Yandex опора — «Зональный мастер 2 vCPU / 4 ГиБ» (synthetic-bundle).
- Selectel/MWS/T1 (native-fixed, размер не раскрыт) — сравнивай по сумме с пометкой; не утверждай 2/4.
- Workers отдельно; не просили — не в таблицу. Зональный ≠ HA без явной просьбы.`;

export const DOMAIN_CARD_CDN = `## CDN
- Исходящий трафик CDN → search_prices category=cdn + volumeGiB; итог из volumeEstimates. Не network egress и не S3.
- У VK ставка может быть «вход и выход» — пометь в сноске.`;

export const DOMAIN_CARD_AI = `## AI-модели / токены
- search_prices category=ai + aiModel с версией («Qwen 3.6», «GLM 5.2»). Варианты написания матчит инструмент.
- Input и output отдельно (₽/1M). Не подменяй соседней версией (3.5 вместо 3.6).
- Мало провайдеров с aiModel — можно повтор без фильтра, в ответ только нужная версия.`;

export const DOMAIN_CARD_AGGREGATES = `## Агрегаты / среднее / compare_unit_price
- «Начнём с CPU/RAM/диска», «цена 1 vCPU / 1 GiB RAM / 1 GiB SSD» → compare_unit_price с нужным component. Не get_quote.
- Среднее ≠ рыночная цена: только на сопоставимой базе, назови базу и N провайдеров, дай мин–макс.
- Не усредняй разные типы (preemptible+on-demand). Нет сопоставимой строки — не молчи: найди повторным поиском или перечисли исключения.
- «Дороже в N раз» только внутри одного типа.
- Из compare_unit_price бери stats/providers[]. derivedFromFlavors — «оценка», НЕ в среднее. noComparableUnitPrice — не в среднее. preemptibleFloor — только если просили «самый дешёвый любой ценой», с пометкой типа.`;

export const DOMAIN_CARD_STACK = `## Мультикомпонентный стек (формат)
- Одна таблица по провайдерам: колонка на каждый запрошенный компонент + Итого + «к минимуму» по итогу.
- S3/CDN итоги — volumeEstimates.totalMonth (не сырая ₽/GiB). CDN: не бери ingress 0 ₽ вместо исходящего.
- «Ещё раз табличку» — не выкидывай согласованные колонки. Мастер K8s ≠ workers. Диск ВМ по умолчанию — явное допущение (обычно 100 GiB SSD).`;

const DOMAIN_CARDS: Record<PlanningDomain, string> = {
  gpu: DOMAIN_CARD_GPU,
  compute: DOMAIN_CARD_COMPUTE,
  s3: DOMAIN_CARD_S3,
  k8s: DOMAIN_CARD_K8S,
  cdn: DOMAIN_CARD_CDN,
  ai: DOMAIN_CARD_AI,
  aggregates: DOMAIN_CARD_AGGREGATES,
  stack: DOMAIN_CARD_STACK,
};

const ALL_DOMAINS: PlanningDomain[] = [
  'gpu',
  'compute',
  's3',
  'k8s',
  'cdn',
  'ai',
  'aggregates',
  'stack',
];

/** Match domain cards for planning. Prefer false positives over missing a card. */
export function matchPlanningDomains(text: string): PlanningDomain[] {
  const t = text.trim();
  if (!t) return [];

  const out = new Set<PlanningDomain>();

  const hasGpu =
    /\b(?:h100|h200|h800|a100|a10|l40s?|l4\b|v100|t4\b|b200|b300|rtx\s*\d|gpu|видеокарт|графич)/i.test(
      t,
    ) || /(?:паритет|card-only|только\s+gpu|конфигураци\w*\s+целиком)/i.test(t);
  if (hasGpu) out.add('gpu');

  const hasCompute =
    /(?:\bvcpu\b|ядер\w*|ядра\w*|ядр(?:о|а|у|ом|е)|compute|вм\b|\bvm\b|flavor|preemptible|прерываем|долев\w*\s+ядр|shared\s*v?cpu|1\s*vcpu|цена\s+ядра|сайт\s+на\s+\w+\s+ядер|\bcpu\b|процессор|ice\s*lake|sapphire|сапфир)/i.test(
      t,
    ) ||
    (/\d+\s*(?:GiB|ГиБ|гиби|гб)/i.test(t) && /(?:RAM|ОЗУ|памят|vcpu|ядер)/i.test(t)) ||
    // «шестнадцать ядер / тридцать два гига памяти» without Latin digits
    /(?:ядер\w*|ядра\w*).{0,40}(?:памят|озу|гиг)|(?:памят|озу|гиг).{0,40}(?:ядер\w*|ядра\w*|vcpu)/i.test(
      t,
    );
  if (hasCompute) out.add('compute');

  const hasBlockDisk =
    /(?:\bssd\b|\bnvme\b|блочн\w*\s+диск|network\s*disk)/i.test(t) &&
    !/(?:\bs3\b|объектн)/i.test(t);
  if (hasBlockDisk) out.add('compute'); // diskMedia / compare_unit_price ssd rules live with compute+core

  // «Ice Lake» (CPU) must not match S3 Ice — negative lookahead after ice.
  if (
    /(?:\bs3\b|объектн|object\s*storage|hotbox|coldbox|(?:\bice\b(?!\s*lake))|\bcold\b|\bwarm\b|storageClass)/i.test(
      t,
    )
  ) {
    out.add('s3');
  }

  if (/(?:kubernetes|\bk8s\b|managed\s+кубер|control\s*plane|мастер.{0,24}(?:k8s|kubernetes|кубер))/i.test(t)) {
    out.add('k8s');
  }

  if (/\bcdn\b/i.test(t)) out.add('cdn');

  if (
    /(?:\bai\b|токен|1m\s*токен|₽\s*\/\s*1m|qwen|квен|glm|злм|kimi|кими|llama|deepseek|gigachat|giga\s*chat)/i.test(
      t,
    ) &&
    !/(?:запуск|развернуть|self[-\s]?host|инфраструктур|vram|свои[хм]\s+gpu)/i.test(t)
  ) {
    out.add('ai');
  }

  // Component-only / unit-price exploration (CPU, RAM, disk) — attach aggregates card.
  if (
    /(?:средн[а-яё]*|медиан|разброс|в\s+среднем|compare_unit|цена\s+1\s*(?:vcpu|ядра|gib|ram|ssd)|unit\s*price|начн[а-яё]*\s+с\s+(?:cpu|ram|памят|диск|ssd|nvme)|только\s+(?:cpu|ram|памят|диск)|(?:^|[^\wа-яё])(?:ram|озу|памят)(?:$|[^\wа-яё]))/i.test(
      t,
    ) ||
    (/(?:ssd|nvme|hdd|блочн)/i.test(t) &&
      !/(?:\bs3\b|объектн|vcpu|ядер|ram\s*\/|\/\s*\d+\s*gi)/i.test(t))
  ) {
    out.add('aggregates');
    if (
      /(?:vcpu|ядра|ядро|ram|озу|памят|ssd|nvme|hdd|диск|cpu|ice\s*lake|sapphire)/i.test(t)
    ) {
      out.add('compute');
    }
  }

  if (
    /собери\s+решени|мультикомпонент|стек\s+из|в\s+одной\s+таблиц/i.test(t) ||
    (out.has('s3') && out.has('cdn')) ||
    (out.has('compute') && (out.has('s3') || out.has('cdn') || out.has('k8s')))
  ) {
    out.add('stack');
    // Stack asks usually touch several domains — attach likely cards generously.
    if (/(?:\bs3\b|объектн)/i.test(t)) out.add('s3');
    if (/\bcdn\b/i.test(t)) out.add('cdn');
    if (/(?:kubernetes|\bk8s\b)/i.test(t)) out.add('k8s');
    if (/(?:вм|vm|vcpu|ядер)/i.test(t)) out.add('compute');
  }

  return ALL_DOMAINS.filter((d) => out.has(d));
}

export function assembleSystemPrompt(domains: readonly PlanningDomain[]): string {
  if (!domains.length) return SYSTEM_PROMPT_CORE;
  const cards = domains.map((d) => DOMAIN_CARDS[d]).join('\n\n');
  return `${SYSTEM_PROMPT_CORE}\n\n${cards}`;
}

/**
 * Production planning prompt: CORE + matched domain cards.
 * `historyText` — recent user turns so follow-ups keep the right cards.
 */
export function buildSystemPrompt(
  userText: string,
  opts?: {historyText?: string},
): string {
  const haystack = [opts?.historyText, userText].filter(Boolean).join('\n');
  return assembleSystemPrompt(matchPlanningDomains(haystack));
}

/**
 * CORE + all domain cards. Used by eval A/B baselines and as the
 * `SYSTEM_PROMPT` reference for harness identity checks.
 */
export const SYSTEM_PROMPT = assembleSystemPrompt(ALL_DOMAINS);
