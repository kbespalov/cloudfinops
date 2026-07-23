export type NewsProviderId =
  | 'yandex-cloud'
  | 'vk-cloud'
  | 'cloud-ru'
  | 'selectel'
  | 'mws-cloud'
  | 't1-cloud'
  | 'aws'
  | 'azure'
  | 'google-cloud'
  | 'market';

export type NewsTag =
  | 'ai'
  | 'compute'
  | 'storage'
  | 'network'
  | 'kubernetes'
  | 'data'
  | 'security'
  | 'finops';

export type NewsItem = {
  id: string;
  date: string;
  provider: NewsProviderId;
  providerName: string;
  title: string;
  summary: string;
  tags: NewsTag[];
  sourceUrl: string;
  sourceLabel: string;
};

export const NEWS_PROVIDER_TITLE: Record<NewsProviderId, string> = {
  'yandex-cloud': 'Yandex Cloud',
  'vk-cloud': 'VK Cloud',
  'cloud-ru': 'Cloud.ru',
  selectel: 'Selectel',
  'mws-cloud': 'MWS Cloud',
  't1-cloud': 'T1 Cloud',
  aws: 'AWS',
  azure: 'Azure',
  'google-cloud': 'Google Cloud',
  market: 'Рынок РФ',
};

export const NEWS_TAG_TITLE: Record<NewsTag, string> = {
  ai: 'AI',
  compute: 'Compute',
  storage: 'Storage',
  network: 'Network',
  kubernetes: 'Kubernetes',
  data: 'Data',
  security: 'Security',
  finops: 'FinOps',
};

