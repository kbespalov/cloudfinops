# Compute flavors / shape envelopes

Сводка **минимальных и максимальных** конфигураций обычных ВМ (vCPU + RAM) по провайдерам каталога Cloud FinOps.  
Нужна, чтобы калькулятор и чат не «придумывали» цены на формы, которые нельзя заказать из публичного self-serve каталога.

> GPU, bare metal / HaaS и выделенные гипервизоры — вне этой таблицы (см. GPU price books).  
> Дата сверки: 2026-07-28. При обновлении доков — править YAML `dimensions` и этот файл.

## Поля в каталоге (`dimensions`)

| Поле | Смысл |
|------|--------|
| `minVcpu` / `minRamGiB` | Нижняя граница orderable формы |
| `maxVcpu` / `maxRamGiB` | Верхняя граница, по которой котируем (self-serve / публичный каталог) |
| `platformMaxVcpu` / `platformMaxRamGiB` | Жёсткий лимит платформы (часто через поддержку / custom) |
| `maxRamGiBPerVcpu` | Потолок RAM на ядро (Yandex) |
| `availableVmTypes` | Точная решётка типов (MWS) |
| `shapeMode` | `envelope` \| `exact-vm-types` \| `exact-flavors` |

Калькулятор читает эти поля через одну общую функцию
`shapeAllowedForProvider(provider, vcpu, ramGiB)` / `isComputeShapeAllowed`
в `src/lib/calculator/compute-shapes.ts` (да/нет для любого провайдера).

## Сводка

| Провайдер | Режим | Min (vCPU / GiB) | Max для quote (vCPU / GiB) | Platform / notes |
|-----------|--------|------------------|----------------------------|------------------|
| **VK Cloud** | envelope (STD2/STD3) | ~1–2 / 2–4 | **16 / 64** | Platform hard: **32 / 1024**; >16/64 — поддержка |
| **Yandex Cloud** Ice Lake (`standard-v3`) | envelope + share rules | 2 / 1 (доля ≥20%) | **96 / 640** (100%) | RAM ≤16 GiB/ядро; доля 20/50% → только 2\|4 vCPU, ≤4 GiB/ядро |
| **Yandex Cloud** Cascade Lake (`standard-v2`) | envelope + share rules | 2 / 0.5 (5%) | **80 / 1280** (100%) | Доля 5% → ≤2 GiB/ядро; 20/50% → ≤4 GiB/ядро, 2\|4 vCPU |
| **Yandex Cloud** *(сводка chat/tool)* | union envelopes | 2 / 0.5 | **96 / 1280** *(не форма)* | max = max(Ice vCPU, Cascade RAM); пара **96×1280 не orderable** |
| **Yandex Cloud** Zen 4 (`standard-v4a`) | docs only* | 2 / 1 | **288 / 1792** | *В каталоге unit SKU пока Ice/Cascade; Windows ≤224 vCPU |
| **Cloud.ru** (Evolution) | exact flavors + envelope | **1 / 1** | **32 / 128** (консоль self-serve) | AZ-зависимо: где-то 32/64; прайс знает до 64/320, но в UI часто недоступно |
| **Selectel** | envelope (Standard dedicated) | **2 / 4** | **32 / 256** (фиксированные SL2 / docs fixed) | Docs произвольные ru-6: **232 / 1200** → `platformMax*`; Shared 1/0.5 в каталоге unit не котируем; пул-зависимо |
| **T1 Cloud** | envelope (flavor grid) | **2 / 4** (`*.large.*`) | **64 / 640** (консоль 2026-07) | Naming/API допускают выше (напр. a5.16xlarge.14 = 896 GiB, GPU до 224 vCPU); для quote — то, что реально выбирается в UI |
| **MWS Cloud** | exact `vmTypes` | **2 / 4** | **48 / 192** | Только опубликованные `gen-*`; не свободная сборка |

## Провайдеры подробно

### VK Cloud

