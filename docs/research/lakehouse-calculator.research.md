# ResearchMD · Lakehouse Calculator (v1)

| Field | Value |
|---|---|
| Status | draft · handoff |
| Product | Cloud FinOps · `/calculator/lakehouse` |
| Modeled as | DIY data platform: **Object Storage + Managed Kubernetes + worker VMs** |
| Not modeled (v1) | Managed Spark/Trino/Airflow/Metastore/ClickHouse as separate PaaS SKUs |
| Owners context | Prepare next research pass → improve presets, BOM realism, provider parity |
| Related canvas | `~/.cursor/projects/.../canvases/finops-lakehouse-research.canvas.tsx` |
| Code entry | `src/lib/calculator/lakehouse-*.ts`, `src/components/calculator/LakehouseCalculatorPanel.tsx` |

---

## 1. Зачем этот документ

Зафиксировать **как сейчас устроен калькулятор Lakehouse**, чтобы другой агент мог:

1. не переизобретать модель с нуля;
2. прокопать слабые места (пресеты, duty-cycle, SKU gaps, UX-развилки);
3. вернуть конкретные рекомендации / PR-ready changes.

Это **не** продуктовая спека навсегда — это research handoff.

---

## 2. Продуктовая модель (что продаём пользователю)

Пользователь сравнивает стоимость **DIY lakehouse** в облаках РФ:

```
Object Storage (Iceberg warehouse)
  + Managed Kubernetes (control plane / master)
  + Worker VMs on that cluster:
      · platform  — Airflow + Iceberg catalog (+ лёгкий control)
      · etl       — Spark / batch jobs (duty-cycled)
      · query     — Trino / Spark SQL (duty-cycled)
```

Софт (Airflow, Iceberg, Spark, Trino) **не тарифицируется отдельными PaaS-строками** — только инфраструктура, на которой он крутится.

Вкладки калькулятора: `ВМ` · `Хостинг LLM` · **`Lakehouse`**.

URL: `/calculator/lakehouse`  
API: `POST /api/calculator/lakehouse`

---

## 3. Как работает сейчас (as-built)

### 3.1 UX flow

1. Пользователь выбирает пресет **S / M / L**.
2. Может крутить:
   - объём озера (TiB)
   - % hot (standard); rest → cold, если у провайдера есть cold-класс
   - K8s master: `basic` | `ha`
   - ETL hours/day
   - Query hours/day
3. Sidebar показывает Best offer + разбивку по провайдерам + cost parts.

Пулы `platform` / размеры нод ETL&Query **сейчас не слайдерятся** — берутся из пресета; меняются только hours для ETL/Query.

### 3.2 Пресеты (дефолты)

| Preset | Lake | Hot% | K8s | Platform | ETL | Query |
|---|---:|---:|---|---|---|---|
| **Small** | 10 TiB | 100% | basic | 2×4/16/100 · 24/7 | 2×8/32/200 · 4ч | 1×4/16/100 · 8ч |
| **Medium** | 75 TiB | 70% | ha | 3×8/32/100 · 24/7 | 4×16/64/200 · 8ч | 2×8/32/100 · 12ч |
| **Large** | 500 TiB | 40% | ha | 3×8/32/200 · 24/7 | 8×16/64/400 · 12ч | 4×16/64/200 · 16ч |

Нотация пула: `count × vCPU / RAM GiB / disk GiB · hours/day`.

Источник: `src/lib/calculator/lakehouse-presets.ts`.

### 3.3 Quote pipeline

```
UI (LakehouseCalculatorPanel)
  → useLakehouseQuote (debounce POST)
    → /api/calculator/lakehouse
      → resolveLakehouseInput(preset + overrides)
      → quoteLakehouse(input, period)
         ├─ Object Storage capacity (standard + optional cold)
         ├─ Managed K8s master (basic/ha, comparable synthetic SKUs)
         ├─ platform pool  = quotePreset(compute) × count × (hours/24)
         ├─ etl pool       = same
         └─ query pool     = same
```

Ключевые файлы:

| File | Role |
|---|---|
| `lakehouse-presets.ts` | S/M/L composition + resolve overrides |
| `lakehouse-quote.ts` | BOM quote across providers |
| `useLakehouseQuote.ts` | client debounce → API |
| `api/calculator/lakehouse/route.ts` | request validation |
| `LakehouseCalculatorPanel.tsx` | UI |
| `quote.ts` / catalog | reuse VM pricing + pricebooks |
| `CostBreakdownBar.tsx` | parts: `storage` `k8s` `platform` `etl` `query` |

### 3.4 Правила выбора SKU

**Object Storage**

- meter: `storage.object.capacity`
- `standard`: предпочитаем multi-AZ / multi-zone; **не** берём single-zone как default (Cloud.ru / T1)
- `cold`: если `hotPercent < 100` и у провайдера есть `storageClass=cold`; иначе весь объём в standard + note
- VK: Hotbox = standard, Icebox = cold
- Cloud.ru standard (~1.84 ₽/GiB·мес) дешевле Yandex/VK/Selectel — это ожидаемо и подтверждено тестом

