export type Parameter = {name: string; type: string; description: string; required?: boolean; default?: string};
export type Endpoint = {
  id: string; title: string; method: 'GET' | 'POST'; path: string; description: string;
  tool?: string; parameters: Parameter[]; returns: string;
};

export const endpoints: Endpoint[] = [
  {
    id: 'products', title: 'Поиск продуктов', method: 'GET', path: '/products', tool: 'search_products',
    description: 'Метод позволяет искать биллинговые SKU по названию и характеристикам. Структурные фильтры ограничивают набор результатов, а текстовый запрос определяет порядок их отображения.',
    parameters: [
      {name: 'q', type: 'string', description: 'Текст для поиска по названию или характеристикам, например H100, SSD или vCPU. Если параметр не задан, продукты упорядочены по провайдеру и SKU.'},
      {name: 'providers', type: 'string[]', description: 'Slug провайдеров, по которым нужно отфильтровать результаты. В REST перечислите их через запятую, например selectel,vk-cloud, а в MCP передайте массив.'},
      {name: 'categories', type: 'string[]', description: 'Категории для фильтрации: compute, gpu, storage, network, cdn, kubernetes или ai.'},
      {name: 'regions', type: 'string[]', description: 'Метки или коды регионов из словаря регионов. Значения должны совпадать точно.'},
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
    id: 'regions', title: 'Регионы', method: 'GET', path: '/regions',
    description: 'Метод возвращает метки регионов из источников тарифов. Поле code содержит нормализованный код, если его удалось определить.',
    parameters: [], returns: 'Для каждого региона ответ содержит label, code и productCount. При фильтрации используйте точное значение label или code.',
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
      {name: 'resource.region', type: 'string', description: 'Точная метка или код региона из каталога. Для конфигураций GPU дополнительно можно задать ограничения form и interconnect.'},
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
