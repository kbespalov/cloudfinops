# Cloud FinOps

Каталог SKU и новости облачного рынка РФ (+ AWS / Azure / Google Cloud).

Сайт: [cloudfinops.ru](https://cloudfinops.ru) · сообщество: [@cloudfinopsru](https://t.me/cloudfinopsru)

## Что внутри

- **Каталог SKU** — сравнимые тарифы compute / GPU / storage / network / Kubernetes
- **Новости** — подборка новых фич провайдеров (старт: июнь 2026)
- **Цены** — YAML price books в `prices/`, собираются в каталог скриптом

## Локально

```bash
npm ci
npm run dev
```

Откроется [http://localhost:3000](http://localhost:3000) → редирект на `/catalog`.

```bash
npm run data:build        # пересобрать src/data/catalog.generated.json
npm run data:embeddings   # эмбеддинги SKU для hybrid search (нужен CLOUDRU_FM_API_KEY)
npm run eval:retrieval    # lexical vs hybrid recall@10
npm run eval:smoke        # live smoke чата (5 вопросов, нужен CLOUDRU_FM_API_KEY)
npm run eval:chat -- "вопрос"  # один live-вопрос через тот же pipeline
npm run build             # production build
npm start
```

### Smoke чата

`npm run eval:smoke` гоняет живой pipeline (`system prompt` + tool loop + ответ) на короткий набор вопросов, включая размытый «ассистировай про кубернатис». Падает, если в ответе утечка English tool-planning, нет tool calls там, где они нужны, или ответ без кириллицы/цен. Один вопрос: `npm run eval:chat -- "Сколько стоит H100?"`. Полный graded eval: `npx tsx scripts/eval/run.ts --limit 20`.

## Hybrid / semantic search (эмбеддинги каталога)

ИИ-ассистент ищет цены через tool `search_prices`. Раньше это был только **lexical**-поиск (пересечение токенов запроса с «сеном» SKU: название, meter, dimensions, синонимы). На точных запросах (`H100`, `GigaChat`, `Standard`) этого хватало; на **перефразах** без общих слов с каталогом — нет.

### Зачем добавили

Пользователь спрашивает не языком прайса, а языком задачи:

- «тариф как у amazon glacier» → класс **Ice**, а не Standard;
- «куда дешевле складывать старые логи надолго» → Cold/Ice;
- «сервер восемь процессоров тридцать два гига» → flavor 8/32;
- «ускоритель чтобы крутить LLM в проде» → GPU.

Чистый lexical такие формулировки часто пропускал или поднимал не тот класс. Отдельная vector DB (Qdrant/Pinecone) при ~417 SKU не нужна: корпус целиком в RAM.

### Что сделали

1. **Документ на каждый meter** — короткий текст для эмбеддинга: display name, sku, meter, provider, dimensions, notes + RU/EN aliases (`src/lib/chat/embed-docs.ts`).
2. **Precompute embeddings** на этапе сборки данных:
   - `npm run data:embeddings` (нужен `CLOUDRU_FM_API_KEY`);
   - модель по умолчанию `BAAI/bge-m3` (Cloud.ru Foundation Models, OpenAI-compatible `/embeddings`);
   - результат: `src/data/catalog-embeddings.generated.json` (base64 Float32, ~2 MiB, коммитится в репо).
3. **Hybrid ranking в runtime** (`src/lib/chat/search.ts`):
   - сначала **hard filters** по dimensions (`category`, `provider`, `gpuModel`, `storageClass`, `meterKind`) — как раньше; embeddings их не подменяют;
   - параллельно: lexical score и dense cosine (query embed через тот же Cloud.ru API);
   - слияние списков **RRF** (Reciprocal Rank Fusion);
   - логика `providersMatched` / cheapest / volumeEstimates без изменений.
4. **Fallback**: нет файла эмбеддингов или нет API-ключа → lexical-only (сайт и сборка по-прежнему не требуют ключа).
5. **Offline eval** без LLM: `npm run eval:retrieval` — ~100+ вопросов (storage / compute / GPU / network / AI), сравнение lexical vs hybrid recall@10; отчёт в `scripts/eval/out/retrieval.json` (в gitignore).

На прогоне: lexical **95.6%** → hybrid **100%** recall@10; на hard-paraphrases **93% → 100%**; регрессий (lexical выиграл, hybrid нет) — 0.

### Чего embeddings не решают

Смешение Standard/Ice в одной таблице, PUT=0 ₽ как «цена хранения», паритет GPU/ВМ — это правила промпта и structural filters / `get_quote`, не retrieval. Semantic search только помогает **найти нужные SKU** по смыслу запроса.

### Ключевые файлы

| Файл | Роль |
|------|------|
| `src/lib/chat/embed-docs.ts` | текст документа SKU |
| `src/lib/chat/embeddings.ts` | API embed, cosine, RRF, загрузка индекса |
| `src/lib/chat/search.ts` | lexical + `searchPricesDetailedAsync` (hybrid) |
| `scripts/build-embeddings.ts` | сборка `catalog-embeddings.generated.json` |
| `scripts/eval/retrieval-questions.ts` | золотые paraphrases |
| `scripts/eval/retrieval-run.ts` | прогон lexical vs hybrid |

## Docker (linux/amd64)

```bash
make release         # npm build + docker buildx (linux/amd64)
make run             # docker run -p 3000:3000
```

Образ: `cloudfinops-site:<version>` (версия из `package.json`).

## Структура

```text
prices/          # прайс-листы провайдеров (YAML)
scripts/         # сборка каталога + embeddings + eval
src/app/         # Next.js App Router
src/components/  # UI (Gravity UI)
src/data/        # новости; catalog*.generated.json — артефакты сборки
src/lib/chat/    # ассистент: tools, lexical/hybrid search, embeddings
```

## Лицензия / дисклеймер

Цены и новости собраны из публичных источников провайдеров. Перед принятием решений сверяйте актуальные тарифы у вендора.
