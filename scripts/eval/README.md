# FinOps chat eval / benchmark

Два слоя:

1. **Grounded bench** (`questions.ts` + `eval:bench`) — жёсткий gold из каталожных tools, `pass/fail` по cheapest / no-halluc.
2. **Soft UX scenarios** (`user-scenarios.ts` + `eval:scenarios`) — корпус естественных запросов (сейчас 220) с мягкими рубриками (score/signals). **Не** vitest и **не** frozen prices.

## Файлы

| Файл | Назначение |
|------|------------|
| `questions.ts` | Grounded датасет (`buildQuestions()`, ~135 кейсов) |
| `ground-truth.ts` | Gold + hard grade (no hallucinated providers, cheapest, recall) |
| `user-scenarios.ts` | Soft UX корпус (`buildUserScenarios()`, `SOFT_SCENARIO_COUNT`) |
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

## Soft UX scenarios (220)

Корпус разговорных/архитектурных/конфликтных запросов. Ожидания — **сигналы** (tools, clarify, refuse/partial, breakdown, forbiddenExtras, optional live `catalogAnchor`), а не зашитая цена в датасете.

### Цель качества (agent path)

- **pass@0.8** ≥ **95%** (score ≥ 0.8 ≈ «4 из 5») на полном корпусе при `--no-fast-path`.
- Улучшения — через **system prompt / tool descriptions / validate / intent gating / force-tool retry / short-final nudge**, не через размножение `ALIAS_PLANS` / homepage fast-path.
- Fast-path остаётся только для коротких homepage/alias кейсов; soft-bench всегда гоняем с `--no-fast-path`.
- Референс-прогон: `out/ux-full-200-goal.json` (fastPath=0; обновить после расширения корпуса).

Финальный вердикт «попал / не попал» — у агента или человека по MD-отчёту (`notesForReview`, misses, warnings). Score нужен для ранжирования и кросс-валидации стабильности, не как CI gate.

```bash
# Размер корпуса
npx tsx -e "import {buildUserScenarios, SOFT_SCENARIO_COUNT} from './scripts/eval/user-scenarios.ts'; console.log(buildUserScenarios().length, SOFT_SCENARIO_COUNT)"

# Короткий live-прогон
npm run eval:scenarios -- --limit 5 --no-fast-path --label smoke-ux

# Секция / выбранные id
npm run eval:scenarios -- --section kubernetes --no-fast-path --label ux-k8s
npm run eval:scenarios -- --section sku-compare --no-fast-path --label ux-sku
npm run eval:scenarios -- --section sizing --no-fast-path --label ux-sizing
npm run eval:scenarios -- --ids ux-001,ux-050,ux-201,ux-206,ux-214 --no-fast-path

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
- Platform/SKU compare (`ux-201`…`ux-208`, `ux-221`): Ice Lake ≠ S3 Ice, nearest preemptible analogs, non-empty tables; `ux-221` — B300×8 HGX peers to H200/H100 ×8, never GTX 1080 / T4 / L4.
- Unit price (`ux-209`…`ux-213`): Cloud.ru via `derivedFromFlavors` with `*` / оценка — не «нет в каталоге».
  - `ux-211` — полная таблица min 1 vCPU + разброс (все 6, Cloud.ru*)
  - `ux-212` — то же для 1 GiB RAM (инверсия: T1 floor / Selectel dear)
  - `ux-213` — ядро + память вместе, по-человечески (разброс, не tool-dump)
- Budget (`ux-210`): ~10k ₽/мес max resources+util; Cloud.ru quoted but often outside util top-6 — surface via `valuePick` (cheaper same vCPU), not «нет в каталоге».
- Capacity sizing (`ux-214`…`ux-220`): RPS/latency → concurrency → vCPU/RAM assumptions → get_quote/compose. Plain-text formulas (no LaTeX). Go defaults ~250 RPS/core × 1.3 safety.
  - `ux-214` — 1000 RPS Go → how many cores
  - `ux-215` — 1000 RPS @ 10 ms → VM + provider prices
  - `ux-216` — 1000 RPS @ 50 ms → higher core ballpark
  - `ux-217` — RAM for Go @ 1000 RPS (clarify/assume)
  - `ux-218` — «тысяча запросов/с» without language/latency (trap)
  - `ux-219` — 5000 RPS I/O-heavy + priced compare
  - `ux-220` — 5 ms vs 20 ms latency teaching + configs

Эти soft-кейсы **не** добавляются в `npm test` / vitest.
