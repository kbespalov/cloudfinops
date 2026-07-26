# Changelog

## 2026-07-27

### AI-конфигурация / корзина сайдбара (merge)

Сайдбар `/calculator/ai` — корзина с merge, не replace: follow-up «докинь CDN» / «RAM 32» / «150 TiB» не затирает остальные части. Общий normalize алиасов (`objectStorageGiB`/`storageGiB`/`lakeTiB`, `egressGiB`, worker*). После tool result шлём второй `sidebar_config` из resolved request. В adhoc quote — Object Storage + internet egress parts. Смена типа диска (`diskMedia=hdd|ssd|nvme`) доходит до сайдбара; `get_quote` принимает и возвращает `diskMedia`.

### AI-конфигурация / сайдбар lakehouse follow-up

В `/calculator/ai` чат мог пересчитать 75→150 TiB в тексте, а правый сайдбар оставался на medium/75: `compose_solution` передавал `objectStorageGiB`, а маппинг сайдбара читал только `lakeTiB`. Теперь GiB→TiB (как в compose), `workload`→preset; follow-up «150 TiB» после lakehouse-хода снова открывает `get_lakehouse_quote`.

### Калькулятор ВМ / степперы vCPU и RAM

Починили кнопки ± у NumberInput: draft показывал 9/17, а в расчёт уходило 12/24 (или откатывало на 8). Spinbutton теперь сразу показывает ступень лестницы. На узкой ширине у vCPU/RAM тоже compact −/+. Повторный клик по активному семейству больше не сбрасывает shape.

Смена SSD/HDD больше не должна сбрасывать vCPU/RAM: пресеты не очищают цены (нет reflow/ложного клика на `2/8`), клик по пресету только с pointerdown на той же карточке, пресет не трогает объём диска. Lakehouse сидит на том же `SliderField` — степпер там тоже починился.

### E-ассистент / fast-path ~20%

В чате sample rate fast-path по умолчанию **0.2** (~каждый пятый chip/alias), остальное — agent/LLM. Override: `CHAT_FAST_PATH_PROBABILITY`. Калькулятор по-прежнему всегда on.

### Self-host / open-weight top модели июля 2026

В каталог inference добавили популярные open-weight модели, которых не хватало для топ-15 по HF/ранжированиям июля: **DeepSeek V4 Flash/Pro**, **Gemma 4 31B**, **Qwen3.5 122B-A10B**, **MiniMax M3**, **Nemotron 3 Super**, **IBM Granite 4.1 8B**. Обновили Popular в picker; алиас `deepseek` ведёт на V4 Flash.

Уточнили GPU-рецепты с обязательным precision: V4 Flash — 2×H200 INT4 / 4×H100 FP8 / 4×A100 INT4 (FP8 на 2×H200 не предлагаем); MiniMax — только FP8 (4×H200 min, 8×H100/H200); Nemotron — NVFP4 только на B200, на H100 FP8/BF16.

Аудит популярных self-host моделей: поправили заниженные FP8 footprints — **DeepSeek V3/R1** (~685 GiB, не 350; FP8 → 8×H200), **Qwen3-235B** (~235), **Coder-480B** (~480), **GLM 4.6** (~330; убрали 2×H200 FP8). gpt-oss помечены как MoE+MXFP4; Mistral/Devstral Small на L40S — FP8, не BF16.

Второй проход по рецептам: статус minimum / recommended / high-throughput / experimental в notes; переставили лестницы (Qwen3.6/32/Gemma → L4 INT4 first; Coder-480/MiniMax → 4×H200 FP8 min, 8×H200 high-throughput; Kimi → 4×H200 INT4 + 8×H200 FP8 как плотный FP8; GLM 5.2 → 4×H200 INT4 primary; Mixtral → 2×A100 INT4 primary, 1×A100 experimental).

Подредактировали тексты рецептов и подсказок why: по-русски, без ярлыков Minimum/Recommended и англо-русской каши; цифры VRAM и quant оставили.

### Self-host калькулятор / нагрузка реально двигает KV

Починили оценку KV cache: fallback был ~100–1000 B/токен вместо десятков–сотен KiB, из‑за чего «токены на запрос» и контекст почти не влияли на VRAM/цену. Добавили attention-профили (GQA/MLA) для популярных моделей; расчёт нагрузки — p95-смесь среднего и макс. контекста. В поле «параллельные запросы» можно нормально набрать 50 (больше не сбрасывает в 1 при очистке).

### E-ассистент / compare VM flavor ≠ unit RAM

