# FinOps chat eval / benchmark

Предметный бенчмарк ассистента: **≥100 вопросов** по каталогу Cloud FinOps (GPU, AI API, S3, SSD, K8s, ВМ, unit-price, adversarial).

Gold строится теми же tools, что и прод (`search_prices` / `get_quote` / `compare_unit_price`), без LLM.

## Файлы

| Файл | Назначение |
|------|------------|
| `questions.ts` | Датасет (`buildQuestions()`, сейчас ~135 кейсов) |
| `ground-truth.ts` | Gold + grade (no hallucinated providers, cheapest, recall) |
| `harness.ts` | Полный chat pipeline (как `/api/chat`) |
| `run.ts` | Один прогон: модель / prompt A/B |
| `benchmark.ts` | Матрица моделей → leaderboard (качество + latency) |
| `smoke.ts` | Быстрый live smoke (homepage / suite) |
| `out/*.json` | Отчёты (в git обычно не коммитим) |

## Требования

`CLOUDRU_FM_API_KEY` в `.env.local` (Cloud.ru Foundation Models).

## Быстрый старт

```bash
# Сколько кейсов в датасете
npx tsx -e "import {buildQuestions} from './scripts/eval/questions.ts'; console.log(buildQuestions().length)"

# Один модель (текущий CLOUDRU_FM_MODEL или дефолт)
npm run eval:bench -- --limit 20 --no-fast-path

# Сравнение моделей (честный A/B: без fast-path)
# ID как в GET /v1/models (пример на 2026-07):
npm run eval:bench -- \
  --models openai/gpt-oss-120b,ai-sage/GigaChat3-10B-A1.8B,Qwen/Qwen3.6-35B-A3B \
  --no-fast-path \
  --concurrency 4 \
  --label models-latency

# Полный бенч (~135 Q × N моделей) — долго и платно
npm run eval:bench -- --models openai/gpt-oss-120b,ai-sage/GigaChat3-10B-A1.8B --no-fast-path --label full-ab

## Кандидаты на ускорение (Cloud.ru FM)

| Model id | Заметки |
|----------|---------|
| `openai/gpt-oss-120b` | Текущий дефолт, tool-calling OK |
| `ai-sage/GigaChat3-10B-A1.8B` | Быстрый internal, проверить FC |
| `Qwen/Qwen3.6-35B-A3B` | Быстрый MoE, проверить FC |
| `openai/gpt-oss-20b` | Меньше / быстрее sibling |
| `GigaChat/GigaChat-2-Max` | По докам без function calling — не для planning |

# Только GPU / только AI
npm run eval:bench -- --tag gpu-price --no-fast-path --models openai/gpt-oss-120b
```

`--no-fast-path` обязателен для сравнения LLM: иначе чипы с главной отвечают детерминированно без модели.

## Метрики

- **pass** — нет выдуманных провайдеров + упомянут правильный cheapest (+ recall ≥50%, если есть офферы)
- **noHalluc** — только провайдеры из gold
- **latency** — p50 / p95 / mean по end-to-end `runChat` (мс)
- Leaderboard: выше pass%, при равенстве — ниже p50

Отчёт: `scripts/eval/out/<label>.json`.

## Prompt A/B (без смены модели)

```bash
npx tsx scripts/eval/run.ts --prompt scripts/eval/prompts/v2.txt --label v2 --no-fast-path --limit 40
```

## Smoke (не бенчмарк)

```bash
npm run eval:smoke          # homepage chips + latency budget
npx tsx scripts/eval/smoke.ts --suite
```