**Kubernetes**

- comparable master через `isK8sComparableMaster(meter, 'basic'|'ha')`
- если HA нет — fallback на basic + note в quote

**Workers**

- family `general`, on-demand, 100% vCPU share, SSD
- duty-cycle: `amount × count × (hoursPerDay / 24)`
- platform всегда 24/7

### 3.5 Что сознательно не в счёте (v1 gaps)

- S3 API ops (PUT/GET/LIST) и compaction tax
- egress / public IP / LB
- block disks сверх boot disk нод (PV под shuffle — только diskGiB ноды)
- Managed Spark / Trino / Airflow / Metastore / ClickHouse / Greenplum / Arenadata
- streaming (Kafka/Flink)
- CVoS / committed discounts
- small-file / metadata overhead
- serving-mart копия озера в CH

### 3.6 Ориентиры по деньгам (list, VAT incl., Jul 2026 catalog)

Только storage floor (standard, без compute):

| Tier | Cloud.ru | VK | Yandex | Selectel |
|---|---:|---:|---:|---:|
| 10 TiB | ~19k | ~23k | ~24k | ~26k |
| 75 TiB | ~141k | ~175k | ~182k | ~197k |
| 500 TiB | ~941k | ~1.17M | ~1.22M | ~1.32M |

Полный Medium (пресет as-is, месяц), пример прогона:

| Provider | Total ≈ | Storage ≈ |
|---|---:|---:|
| Cloud.ru | 212k | 121k |
| VK Cloud | 257k | 148k |
| Yandex | 276k | 157k |
| Selectel | 286k | 167k |

На Large storage часто 70%+ счёта при ephemeral ETL.

---

## 4. Исходный research-контекст (зачем так решили)

- Статья-якорь (FOCUS / warehouse FinOps):  
  https://iceberglakehouse.com/posts/2026-05-24-finops-warehouse-cost/  
  → про accountability Snowflake/BQ; нам нужен **BOM open lakehouse**, не credits.
- Провайдеры:
  - **VK** — самый продуктовый DLH pack (но мы в v1 всё равно DIY)
  - **Yandex** — managed menu (Spark/Metastore/Airflow/CH), Iceberg как pattern
  - **Selectel** — S3 + CH-over-Iceberg + DIY K8s
- Пользовательский запрос: мыслить **пресетами S/M/L**, дальше нагрузка (частота загрузок / concurrency).

---

## 5. ASSIGNMENT · для следующего агента

> **Goal:** прокопать и улучшить research → предложить v1.1 модель калькулятора Lakehouse (без обязательной реализации, если не попросят код).

### 5.1 Обязательный scope

1. **Валидация пресетов S/M/L**  
   Сравни наши node pools / duty-cycles с публичными кейсами и sizing guides:
   - Yandex Cloud data platform / Iceberg / Spark / Airflow
   - Selectel S3 + ClickHouse / 1PB DLH case
   - VK Cloud Data Lakehouse (architecture + tariffication)
   - open-source refs: Trino/Spark on K8s sizing, Iceberg catalog footprint  
   Верни: «оставить / уменьшить / увеличить» по каждому пулу с обоснованием.

2. **Карта cost drivers, которых нет в v1**  
   Для каждого — impact (₽ order of magnitude на S/M/L) и стоит ли тащить в UI v1.1:
   - S3 ops + small files
   - egress
   - serving CH/MPP (copy vs query-over-Iceberg)
   - streaming plane
   - managed engines vs DIY delta

3. **Provider parity audit**  
   Пройди pricebooks `prices/*/iaas/storage/object.yaml` и `.../managed-kubernetes.yaml`:
   - корректны ли pickers (multi-zone, cold mapping, HA fallback)?
   - где сравнение нечестное (T1 multi-zone vs others, Cloud.ru HA gap, MWS no cold)?
   - что добавить в notes UI?

4. **UX forks research**  
   Какие рычаги реально двигают счёт на порядок и должны быть в UI (Tier A), а какие — advanced:
   уже есть: lake size, hot%, k8s tier, ETL/Query hours  
   кандидаты: node count/size, concurrency→query sizing, nightly vs hourly vs streaming, serving on/off, egress destination.

5. **Competitive calculators / public packs**  
   Найди публичные «от X ₽/мес» packs (Selectel CH+10TB и аналоги) и сравни с нашим Small: мы завышаем/занижаем?

### 5.2 Deliverables (обязательный формат ответа)

Верни **один** markdown или canvas со структурой:

```
## Findings
- …

## Preset verdict (S/M/L table)
| Pool | Keep / Change | Why | Source |

## Cost drivers backlog (P0/P1/P2)
| Driver | Add to calc? | UX control | Est. impact |

## Provider fairness notes
- …

## Recommended v1.1 calculator model
- inputs
- BOM line items
- defaults

## Open questions for product owner
- …
```

Источники — со ссылками. Цифры — с пометкой list/VAT/date.

### 5.3 Constraints

