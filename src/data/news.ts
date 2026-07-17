export type NewsProviderId =
  | 'yandex-cloud'
  | 'vk-cloud'
  | 'cloud-ru'
  | 'selectel'
  | 'mws-cloud'
  | 't1-cloud'
  | 'aws'
  | 'azure'
  | 'google-cloud';

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
      'Умный класс хранения автоматически перемещает объекты между уровнями доступа и помогает снижать стоимость холодных данных без ручного lifecycle.',
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
      'Автоматическое масштабирование control plane master-нод под нагрузку кластера — меньше ручных решений по размеру masters.',
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
      'Сервис генерации сайтов и веб-приложений по текстовому описанию вышел из закрытой беты; новым пользователям начисляют нейрокредиты на старт.',
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
      'Preview Cloud Router для маршрутизации между VPC, on-prem и BareMetal; в Cloud DNS — фильтры нежелательных FQDN через API/CLI/Terraform.',
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
      'Единый API-ключ к сотням LLM, квоты, аналитика и оплата в рублях без отдельных контрактов с каждым вендором моделей.',
    tags: ['ai'],
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
      'Управляемый ClickHouse с шардированием, S3/Iceberg, веб-интерфейсом и аудитом — для логов, DWH и lakehouse-сценариев.',
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
      'Первый Multi-AZ регион объектного хранилища: три реплики в разных ДЦ Москвы, классы Standard и Cold.',
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
      'Расширили сетевые опции облака новым типом IP-адреса — удобнее разделять сценарии direct / floating / reserved.',
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
      'В каталог приложений Managed Kubernetes добавили Envoy Gateway — путь к Gateway API вместо устаревающего Ingress NGINX.',
    tags: ['kubernetes', 'network'],
    sourceUrl: 'https://selectel.ru/blog/digest26-06/',
    sourceLabel: 'Дайджест Selectel · июнь 2026',
  },

  // ——— Cloud.ru ———
  {
    id: 'cloudru-2026-06-managed-rag',
    date: '2026-06-10',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Evolution Managed RAG и AI Agents',
    summary:
      'В Evolution появились управляемый RAG и AI Agents — быстрее собирать корпоративные ИИ-сценарии на платформе без своей обвязки.',
    tags: ['ai'],
    sourceUrl: 'https://cloud.ru/blog/daydzhest-may-2026',
    sourceLabel: 'Дайджест Cloud.ru (публикация 10 июня)',
  },
  {
    id: 'cloudru-2026-06-managed-clickhouse',
    date: '2026-06-10',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Evolution Managed ClickHouse',
    summary:
      'Управляемый ClickHouse в линейке Evolution — аналитика событий и озёр данных ближе к остальным managed-сервисам платформы.',
    tags: ['data'],
    sourceUrl: 'https://cloud.ru/blog/daydzhest-may-2026',
    sourceLabel: 'Дайджест Cloud.ru (публикация 10 июня)',
  },
  {
    id: 'cloudru-2026-06-multicloud-mws',
    date: '2026-06-01',
    provider: 'cloud-ru',
    providerName: 'Cloud.ru',
    title: 'Мультиоблачная связь с MWS Cloud',
    summary:
      'Прямая сетевая связность Cloud.ru ↔ MWS Cloud (запуск в июне): выделенный канал между облаками, на старте — через поддержку.',
    tags: ['network'],
    sourceUrl: 'https://cloud.ru/blog/cloud-ru-servis-multioblachnoy-svyazi-c-mws-cloud-i-beeline-cloud',
    sourceLabel: 'Блог Cloud.ru',
  },

  // ——— MWS ———
  {
    id: 'mws-2026-06-multicloud',
    date: '2026-06-01',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'Мультиоблачная связность с Cloud.ru',
    summary:
      'Совместный сервис прямой связности инфраструктур двух провайдеров — для DR, балансировки нагрузки и мультиоблачных архитектур.',
    tags: ['network'],
    sourceUrl:
      'https://fomag.ru/news-streem/mws-cloud-zapustit-v-iyune-servis-multioblachnoy-svyazi-c-platformoy-cloud-ru/',
    sourceLabel: 'Анонс MWS Cloud / ТАСС',
  },
  {
    id: 'mws-2026-06-local-nvme',
    date: '2026-06-20',
    provider: 'mws-cloud',
    providerName: 'MWS Cloud',
    title: 'Локальные NVMe-диски для ВМ',
    summary:
      'Временные локальные NVMe на хосте для ВМ — выше IOPS/latency для кэшей, scratch и тяжёлых локальных нагрузок.',
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
      'В каталоге моделей появилась gpt-oss-120b (120B параметров) в GA — для ассистентов, суммаризации и API-интеграций.',
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
      'Аттестат для размещения значимых объектов КИИ до 1-й категории, а также ГИС К1 и ИСПДн УЗ1 — на российской платформе VK Tech.',
    tags: ['security'],
    sourceUrl: 'https://www.cnews.ru/news/line/2026-06-17_vk_tech_attestoval_vk_secure_cloud',
    sourceLabel: 'CNews / VK Tech',
  },

  // ——— AWS ———
  {
    id: 'aws-2026-06-lambda-microvms',
    date: '2026-06-24',
    provider: 'aws',
    providerName: 'AWS',
    title: 'AWS Lambda MicroVMs',
    summary:
      'Новый serverless-примитив: VM-изоляция (Firecracker), near-instant resume и stateful suspend до 8 часов — для песочниц и AI-generated code.',
    tags: ['compute', 'ai'],
    sourceUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/06/aws-lambda-microvms/',
    sourceLabel: 'AWS What’s New',
  },

  // ——— Azure ———
  {
    id: 'azure-2026-06-container-linux',
    date: '2026-06-02',
    provider: 'azure',
    providerName: 'Azure',
    title: 'Azure Container Linux (ACL) GA на AKS',
    summary:
      'Иммутабельный container host на базе Flatcar/Azure Linux для AKS: единый hardened OS SKU для кластеров вместо разрозненных preview-образов.',
    tags: ['kubernetes', 'security'],
    sourceUrl:
      'https://techcommunity.microsoft.com/blog/linuxandopensourceblog/introducing-azure-container-linux-acl/4523411',
    sourceLabel: 'Microsoft Tech Community',
  },
  {
    id: 'azure-2026-06-aks-bare-metal',
    date: '2026-06-15',
    provider: 'azure',
    providerName: 'Azure',
    title: 'AKS on Bare Metal (preview)',
    summary:
      'Kubernetes без гипервизора с прямым доступом к NVLink/RDMA — для AI training/inference на AKS (анонсы Build 2026, волны в прессе в июне).',
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
      'Сквозная наблюдаемость сети в multi-cloud/hybrid: synthetic probing, hop-by-hop диагностика и связка с Gemini Cloud Assist.',
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
      'Кастомный Python внутри BigQuery в production: vectorized PyArrow, до 16 GB / 4 vCPU на функцию, метрики в Cloud Monitoring.',
    tags: ['data'],
    sourceUrl:
      'https://cloud.google.com/blog/products/data-analytics/python-udf-in-bigquery-now-generally-available',
    sourceLabel: 'Google Cloud Blog',
  },
];

export function newsMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function formatNewsDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short', year: 'numeric'});
}

export function sortNewsNewestFirst(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.providerName.localeCompare(b.providerName, 'ru');
  });
}
