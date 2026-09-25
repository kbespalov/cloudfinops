/** Prose fields may wrap identifiers in backticks, see lib/public-api/doc-typography. */
export type Parameter = {name: string; type: string; description: string; required?: boolean; default?: string};
export type Endpoint = {
  id: string; title: string; method: 'GET' | 'POST'; path: string; description: string;
  tool?: string; parameters: Parameter[]; returns: string;
};

export const endpoints: Endpoint[] = [
  {
    id: 'products', title: 'Поиск SKU', method: 'GET', path: '/products', tool: 'search_products',
    description: 'Возвращает биллинговые SKU по структурированным фильтрам. Значения одного параметра объединяются через ИЛИ, разные параметры — через И. Поля и операции для `attributes` описаны в `GET /attributes`. Один SKU — компонент тарифа, а не готовая конфигурация: месячную стоимость VM или GPU считает `POST /estimates`.',
    parameters: [
      {name: 'attributes', type: 'object (JSON)', description: 'Фильтр по полям `Product.attributes`. На каждое поле одна операция: `eq` — точное совпадение с учётом регистра, `in` — любое из значений, `range` — включительный диапазон `min`/`max`. В REST передайте JSON одним query-параметром (`URLSearchParams` или `--data-urlencode`); в MCP — объект. Неизвестное поле, неверный тип или операция — 400. `null` не совпадает ни с каким значением. Числа описывают уже существующий SKU, а не запрос собрать конфигурацию. Пример: `{"gpuModel":{"eq":"NVIDIA L4"},"gpuCount":{"range":{"min":1,"max":4}}}`.'},
      {name: 'q', type: 'string', description: 'Короткий лексический поиск по названию, идентификатору SKU, модели GPU и категории. Произвольные `providerAttributes` не индексируются. Если параметр не задан, порядок — по провайдеру и SKU. Для токенных AI-ставок задайте `services=ai` и `units=token`; `q` для этого не нужен.'},
      {name: 'providers', type: 'string[]', description: 'Идентификаторы провайдеров из `GET /providers`. В REST — через запятую, например `selectel,vk-cloud`; в MCP — массив. Неизвестные значения отбрасывают соответствующие SKU, а не возвращают 404.'},
      {name: 'categories', type: 'string[]', description: 'Категории каталога: `compute`, `gpu`, `storage`, `network`, `cdn`, `kubernetes`, `ai`. Блочные диски относятся к `compute`, объектное хранилище — к `storage`. Оценка конфигурации поддерживает только `compute` и `gpu`.'},
      {name: 'services', type: 'string[]', description: 'Точные идентификаторы сервисов из `GET /services`: `ai`, `compute`, `storage`, `network`, `cdn`, `containers`. Сервис ≠ категория: GPU входит в сервис `compute`, блочные диски — в сервис `storage` и категорию `compute`.'},
      {name: 'serviceProducts', type: 'string[]', description: 'Точные значения `attributes.serviceProduct`, например `foundation-models`, `gpt-model-hub`, `ai-studio` или `ml-inference`. Чтобы сузить один продукт у нескольких провайдеров, добавьте `providers`.'},
      {name: 'meters', type: 'string[]', description: 'Точный идентификатор ставки из `GET /services` или `Product.meter`, например `ai.inference.tokens.input` или `ai.embeddings.tokens`. Совпадение полное: префикс и полнотекстовый поиск не поддерживаются.'},
      {name: 'units', type: 'string[]', description: 'Точные значения `Price.unit`. `token` выбирает токенные ставки любого пакета; знаменатель пакета — в `Price.unitQuantity`. Ставки за GPU-час и за запрос в выборку не попадут.'},
      {name: 'modelIds', type: 'string[]', description: 'Точные значения `attributes.modelId`, например `gpt-oss-120b`. Регистр учитывается; идентификаторы разных провайдеров не нормализуются.'},
      {name: 'tokenDirections', type: 'string[]', description: '`input` и/или `output`. SKU без указанного направления фильтру не соответствует. Чтобы получить все токенные ставки, включая embeddings с неизвестным направлением, задайте только `units=token`.'},
      {name: 'inferenceModes', type: 'string[]', description: 'Точные значения `attributes.inferenceMode`, например `synchronous` или `batch`. SKU с неизвестным режимом явному фильтру не соответствуют.'},
      {name: 'regions', type: 'string[]', description: 'Точная метка из `GET /regions` или любой код из `codes` / `Product.regionCodes`. Регистр кодов не важен; иерархия «город ⊂ регион» не выводится. В REST повторяйте `regions` для нескольких меток, в том числе с запятыми; перечисление кодов через запятую тоже принимается. Для кодов конкретного провайдера задайте `providers`.'},
      {name: 'status', type: 'string', description: 'Статус записи в каталоге, например `available`. Не подтверждает текущую ёмкость у провайдера.'},
      {name: 'limit', type: 'integer', default: '50', description: 'Размер страницы, от 1 до 100.'},
      {name: 'cursor', type: 'string', description: 'Непрозрачный `pagination.nextCursor` из предыдущего ответа. Не конструируйте его: внутри сохранены фильтры, порядок и версия снимка. При 409 начните с первой страницы без `cursor`.'},
    ],
    returns: 'Массив `Product` с вложенными правилами `Price`. В `meta` — версии каталога и расчёта. Если страница не последняя, `pagination.nextCursor` указывает на следующую; `null` — конец выборки.',
  },
  {
    id: 'product', title: 'Получить продукт', method: 'GET', path: '/products/{id}', tool: 'get_product',
    description: 'Возвращает один биллинговый SKU по идентификатору `prod_…` из `GET /products`: характеристики, `providerAttributes`, правила тарификации, НДС, единицы, ступени и источник с `checkedAt`. `Product.id` и `providerSku` — разные идентификаторы. `null` означает «неизвестно» или «не применимо», но не ноль.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Точный `Product.id` из поиска. Не подставляйте `providerSku`.'}],
    returns: 'Объект `Product`. Неизвестный идентификатор — 404.',
  },
  {
    id: 'alternatives', title: 'Альтернативы продукта', method: 'GET', path: '/products/{id}/alternatives', tool: 'list_product_alternatives',
    description: 'Возвращает сопоставимые SKU того же биллингового рода у других провайдеров. Сравнивает компоненты тарифа, а не полные конфигурации. Похожесть по функции не означает одинаковую тарификацию или состав.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Идентификатор исходного `Product.id`. Неизвестный id — 404. Если SKU есть, но сопоставимых альтернатив нет, ответ — пустой массив.'}],
    returns: 'Массив кандидатов. У каждого: `product`, `mode` (`exact` или `functional`), `differences`, `ineligibleReasons` и `priceComparable`. Сравнивать ставки можно только при `priceComparable=true`.',
  },
  {
    id: 'providers', title: 'Все провайдеры', method: 'GET', path: '/providers', tool: 'list_providers',
    description: 'Возвращает провайдеров каталога: идентификаторы, категории, число SKU и публичные источники тарифов. Эти идентификаторы передавайте в `GET /products` и `POST /estimates`. Покрытие описывает каталог, а не живую ёмкость инфраструктуры.',
    parameters: [],
    returns: 'Массив `Provider`: `id` (slug), `name`, `productCount`, `categories`, `estimateResourceTypes` и `sources`.',
  },
  {
    id: 'provider', title: 'Получить провайдера', method: 'GET', path: '/providers/{id}',
    description: 'Возвращает одного провайдера по идентификатору из `GET /providers`: покрытие каталога и источники тарифов.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Slug провайдера из `GET /providers`, например `selectel` или `yandex-cloud`.'}],
    returns: 'Объект `Provider`. Неизвестный идентификатор — 404.',
  },
  {
    id: 'categories', title: 'Категории', method: 'GET', path: '/categories',
    description: 'Возвращает категории каталога и число SKU в каждой. Блочные диски относятся к `compute`, объектное хранилище — к `storage`. `POST /estimates` считает только `compute` и `gpu`.',
    parameters: [],
    returns: 'Массив объектов с полями `id`, `title` и `productCount`.',
  },
  {
    id: 'attributes', title: 'Характеристики по категориям', method: 'GET', path: '/attributes',
    description: 'Справочник полей `Product.attributes`: тип, допустимые операции, единица измерения, закрытые перечисления и наблюдаемые значения. По этому справочнику API проверяет запросы. Произвольные `providerAttributes` фильтровать нельзя.',
    parameters: [{name: 'categories', type: 'string[]', description: 'Ограничить справочник перечисленными категориями. В REST — через запятую. Без параметра возвращаются все категории.'}],
    returns: 'Для каждой категории — массив `attributes`. У поля: `id`, `type`, `operators` и `allowedValues` (закрытое перечисление либо `null`). `values` — наблюдаемые значения и число SKU до других фильтров; для строк это подсказка, а не enum. `observedRange` — границы чисел в каталоге. `knownCount` и `missingCount` показывают заполненность. Строки сравниваются точно, с учётом регистра; значение вне наблюдаемого списка допустимо и может дать пустую выдачу.',
  },
  {
    id: 'services', title: 'Сервисы', method: 'GET', path: '/services',
    description: 'Возвращает сервисы исходного каталога и идентификаторы ставок (`meters`). Сервисы отражают структуру источника; категории — группировку на сайте.',
    parameters: [],
    returns: 'Для каждого сервиса: `id`, `productCount`, `layers`, `categories` и `meters`. Передавайте `id` в фильтр `services`, значения из `meters` — в `meters`. Например, сервис `ai` включает токены, ML-инфраструктуру и запросы классификации.',
  },
  {
    id: 'regions', title: 'Регионы', method: 'GET', path: '/regions',
    description: 'Возвращает исходные метки расположения: страны, города, зоны, группы и области действия тарифов. Это не географическая иерархия: «—» — неуказанное расположение, «Все регионы» — исходная метка, а не поиск без ограничений. Не выводите регион из города или схемы именования другого провайдера.',
    parameters: [],
    returns: 'Для каждой метки: `label`, `code`, `codes` и `productCount`. `codes` — все распознанные коды в нижнем регистре; `code` заполнен, только если код один. `productCount` считает SKU с точной меткой; фильтр по коду может вернуть больше SKU из нескольких меток. В `Product` тот же массив называется `regionCodes`.',
  },
  {
    id: 'estimates', title: 'Создать расчёт', method: 'POST', path: '/estimates', tool: 'create_estimate',
    description: 'Считает месячную стоимость конфигурации `compute` (`vcpu`, `memoryGiB`) или `gpu` (`gpuModel`, `gpuCount`) по публичным тарифам. Месяц — 720 часов. Числовые размеры — минимумы: фактический состав смотрите в `matchedResource` и `differences`. Сравнивайте только предложения со статусом `priced`. Расчёт не создаёт ресурсы и не проверяет ёмкость.',
    parameters: [
      {name: 'resource', type: 'object', required: true, description: 'Запрашиваемая конфигурация. Тип задаёт `resource.type`: `compute` или `gpu`. Категориальные ограничения и регион при подборе сохраняются; числовые поля могут быть превышены.'},
      {name: 'resource.type', type: 'enum', required: true, description: '`compute` — CPU и память; `gpu` — конфигурация с ускорителем.'},
      {name: 'resource.vcpu', type: 'integer', description: 'Минимум vCPU, от 1 до 4096. Обязателен для `compute`. Для GPU со `scope=instance` — необязательный минимум хоста; при `scope=gpu_only` не передаётся.'},
      {name: 'resource.memoryGiB', type: 'number', description: 'Минимум памяти хоста в GiB, не видеопамять GPU. Обязателен для `compute`. При `scope=gpu_only` не передаётся.'},
      {name: 'resource.disk', type: 'object', default: '100 GiB SSD', description: 'Диск инстанса: `sizeGiB` и `media` (`ssd` или `hdd`). Носитель не подменяется. Для `instance` по умолчанию — 100 GiB SSD. При `scope=gpu_only` не передаётся.'},
      {name: 'resource.gpuModel', type: 'string', description: 'Модель GPU из каталога, например `L4` или `H100`. Обязателен для `gpu`. Физическая GPU не заменяется vGPU.'},
      {name: 'resource.gpuCount', type: 'integer', description: 'Минимум GPU. Обязателен для `gpu`; подобранная конфигурация может содержать больше.'},
      {name: 'resource.scope', type: 'enum', default: 'instance', description: 'Состав расчёта GPU: `instance` — хост и диск, `gpu_only` — только ускоритель. Для `gpu_only` не передавайте `vcpu`, `memoryGiB` и `disk`.'},
      {name: 'resource.region', type: 'string', description: 'Точная метка или любой код из `GET /regions` / `Product.regionCodes`. Регистр кодов не важен. Для GPU дополнительно можно задать `interconnect`. Параметр `form` требует явного форм-фактора; в текущем каталоге таких SKU нет — не передавайте его.'},
      {name: 'resource.purchaseModel', type: 'enum', default: 'on-demand', description: 'Модель потребления: `on-demand` или `preemptible`. `preemptible` не подменяется на `on-demand`.'},
      {name: 'providers', type: 'string[]', description: 'Уникальные идентификаторы из `GET /providers`. Без параметра считаются все провайдеры каталога.'},
      {name: 'period', type: 'enum', default: 'month', description: 'Единственное значение в v1 — `month` (720 часов).'},
      {name: 'addons', type: 'object', default: '0', description: 'Дополнительные ресурсы: `publicIpCount`, `objectStorageGiB`, `internetEgressGiB`, `cdnEgressGiB`. Если ставки нет, предложение получает статус `incomplete`, а не нулевую цену.'},
    ],
    returns: 'Объект `Estimate`: `quotes` с `matchedResource`, `differences`, `lineItems`, `status` и `total`; `coverage`; `lowestPriceProviderIds` — все провайдеры с минимальной стоимостью среди `priced` (ничьи сохраняются). Суммы — десятичные строки в ₽, НДС включён у предложений `priced`. `incomplete`, `unavailable` и `error` — не бесплатные оферты. HTTP 200 означает, что запрос разобран; статус каждого провайдера смотрите в `quotes[].status`.',
  },
];

export const guides = [
  {id: 'overview', title: 'Обзор API'},
  {id: 'authentication', title: 'Доступ и ограничения'},
  {id: 'models', title: 'Продукты и цены'},
  {id: 'pagination', title: 'Пагинация'},
  {id: 'errors', title: 'Ошибки'},
];
export const computeExample = JSON.stringify({resource: {type: 'compute', vcpu: 4, memoryGiB: 8, disk: {sizeGiB: 100, media: 'ssd'}}}, null, 2);
export const gpuExample = JSON.stringify({resource: {type: 'gpu', gpuModel: 'L4', gpuCount: 1, scope: 'instance'}}, null, 2);
export const baseUrl = 'https://cloudfinops.ru/api/v1';
export const mcpUrl = 'https://cloudfinops.ru/mcp';