CTA «Сравни с другими провайдерами» для Cloud.ru `cloudru.compute.4vcpu-32gb` (и других flavor N vCPU / M GiB) больше не отвечает unit RAM / GPU V100 preemptible RAM. Fast-path → `get_quote(vcpu, ramGiB)`; `search_prices`+nearestAnalog для flavor тоже фильтрует unit-компоненты. Soft eval `ux-225` (`SOFT_SCENARIO_COUNT` = 225).

### E-ассистент / две таблицы в сравнении ВМ

Для фиксированного shape (`Сравни 4 vCPU / 16 GiB…`) в ответе две таблицы: **по провайдерам** (итог) и **по компонентам** (строки vCPU / RAM / диск / flavor, столбцы — провайдеры). У Cloud.ru flavor vCPU+RAM одной строкой — в матрице это отмечено.

### E-ассистент / follow-up «только Cloud.ru» / «а у MWS?»

После сравнения ВМ уточнение по одному провайдеру больше не повторяет полную таблицу: фильтруем предыдущий `get_quote` (fast-path `quote-provider-focus`). Soft eval `ux-226`→`ux-227` (`SOFT_SCENARIO_COUNT` = 227).

### Каталог / Yandex preemptible GPU (1/2/4)

В Billing API у Yandex есть отдельные preemptible SKU на GPU. Добавили в каталог Gen2 / T4i / V100 Broadwell preemptible; у A100/V100/T4/Platform V4 поправили решётку на **1/2/4** (8× в spot обычно недоступна). Реальная скидка — у A100/V100/T4; у Gen2/T4i/Platform V4 ставка GPU как у on-demand. Добавили vCPU/RAM ставок GPU-платформ (`gpu-platforms.yaml`) и переключатель «Прерываемая» в калькуляторе GPU.

### Каталог / Yandex GPU host lattices (Gen2 ×8)

