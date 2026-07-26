import type {BlogPost} from '@/data/blog';

export const kimiK3VsGlm52Post: BlogPost = {
  slug: 'kimi-k3-vs-glm-5-2',
  date: '2026-07-26',
  series: 'AI-инфраструктура',
  title: 'Kimi K3 vs GLM 5.2 для разработки: capability, цена и self-host',
  seoTitle: 'Kimi K3 vs GLM 5.2: coding agents, Opus 4.8, Fable 5 и cost per task',
  description:
    'Сравнение Kimi K3 и GLM 5.2 для coding agents: бенчмарки с оговоркой harness, цена за задачу, open weights, где они стоят относительно Claude Opus 4.8, Fable 5 и GPT-5.6 Sol.',
  lead:
    'Coding agent час крутит один и тот же баг: токены списываются, PR всё ещё красный. Вопрос не «какая модель умнее на слайде», а какая даёт приемлемый merge rate за понятные деньги — и когда имеет смысл эскалировать на Fable или Opus. Разбираем Kimi K3 и GLM 5.2 для разработки.',
  tags: ['ai', 'finops'],
  keywords: [
    'Kimi K3',
    'GLM 5.2',
    'Kimi K3 vs GLM 5.2',
    'coding agent',
    'Claude Opus 4.8',
    'Claude Fable 5',
    'GPT-5.6 Sol',
    'open weights',
    'SWE-bench',
    'Terminal-Bench',
    'cost per task',
    'self-host LLM',
    'AI инфраструктура',
  ],
  readingMinutes: 14,
  sources: [
    {
      label: 'Kimi K3 Tech Blog (Moonshot)',
      url: 'https://www.kimi.com/blog/kimi-k3',
    },
    {
      label: 'GLM-5.2 — Z.ai blog',
      url: 'https://z.ai/blog/glm-5.2',
    },
    {
      label: 'Artificial Analysis — LLM leaderboard',
      url: 'https://artificialanalysis.ai/',
    },
    {
      label: 'DeepSWE leaderboard',
      url: 'https://deepswe.datacurve.ai/',
    },
    {
      label: 'Together — Kimi K3 vs Claude Fable 5 on DeepSWE',
      url: 'https://www.together.ai/blog/kimi-k3-vs-claude-fable-5-on-deepswe-cost-and-coding',
    },
  ],
  body: [
    {
      type: 'p',
      text: 'Команда перевела coding agent с Claude на «дешёвую open-модель» и через неделю спорит о результате. У одних merge rate почти не изменился, а счёт за токены упал. У других агент стал длиннее, чаще переписывал одни и те же файлы, а экономия на прайсе съелась числом итераций.',
    },
    {
      type: 'p',
      text: 'В июне–июле 2026 на эту развилку одновременно вышли два сильных игрока open/near-frontier класса: **GLM 5.2** от Z.ai (Zhipu) и **Kimi K3** от Moonshot. Оба целятся в agentic coding и контекст порядка миллиона токенов. Оба уже сравнивают с **Claude Opus 4.8**, **Claude Fable 5** и **GPT-5.6 Sol**. Ниже — как читать эти сравнения, если вы выбираете модель под разработку, а не под лидерборд в чате.',
    },
    {
      type: 'p',
      text: 'После статьи можно ответить: когда брать GLM 5.2 как объёмный workhorse, когда тестировать Kimi K3 на сложных и multimodal задачах, и куда в этой лестнице ставить Opus и Fable.',
    },

    {type: 'h2', text: 'Коротко: если нужна только суть'},
    {
      type: 'ul',
      items: [
        '**Kimi K3** (Moonshot, 16 июля 2026) — 2,8T MoE, native vision, контекст 1M, сильный профиль на long-horizon coding и agentic work. На дату статьи доступ через API/`kimi-k3`; полные веса обещаны к **27 июля 2026**.',
        '**GLM 5.2** (Z.ai, середина июня 2026) — ~0,74–0,75T MoE, MIT-веса уже доступны, текст-first, заметно дешевле и обычно быстрее на API. Сильная open-weight ставка на рутинный agentic coding.',
        'На независимом Artificial Analysis Intelligence Index (снимок июля 2026, max reasoning) порядок примерно такой: **Fable 5 ≈ 60**, **GPT-5.6 Sol ≈ 59**, **Kimi K3 ≈ 57**, **Opus 4.8 ≈ 56**, **GLM 5.2 ≈ 51**. Цифры плывут — проверяйте дату snapshot.',
        'Vendor-таблицы Moonshot часто показывают крупный отрыв K3 от GLM на DeepSWE / SWE Marathon. На близких terminal-задачах разрыв меньше; на части независимых прогонов модели почти рядом.',
        'Прайс за миллион токенов врёт без **cost per task**: GLM тратит больше токенов на тот же ответ чаще, чем Opus; K3 дороже output, но выигрывает на cache-hit в coding workloads.',
        'Практичный паттерн: объём и повторяемые правки → GLM 5.2; дорогие сбои / multimodal / длинный агент → K3 или escalate на Fable/Opus/Sol.',
      ],
    },

    {type: 'h2', text: 'Кто есть кто'},
    {
      type: 'h3',
      text: 'Kimi K3',
    },
    {
      type: 'p',
      text: 'Moonshot позиционирует K3 как open 3T-class frontier: 2,8 трлн параметров, архитектура с Kimi Delta Attention и Attention Residuals, Stable LatentMoE (в материалах вендора — активация 16 из 896 experts), контекст до 1M токенов, **native vision** (изображения и видео в одном стеке с кодом).',
    },
    {
      type: 'p',
      text: 'Официальный API на запуске: cache-hit input **$0,30** / MTok, cache-miss input **$3** / MTok, output **$15** / MTok. Для coding Moonshot заявляет cache hit rate выше 90% на своём инференсе. На запуске thinking effort по умолчанию — max; более лёгкие режимы обещаны позже.',
    },
    {
      type: 'p',
      text: 'Сам вендор честно пишет: по общему UX K3 всё ещё отстаёт от Claude Fable 5 и GPT-5.6 Sol. Это важно: «открытый frontier» ≠ «замена закрытого флагмана во всех сценариях».',
    },

    {
      type: 'h3',
      text: 'GLM 5.2',
    },
    {
      type: 'p',
      text: 'Z.ai выпустила GLM 5.2 как coding-first флагман open-weight линейки: порядка **744–753B** параметров MoE (в обзорах встречаются оба округления), активных на токен существенно меньше полного размера, контекст до 1M (часто через отдельный идентификатор вроде `glm-5.2[1m]`), веса под **MIT**.',
    },
    {
      type: 'p',
      text: 'Публичные API-прайсы в обзорах июля 2026 обычно указывают около **$1,40** / MTok input и **$4,40** / MTok output — в несколько раз дешевле output K3 и заметно дешевле Opus/Fable. Точные цифры лучше сверять в кабинете провайдера: скидки, Coding Plan и зеркала (включая российский контур) меняют TCO.',
    },
    {
      type: 'p',
      text: 'Базовый GLM 5.2 — text-first. Для задач «почини UI по скриншоту» это сразу другой класс нагрузки, чем у K3.',
    },

    {
      type: 'aside',
      label: 'Про «открытость»',
      text: 'Open-weight обещание и скачанные веса — разные состояния. На 26 июля 2026 GLM 5.2 уже можно self-host’ить; K3 — API сейчас, веса — к 27 июля по заявлению Moonshot. Планируйте закупку и compliance по факту доступности, не по пресс-релизу.',
    },

    {type: 'h2', text: 'Как читать бенчмарки, чтобы не обмануть себя'},
    {
      type: 'p',
      text: 'Почти все громкие цифры июля 2026 сняты в **разных agent harness**: KimiCode, Claude Code, Codex, Terminus 2, mini-SWE-agent. Harness задаёт tools, retries, лимиты ходов и иногда fallback на другую модель. Сравнивать «67,5 против 46,2» без этой оговорки — плохая инженерия.',
    },
    {
      type: 'ul',
      items: [
        '**Одинаковый независимый harness** (Artificial Analysis, Vals, DeepSWE на mini-SWE-agent) — лучший сигнал для относительного порядка.',
        '**Таблица вендора «мы прогнали всех»** — полезный ориентир, но это не независимый суд.',
        '**Лучший score модели на её родном harness** — маркетинг throughput’а экосистемы, не чистая сила весов.',
        '**Elo на Frontend Arena** — человеческое предпочтение на UI-задачах; плохо переносится на backend-рефакторинг монорепы.',
      ],
    },
    {
      type: 'p',
      text: 'Рабочее правило: сначала смотрите независимый индекс и один-два coding бенчмарка на общем harness, потом — vendor gap на long-horizon, потом — свой прогон на вашем репозитории. Последний пункт обычно важнее первых двух.',
    },

    {type: 'h2', text: 'Kimi K3 vs GLM 5.2 на разработке'},
    {
      type: 'p',
      text: 'На Artificial Analysis (июль 2026, max) K3 выше GLM по Intelligence / Coding / Agentic sub-index. Это согласуется с картиной «K3 — более сильная общая модель».',
    },
    {
      type: 'p',
      text: 'На coding-специфике картина тоньше:',
    },
    {
      type: 'ul',
      items: [
        '**Terminal / bounded agent tasks** — разрыв часто небольшой. В части независимых прогонов Terminal-Bench 2.1 модели оказываются рядом (~81).',
        '**Long-horizon / marathon-style** — в таблице Moonshot отрыв K3 от GLM большой (DeepSWE, FrontierSWE, SWE Marathon). Читайте как сигнал «на длинных автономных сессиях K3 выглядит сильнее», а не как точный процент для вашего CI.',
        '**Frontend + vision** — преимущество K3 структурное: модель видит скриншот и правит код в одном контуре. GLM здесь либо отстаёт, либо требует внешнего vision-слоя.',
        '**Hallucination tradeoff** — в разборах AA-Omniscience у GLM иногда выше non-hallucination rate при более низкой accuracy. Для агента, который «уверенно» ломает прод, это не академическая деталь.',
      ],
    },
    {
      type: 'p',
      text: 'Итог для engineering manager: GLM 5.2 — разумный default на повторяемые правки, тесты, небольшие PR и высоковольтный CI-агент. K3 — кандидат на сложные многошаговые задачи, multimodal UI/game/CAD-контуры и случаи, где цена ошибки высока, а бюджет на токены ещё терпит.',
    },

    {
      type: 'h2',
      text: 'Где здесь Opus 4.8, Fable 5 и GPT-5.6 Sol',
    },
    {
      type: 'p',
      text: 'Закрытый верхний этаж в июле 2026 обычно делят **Claude Fable 5** и **GPT-5.6 Sol**. **Claude Opus 4.8** остаётся сильным рабочим default Anthropic: дешевле Fable, слабее на самых жёстких agentic/SWE-pro задачах, часто спокойнее по калибровке.',
    },
    {
      type: 'ul',
      items: [
        '**Fable 5** — Mythos-класс Anthropic: выше capability, примерно 2× прайс Opus ($10/$50 vs $5/$25 за MTok в типичных публичных прайсах). Имеет смысл, когда модель реально сокращает число агент-циклов на трудной задаче.',
        '**Opus 4.8** — повседневный closed coding workhorse. Многие команды оставляют его на escalate, даже если объём уехал на GLM/K3.',
        '**GPT-5.6 Sol** — верхняя полка OpenAI/Codex-экосистемы; на части независимых SWE-прогонов лидирует или делит первое место с Fable.',
        '**Kimi K3** — ближайший open/near-open претендент к этой полке по AA Index; на отдельных coding suites почти догоняет Fable, на других отстаёт.',
        '**GLM 5.2** — лучший (или один из лучших) open-weight workhorse до появления K3; к Opus близок на tool-use / части agentic, отстаёт на самых длинных и самых жёстких repo-задачах.',
      ],
    },
    {
      type: 'aside',
      label: 'Практическое наблюдение',
      text: 'Независимые прогоны DeepSWE у Together для K3 vs Fable показывали разницу порядка полутора пунктов при существенно меньшей цене rollout у K3. Это не «K3 победил Fable», а сигнал, что на retry-tolerant пайплайнах open-near-frontier уже конкурирует по value, а не только по престижу.',
    },

    {type: 'h2', text: 'FinOps: прайс токена, cost per task и self-host'},
    {
      type: 'p',
      text: 'Строка в прайсе — ещё не юнит-экономика агента. Считайте хотя бы четыре слоя:',
    },
    {
      type: 'ol',
      items: [
        '**$/MTok list** — вход, выход, cache.',
        '**Токены на задачу** — thinking, retries, переписывание файлов, длинный tool loop. Дешёвая модель с 3× токенами может проиграть «дорогой» на cost per task.',
        '**Цена ошибки** — красный CI, откат релиза, час инженера на разбор «уверенного» патча.',
        '**Модель поставки** — публичный API, enterprise tenant, self-host на своих/арендованных GPU.',
      ],
    },
    {
      type: 'p',
      text: 'Грубая карта на середину июля 2026:',
    },
    {
      type: 'ul',
      items: [
        'GLM 5.2 — низкий list price и высокий throughput; выгоден на объёме, если harness не раздувает траекторию.',
        'Kimi K3 — дороже output, но официальный cache-hit $0,30 делает coding-сессии заметно дешевле «холодного» прайса; выгоден, когда capability реально снижает число кругов.',
        'Opus 4.8 — дороже GLM по токену, часто эффективнее по токенам на ответ; хороший escalate.',
        'Fable 5 / Sol — максимальная capability; окупаются на трудных задачах, где меньше циклов важнее sticker price.',
      ],
    },
    {
      type: 'p',
      text: 'Self-host меняет уравнение ещё раз: вы платите за GPU-часы и утилизацию, а не за MTok. Для ориентира по картам под open-weight инференс удобен [калькулятор self-host LLM](/calculator/self-host); для сравнения облачных GPU в РФ — [каталог GPU](/gpu). Модель «скачал веса = бесплатно» ломается о память, сеть и простой кластера так же, как любой другой inference workload.',
    },

    {type: 'h2', text: 'Матрица выбора'},
    {
      type: 'table',
      caption:
        'Ориентир на конец июля 2026. Цифры бенчмарков сознательно не зашиты в ячейки «победил/проиграл» — слишком зависят от harness и даты.',
      headers: ['Ось', 'Kimi K3', 'GLM 5.2', 'Opus 4.8 / Fable 5'],
      rows: [
        [
          'Роль',
          'Near-frontier open/API, multimodal coding',
          'Open-weight workhorse на объёме',
          'Closed default (Opus) / потолок (Fable)',
        ],
        [
          'Сильная сторона',
          'Long-horizon, vision-in-the-loop, agentic breadth',
          'Цена, скорость, MIT-веса сегодня',
          'Стабильный экосистемный UX и верх capability',
        ],
        [
          'Слабое место',
          'До weights — контроль поставки; дороже output',
          'Слабее на ultra-long / multimodal',
          'Цена; Fable — ещё и 2× к Opus',
        ],
        [
          'Лицензия / веса',
          'Обещаны open weights (к 27.07.2026)',
          'MIT, доступны',
          'Proprietary',
        ],
        [
          'Контекст',
          '1M',
          '1M',
          'до 1M (зависит от модели/режима)',
        ],
        [
          'Vision',
          'Native',
          'Text-first',
          'Есть у актуальных Claude/GPT флагманов',
        ],
        [
          'Когда брать первым',
          'Сложный агент, UI по скрину, дорогая ошибка',
          'Массовые PR, CI-агенты, self-host',
          'Escalate / regulated / привычный Claude Code',
        ],
      ],
    },

    {type: 'h2', text: 'Как выбрать за один день'},
    {
      type: 'ol',
      items: [
        'Возьмите 10–20 реальных задач из вашего трекера: баги, небольшие фичи, один «сложный» рефакторинг, один UI-баг со скрином.',
        'Прогоните одним и тем же harness (Claude Code / Cline / Kimi Code / свой агент) на GLM 5.2, Kimi K3 и вашем текущем default (часто Opus).',
        'Считайте не «победил бенчмарк», а **pass rate**, **число итераций**, **токены**, **$/задачу**, время инженера на доводку.',
        'Решите routing: что уходит в дешёвый объём, что — в escalate.',
        'Отдельно проверьте compliance: можно ли слать код во внешний API, нужны ли веса в своём контуре, есть ли российский хостинг нужной версии.',
      ],
    },
    {
      type: 'ul',
      items: [
        'Повторяемый объём и self-host → **GLM 5.2**.',
        'Сложный multimodal / длинный автономный контур → **Kimi K3** (и перепроверка после выхода весов).',
        'Нужен максимальный потолок или привычный closed UX → **Fable 5** / **Sol**, с **Opus 4.8** как более дешёвым escalate/default.',
        'Не хотите выбирать один раз навсегда → router: GLM на 70–80% задач, K3/Opus/Fable на хвост распределения сложности.',
      ],
    },

    {type: 'h2', text: 'Ограничения, о которых вендоры пишут мельче'},
    {
      type: 'ul',
      items: [
        'K3 чувствителен к **thinking history**: если harness не возвращает историю рассуждений или сессию переключили с другой модели, качество может просесть. Moonshot рекомендует совместимый harness вроде Kimi Code.',
        'K3 обучен на long-horizon задачах и иногда **излишне инициативен** — полезно жёстко задавать границы в system prompt / `AGENTS.md`.',
        'GLM выигрывает цену и доступность весов, но на самых длинных автономных прогонах отставание от K3/Fable/Opus становится заметнее.',
        'Любой snapshot июля 2026 устареет быстро: веса K3, новые harness, зеркала в РФ и Coding Plan-тарифы двигают TCO без смены названия модели.',
      ],
    },

    {type: 'h2', text: 'Вывод'},
    {
      type: 'p',
      text: 'Kimi K3 и GLM 5.2 — не два бренда одной полки. GLM забирает объём, контроль и юнит-экономику повторяемой разработки. K3 забирает более высокую capability-полку open/near-frontier сегмента и multimodal coding. Opus 4.8 и Fable 5 / Sol остаются закрытым эталоном, от которого open-модели отсчитывают дистанцию.',
    },
    {
      type: 'p',
      text: 'Выбирайте не модель с лучшим пресс-релизом, а конфигурацию «задача → harness → цена ошибки → cost per task». В июле 2026 разумная стартовая гипотеза проста: GLM 5.2 на поток, Kimi K3 на сложное, closed flagship — когда дешевле не ошибиться, чем сэкономить на токене.',
    },
  ],
};
