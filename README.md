# Cloud FinOps

## New Project

**Сравнить цены облаков России — без презентаций вендоров, без «примерно» и без скрытых промо.**

[cloudfinops.ru](https://cloudfinops.ru) · сообщество [@cloudfinopsru](https://t.me/cloudfinopsru)

Публичные тарифы шести провайдеров на одной площадке: каталог SKU, калькуляторы нагрузки и ИИ-ассистент, который считает в рублях с НДС.

---

## Зачем это нужно

Облако в РФ — это уже не один прайс и не один «стандартный» flavor. Одинаковая формулировка «4 vCPU / 16 GiB» у разных провайдеров означает разный SKU, разный состав цены и разный итог на счёте. GPU, object storage, Managed Kubernetes и lakehouse-стек добавляют ещё один слой сложности.

**Cloud FinOps** собирает публичные цены в сопоставимый вид и даёт инструменты, которыми реально пользоваться на ежедневных решениях:

- выбрать провайдера под конкретную конфигурацию;
- понять, где минимум по каталогу — и на сколько дороже альтернативы;
- описать нагрузку текстом и сразу увидеть расчёт, а не таблицу «на глаз».

Мы не подменяем договор с вендором. Мы делаем **прозрачную точку входа** в публичные тарифы — чтобы FinOps, архитекторы и инженеры тратили меньше времени на ручной разбор прайсов.

---

## Что умеет продукт

| Поверхность | Зачем |
|---|---|
| **[Каталог SKU](https://cloudfinops.ru/catalog)** | Compute, GPU, storage, network, Kubernetes, AI API — фильтры, поиск, сравнение позиций |
| **[Калькулятор ВМ / GPU](https://cloudfinops.ru/calculator/vm)** | Конфигурация целиком: минимальная расчётная цена и альтернативы |
| **[Хостинг LLM](https://cloudfinops.ru/calculator/self-host)** | Подбор GPU под open-weight модели (VRAM, кванты, узлы) |
| **[Lakehouse](https://cloudfinops.ru/calculator/lakehouse)** | DIY open lakehouse: Object Storage + Managed Kubernetes + worker ВМ |
| **[AI конфигурация](https://cloudfinops.ru/calculator/ai)** | Тот же правый блок цены, но слева — чат вместо слайдеров |
| **[ИИ-ассистент](https://cloudfinops.ru/chat)** | Вопросы своими словами → tools → таблицы и цифры из каталога |
| **[Новости](https://cloudfinops.ru/news)** | Что меняется у провайдеров (фичи, релизы, кейсы) |

Провайдеры в фокусе: **Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS, T1**.

---

## Принципы

1. **Только публичные тарифы.** Промо, партнёрские скидки и «позвоните менеджеру» в расчёт не входят.
2. **Рубли с НДС.** Месяц в калькуляторе = **720 часов**, если иное явно не указано.
3. **Честное сравнение.** Flavor ≠ unit; GPU «целиком» ≠ «только GPU»; синтетические/частичные SKU помечаются.
4. **Одинаковый правый блок.** ВМ, LLM, Lakehouse и AI-конфигурация показывают одну и ту же логику: минимум, структура цены, альтернативы.
5. **Открытый каталог данных.** Прайс-листы живут в репозитории как YAML — их можно читать, диффать и пересобирать.

---

## Быстрый старт

```bash
npm ci
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

```bash
npm run data:build        # prices/*.yaml → src/data/catalog.generated.json
npm run data:embeddings   # эмбеддинги SKU для hybrid search (нужен CLOUDRU_FM_API_KEY)
npm test                  # unit-тесты калькулятора и чата
npm run build && npm start
```

Docker:

```bash
make release   # production build + linux/amd64 image
make run       # http://localhost:3000
```

---

## Как устроены данные и поиск

```text
prices/                 # YAML price books по провайдерам
scripts/build-catalog.ts
        ↓
src/data/catalog.generated.json
        ↓
каталог · калькуляторы · tools ассистента
```

ИИ-ассистент ищет SKU через **hybrid search**: lexical + dense embeddings (RRF), с hard-фильтрами по dimensions. Без ключа API или файла эмбеддингов остаётся lexical-only — сайт при этом собирается и работает.

Полезные команды:

| Команда | Что делает |
|---|---|
| `npm run eval:retrieval` | lexical vs hybrid recall@10 (offline) |
| `npm run eval:smoke` | live smoke чата (нужен `CLOUDRU_FM_API_KEY`) |
| `npm run eval:chat -- "…"` | один живой вопрос через тот же pipeline |

Подробности по embeddings и retrieval — в `src/lib/chat/` (`embed-docs.ts`, `embeddings.ts`, `search.ts`) и `scripts/eval/`.

---

## Структура репозитория

```text
prices/           # прайс-листы (источник правды по тарифам)
scripts/          # сборка каталога, embeddings, eval, theme
src/app/          # Next.js App Router (страницы и API)
src/components/   # UI на Gravity UI
src/data/         # новости + generated-артефакты каталога
src/lib/          # quote engines, chat tools, catalog helpers
```

Стек: **Next.js · React · Gravity UI · TypeScript**.

---

## Сообщество и вклад

- Сайт: [cloudfinops.ru](https://cloudfinops.ru)
- Telegram: [@cloudfinopsru](https://t.me/cloudfinopsru)

Нашли ошибку в тарифе, устаревший SKU или идею для калькулятора — лучше всего начать с issue или сообщения в сообществе. Каталог живёт настолько, насколько свежи публичные источники.

---

## Дисклеймер

Цены и новости собраны из **публичных** материалов провайдеров. Перед закупкой и архитектурными решениями сверяйте актуальные тарифы и условия у вендора. Cloud FinOps — инструмент прозрачности, а не оферта.