/** Curated industry feature news — start: June 2026. */
export const newsItems: NewsItem[] = [
  // ——— Yandex Cloud ———
  {
    id: 'yc-2026-06-intelligent-tiering',
    date: '2026-06-30',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'S3 Intelligent Tiering в Object Storage',
    summary:
      'Появился умный класс хранения: объекты сами переезжают между уровнями доступа в зависимости от того, как часто к ним обращаются. Это удобно для архивов и редко читаемых данных — не нужно вручную настраивать длинные lifecycle-правила, а стоимость хранения холодных объектов становится предсказуемее.',
    tags: ['storage', 'finops'],
    sourceUrl: 'https://yandex.cloud/ru/blog/digest-june-2026',
    sourceLabel: 'Дайджест Yandex Cloud · июнь 2026',
  },
  {
    id: 'yc-2026-06-master-autoscaler',
    date: '2026-06-30',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Master Autoscaler для Managed Kubernetes',
    summary:
      'Control plane Managed Kubernetes умеет автоматически подстраивать размер master-нод под нагрузку кластера. Меньше ручных оценок «хватит ли masters» при росте API-запросов и аддонов — кластер сам добирает ресурсы, когда это нужно.',
    tags: ['kubernetes'],
    sourceUrl: 'https://yandex.cloud/ru/blog/digest-june-2026',
    sourceLabel: 'Дайджест Yandex Cloud · июнь 2026',
  },
  {
    id: 'yc-2026-06-vibecraft',
    date: '2026-06-25',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Публичный доступ к Vibecraft',
    summary:
      'Сервис генерации сайтов и веб-приложений по текстовому описанию вышел из закрытой беты. Новым пользователям начисляют нейрокредиты на старт — можно быстро собрать прототип интерфейса и вынести его в облако, не начиная с пустого репозитория.',
    tags: ['ai'],
    sourceUrl: 'https://yandex.cloud/ru/blog/digest-june-2026',
    sourceLabel: 'Дайджест Yandex Cloud · июнь 2026',
  },
  {
    id: 'yc-2026-06-cloud-router',
    date: '2026-06-04',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Yandex Cloud Router + DNS-фильтры',
    summary:
      'В preview появился Cloud Router для маршрутизации между VPC, on-prem и BareMetal — проще строить гибридные схемы без зоопарка шлюзов. Параллельно в Cloud DNS добавили фильтры нежелательных FQDN: управлять списками можно через API, CLI и Terraform.',
    tags: ['network', 'security'],
    sourceUrl: 'https://yandex.cloud/ru/blog/yandex-cloud-router',
    sourceLabel: 'Блог Yandex Cloud',
  },
  // ——— Selectel ———
  {
    id: 'selectel-2026-06-ai-router',
    date: '2026-06-30',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'ИИ-роутер: 300+ моделей в одном окне',
    summary:
      'Единая точка доступа к сотням LLM: один API, квоты, аналитика, лимиты расходов и оплата в рублях; при недоступности поставщика есть переключение на резерв. Не нужно заводить отдельные кабинеты у каждого вендора моделей — удобно и для пилотов, и для контроля TCO.',
    tags: ['ai', 'finops'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },
  {
    id: 'selectel-2026-06-clickhouse',
    date: '2026-06-30',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'ClickHouse-as-a-service',
    summary:
      'Управляемый ClickHouse с шардированием, интеграцией с S3/Iceberg, веб-интерфейсом и аудитом. Подходит для логов, продуктовой аналитики и lakehouse-сценариев — меньше времени на эксплуатацию СУБД, больше на запросы и модели данных.',
    tags: ['data'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },
  {
    id: 'selectel-2026-06-s3-ru6',
    date: '2026-06-30',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'S3-регион ru-6 Multi-AZ',
    summary:
      'Запущен первый Multi-AZ регион объектного хранилища: три реплики в разных дата-центрах Москвы, классы Standard и Cold. Для критичных данных это проще путь к отказоустойчивости без самостоятельной репликации между площадками.',
    tags: ['storage'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },
  {
    id: 'selectel-2026-06-new-ip',
    date: '2026-06-30',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Новый тип публичного IP в облаке',
    summary:
      'В сетевых опциях облака появился дополнительный тип публичного IP. Так проще разделять сценарии direct / floating / reserved и планировать стоимость и привязку адресов к сервисам без лишней путаницы в схеме.',
    tags: ['network'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },
  {
    id: 'selectel-2026-06-envoy-gateway',
    date: '2026-06-30',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Envoy Gateway в Managed Kubernetes',
    summary:
      'В каталог приложений Managed Kubernetes добавили Envoy Gateway — практичный шаг к Gateway API. Командам, которые ещё сидят на Ingress NGINX, проще начать миграцию на более современную модель маршрутизации трафика в кластере.',
    tags: ['kubernetes', 'network'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },
  // ——— Cloud.ru ———
  {
    id: 'cloudru-2026-05-managed-rag',
    date: '2026-05-20',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Evolution Managed RAG и AI Agents',
    summary:
      'В Evolution появились управляемый RAG и AI Agents — можно быстрее собирать корпоративные ИИ-сценарии на платформе, не поднимая с нуля векторное хранилище, оркестрацию и обвязку агентов. Хорошая точка входа для пилотов внутри периметра облака.',
    tags: ['ai'],
    sourceUrl: 'https://habr.com/ru/companies/cloud_ru/posts/1048026/',
    sourceLabel: 'Хабр · дайджест Cloud.ru за май 2026',
  },
  {
    id: 'cloudru-2026-05-managed-clickhouse',
    date: '2026-05-20',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Evolution Managed ClickHouse',
    summary:
      'Управляемый ClickHouse вошёл в линейку Evolution: аналитика событий и озёр данных ближе к остальным managed-сервисам платформы. Меньше работы с кластером «на руках», проще связать поток данных с уже привычными инструментами Evolution.',
    tags: ['data'],
    sourceUrl: 'https://habr.com/ru/companies/cloud_ru/posts/1048026/',
    sourceLabel: 'Хабр · дайджест Cloud.ru за май 2026',
  },
  {
    id: 'cloudru-2026-06-multicloud-mws',
    date: '2026-05-19',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Мультиоблачная связь с MWS Cloud',
    summary:
      'Прямая сетевая связность Cloud.ru ↔ MWS Cloud (и Beeline Cloud): выделенный канал между облаками для DR, обмена данными и мультиоблачных архитектур. На старте подключение идёт через поддержку — полезно закладывать в архитектуру, если площадки уже распределены.',
    tags: ['network'],
    sourceUrl:
      'https://www.comnews.ru/content/245355/2026-05-19/2026-w21/1018/cloudru-anonsiroval-servis-multioblachnoy-svyazi-c-mws-cloud-i-beeline-cloud',
    sourceLabel: 'ComNews · анонс Cloud.ru',
  },

  // ——— MWS ———
  {
    id: 'mws-2026-06-local-nvme',
    date: '2026-06-20',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'Локальные NVMe-диски для ВМ',
    summary:
      'Для виртуальных машин доступны временные локальные NVMe на хосте — выше IOPS и ниже latency, чем у сетевых дисков. Хорошо заходят кэши, scratch, сборки и другие нагрузки, где данные не обязаны переживать переезд ВМ.',
    tags: ['compute', 'storage'],
    sourceUrl: 'https://habr.com/ru/amp/publications/1050872/',
    sourceLabel: 'Дайджест MWS Cloud Platform',
  },
  {
    id: 'mws-2026-06-gpt-oss',
    date: '2026-06-20',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'LLM gpt-oss-120b в GPT Model Hub',
    summary:
      'В каталоге моделей появилась gpt-oss-120b (120B параметров) в GA. Можно подключать через API для ассистентов, суммаризации и внутренних инструментов — ещё один вариант крупной открытой модели рядом с остальным стеком платформы.',
    tags: ['ai'],
    sourceUrl: 'https://habr.com/ru/amp/publications/1050872/',
    sourceLabel: 'Дайджест MWS Cloud Platform',
  },

  // ——— VK Cloud ———
  {
    id: 'vk-2026-06-secure-cloud-kii',
    date: '2026-06-17',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'VK Secure Cloud аттестован для ЗОКИИ',
    summary:
      'Площадка получила аттестат для размещения значимых объектов КИИ до 1-й категории, а также ГИС К1 и ИСПДн УЗ1 на российской платформе VK Tech. Для команд с жёсткими требованиями по контуру это снимает часть вопросов при выборе защищённого облака.',
    tags: ['security'],
    sourceUrl: 'https://www.cnews.ru/news/line/2026-06-17_vk_tech_attestoval_vk_secure_cloud',
    sourceLabel: 'CNews / VK Tech',
  },
  {
    id: 'vk-2026-06-object-versioning',
    date: '2026-06-03',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'Версионирование объектов в VK Object Storage',
    summary:
      'В S3-совместимом хранилище появилось версионирование: каждое изменение объекта сохраняется, можно откатиться после перезаписи или удаления. В связке с Object Lock (WORM) закрывает типичный набор для корпоративных бэкапов и требований к восстановлению данных.',
    tags: ['storage', 'security'],
    sourceUrl: 'https://cloud.vk.com/blog/versionirovanie-obektov-v-vk-object-storage/',
    sourceLabel: 'Блог VK Cloud',
  },
  {
    id: 'vk-2026-06-static-site-hosting',
    date: '2026-06-01',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'Хостинг статических сайтов в Object Storage',
    summary:
      'Бакет можно перевести в режим static site hosting: index/error-страницы, routing rules и отдельный website-endpoint вида hb-website.*. Подходит для лендингов, документации и простых SPA без отдельного веб-сервера; свой домен и SSL — через панель и поддержку.',
    tags: ['storage'],
    sourceUrl: 'https://cloud.vk.com/docs/ru/storage/s3/concepts/static-site-hosting',
    sourceLabel: 'Документация VK Cloud · Object Storage',
  },

  // ——— AWS ———
  {
    id: 'aws-2026-06-lambda-microvms',
    date: '2026-06-24',
    provider: 'aws',
    providerName: 'AWS',
    title: 'AWS Lambda MicroVMs',
    summary:
      'Новый serverless-примитив с VM-изоляцией на Firecracker: быстрый resume и stateful suspend до нескольких часов. Интересен для песочниц, AI-generated code и сценариев, где нужна изоляция сильнее обычных Lambda execution environments.',
    tags: ['compute', 'ai'],
    sourceUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/06/aws-lambda-microvms/',
    sourceLabel: 'AWS What’s New',
  },
  {
    id: 'aws-2026-06-cost-anomaly',
    date: '2026-06-18',
    provider: 'aws',
    providerName: 'AWS',
    title: 'Расширения Cost Anomaly Detection',
    summary:
      'В линейке FinOps-инструментов AWS обновили обнаружение аномалий затрат: точнее ловить всплески по сервисам и аккаунтам. Полезно сравнивать с тем, как вы уже режете bill в CUR / Cost Explorer и алертите команды.',
    tags: ['finops'],
    sourceUrl: 'https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/',
    sourceLabel: 'AWS Cost Management',
  },

  // ——— Azure ———
  {
    id: 'azure-2026-06-aks-bare-metal',
    date: '2026-06-15',
    provider: 'azure',
    providerName: 'Azure',
    title: 'AKS on Bare Metal (preview)',
    summary:
      'Kubernetes без гипервизора с прямым доступом к NVLink/RDMA — для AI training и inference на AKS. Анонсы Build 2026 активно обсуждали в июне: имеет смысл смотреть, если упираетесь в накладные расходы виртуализации на GPU-нодах.',
    tags: ['kubernetes', 'ai', 'compute'],
    sourceUrl: 'https://www.infoq.com/news/2026/06/microsoft-build-aks-ai/',
    sourceLabel: 'InfoQ / Microsoft Build',
  },

  // ——— Google Cloud ———
  {
    id: 'gcp-2026-06-network-insights',
    date: '2026-06-17',
    provider: 'google-cloud',
    providerName: 'Google Cloud',
    title: 'Cloud Network Insights GA',
    summary:
      'Сквозная наблюдаемость сети в multi-cloud и hybrid: synthetic probing, hop-by-hop диагностика и связка с Gemini Cloud Assist. Помогает быстрее находить, где именно «теряется» путь между облаками и on-prem.',
    tags: ['network'],
    sourceUrl:
      'https://cloud.google.com/blog/products/networking/cloud-network-insights-end-to-end-cross-cloud-observability',
    sourceLabel: 'Google Cloud Blog',
  },
  {
    id: 'gcp-2026-06-python-udf',
    date: '2026-06-22',
    provider: 'google-cloud',
    providerName: 'Google Cloud',
    title: 'BigQuery Managed Python UDF — GA',
    summary:
      'Кастомный Python внутри BigQuery дошёл до GA: vectorized PyArrow, до 16 GB / 4 vCPU на функцию, метрики в Cloud Monitoring. Аналитикам проще держать логику рядом с данными, не вынося каждый шаг во внешний сервис.',
    tags: ['data'],
    sourceUrl:
      'https://cloud.google.com/blog/products/data-analytics/python-udf-in-bigquery-now-generally-available',
    sourceLabel: 'Google Cloud Blog',
  },
  {
    id: 'gcp-2026-06-gke-autopilot',
    date: '2026-06-12',
    provider: 'google-cloud',
    providerName: 'Google Cloud',
    title: 'GKE Autopilot: плотнее packing и FinOps-метрики',
    summary:
      'В Autopilot продолжают улучшать утилизацию узлов и прозрачность стоимости workloads. Для сравнения с Managed Kubernetes у российских провайдеров полезно смотреть не только $/vCPU, но и то, как платформа показывает фактическое потребление.',
    tags: ['kubernetes', 'finops'],
    sourceUrl: 'https://cloud.google.com/blog/products/containers-kubernetes',
    sourceLabel: 'Google Cloud Blog · Containers',
  },

  // ——— Май 2026 ———
  {
    id: 'yc-2026-05-alice-ai-art',
    date: '2026-05-28',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Обновлённая Alice AI ART в Yandex AI Studio',
    summary:
      'В майском продуктовом дайджесте — выпуск обновлённой модели Alice AI ART и другие релизы AI Studio. Имеет смысл сверять с пилотами генерации изображений и тем, какие квоты/тарифы действуют после индексации цен мая.',
    tags: ['ai'],
    sourceUrl: 'https://yandex.cloud/ru/blog/digest-may-2026',
    sourceLabel: 'Дайджест Yandex Cloud · май 2026',
  },
  {
    id: 'yc-2026-05-pricing-update',
    date: '2026-05-01',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Изменение цен на ряд сервисов Yandex Cloud с 1 мая',
    summary:
      'Официальный анонс индексации: для большинства сервисов +5–8%, часть позиций до ~10%. AI Studio и некоторые security-сервисы без изменений; для действующих CVoS сохранены прежние условия. Обязательный материал для FinOps-сверки бюджетов и каталога SKU.',
    tags: ['finops'],
    sourceUrl: 'https://yandex.cloud/en/blog/pricing-update-2026',
    sourceLabel: 'Блог Yandex Cloud · Pricing update 2026',
  },
  {
    id: 'yc-2026-05-datalens',
    date: '2026-05-20',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'DataLens: релизы мая — рассылки и коннектор StarRocks',
    summary:
      'В release notes DataLens за май — рассылки дашбордов по расписанию и нативный коннектор к StarRocks. Для аналитических команд это меньше ручной выгрузки отчётов и проще связать BI с актуальными OLAP-источниками в облаке.',
    tags: ['data'],
    sourceUrl: 'https://yandex.cloud/ru/docs/datalens/release-notes/',
    sourceLabel: 'Документация Yandex Cloud · DataLens',
  },
  {
    id: 'selectel-2026-05-fmc-models',
    date: '2026-05-25',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Foundation Models Catalog: ASR, OCR, RAG и новые LLM',
    summary:
      'В FMC расширили набор моделей: транскрибация, OCR, RAG-поиск, embedding/rerank и ряд LLM (в т.ч. gpt-oss-120b, Qwen, Gemma). Можно закрывать больше AI-сценариев из одного каталога — с прицелом на скорость внедрения без разрозненных контрактов.',
    tags: ['ai'],
    sourceUrl: 'https://selectel.ru/blog/digest26-05/',
    sourceLabel: 'Дайджест Selectel · май 2026',
  },
  {
    id: 'selectel-2026-05-selectos-patches',
    date: '2026-05-25',
    provider: 'selectel',
    providerName: 'Selectel',
    title: '18 патчей безопасности в SELECTOS',
    summary:
      'Закрыли критичные CVE в ядре Linux (в т.ч. связанные со страничным кэшем и получением root). Плюс qcow2-образ SELECTOS, заточенный под облачные ВМ. Для security- и platform-команд — сигнал, что ОС провайдера обновляется оперативно.',
    tags: ['security', 'compute'],
    sourceUrl: 'https://selectel.ru/blog/digest26-05/',
    sourceLabel: 'Дайджест Selectel · май 2026',
  },
  {
    id: 'selectel-2026-05-k8s-multiaz',
    date: '2026-05-25',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Катастрофоустойчивый Managed Kubernetes в ru-6',
    summary:
      'Мультизональный кластер: master и worker-ноды разнесены по разным ДЦ, кластер остаётся доступным при отказе одной площадки. Имеет смысл закладывать в DR-архитектуру и сравнивать с single-AZ по стоимости control plane и нод.',
    tags: ['kubernetes'],
    sourceUrl: 'https://selectel.ru/blog/digest26-05/',
    sourceLabel: 'Дайджест Selectel · май 2026',
  },
  {
    id: 'selectel-2026-05-gpu-ru6',
    date: '2026-05-25',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Новые GPU в зоне ru-6a: H200, RTX, L4',
    summary:
      'В ru-6a расширили GPU-линейку: H200 141 ГБ, RTX 6000 Pro, RTX 4090 и L4. Для обучения и инференса появляется больше вариантов по памяти и цене — удобно сверять с каталогом SKU и планами по AI-нагрузкам.',
    tags: ['ai', 'compute'],
    sourceUrl: 'https://selectel.ru/blog/digest26-05/',
    sourceLabel: 'Дайджест Selectel · май 2026',
  },
  {
    id: 'cloudru-2026-05-ai-factory-models',
    date: '2026-05-20',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Evolution Foundation Models: GLM, Kimi, DeepSeek',
    summary:
      'В AI Factory появились новые модели (GLM-5.1, Kimi K2.6, DeepSeek V4 Pro), а Managed RAG научился глубже сканировать источники знаний. Плюс точечные улучшения Load Balancer, Data Platform и Terraform — детали в майском дайджесте на Хабре.',
    tags: ['ai'],
    sourceUrl: 'https://habr.com/ru/companies/cloud_ru/posts/1048026/',
    sourceLabel: 'Хабр · дайджест Cloud.ru за май 2026',
  },
  {
    id: 'cloudru-2026-05-cost-controls',
    date: '2026-05-20',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Оплата и контроль затрат в Evolution',
    summary:
      'В майском дайджесте — блок про оплату и контроль затрат наряду с остановкой/возобновлением инстансов Data Platform для экономии. Полезно, если настраиваете FinOps-процессы именно на Evolution, а не только смотрите прайс VM.',
    tags: ['finops'],
    sourceUrl: 'https://habr.com/ru/companies/cloud_ru/posts/1048026/',
    sourceLabel: 'Хабр · дайджест Cloud.ru за май 2026',
  },
  {
    id: 'mws-2026-05-new-az',
    date: '2026-05-25',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'Новые зоны доступности в Москве и Новосибирске',
    summary:
      'До конца 2026 MWS Cloud планирует третью AZ в Москве и площадку в Новосибирске — больше вариантов для multi-AZ и размещения ближе к пользователям в Сибири. Важно для архитектуры отказоустойчивости и оценки сетевой latency/стоимости трафика.',
    tags: ['network', 'compute'],
    sourceUrl: 'https://www.cnews.ru/news/line/2026-05-25_mws_cloud_zapustit_novye_zony',
    sourceLabel: 'CNews / MWS Cloud',
  },
  {
    id: 'azure-2026-05-windows-2025-acl',
    date: '2026-05-29',
    provider: 'azure',
    providerName: 'Azure',
    title: 'AKS: Windows Server 2025 и Azure Container Linux GA',
    summary:
      'В релизе AKS 2026-05-29 Windows Server 2025 node pools стали GA без feature flag, Azure Container Linux — GA OS option с v1.34. Проще стандартизировать worker nodes и планировать миграции OS SKU в корпоративных кластерах.',
    tags: ['kubernetes', 'security'],
    sourceUrl: 'https://github.com/Azure/AKS/releases/tag/2026-05-29',
    sourceLabel: 'Azure AKS release notes · 2026-05-29',
  },

  // ——— Июль 2026 ———
  {
    id: 'selectel-2026-07-dbaas-multiaz',
    date: '2026-07-23',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Multi-AZ кластеры DBaaS в ru-6',
    summary:
      'В геораспределённом регионе ru-6 (три независимых AZ на 10–15 км, связность до 10 Гбит/с) доступны отказоустойчивые кластеры облачных БД: PostgreSQL, MySQL, Redis, TimescaleDB и ClickHouse. При репликах ноды гарантированно разносятся по дата-центрам — по модели AWS Multi-AZ. Вместе с уже анонсированными S3 и Managed Kubernetes в ru-6 это закрывает типичный DR-контур «хранилище + K8s + БД» без самостоятельной репликации между площадками; имеет смысл закладывать в TCO разницу single-AZ vs multi-AZ.',
    tags: ['data', 'finops'],
    sourceUrl: 'https://selectel.ru/blog/multiaz-dbaas/',
    sourceLabel: 'Академия Selectel',
  },
  {
    id: 'market-2026-07-vera-rubin-deploy',
    date: '2026-07-22',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Vera Rubin NVL72 начинает деплой у облаков',
    summary:
      'NVIDIA сообщает, что производство Vera Rubin NVL72 выходит на полный ход: стойки уже работают у CoreWeave, Google Cloud, Microsoft Azure и Oracle Cloud. CoreWeave на живом железе показал ~10× больше tokens/s на мегаватт, чем Grace Blackwell NVL72 (бенчмарк DeepSeek-R1) — метрика, по которой сейчас считают экономику AI-фабрик. У Google Cloud запущен первый bare-metal инстанс A5X на Rubin + Virgo; параллельно в AI-фабрики идут коммутаторы Spectrum-6. Для рынка это сигнал: поколение после Blackwell уже не слайд, а ранний деплой — ждать сдвига $/token и $/MW.',
    tags: ['ai', 'compute', 'finops'],
    sourceUrl: 'https://blogs.nvidia.com/blog/vera-rubin/',
    sourceLabel: 'NVIDIA Blog · Vera Rubin',
  },
  {
    id: 'gcp-2026-07-gemini-flash-36',
    date: '2026-07-21',
    provider: 'google-cloud',
    providerName: 'Google Cloud',
    title: 'Gemini 3.6 Flash, 3.5 Flash-Lite и Flash Cyber',
    summary:
      'Google выпустил три модели Flash-линейки для production-агентов: 3.6 Flash — workhorse с лучшим coding/multimodal и ~17% меньшей выдачей токенов при более низкой цене ($1.50 / $7.50 за 1M); 3.5 Flash-Lite — самый быстрый и дешёвый в классе 3.5 (~350 tok/s, $0.30 / $2.50 за 1M); 3.5 Flash Cyber — узкая модель под поиск и патчи уязвимостей в CodeMender, пока только governments и trusted partners. 3.5 Pro всё ещё в тестах с партнёрами; параллельно стартовал pre-training Gemini 4. 3.6 Flash и Flash-Lite доступны в Gemini API, AI Studio и Gemini Enterprise.',
    tags: ['ai', 'finops', 'security'],
    sourceUrl:
      'https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/',
    sourceLabel: 'Google Blog · Gemini',
  },
  {
    id: 'market-2026-07-qwen-image-30',
    date: '2026-07-21',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Вышла Qwen-Image-3.0',
    summary:
      'Команда Qwen (Alibaba) представила третье поколение модели генерации изображений. Фокус — на «полезных» картинках для работы: плотные layouts, инфографика, UI-макеты, мелкий текст и мультиязычный рендер. Доступ пока через Qwen Chat / Studio; открытых весов в анонсе нет.',
    tags: ['ai'],
    sourceUrl: 'https://qwen.ai/blog?id=qwen-image-3.0',
    sourceLabel: 'Qwen Blog',
  },
  {
    id: 'cloudru-2026-07-guardrails-oss',
    date: '2026-07-20',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Open-source Guardrails Filter для LLM',
    summary:
      'Cloud.ru открыл исходный код Guardrails Filter — прокси между приложением и языковой моделью, который маскирует PII, API-ключи и пароли до инференса и восстанавливает их в ответе. Версии Standalone и ExtProc (Envoy) можно развернуть в своём контуре с моделями любых провайдеров; уже используется в AI Factory / Foundation Models. На pii-bench заявлены F1 93,1 и точность срабатываний 99,9%.',
    tags: ['ai', 'security'],
    sourceUrl:
      'https://www.comnews.ru/content/246472/2026-07-20/2026-w30/1018/cloudru-otkryl-iskhodnyy-kod-guardrails-filter-instrumenta-dlya-bezopasnoy-raboty-ii-modelyami',
    sourceLabel: 'ComNews / Cloud.ru',
  },
  {
    id: 'market-2026-07-cloudfinops-llm-calculator',
    date: '2026-07-20',
    provider: 'market',
    providerName: 'Cloud FinOps',
    title: 'Калькулятор self-host LLM: расчёт GPU под инференс моделей',
    summary:
      'В Cloud FinOps появился калькулятор хостинга LLM: можно подобрать GPU-инфраструктуру под open-weight модели (Qwen, Llama 4, DeepSeek R1, GLM, gpt-oss, Devstral и др.) и сразу сравнить аренду узлов в облаках РФ — H100, H200, A100, L40S, L4, B300. Для каждой модели есть ориентир по VRAM, кванту и числу карт, плюс рядом — Hosted API в ₽/1M токенов, если он есть в каталоге. Считать инфраструктуру под инференс можно в разделе «Калькулятор → Self-host LLM».',
    tags: ['ai', 'compute', 'finops'],
    sourceUrl: 'https://cloudfinops.ru/calculator/self-host',
    sourceLabel: 'Cloud FinOps · калькулятор Self-host LLM',
  },
  {
    id: 'market-2026-07-kimi-k3-pause-subs',
    date: '2026-07-19',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Moonshot временно остановила новые подписки Kimi из‑за спроса на K3',
    summary:
      'После релиза Kimi K3 спрос за ~48 часов приблизил GPU Moonshot к пределу мощности: новые подписки временно приостановлены, приоритет вычислений — у действующих участников (их доступ не режут). Мощности наращивают и обещают открывать места партиями. Параллельно членство разделят на Kimi Membership (Web/App/Work) и Kimi Code Membership — чтобы точнее распределять compute. Для рынка это сигнал: даже сильный frontier упирается в ёмкость инференса; в РФ уже хостят предыдущее поколение (Kimi K2.6) у MWS и Cloud.ru.',
    tags: ['ai', 'compute', 'finops'],
    sourceUrl: 'https://twitter.com/kimi_moonshot/status/2078855608565207130',
    sourceLabel: 'Kimi Moonshot · X',
  },
  {
    id: 'market-2026-07-qwen-38',
    date: '2026-07-19',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Alibaba анонсировала Qwen3.8 — 2,4T параметров, open-weight скоро',
    summary:
      '19 июля команда Qwen (Alibaba) сообщила о выходе Qwen3.8: ~2,4 трлн параметров, формальный релиз и open-weight — «в ближайшее время». Preview Qwen3.8-Max уже в Token Plan, Qoder и QoderWork (есть промо на credits; планы Individual/Team, совместимость с OpenAI/Anthropic-тулами). Вендор позиционирует модель как frontier, «вторую после Fable 5» — без опубликованных независимых бенчмарков. Сравнивать логично с Claude Fable 5, GPT-5.6 Sol, Kimi K3 (2,8T, веса к 27.07) и GLM 5.2; в РФ уже есть инференс предыдущего поколения Qwen (MWS и др.).',
    tags: ['ai'],
    sourceUrl: 'https://www.yicai.com/news/103281471.html',
    sourceLabel: '第一财经 / Yicai',
  },
  {
    id: 'mws-2026-07-glm-52',
    date: '2026-07-17',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'GLM 5.2 в GPT Model Hub: инференс в российском контуре',
    summary:
      'MWS Cloud первой в России развернула GLM 5.2 (Z.AI) на собственных GPU: запросы обрабатываются внутри MWS Cloud Platform и не уходят разработчику модели. Вместе с обновлением каталога доступны Kimi K2.6, Qwen 3.6, Gemma 4 и другие LLM через OpenAI-совместимый API — удобно сравнивать TCO инференса без своей GPU-фермы.',
    tags: ['ai', 'finops'],
    sourceUrl:
      'https://mws.ru/news/mws-cloud-pervoj-v-rossii-razvernula-glm-5-2-v-sobstvennom-oblake/',
    sourceLabel: 'Новости MWS',
  },
  {
    id: 'market-2026-07-kimi-k3',
    date: '2026-07-16',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Moonshot выпустила Kimi K3 — open frontier на 2,8T параметров',
    summary:
      'Kimi K3: multimodal MoE ~2,8 трлн параметров, контекст до 1M токенов, доступ через kimi.com и API (`kimi-k3`). Полные веса обещают к 27 июля 2026. Для облачного рынка это сигнал к гонке инференса крупных open-моделей — в РФ уже есть хостинг предыдущего поколения (Kimi K2.6) у MWS и Cloud.ru.',
    tags: ['ai'],
    sourceUrl: 'https://www.kimi.com/blog/kimi-k3',
    sourceLabel: 'Kimi Blog · Moonshot AI',
  },
  {
    id: 'yc-2026-07-ai-studio-agents',
    date: '2026-07-14',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'ИИ-агенты-исследователи в Yandex AI Studio',
    summary:
      'В AI Studio усилили Web Search: бизнес может собирать агентов, которые сами ищут источники, анализируют материалы и готовят структурированный ответ — от быстрого мониторинга до глубокого разбора. Полезно для внутренних research-пайплайнов рядом с остальным стеком Yandex B2B Tech.',
    tags: ['ai'],
    sourceUrl:
      'https://www.comnews.ru/content/246396/2026-07-14/2026-w29/1009/yandeks-otkryl-biznesu-dostup-k-sozdaniyu-agentov-issledovateley',
    sourceLabel: 'ComNews / Yandex B2B Tech',
  },
  {
    id: 'selectel-2026-07-fstec-117',
    date: '2026-07-07',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Аттестат ФСТЭК по приказу №117 (К1)',
    summary:
      'Selectel первым публично подтвердил соответствие обновлённым требованиям приказа ФСТЭК №117: облако готово к размещению ИС первого класса защищённости (К1). Для ГИС и подрядчиков госсектора это упрощает выбор контура и ускоряет собственную аттестацию заказчика.',
    tags: ['security'],
    sourceUrl: 'https://selectel.ru/blog/new-fstec-standards/',
    sourceLabel: 'Блог Selectel',
  },
  {
    id: 'vk-2026-07-gpu-operator',
    date: '2026-07-08',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'GPU Operator в Managed Kubernetes',
    summary:
      'Аддон для кластеров второго поколения ставит NVIDIA GPU Operator без ручной настройки драйверов и device plugin на каждой ноде. После включения кластер готов принимать поды с nvidia.com/gpu — удобно для обучения, инференса и рендеринга в привычном K8s-контуре.',
    tags: ['kubernetes', 'ai', 'compute'],
    sourceUrl:
      'https://cloud.vk.com/blog/gpu-operator-v-managed-kubernetes-zapusk-gpu-vichislenii-bez-ruchnoi-nastroiki-draiverov/',
    sourceLabel: 'Блог VK Cloud',
  },
  {
    id: 'vk-2026-07-argo-cd',
    date: '2026-07-07',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'Argo CD как аддон Managed Kubernetes',
    summary:
      'GitOps из панели: Argo CD подключается аддоном, желаемое состояние живёт в Git, а контроллер синхронизирует кластер. Меньше дрейфа от ручных kubectl и проще единый путь релизов для test/stage/prod без сборки CD-стека с нуля.',
    tags: ['kubernetes'],
    sourceUrl:
      'https://cloud.vk.com/blog/argo-cd-v-managed-kubernetes-avtomatizatsiya-relizov-po-gitops/',
    sourceLabel: 'Блог VK Cloud',
  },
  {
    id: 'vk-2026-07-external-secrets-operator',
    date: '2026-07-01',
    provider: 'vk-cloud',
    providerName: 'VK Cloud',
    title: 'External Secrets Operator в Managed Kubernetes',
    summary:
      'Аддон ESO синхронизирует секреты из менеджера секретов VK Cloud в обычные Kubernetes Secret: SecretStore + ExternalSecret, периодический refresh. Секреты не лежат в Git и не копируются руками в кластер — удобно для GitOps рядом с Argo CD.',
    tags: ['kubernetes', 'security'],
    sourceUrl:
      'https://cloud.vk.com/docs/ru/kubernetes/k8s/how-to-guides/external-secrets-operator',
    sourceLabel: 'Документация VK Cloud · Cloud Containers',
  },
  {
    id: 'cloudru-2026-07-airflow-flink',
    date: '2026-07-06',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Managed Airflow GA и Managed Flink в публичном тесте',
    summary:
      'Evolution Data Platform: Managed Airflow вышел в коммерческую эксплуатацию, Managed Flink — в public preview. Можно собирать пайплайны от потока до аналитики в одном контуре (Flink → Spark → ArenadataDB → BI) без своего «зоопарка» оркестраторов.',
    tags: ['data'],
    sourceUrl: 'https://www.cnews.ru/news/line/2026-07-06_cloudru_dobavil_novye_servisy',
    sourceLabel: 'CNews / Cloud.ru',
  },
  {
    id: 'mws-2026-07-fast-s3-ml',
    date: '2026-07-02',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'Быстрый «тёплый» класс S3 для ML-нагрузок',
    summary:
      'Object Storage на NVMe: до ~1,8 ГиБ/с и TTFB около 20 мс по данным провайдера, совместимость с S3 API, lifecycle и версионирование. Для датасетов и feature store это другой профиль latency/цены, чем у холодного object storage — стоит заложить в модель стоимости.',
    tags: ['storage', 'ai', 'finops'],
    sourceUrl:
      'https://mws.ru/news/mws-cloud-zapustila-samoe-bystroe-s3-hranilishhe-na-rynke-dlya-ml-zadach/',
    sourceLabel: 'Новости MWS',
  },
  {
    id: 'aws-2026-07-bedrock-gpt56',
    date: '2026-07-13',
    provider: 'aws',
    providerName: 'AWS',
    title: 'OpenAI GPT-5.6 Sol / Terra / Luna в Amazon Bedrock',
    summary:
      'Семейство GPT-5.6 доступно в Bedrock: Sol для сложных agentic-задач, Terra как баланс цена/качество, Luna для дешёвого быстрого инференса. Есть prompt caching со скидкой на повторный контекст — прямой FinOps-рычаг для agent-пайплайнов.',
    tags: ['ai', 'finops'],
    sourceUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/07/openai-gpt-sol-terra/',
    sourceLabel: 'AWS What’s New',
  },
  {
    id: 'aws-2026-07-lambda-s3-code',
    date: '2026-07-15',
    provider: 'aws',
    providerName: 'AWS',
    title: 'Lambda: код из своего S3 без копирования',
    summary:
      'Self-managed code storage: Lambda ссылается на пакет в вашем S3 bucket (режим REFERENCE), не копируя его в свой лимит хранилища. Дефолтный лимит Lambda-managed storage подняли до 300 ГБ/регион — меньше квот-тикетов и проще единый source of truth для деплоев.',
    tags: ['compute', 'finops'],
    sourceUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/07/lambda-self-managed-code-storage/',
    sourceLabel: 'AWS What’s New',
  },
  {
    id: 'aws-2026-06-ec2-g7',
    date: '2026-06-18',
    provider: 'aws',
    providerName: 'AWS',
    title: 'EC2 G7 на NVIDIA RTX PRO 4500 Blackwell GA',
    summary:
      'Новое поколение GPU-инстансов для inference и графики: до 8× RTX PRO 4500 Blackwell, On-Demand / Savings Plans / Spot. Для сравнения с H100/L4 у российских провайдеров — другой сегмент, но полезный ориентир по цене inference и Spot-экономии.',
    tags: ['compute', 'ai'],
    sourceUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-ec2-g7-generally-available/',
    sourceLabel: 'AWS What’s New',
  },
  {
    id: 'gcp-2026-06-conversational-analytics',
    date: '2026-06-30',
    provider: 'google-cloud',
    providerName: 'Google Cloud',
    title: 'Conversational Analytics в BigQuery — GA',
    summary:
      'Аналитика на естественном языке прямо в BigQuery стала GA: multi-step разбор, визуализации и наследование governance/биллинга BigQuery. Есть лимиты вроде max billed bytes для агента — важный FinOps-контроль, чтобы «спросить данные» не раздувало счет.',
    tags: ['data', 'finops', 'ai'],
    sourceUrl:
      'https://cloud.google.com/blog/products/data-analytics/conversational-analytics-in-bigquery-now-ga',
    sourceLabel: 'Google Cloud Blog',
  },

  // ——— FinOps / рынок РФ ———
  {
    id: 'market-2026-06-cloud-prices-habr',
    date: '2026-06-05',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Облака в России дорожают: НДС, железо и новые прайсы',
    summary:
      'Разбор на Хабре: рост тарифов Yandex Cloud с мая 2026, влияние ставки НДС 22% и удорожания оборудования. Полезно как фон для сравнения SKU и планирования бюджетов — не только «какая ВМ дешевле», но и куда двигается рынок в целом.',
    tags: ['finops'],
    sourceUrl: 'https://habr.com/ru/companies/x-com/articles/1035500/',
    sourceLabel: 'Хабр · X-Com',
  },
  {
    id: 'selectel-2026-finops-overview',
    date: '2026-06-10',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'FinOps на практике: как оптимизировать расходы в облаке',
    summary:
      'Обзорный материал Selectel про разумное потребление: от тегирования и квот до прерываемых ВМ со скидкой до 75%. Хорошая шпаргалка, если внедряете FinOps-процессы и хотите связать технические рычаги с финансовой дисциплиной команд.',
    tags: ['finops', 'compute'],
    sourceUrl: 'https://selectel.ru/blog/finops-overview/',
    sourceLabel: 'Блог Selectel',
  },
  {
    id: 'selectel-2026-07-price-update',
    date: '2026-06-20',
    provider: 'selectel',
    providerName: 'Selectel',
    title: 'Selectel обновляет цены с 1 июля 2026',
    summary:
      'Официальный файл с изменениями тарифов: выделенные серверы и ряд доп. услуг индексируются (частично на 10% и выше). Имеет смысл сверить с вашим каталогом SKU и контрактом до даты вступления — особенно GPU- и bare-metal линейки.',
    tags: ['finops'],
    sourceUrl: 'https://files.selectel.ru/docs/ru/Selectel_Prices_010726.pdf',
    sourceLabel: 'Selectel · PDF с ценами',
  },
  {
    id: 'market-2026-q1-finops-migrations',
    date: '2026-04-15',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Cloud Native Q1 2026: FinOps и завершение миграций',
    summary:
      'Обзор рынка: рост облаков при давлении на средний чек, доля FinOps-аудитов у крупного бизнеса, GPU как новая статья бюджета. Есть сравнительная картинка по Cloud.ru, MWS, Yandex Cloud, Selectel и VK Cloud — удобно как контекст к каталогу цен.',
    tags: ['finops'],
    sourceUrl:
      'https://it-institute.ru/oblaka-infrastruktura/cloud-native-rossiya-q1-2026-finops-migracziya/',
    sourceLabel: 'IT Institute',
  },
  {
    id: 'market-2026-01-comnews-growth',
    date: '2026-01-12',
    provider: 'market',
    providerName: 'Рынок РФ',
    title: 'Рынок облачных сервисов в 2026 продолжит рост',
    summary:
      'ComNews собирает оценки игроков: спрос на IaaS, консолидация инфраструктуры и интерес к FinOps-сервисам на фоне роста себестоимости железа. Selectel отдельно отмечает устойчивый рост облачной выручки — полезно для понимания динамики рынка, а не точечных тарифов.',
    tags: ['finops'],
    sourceUrl:
      'https://www.comnews.ru/content/243065/2026-01-12/2026-w03/1008/rynok-oblachnykh-servisov-2026-g-prodolzhit-rost',
    sourceLabel: 'ComNews',
  },
  {
    id: 'yc-billing-docs',
    date: '2026-06-01',
    provider: 'yandex-cloud',
    providerName: 'Yandex Cloud',
    title: 'Биллинг и отчёты по потреблению в Yandex Cloud',
    summary:
      'Документация по биллингу: как смотреть детализацию, бюджеты и экспорт данных о потреблении. Базовый FinOps-инструментарий провайдера — точка старта, если строите единый отчёт по затратам рядом с каталогом SKU.',
    tags: ['finops'],
    sourceUrl: 'https://yandex.cloud/ru/docs/billing/',
    sourceLabel: 'Документация Yandex Cloud · Billing',
  },
];

export function newsMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function formatNewsDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short', year: 'numeric'});
}

export function formatNewsMonth(monthKey: string): string {
  const d = new Date(`${monthKey}-01T00:00:00Z`);
  const label = d.toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'});
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function listNewsMonths(items: NewsItem[] = newsItems): string[] {
  return [...new Set(items.map((n) => newsMonthKey(n.date)))].sort((a, b) => b.localeCompare(a));
}

export function sortNewsNewestFirst(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.providerName.localeCompare(b.providerName, 'ru');
  });
}

export function getNewsById(id: string): NewsItem | undefined {
  return newsItems.find((n) => n.id === id);
}

/**
 * Related items for a news detail page: same provider first, then same tag,
 * newest first, excluding the current item. Used for internal linking (helps
 * crawlers discover and connect news pages).
 */
export function getRelatedNews(item: NewsItem, limit = 4): NewsItem[] {
  const others = newsItems.filter((n) => n.id !== item.id);
  const sameProvider = others.filter((n) => n.provider === item.provider);
  const sameTag = others.filter(
    (n) => n.provider !== item.provider && n.tags.some((t) => item.tags.includes(t)),
  );
  const picked = new Map<string, NewsItem>();
  for (const n of [...sortNewsNewestFirst(sameProvider), ...sortNewsNewestFirst(sameTag)]) {
    if (picked.size >= limit) break;
    picked.set(n.id, n);
  }
  return [...picked.values()];
}