В YAML Yandex GPU добавили `hostConfigs` — допустимые конфигурации из консоли и [доки Compute GPUs](https://yandex.cloud/en/docs/compute/concepts/gpus): Gen2 (`gpu-standard-v3i`, AMD EPYC 9474F) 1/2/4/8 GPU включая **8× · 180 vCPU · 1440 GiB**, Platform V4, A100, V100, T4/T4i. Новая SKU не нужна — `yc.gpu.gen2` уже был; чип по-прежнему «не указан». Калькулятор публикует эти формы как flavor-пресеты и собирает цену GPU + vCPU + RAM.

## 2026-07-26

### Каталог / H200 synthetic без чужого провайдера в slug

Переименовали синтетические full-node SKU Selectel/T1: было `*.vk-host-1/8.synthetic`, стало `*.44-256.synthetic` / `*.240-2048.synthetic`. В slug больше нет отсылки к VK — только конфигурация хоста. Notes переписаны: явно «оценка *, не публичный тариф», зачем строка (сравнение с flavor’ами GPU+хост) и что для заказа смотреть card-only.

### Каталог / единый тон notes у всех synthetic

Выровняли пользовательские notes у 18 synthetic SKU: «синтетическая оценка *, не публичный тариф», без имён чужих провайдеров в тексте (VK H200 unit больше не ссылается на Selectel/T1), без «unit-ставок Cloud FinOps» как будто это наш прайс.

### Каталог / CDN-запросы на едином pack

Во вкладке CDN → «Запросы» T1 показывался за 10 тыс., Yandex — за 100 тыс., из‑за чего «0,82 ₽» vs «1 ₽» выглядели сопоставимо, хотя за запрос Yandex дешевле. Теперь оба (и S3) в UI — **₽ за 10 000 запросов** (Yandex 1 ₽/100 тыс. → 0,10 ₽/10 тыс.). У MWS в публичном прайсе CDN только egress — строк «ресурс»/«запросы» нет (это не дыра каталога).

### Чат / самая дешёвая ВМ у каждого провайдера

Запрос вроде «самое экономичное у каждого провайдера» больше не должен отвечать размытой вилкой «~400–600 ₽». `get_quote(mode=cheapest-per-provider)` сканирует минимальные полноценные ВМ (vCPU+RAM+диск) по всем провайдерам: Cloud.ru 10%, Yandex/Selectel preemptible и т.д. Fast-path + правила в system prompt. Soft UX: `ux-222`…`ux-224` в `scripts/eval/user-scenarios.ts` (`SOFT_SCENARIO_COUNT` = 224).

### Калькулятор / Экономичные

Вкладка «Экономичные» больше не форсит прерываемую + 100% (из‑за этого пропадали дешёвые Cloud.ru). Теперь по умолчанию: **обычная ВМ + доля 10% + HDD + 1/1** — в выдаче появляются эконом-флейворы Cloud.ru (~300 ₽/мес). Прерываемые Selectel/Yandex остаются через переключатель «Прерываемая».

### Каталог / price audit (критические якоря)

Прогнали инвентаризацию SKU и сверку с публичными прайсами.

- **MWS GPT Model Hub:** в каталоге list-тарифы с `effectiveFrom: 2026-08-01`; краткие промо на сайте MWS в каталог не тащим. Notes — только про продукт, без редакционных пояснений про акцию.
- **MWS Compute:** смена ставки с 01.08 лежит в `futureHourlyAmount` (dimensions), не в пользовательских notes.
- Нулевые «бесплатные» SKU без пояснения получили `notes` (MWS interzone ingress, Selectel S3 ingress, T1 internet ingress).
- Добавлены `npm run data:audit` и golden-тест `src/lib/catalog/price-anchors.test.ts` (YC/MWS/VK/Selectel/T1 якоря).

### Каталог / VK H200 card-only synthetic

У VK Cloud в прайсе H200 только flavor «целиком» (×1 / ×8) — отдельной card-only строки нет. Добавили синтетическую SKU `vk.gpu.h200.unit.synthetic` (*): оценка «только GPU» = `GPU-44-256-H200-1` минус хост 44 vCPU / 256 GiB по unit-ставкам Cascade Lake. В каталоге рядом с Selectel/T1 «только GPU»; в калькуляторе не участвует (как Cloud.ru unit.synthetic).

### ИИ-ассистент / сравнение GPU по классу карт

Кнопка «Сравнить» у GPU SKU больше не подставляет самый дешёвый NVIDIA из каталога (например GTX 1080 к B300). Поиск и fast path выбирают **ближайший datacenter-peer** того же класса.

- Peer-группы для training/HGX: B300 ↔ B200 / H200 / H100; учёт числа карт (×8), dedicated/HGX; consumer/entry (GTX, RTX 20xx, T4, L4) отсекаются.
- `search_prices`: флаг `nearestAnalog`; SKU-compare fast path передаёт `gpuModel` + `nearestAnalog` и берёт nearest-per-provider, не absolute cheapest.
- Промпт сравнения GPU и domain-card: аналоги по поколению/VRAM/числу карт; нет близкого SKU — сказать прямо, не паддить дешёвым мусором.
- Soft eval `ux-221` (B300×8 HGX → H200/H100 ×8, forbid GTX 1080); unit-тесты на search / fast-path / prompt.

## 2026-07-25

### ИИ-ассистент / solution tool chain

Усилили агентный цикл сборки решений: LLM выбирает intent и стратегию, backend ищет, собирает, проверяет и считает.

- Новые primitives: `search_catalog`, `get_product_details`, `compose_solution`, `validate_solution`, `price_solution`, `compare_solutions`. Shortcuts (`get_quote`, `search_prices`, …) сохранены.
- Стабильный `RequirementSpec`; compose возвращает только estimate; authoritative totals — только из `price_solution` (`strict_pinned` по умолчанию).
- Validation по классам (requirements / compatibility / pricing / provenance), `billingScope`, assumptions ≠ unresolved, K8s recipe policy (S3/IP/egress только по запросу).
- Compare: Pareto с порогами coverage/completeness; неполное дешёвое не бьёт полное. Self-contained payload между tool calls.
- Eval smoke 28/28; chat unit 172/172.

### Каталог / CDN

Новая категория **CDN** в каталоге и прайсах (Yandex, VK, Cloud.ru, Selectel, MWS, T1): исходящий трафик, ресурс/месяц, запросы и платные опции где есть в публичных тарифах.

- Вкладки и фильтры каталога, иконка категории, поиск и сравнение SKU; `taxonomyVersion: 1.7.0`, `asOf: 2026-07-25`.
- В ассистенте: `search_prices` с `category: cdn`, оценка объёма по **egress** (не бесплатный ingress), подсказки на главной.

### ИИ-ассистент / стеки и модель

Агент умеет собирать мультикомпонентные стеки (ВМ + IP + S3 + CDN + K8s…) через параллельные tool calls и итоговую таблицу по провайдерам.

- Дефолтная модель: **Google Gemini 3.1 Flash Lite** (`google/gemini-3.1-flash-lite`).
- Fast path в чате sample **~20%** по умолчанию (`CHAT_FAST_PATH_PROBABILITY=0.2`); калькулятор — всегда on для сайдбара. Для полного agent/LLM: `=0`, для latency A/B: `=1`. Одиночный S3/volume fast path больше не «съедает» стековые вопросы.
- Recovery: русские лейблы tool (`прайс-листа` и т.п.) → правильный tool по форме args; финальный ответ по стеку — digest LLM / compose, без слияния tool results из прошлых ходов.
- Калькулятор «AI-конфигурация»: follow-up «докинь / докинем CDN» → `category=cdn`, **мерж в корзину** (CDN egress), не Object Storage / network ingress. `get_quote` без RAM → 4×vCPU (как сайдбар).
- Пошаговая сборка в чате/калькуляторе: CPU / RAM / диск / IP / CDN / S3 по одному → `compare_unit_price` или `search_prices`; `get_quote` только для полной ВМ. «Ice Lake» не путается с S3 Ice.

### Каталог / MWS GPT Model Hub

В каталог подтянуты новые публичные тарифы MWS GPT Model Hub, которые вступают **с 1 августа 2026** (`effectiveFrom: 2026-08-01`).

- Пересчитаны ставки ₽/1M токенов (с НДС) для актуального состава моделей: gpt-oss-120b, Gemma 4 31B, Qwen3.6 / 235B / Coder, GLM 5.2, Kimi K2.6, embedding BGE.
- Старые промо-/базовые единые ставки (часто ~1098 / 1220 / 2318 ₽) заменены на раздельные input/output по новой тарификации; цены заметно ниже.
- Из прайса убраны позиции, которых больше нет в публичном GPT Model Hub: gemma-3-27b-it, qwen3-32b, glm-4.6-357b, kimi-k2-instruct.
- Тест `openWeights` / CTA «Развернуть»: порог числа AI model-token SKU снижен под новый состав Hub; у Qwen / GLM / gpt-oss по-прежнему `openWeights: true`.

## 2026-07-23

### Каталог / GPU

- Yandex **GPU Platform V4** больше не размечен как NVIDIA H200: в публичной доке Яндекса чип не назван, а калькулятор ошибочно включал Яндекс в сравнение H200-пресетов.

## 2026-07-21

### Калькулятор / речь, T-Search и rerank

В Self-host добавлены open-weight профили вне chat-LLM: ASR, agentic search и лёгкий retrieval-стек.

- **Речь (топ для инференса):** GigaAM-v3, GigaAM Multilingual, Whisper large-v3-turbo; плюс GigaChat3.1-Audio-10B (audio-LLM).
- **Поиск T-Tech:** T-Search (на базе Qwen3.6-35B-A3B, FP8/INT4 рецепты) + Qwen3-Embedding-8B из их бенчмарков.
- **Rerank:** Qwen3-Reranker-0.6B / 4B.
- Пicker: чипы «Речь / Поиск / Rerank», лаборатории Sber/Giga и T-Tech с марками.

### Калькулятор / UX polish + VRAM + Model Picker

Довели калькулятор до рабочего инструмента: плотнее верх страницы, понятнее Self-host, жёстче проверки цен перед релизом.

- **Вёрстка VM:** компактный hero и вкладки; семейства General…GPU на всю ширину формы; поля сгруппированы (Вычисления / Хранилище / Сеть); тише слайдеры и пресеты; SSD/HDD компактный сегмент.
- **Сайдбар:** убраны лишние «Лучшее предложение» / scope-подписи; у лучшего провайдера — зелёный label «лучший».
- **Self-host:** диалог выбора модели (поиск, лаборатории, недавние); аддитивный VRAM (веса + KV + активации + оверхед) с полосой нагрузки; batch / пользователи / контекст.
- **Таблица GPU:** колонки «GPU-конфигурация · Формат · Использование VRAM · Запас памяти · Стоимость»; статусы «Впритык / Малый запас / Оптимально / Большой запас»; показ «N из M GiB».
- **Тесты:** release-suite на ad-hoc котировки UI, GPU-композиции, все модели Self-host, паритет recommend↔quote, best offer (`calculator-release.test.ts`); 149 unit-тестов зелёные.

## 2026-07-20

### Калькулятор / массовая переработка (VM + Self-host LLM)

Калькулятор разделён на два сценария с отдельными страницами и общим живым сравнением цен по провайдерам РФ.

- Маршруты: `/calculator/vm` (ВМ) и `/calculator/self-host` (GPU под LLM); `/calculator` ведёт в self-host. Оба URL — в sitemap.
- **VM:** семейства Low-cost / General / High CPU / High Memory, слайдеры vCPU · RAM · диск, выбор HDD/SSD, сетка GPU-форм из каталога, sticky-сайдбар с офферами.
- **Self-host LLM:** модель → квант → лестница GPU-конфигов (VRAM, число карт) с арендой H100 / H200 / A100 / L40S / L4 / B300 и рядом Hosted API в ₽/1M токенов, если модель есть в каталоге.
- База open-weight выросла до ~26 профилей по популярности self-host (июль 2026), а не только по SKU: Llama 4 Scout/Maverick, DeepSeek R1 (+ Distill 32B), gpt-oss-20b, Devstral, Phi-4, Qwen3 8B — плюс GLM, Qwen3/Coder, Kimi, DeepSeek V3, Gemma, Mixtral, Mistral Small. API-only и «веса скоро» помечены отдельно.
- Тот же каталог моделей питает ИИ-ассистента (`recommend_inference_infra`); «GPT-УСС» → gpt-oss; вопросы про цену токенов остаются на `search_prices`.
- Фиксы котировок: L4 ≠ L40S, H100 по умолчанию 80 GB (не 94 GB sole-offer), sidebar не путает memory-tier и не показывает старую цену при смене конфига, Hosted API без подмены соседними SKU.
- В `/news` — анонс калькулятора хостинга LLM. UI: бейджи семейств моделей, пресет-гриды, проще copy и контраст в dark theme.

### ИИ-ассистент / таблицы

- Ширина чата выровнена с каталогом (**1200px**, как колонка с логотипом CF).
- Фикс наложения цифр в колонке цены: убран жёсткий `max-width: 240px` у ячеек markdown-таблиц; цены в одну строку, широкая таблица — горизонтальный скролл.

### Каталог / сравнение SKU

- В карточке тарифа (drawer справа) появилась кнопка **Сравнить** с иконкой ИИ-ассистента: открывает `/chat` с готовым запросом найти **ближайшие аналоги** у других провайдеров и сравнить цены (если точного SKU нет — ближайшее по смыслу).
- Кнопка фиолетовая (utility), чтобы сразу отличаться от жёлтых brand-действий в интерфейсе.
- Unit-тесты на сборку промпта и deeplink `?q=`.

### Калькулятор / dark theme

- Фикс «серой пелены» на карточках пресетов: вместо `float-heavy` + полупрозрачного `base-generic` — обычный `float` и сплошной `generic-ultralight` для блоков vCPU/RAM/SSD; текст снова читается.

## 2026-07-19

### Каталог / сетевой трафик и фритиры

- Исходящий трафик больше не показывается как **0 ₽** из‑за бесплатного порога: в таблице — ставка **сверх** фритира (первая платная ступень).
- Yandex Object Storage → интернет: **1,68 ₽/GiB** (после 100 ГБ/мес бесплатно; дальше шкала дешевле). Compute/VPC egress: **1,42 ₽/GiB** после 100 ГБ.
- То же для Selectel (~0,90 ₽/GiB после 3 ТБ) и Cloud.ru Object Storage (1,17 ₽/GiB после 10 ТБ). В пояснении к SKU — про бесплатный объём.
- Сборка каталога: для `pricingMode: tiered`, если в `rate` стоит 0, берётся первая ненулевая ступень из `tiers`.
- Аудит всех прайсов: структурные `tiers:` были только у трафика. У хранения/операций с фритиром (Yandex/Cloud.ru Standard capacity, Yandex Standard PUT/GET) в `rate` уже стояла платная ставка — уточнили пояснения и `freeTier*`, чтобы не путать с «всегда 0 ₽».

### Каталог / Cloud.ru Compute

- У Cloud.ru в каталоге появились **оценки цены ядра и памяти** (строки с `*`): Cascade Lake и Ice Lake, vCPU и RAM — по четыре SKU.
- Cloud.ru в прайсе продаёт только готовые ВМ; отдельные ставки за ядро/ГБ нет. Мы разложили типичные конфигурации, чтобы сравнивать с Yandex / VK / MWS и другими.
- На серверах Evolution — Cascade Lake (Xeon Gold 6248R) или Ice Lake (6348); **в тарифе цена одна**, поколения не разделены.
- Пояснения в карточке тарифа написаны для читателя сайта: что значит `*`, зачем строка, когда оценка совпадает с прайсом, и где дороже (2 ядра с RAM от 8 ГБ, все ВМ на 12 ядер).
- В калькуляторе по-прежнему берутся только реальные комплекты ВМ; оценки `*` не подставляются как заказной тариф. В сравнении «средняя цена ядра» Cloud.ru идёт отдельной строкой-оценкой, не в среднее по больнице.
- Подписи в карточке: «оценка *», тарификация «За единицу» / «Комплект (ВМ целиком)».

### Производительность / навигация

- Шапка: внутренние разделы через Next.js `Link` (soft-nav) — без полного reload при переключении вкладок.
- CTA на About / API / News / Calculator тоже soft-nav (`Button` + `Link`), без hard-reload.
- Тема: blocking boot-script + `useSyncExternalStore` по `cf-theme` — меньше вспышки light→dark до hydrate.
- Шрифт: Inter через `next/font` (self-host), убран Google Fonts `@import` из Gravity `fonts.css`.
- Фикс иконок в шапке: после soft-nav рефакторинга дети `Button` нельзя было оборачивать в Fragment (Gravity клал иконку над текстом).
- Известный следующий шаг (не в этом релизе): `catalog.generated.json` (~450KB) сейчас уезжает в клиентский бандл каталога — можно ужать / отдавать порциями.

### Главная

- Поиск: убран белый квадратный фон от scoped `ThemeProvider` (`.g-root`); вместо цельной белой карточки — стеклянная полоса поиска и чипы без «боксового» фона.

### Eval / бенчмарк чата

- Предметный бенчмарк качества+латентности: `scripts/eval/questions.ts` (~135 кейсов: GPU, AI, S3, SSD volume, K8s, unit-price, adversarial).
- `npm run eval:bench` — матрица моделей (`--models a,b`), `--no-fast-path` для честного A/B, leaderboard pass% + p50/p95.
- Модель переключается на лету (`withChatModel` / `CLOUDRU_FM_MODEL`); harness пишет `durationMs`, `fastPath`.

### ИИ-ассистент / Kubernetes

- Сравнение Managed Kubernetes: поиск отдаёт сопоставимые **мастера** (basic/HA), а не 0₽ фикс Yandex и не unit-ставки vCPU/RAM; synthetic 2/4 VK/Yandex больше не штрафуются в ranking.
- В ответе tool: поля `k8sTier` / `k8sClass` / `synthetic`; в системном промпте правила сравнения control plane (workers отдельно).
- AI-модели: матчинг `Qwen 3.6` ↔ `Qwen3.6-35B-A3B` ↔ `qwen3.6-35b-a3b` (Yandex / Cloud.ru / MWS); авто-detect версии из запроса, чтобы не оставлять только Yandex и не подменять Coder-Next.

### Главная

- Search-first лендинг: brand + benefit-headline + поисковая строка «Начать сравнение» и чипы примеров (ВМ, H100, S3, Kubernetes, AI API).
- Запросы с главной ведут в `/chat?q=…` с автозапуском нового чата; каталог остаётся в шапке.

### ИИ-ассистент FinOps

- **Подбор под бюджет (`fit_budget`):** на вопросы «~N ₽/мес что можно позволить» сразу считается, сколько целых ВМ/GPU укладывается в бюджет (`count` / `utilPct`), без длинного опросника; чип в suggestions; smoke-кейс `fit-budget-100k`.
- После tool-calling пустой `content` от модели больше не обрывает ответ: tools-free force + nudge «дай таблицу»; компактный `fit_budget` (best + also); ужаты `search_prices` rows (без sku/year/длинных note).
- Таблицы сравнения: колонка «к best offer» (`%` к самому дешёвому); для стеков (ВМ+IP+S3+K8s) сохраняются все колонки на итоговой табличке.
- Санитизация ответов: сырые имена инструментов (`get_quote`, `fit_budget` и т.п.) не утекают в сноски; stream-путь тоже проходит через sanitize.
- `maxToolRounds` поднят до 6 — стековые сравнения не обрываются на середине.
- Deep-link `?q=` создаёт новый чат и сразу отправляет вопрос, затем сбрасывает query из URL.
- Фикс гонки `localStorage`: пустой первый рендер больше не затирает историю (и deep-link) до загрузки storage.

### Калькулятор

- Карточки пресетов: вернули цветные иконки спек (vCPU / RAM / SSD), явный CTA «Сравнить · N офферов», цена `от … ₽ / период` без двойного символа валюты.
- Семейства Compute переключены на вкладки с цветными иконками (Low-cost / General / High CPU / High Memory); на экране одно семейство — меньше текстового шума.
- Дифференциация цветом: цветная верхняя грань карточки и tinted-иконки вкладок; без заливки всего фона панели.
- Lead: «Выберите конфигурацию — откроется сравнение офферов по провайдерам.» Клик по карточке по-прежнему открывает drawer с офферами.
- Dark theme: карточки отделяются от фона float-поверхностью и `line-generic` border (см. также фикс контраста статов от 2026-07-20).

## 2026-07-18

### Mobile UX

- Шапка: на узких экранах (`≤900px`) навигация снова доступна через меню (Gravity UI `Drawer`), а не только бренд и тема.
- `/chat`: один viewport без page-scroll (SEO скрыт визуально, hero убран на mobile), без autofocus клавиатуры, `safe-area`, узкий history popup, suggestions списком.
- Каталог: wrap фильтров и горизонтальный скролл вкладок на `≤760px` (без раздувания страницы).
- Калькулятор: на `≤520px` уже sticky-колонки таблицы и скрыта подпись «Внешний вид».

### ИИ-ассистент FinOps

- **Баг:** модель `gpt-oss-120b` иногда вместо native `tool_calls` писала в чат английский план вызова (`We will call search_prices…` + JSON аргументов). Пользователь видел внутренний монолог вместо ответа.
- **Фикс:** детектор утечки + recovery JSON/прозы → реальные `tool_calls`; если не удалось распарсить — retry с `tool_choice=required`; утечка пользователю не отдаётся. Общий `runToolLoop` для `/api/chat` и eval; в системном промпте запрет писать план вызова в текст; planning temperature `0.1`.
- **Проверка:** `npm run eval:smoke` / `eval:chat` — live smoke (leak / tools / кириллица / цены), в т.ч. кейс «ассистировай про кубернатис».
- Object storage / S3: жёсткий фильтр `storageClass` и предпочтение capacity над requests в `search_prices` (больше не подменяет Standard на Ice и не берёт PUT=0 ₽ как «самый дешёвый»).
- Параметр `volumeGiB` → `volumeEstimates` (ставка × объём за месяц) для сценариев DWH / «N ТБ».
- Системный промпт: правила сопоставимости классов Standard / Warm / Cold / Ice и расчёта объёма.
- Eval: расширен набор вопросов по object storage (классы, объёмы, ловушки смешения классов).
- Вкладка `/chat`: компактный заголовок, чат на всю высоту вьюпорта — поле ввода сразу в кадре без скролла страницы.
- Фикс пустого ответа «Не удалось получить ответ» после tool-calling: финальный `content` из non-stream раунда больше не отбрасывается; если SSE пустой — fallback на non-stream completion.
- Ускорение `/chat` без смены модели: параллельный запуск tool_calls в одном раунде; меньший `max_tokens` на planning-раунде с tools; skip query-embedding при жёстких фильтрах (`storageClass` / `gpuModel` / `aiModel`); короче `note` в ответе `search_prices`.
- **Hybrid / semantic search** в инструменте `search_prices` (см. подробности в README):
  - зачем: lexical token-overlap плохо ловит перефразы («amazon glacier», «старые логи надолго», «восемь процессоров / 32 гига»);
  - что: precomputed embeddings всех SKU (`BAAI/bge-m3` через Cloud.ru FM) + cosine по запросу + RRF с lexical; hard filters по dimensions без изменений;
  - артефакт: `npm run data:embeddings` → `src/data/catalog-embeddings.generated.json`;
  - проверка: `npm run eval:retrieval` (~114 вопросов) — lexical 95.6% → hybrid 100% recall@10, без регрессий.

### Калькулятор

- Переключатель карточек и таблицы получил видимую подпись «Внешний вид».
- На витрине GPU основной пример H100 переключён с Cloud.ru-only 94 ГБ на H100 80 ГБ PCIe для кросс-провайдерного сравнения.
- Заголовок страницы и переключатели периода/вида приведены к размерам каталога (`header-1`, `SegmentedRadioGroup` size `m`).

### API

- Пункт `API planned` в навигации стал кликабельным и ведёт на страницу будущего публичного API.
- Добавлен продуктовый pipeline «конфигурация → Cloud FinOps API → шесть облаков → единый ответ» с адаптивной янтарной анимацией и поддержкой reduced-motion.
- Страница `/api` добавлена в sitemap и IndexNow; metadata явно обозначает, что API находится в разработке.

## 2026-07-17

### ИИ-ассистент FinOps

- Страница `/chat`: чат по ценам облаков РФ (Gravity UI AI Kit), история в `localStorage`.
- API `POST /api/chat`: Cloud.ru Foundation Models (OpenAI-compatible), tool-calling по каталогу (`search_prices`, `get_quote`), стриминг ответа.
- Без `CLOUDRU_FM_API_KEY` чат отвечает 503; остальной сайт и сборка не зависят от ключа (см. `.env.example`).
- Пункт «AI-ассистент» в навигации; CTA на главной.
- SEO: metadata, JSON-LD, запись в `sitemap.xml`.
- Eval-харнесс `scripts/eval/` для проверки галлюцинаций провайдеров/цен (локально, с ключом API).
- Логи `/api/chat`: JSON в stdout (IP, preview вопроса, tool-calls, длительность).
- Базовые лимиты: до 50 сообщений в истории / 80k символов, 20 req/IP·мин, ~100k estimated tokens/мин глобально (429 + Retry-After).

### SEO / IndexNow

- Скрипт `npm run seo:indexnow` — ping Yandex/Bing после деплоя (`scripts/indexnow.ts`).
- Публичный ключ IndexNow: `public/<key>.txt` (по протоколу должен быть доступен с сайта).

### Главная

- Короткий лендинг на `/`: Cloud FinOps, подзаголовок и кнопка в каталог.
- Фон — анимированный Shader Gradient (тёплый honey/cream); статичный fallback при reduced-motion.
- В lead и CTA добавлен ИИ-ассистент FinOps.

### Kubernetes

- Мастера размечены как **зональный** / **региональный** (`availability`, `faultTolerant`); названия SKU не менялись.
- В каталоге фильтр Мастер: зональный (не отказоустойчивый) / региональный (отказоустойчивый).
- **VK Cloud**: добавлена ставка **Master RAM** из прайса Cloud Containers; расчётные мастера 2 vCPU / 4 ГиБ больше не без памяти.
- Расчётные мастера VK/Yandex переименованы в понятные «Зональный/Региональный мастер 2 vCPU / 4 ГиБ» (без слова Synthetic в названии).
- Выровнена сравнимость: VK/Yandex/Cloud.ru — одна опорная конфигурация 2/4; у Selectel/MWS/T1 в пояснении, что размер master не раскрыт.
- Пояснения к Kubernetes-SKU упрощены и выровнены по тону (без лишнего жаргона; у Cloud.ru добавлена заметка).

### Каталог — пояснения

- Пользовательские заметки к SKU переписаны проще (без внутреннего жаргона); в карточке заголовок «Пояснение».

### GPU

- Yandex Platform V4 (141 ГБ) размечен как **NVIDIA H200**.
- Selectel: выделенный **HGX B300** (`GL8-B300-HGX-25GE`, 8×GPU, 8 млн ₽/мес).
- В фильтре GPU каталога добавлен **B300**.
- MWS: зафиксирован **A100 80 ГБ** без публичной ставки (status-only).

### SEO / сайт

- Favicon (CF-марка): `.ico`, `.svg`, PNG, Apple touch icon, `site.webmanifest`.
- Метаданные и ключевые слова: SKU, цена облака, калькулятор облаков, FinOps, FinOps-инструменты.
- `robots.txt` и `sitemap.xml` для индексации.

### Каталог

- На вкладке «Все» — быстрый фильтр провайдеров кнопками; марки монохромные (`currentColor`).
- Network: единицы выровнены — публичный IP как `IP · час` / «за IP · в час», трафик как `GiB` / «за GiB» (без ложного «в час»).
- Пояснения к Network-SKU упрощены (Cloud.ru / VK / Selectel / T1).
- Образы ВМ и снимки дисков перенесены в **Compute** (типы «Образ» / «Снимок»).
- В Storage колонка «Класс» — только класс объектного хранилища (Standard / Warm…), без GiB.
- Единица биллинга явная: в таблице «GiB · час», в подсказке цены — «за GiB · в час», в drawer — «Единица биллинга».
- Единая таксономия `storage.image.capacity` / `storage.snapshot.capacity` (нейминг «Снимок», не «бэкап») для MWS, Yandex, VK, Selectel, Cloud.ru и **T1 Cloud**.
- Единица биллинга выровнена: у всех образов/снимков нормализованная ставка **₽ / GiB · час**.

### Новости

- Карточки открываются на отдельных URL `/news/[id]` (drawer убран).
- Related-ссылки между материалами; JSON-LD ItemList / Article; URL новостей в sitemap.
- Фильтры справа: период, категория, провайдер.
- Пагинация: по 10 материалов на страницу.
- В каждой строке — ссылка на источник; материалы за май / июнь / июль 2026 и FinOps по рынку РФ.

### Метрики / верификация

- Файл подтверждения Яндекс: `/yandex_1052d325f512c4b3.html`.
- Счётчик Яндекс.Метрики `110803974` (webvisor, clickmap, SPA hit на смене маршрута).

### About — страница «О нас»

- В навигации пункт **О нас** (`/about`).
- Короткий текст: открытое сообщество практиков, каталог SKU и приглашение в Telegram.

### Catalog — период цен

- Переключатель периода: **Единица** → **Час** (рядом с Месяц / Год).
- Подписи цены: «Цена / час», «в час» вместо «за единицу».
- Параметр URL без изменений: `period=unit` по-прежнему означает почасовую цену.
