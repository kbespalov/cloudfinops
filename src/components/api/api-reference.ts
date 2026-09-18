export type Parameter = {name: string; type: string; description: string; required?: boolean; default?: string};
export type Endpoint = {
  id: string; title: string; method: 'GET' | 'POST'; path: string; description: string;
  tool?: string; parameters: Parameter[]; returns: string;
};

export const endpoints: Endpoint[] = [
  {
    id: 'products', title: 'Поиск продуктов', method: 'GET', path: '/products', tool: 'search_products',
    description: 'Метод выбирает биллинговые SKU по сервису, типу тарифа, единице оплаты, модели и другим признакам. Для токенных AI-тарифов задайте services=ai&units=token; q не нужен. Значения одного фильтра объединяются через ИЛИ, разные фильтры — через И.',
    parameters: [
      {name: 'q', type: 'string', description: 'Короткий поисковый запрос по названию, SKU или модели GPU, например H100, SSD или vCPU. Дополнительные providerAttributes не участвуют в текстовом поиске. Если параметр не задан, продукты упорядочены по провайдеру и SKU.'},
      {name: 'providers', type: 'string[]', description: 'Slug провайдеров, по которым нужно отфильтровать результаты. В REST перечислите их через запятую, например selectel,vk-cloud, а в MCP передайте массив.'},
      {name: 'categories', type: 'string[]', description: 'Категории для фильтрации: compute, gpu, storage, network, cdn, kubernetes или ai.'},
      {name: 'services', type: 'string[]', description: 'ID сервисов из GET /services: ai, compute, storage, network, cdn, containers. Сервис отличается от категории: GPU относится к compute, а блочные диски — к storage.'},
      {name: 'serviceProducts', type: 'string[]', description: 'Точные значения attributes.serviceProduct: например foundation-models, gpt-model-hub, ai-studio или ml-inference. При необходимости ограничьте провайдера.'},
      {name: 'meters', type: 'string[]', description: 'Точный тип биллинговой ставки из GET /services или Product.meter: например ai.inference.tokens.input, ai.inference.tokens.output или ai.embeddings.tokens.'},
      {name: 'units', type: 'string[]', description: 'Единицы оплаты Price.unit. Значение token выбирает токенные тарифы независимо от размера пакета; размер пакета указан в Price.unitQuantity. GPU и запросы с другой единицей оплаты не попадут в выборку.'},
      {name: 'modelIds', type: 'string[]', description: 'Точные значения attributes.modelId, например gpt-oss-120b. Регистр важен; разные идентификаторы провайдеров автоматически не объединяются.'},
      {name: 'tokenDirections', type: 'string[]', description: 'input и/или output. Если направление не указано в каталоге, такой SKU не соответствует фильтру. Для всех токенных тарифов, включая embeddings с неизвестным направлением, задайте только units=token.'},
      {name: 'inferenceModes', type: 'string[]', description: 'Точные значения attributes.inferenceMode, например synchronous или batch. Тарифы с неизвестным режимом не соответствуют заданному фильтру.'},
      {name: 'regions', type: 'string[]', description: 'Точные метки или любой код из codes словаря регионов. Регистр кодов не важен; совпадение по любому значению, без дубликатов. В REST повторяйте параметр regions для нескольких меток, особенно с запятыми. Перечисление кодов через запятую также поддерживается. Для кодов конкретного провайдера задайте providers.'},
      {name: 'status', type: 'string', description: 'Статус продукта в каталоге, например available.'},
      {name: 'limit', type: 'integer', default: '50', description: 'Число продуктов на странице, от 1 до 100.'},
      {name: 'cursor', type: 'string', description: 'Значение pagination.nextCursor из предыдущего ответа. Cursor сохраняет фильтры, порядок результатов и версию каталога.'},
    ],
    returns: 'Ответ содержит массив объектов Product с вложенными правилами тарификации Price, метаданные с версиями каталога и pagination.nextCursor для получения следующей страницы.',
  },
  {
    id: 'product', title: 'Получить продукт', method: 'GET', path: '/products/{id}', tool: 'get_product',
    description: 'Product описывает один биллинговый SKU, например vCPU или GPU flavor. Метод возвращает его характеристики, источник данных и полные правила тарификации.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Непрозрачный идентификатор продукта prod_… из каталога, который сохраняется при обновлении ставки.'}],
    returns: 'Метод возвращает объект Product. Если продукт с указанным идентификатором не найден, API возвращает 404.',
  },
  {
    id: 'alternatives', title: 'Альтернативы продукта', method: 'GET', path: '/products/{id}/alternatives', tool: 'list_product_alternatives',
    description: 'Метод возвращает сопоставимые SKU того же рода у других провайдеров с учётом характеристик и способа тарификации.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Идентификатор prod_… продукта, для которого нужно найти альтернативы.'}],
    returns: 'Для каждого продукта ответ содержит differences, ineligibleReasons и priceComparable. Сравнивать цены можно только при priceComparable=true.',
  },
  {
    id: 'providers', title: 'Все провайдеры', method: 'GET', path: '/providers', tool: 'list_providers',
    description: 'Метод возвращает список провайдеров с информацией о представленных в каталоге SKU и категориях, а также со ссылками на источники тарифов.',
    parameters: [], returns: 'Ответ содержит массив объектов Provider со slug, названием, числом SKU, категориями и источниками тарифов.',
  },
  {
    id: 'provider', title: 'Получить провайдера', method: 'GET', path: '/providers/{id}',
    description: 'Метод возвращает информацию об одном провайдере и его данных в каталоге.',
    parameters: [{name: 'id', type: 'string', required: true, description: 'Slug провайдера, например selectel или yandex-cloud.'}],
    returns: 'Метод возвращает объект Provider. Если провайдер с указанным slug не найден, API возвращает 404.',
  },
  {
    id: 'categories', title: 'Категории', method: 'GET', path: '/categories',
    description: 'Метод возвращает категории биллинговых SKU и число продуктов в каждой из них. Блочные диски относятся к категории compute, а объектное хранилище — к storage.',
    parameters: [], returns: 'Для каждой категории ответ содержит id, title и productCount.',
  },
  {
    id: 'services', title: 'Сервисы', method: 'GET', path: '/services',
    description: 'Справочник сервисов и типов тарифов, по которым можно фильтровать SKU. Сервисы отражают исходную структуру каталога; категории используются для группировки продуктов на сайте.',
    parameters: [], returns: 'Для каждого сервиса ответ содержит id, productCount, layers, categories и meters. Передавайте id в фильтр services, а типы ставок из meters — в фильтр meters. Например, сервис ai включает токены, ML-инфраструктуру и запросы классификации.',
  },
  {
    id: 'regions', title: 'Регионы', method: 'GET', path: '/regions',
    description: 'Метод возвращает исходные метки: страны, города, зоны, группы и области действия тарифов. Это не географическая иерархия: «—» означает неуказанное расположение, а «Все регионы» — исходную метку, а не поиск без ограничений.',
    parameters: [], returns: 'Ответ содержит label, code, codes и productCount. В codes — все распознанные коды в нижнем регистре; code заполнен только при одном коде. Например, «Россия / ru-1, ru-3, ru-7» содержит три кода и code: null. productCount считает SKU с точной меткой; фильтр по коду может вернуть больше SKU из нескольких меток. В Product аналогичный массив называется regionCodes.',
  },
  {
    id: 'estimates', title: 'Создать расчёт', method: 'POST', path: '/estimates', tool: 'create_estimate',
    description: 'Метод рассчитывает месячную стоимость конфигурации compute или GPU по провайдерам. Укажите минимально необходимые ресурсы, чтобы получить подобранную конфигурацию и стоимость каждого её компонента.',
    parameters: [
      {name: 'resource', type: 'object', required: true, description: 'Конфигурация compute или gpu с минимально необходимыми ресурсами. Фактические размеры могут быть больше указанных, но категориальные ограничения и регион сохраняются при подборе.'},
      {name: 'resource.type', type: 'enum', required: true, description: 'Тип конфигурации: compute для CPU и памяти или gpu для ресурсов с ускорителями.'},
      {name: 'resource.vcpu', type: 'integer', description: 'Число vCPU от 1 до 4096. Параметр обязателен для compute и необязателен для GPU со scope=instance.'},
      {name: 'resource.memoryGiB', type: 'number', description: 'Минимальный объём памяти в GiB. Параметр обязателен для compute; в конфигурации GPU он задаёт требуемую память хоста.'},
      {name: 'resource.disk', type: 'object', default: '100 GiB SSD', description: 'Параметры диска: размер sizeGiB и тип media со значением ssd или hdd. При scope=gpu_only диск, vcpu и память не передаются.'},
      {name: 'resource.gpuModel', type: 'string', description: 'Модель GPU, например L4 или H100. Параметр обязателен для GPU; при подборе физическая GPU не заменяется vGPU.'},
      {name: 'resource.gpuCount', type: 'integer', description: 'Минимальное число GPU. Параметр обязателен для GPU; фактическое количество ускорителей может быть больше запрошенного.'},
      {name: 'resource.scope', type: 'enum', default: 'instance', description: 'Состав расчёта для GPU: instance включает хост, а gpu_only учитывает только ускоритель.'},
      {name: 'resource.region', type: 'string', description: 'Точная метка или любой код из codes региона / regionCodes продукта; регистр кодов не важен. Для конфигураций GPU дополнительно можно задать interconnect. Параметр form требует явных данных о форм-факторе, которых в текущем каталоге нет.'},
      {name: 'resource.purchaseModel', type: 'enum', default: 'on-demand', description: 'Модель потребления: on-demand или preemptible. При подборе используется только указанная модель.'},
      {name: 'providers', type: 'string[]', description: 'Массив slug провайдеров, для которых нужно выполнить расчёт. Если параметр не задан, используются все провайдеры каталога.'},
      {name: 'period', type: 'enum', default: 'month', description: 'В v1 поддерживается только month: расчётный месяц составляет 720 часов.'},
      {name: 'addons', type: 'object', default: '0', description: 'Дополнительные ресурсы задаются полями publicIpCount, objectStorageGiB, internetEgressGiB и cdnEgressGiB. Если для их расчёта не хватает тарифных данных, предложение получает статус incomplete.'},
    ],
    returns: 'Объект Estimate содержит предложения quotes, подобранные конфигурации matchedResource, отличия differences, строки расчёта lineItems и сведения о покрытии coverage. В lowestPriceProviderIds входят провайдеры с минимальной стоимостью среди предложений со статусом priced; при равных итогах возвращаются все такие провайдеры.',
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