- Docs: [flavors](https://cloud.vk.ru/docs/computing/iaas/concepts/vm/flavor), [quotas](https://cloud.vk.ru/docs/ru/tools-for-using-services/account/concepts/quotasandlimits)
- Self-serve STD2 (Cascade Lake) / STD3 (Ice Lake): до **16 vCPU / 64 GiB**
- Hard per-instance: **32 vCPU / 1024 GiB** (custom flavor через поддержку)
- High-Freq: до 24 vCPU
- YAML: `prices/vk-cloud/iaas/compute/general.yaml`

### Yandex Cloud

- Docs: [performance-levels](https://yandex.cloud/ru/docs/compute/concepts/performance-levels), [platforms](https://yandex.cloud/ru/docs/compute/concepts/vm-platforms), [limits](https://yandex.cloud/ru/docs/compute/concepts/limits)
- Доли &lt;100%: только **2 или 4** vCPU; RAM/ядро зависит от доли (уже в `vcpu-share.ts`)
- Ice Lake 100%: до **96 vCPU / 640 GiB**, ≤16 GiB/ядро
- Cascade Lake 100%: до **80 vCPU / 1280 GiB**, ≤16 GiB/ядро
- Zen 4: до **288 / 1792** (в каталоге unit SKU пока нет)
- YAML: `prices/yandex-cloud/iaas/compute/general.yaml`

### Cloud.ru (Сбер / Evolution Compute)

- Docs: [flavors](https://cloud.ru/docs/virtual-machines/ug/topics/concepts__flavors)
- Только фиксированные флейворы (произвольный vCPU/RAM недоступен)
- **Консоль self-serve (сверка 2026-07-28):** при 100% доля vCPU до **32**, RAM до **128** (в части AZ только до 64); 192–256 на 32 vCPU серые
- Price book всё ещё публикует крупные формы (до **64/320**) — в каталоге как `platformMax*`, для quote не считаем orderable
- Эконом: 10% до 8/32; 30% до 32/64
- YAML: `prices/cloud-ru/iaas/compute/general.yaml` (`maxVcpu/maxRamGiB` = console; flavors = точные формы)

### Selectel

- Docs: [configurations](https://docs.selectel.ru/cloud-servers/create/configurations/)
- Наш price book — Standard **100% / EPYC 9754 / ru-6a** (выделенные ядра). Для этой линейки:
  - **Фиксированные** dedicated: **2–32 vCPU / 4–256 GiB** (до `SL2.32-262144-AMD`) — это `max*` для quote
  - **Произвольные** dedicated в docs: **2–232 / 4–1200** (ru-6) — `platformMax*`; FAQ: если форму не собрать — тикет/поддержка
- Маркетинг («до 232 / 900») и произвольные таблицы ≠ гарантированный self-serve фиксированный каталог
- HighFreq произвольные: до **176 / 900** (ru-6 до 1300 GiB) — отдельная линейка, не наши unit SKU
- Shared: от **1 / 0.5**, доля 10/20/50% — не в general unit meters
- >8 vCPU: соотношение vCPU:RAM не ниже 1:2
- YAML: `prices/selectel/iaas/compute/general.yaml`

### T1 Cloud

- Docs: [конфигурации сервера](https://t1-cloud.ru/docs/article/cloud-engine-openstack/cloud-compute/konfiguratsii-servera), [API flavors](https://t1-cloud.ru/docs/article/api/znacheniya-parametrov-v-api)
- Формат `A.B.C`: A=семейство (b2/b3/b5 переподписка 1:3; a1/a5 = 1:1), B=размер ядер, C=RAM/vCPU
- Min: **2 vCPU / 4 GiB** (`*.large.2`)
- Max в консоли заказа (сверка 2026-07-28): **64 vCPU / 640 GiB** — это значение в каталоге для quote
- В справочнике API встречаются и более жирные RAM-ratio (напр. a5.16xlarge.14 = 64/896); naming до `56xlarge` = 224 vCPU на GPU
- YAML: `prices/t1-cloud/iaas/compute/general.yaml`

### MWS Cloud

- Docs: [VM types](https://mws.ru/docs/cloud-platform/compute/general/vm-types.html)
- Только фиксированные типы `gen-{vcpu}-{ram}`
- Balanced 1:4 → до `gen-48-192`; CPU 1:2 → `gen-48-96`; Memory 1:8 → `gen-24-192`
- Max: **48 vCPU / 192 GiB**; min: **2 / 4**
- YAML: `prices/mws-cloud/iaas/compute/general.yaml` → `availableVmTypes`

## Как это влияет на калькулятор

1. Пресеты `gen-32-128`, `mem-32-256` и т.п. **не должны** получать quote у провайдера, если форма вне его envelope / решётки.
2. Miss reason: короткое RU-сообщение («нет STD-формы ≤16/64», «нет vmType gen-…», …).
3. Слайдеры UI могут оставаться широкими (сравнение cross-cloud); ограничение — на этапе quote / missing providers.

## Источники для повторной сверки

1. VK — flavors + quotasandlimits  
2. Yandex — performance-levels + vm-platforms  
3. Cloud.ru — concepts__flavors + price book  
4. Selectel — cloud-servers/create/configurations  
5. T1 — konfiguratsii-servera + API flavor list  
6. MWS — vm-types.html  
