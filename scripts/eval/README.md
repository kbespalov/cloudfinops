# FinOps chat eval / benchmark

Два слоя:

1. **Grounded bench** (`questions.ts` + `eval:bench`) — жёсткий gold из каталожных tools, `pass/fail` по cheapest / no-halluc.
2. **Soft UX scenarios** (`user-scenarios.ts` + `eval:scenarios`) — 200 естественных запросов с мягкими рубриками (score/signals). **Не** vitest и **не** frozen prices.

## Файлы

| Файл | Назначение |
|------|------------|
| `questions.ts` | Grounded датасет (`buildQuestions()`, ~135 кейсов) |
| `ground-truth.ts` | Gold + hard grade (no hallucinated providers, cheapest, recall) |
| `user-scenarios.ts` | Soft UX корпус (`buildUserScenarios()`, ровно 200) |
| `soft-grade.ts` | Мягкий score 0–1 + hits/misses/warnings + optional live catalogAnchor |
| `scenario-run.ts` | Прогон soft-корпуса → JSON/MD; `--compare` для кросс-валидации |
| `harness.ts` | Полный chat pipeline (как `/api/chat`), support `history` для revise |
| `run.ts` | Один прогон: модель / prompt A/B |
| `benchmark.ts` | Матрица моделей → leaderboard (качество + latency) |
| `smoke.ts` | Быстрый live smoke (homepage / suite) |
| `out/*` | Отчёты (в git обычно не коммитим) |

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

## Soft UX scenarios (200)

Корпус разговорных/архитектурных/конфликтных запросов. Ожидания — **сигналы** (tools, clarify, refuse/partial, breakdown, forbiddenExtras, optional live `catalogAnchor`), а не зашитая цена в датасете.

### Цель качества (agent path)

- **pass@0.8** ≥ **95%** (score ≥ 0.8 ≈ «4 из 5») на полном корпусе 200 при `--no-fast-path`.
- Улучшения — через **system prompt / tool descriptions / validate / intent gating / force-tool retry / short-final nudge**, не через размножение `ALIAS_PLANS` / homepage fast-path.
- Fast-path остаётся только для коротких homepage/alias кейсов; soft-bench всегда гоняем с `--no-fast-path`.
- Референс-прогон: `out/ux-full-200-goal.json` (fastPath=0).

Финальный вердикт «попал / не попал» — у агента или человека по MD-отчёту (`notesForReview`, misses, warnings). Score нужен для ранжирования и кросс-валидации стабильности, не как CI gate.

```bash
# Размер корпуса
npx tsx -e "import {buildUserScenarios} from './scripts/eval/user-scenarios.ts'; console.log(buildUserScenarios().length)"

# Короткий live-прогон
npm run eval:scenarios -- --limit 5 --no-fast-path --label smoke-ux

# Секция / выбранные id
npm run eval:scenarios -- --section kubernetes --no-fast-path --label ux-k8s
npm run eval:scenarios -- --ids ux-001,ux-050,ux-171 --no-fast-path

# Кросс-валидация двух прогонов (согласованность signals, не дословный текст)
npm run eval:scenarios -- --compare \
  scripts/eval/out/scenarios-a.json \
  scripts/eval/out/scenarios-b.json
```

### Как читать отчёт

- `score` 0–1 — доля hits против misses/warnings (мягко).
- `misses` — сильные отклонения от рубрики (нет tool, нет clarify на trap, claim 100% coverage на impossible).
- `warnings` — слабые сигналы (нет breakdown, cheapest не упомянут при catalogAnchor).
- `signals.catalog` — live cheapest/hallucination из tools; **не** golden в git.
- Revise-кейсы (`ux-191`…`ux-200`) сначала гоняют `seedId`, затем follow-up с `history`.

Эти 200 кейсов **не** добавляются в `npm test` / vitest.