- Не ломай текущий контракт API без необходимости; сначала research.
- Не предлагай «один Managed Iceberg SKU», которого нет в прайсах.
- Сохраняй DIY-first narrative (K8s + S3), managed engines — optional path.
- Пиши по-русски для product-facing частей; технические id можно EN.
- Код менять **только если** явно попросят после research; иначе — только research artifact.

### 5.4 Suggested starting points in repo

```
src/lib/calculator/lakehouse-presets.ts
src/lib/calculator/lakehouse-quote.ts
src/lib/calculator/lakehouse-quote.test.ts
src/components/calculator/LakehouseCalculatorPanel.tsx
src/app/api/calculator/lakehouse/route.ts
src/app/calculator/lakehouse/page.tsx
prices/*/iaas/storage/object.yaml
prices/*/paas/containers/managed-kubernetes.yaml
docs/research/lakehouse-calculator.research.md   ← this file
```

### 5.5 Prompt seed (можно вставить другому агенту as-is)

```
Прочитай docs/research/lakehouse-calculator.research.md целиком.
Выполни секцию «5. ASSIGNMENT» и верни deliverables в формате 5.2.
Сверь пресеты и quote-модель с актуальными публичными материалами
Yandex / Selectel / VK Cloud и с pricebooks в репозитории.
Не пиши код, пока не попросят — только research + рекомендации v1.1.
```

---

## 6. Definition of done для research-агента

- [ ] Пресеты S/M/L либо подтверждены, либо предложены новые числа с источниками
- [ ] Список P0 cost drivers для следующего инкремента калькулятора
- [ ] Зафиксированы fairness-оговорки по провайдерам
- [ ] Есть конкретная v1.1 input model (какие слайдеры/тогглы)
- [ ] Open questions сформулированы так, что product owner может ответить yes/no

---

## 6a. Findings (research pass 2026-07-24)

Источники: Dremio (small files), LakeOps (Iceberg cost optimization 2026 / reduce S3 cost), iceberglakehouse (storage/compute decoupling), Acceldata Trino capacity planning, AWS data-on-EKS Trino, Trino Helm docs, lakebench-k8s.

**Cost drivers (подтверждено):**
- **Storage — обычно крупнейшая статья**, особенно на L. На «сырых» стриминговых озёрах реальный счёт в **2–4× выше** логического из-за orphan-файлов, старых снапшотов и мелких файлов. Лечится lifecycle → cold + `OPTIMIZE`/`VACUUM`/`expire_snapshots`.
- **S3 API ops (GET/LIST)** сами по себе дешёвые (~$0.0004/1000 GET), но при small files раздувают и планирование, и compute (пример: 47k файлов → 47k GET на запрос; после компакции 28 файлов — запрос ×9 быстрее). Для нашего калькулятора ops = **P1**, не P0: влияет на порядок только на плохо обслуживаемых стриминговых озёрах.
- **Compute определяется duty-cycle.** Отраслевой паттерн — scale-to-zero воркеров (KEDA/Karpenter), coordinator on-demand, воркеры можно спот. → наш `hours/day` рычаг корректен и является главным.
- Ниже ~500 GB Iceberg-стек не окупается (фикс-оверхед) — наш Small 10 TiB выше этого порога, ок.

**Sizing verdict (пресеты):**
- Trino/Spark: **scale-out воркерами > vertical**; 1 pod на ноду; воркер ≥ 16 vCPU / 64 GiB для крупных; coordinator скромный (~2 vCPU / 8 GiB достаточно).
- Наши пулы в целом в диапазоне гайдов. Нюансы на будущее: platform-нода как «coordinator» у нас 4–8 vCPU — можно уменьшить до 2–4; ETL/Query воркеры 8–16 vCPU — норм.
- Вердикт: **оставить числа пулов в v1.1**, размер нод не выносим в UI (шум); двигаем только объём/hot/duty/k8s.

## 6b. Что изменено в UI (v1.1, 2026-07-24)

Цель — полезнее и меньше шума.

- **Убран** дублирующий блок «Состав (DIY на K8s)» с тремя pool-строками, которые повторяли слайдеры.
- **Добавлен** компактный footprint кластера: `Ноды / vCPU / RAM` под пиком + подпись «24/7 работает N нод … ETL и Query по duty-cycle».
- **Добавлен** динамический инсайт из лучшего оффера: «Крупнейшая статья — X (N%)» + actionable-подсказка (storage → lifecycle/компакция; etl/query → duty-cycle).
- **Duty-cycle слайдеры** теперь показывают «активен X/24 ч — платите за N% времени» вместо абстрактного хинта.
- **Явная оговорка**: запросы к S3 (PUT/GET) и egress в расчёт не входят — снимает ложные ожидания.

Файлы: `LakehouseCalculatorPanel.tsx`, `LakehouseCalculatorPanel.module.css`. Модель quote/API не менялась.

## 7. Changelog этого ResearchMD

| Date | Note |
|---|---|
| 2026-07-24 | v1 as-built после первого ship калькулятора Lakehouse; assignment для follow-up research |
| 2026-07-24 | research pass 2: findings по cost drivers/sizing (§6a) + UI-улучшения v1.1 (§6b) |
