import {
  COMPUTE_FAMILY_TITLE,
  COMPUTE_PRESETS,
  computePresetsByFamily,
  type ComputeFamily,
  type GpuPreset,
} from '@/lib/calculator/presets';
import {CALCULATOR_PROVIDER_SEO} from '@/data/calculator-providers-seo';
import {INFERENCE_MODELS} from '@/data/inference-models';
import styles from './CalculatorSeo.module.css';

const FAMILIES: ComputeFamily[] = ['low-cost', 'general', 'high-cpu', 'high-memory'];

const PROVIDERS = [
  'Яндекс.Облако (Yandex Cloud)',
  'VK Cloud',
  'Selectel',
  'Cloud.ru',
  'MWS Cloud',
  'T1 Cloud',
];

/** Featured NVIDIA SKUs people search for (calculator + SEO). */
const GPU_CARDS = [
  {
    id: 'b300',
    title: 'NVIDIA B300',
    text: 'Выделенный 8×B300 288GB (Selectel) — калькулятор показывает bundle dedicated-узла, не облачную GPU-ВМ.',
  },
  {
    id: 'h100',
    title: 'NVIDIA H100 80GB',
    text: '1× и 8× H100 PCIe/NVLink: сравнение Cloud.ru flavor и сборки GPU + host у Selectel / T1 / других.',
  },
  {
    id: 'h200',
    title: 'NVIDIA H200 141GB',
    text: '1× и 8× H200 под крупные MoE и длинный контекст — минимальная цена в каталоге по публичным тарифам РФ.',
  },
  {
    id: 'a100',
    title: 'NVIDIA A100 80GB',
    text: 'Классика датацентрового инференса и обучения; flavor и unit-цены в одном сравнении.',
  },
  {
    id: 'l4',
    title: 'NVIDIA L4 24GB',
    text: 'Экономичный inference / embedding; часто дешевле H100 при подходящем размере модели.',
  },
  {
    id: 'v100',
    title: 'NVIDIA V100 32GB',
    text: 'Legacy-карта в каталоге — полезно для оценки миграции со старых кластеров.',
  },
] as const;

/** Server-rendered SEO: in DOM for crawlers, visually hidden (interactive UI owns viewport). */
export function VmCalculatorSeo({
  gpuPresets,
  gpuShapeCount,
}: {
  gpuPresets: GpuPreset[];
  gpuShapeCount: number;
}) {
  return (
    <section className={styles.seo} aria-labelledby="calculator-vm-seo-title">
      <h2 id="calculator-vm-seo-title" className={styles.title}>
        Калькулятор цены облака: стоимость ВМ и аренды GPU в России
      </h2>
      <p className={styles.lead}>
        Бесплатный <strong>калькулятор цен облака</strong> для сравнения стоимости виртуальных машин
        (vCPU, RAM, SSD/NVMe, публичный IP) и аренды GPU NVIDIA — <strong>B300</strong>,{' '}
        <strong>H100</strong>, <strong>H200</strong>, <strong>A100</strong>, <strong>L4</strong>,{' '}
        <strong>V100</strong> — у {PROVIDERS.join(', ')}. Минимальная цена в каталоге — ордерабельная
        конфигурация по открытому каталогу Cloud FinOps, без промо-тарифов. Месяц = 720 часов, цены в
        рублях с НДС.
      </p>

      <h3 className={styles.subtitle}>Для кого этот калькулятор</h3>
      <ul className={styles.list}>
        <li>
          <strong>FinOps и закупки</strong> — быстро понять, сколько стоит облако на типовых
          конфигурациях 4/16 или 8/32 в РФ, без ручного сбора прайсов.
        </li>
        <li>
          <strong>Архитекторы и DevOps</strong> — сравнение General / High CPU / High Memory /
          Low-cost и вкладки GPU с flavor-пресетами.
        </li>
        <li>
          <strong>AI-команды</strong> — оценка аренды H100 / H200 / B300 до детального self-host
          расчёта на <a href="/calculator/self-host">калькуляторе Self-host LLM</a>.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Публичные цены облачных провайдеров</h3>
      <ul className={styles.list}>
        {CALCULATOR_PROVIDER_SEO.map((p) => (
          <li key={p.slug}>
            <a href={`/calculator/${p.slug}`}>
              <strong>Публичные цены {p.brandDisplay}</strong>
            </a>
            {' — '}
            {p.brandRu}
            {p.aliases[0] ? ` / ${p.aliases[0]}` : ''}
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Калькулятор по видеокартам</h3>
      <ul className={styles.list}>
        {GPU_CARDS.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong> — {card.text}
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Как считается цена ВМ</h3>
      <ul className={styles.list}>
        <li>
          <strong>Unit-тариф</strong> — складываем N × vCPU + M × RAM + диск (по умолчанию 10 GiB
          SSD/NVMe) + публичные IP, если включены.
        </li>
        <li>
          <strong>Flavor</strong> — готовая ВМ (типично Cloud.ru) + диск отдельно, если не входит в
          SKU.
        </li>
        <li>
          <strong>General / High CPU / High Memory</strong> — только on-demand с гарантией ядра
          100%. Shared и preemptible — в Low-cost.
        </li>
        <li>
          <strong>GPU</strong> — flavor Cloud.ru и уникальные формы VK/Selectel (в т.ч. dedicated
          B300); иначе GPU unit + host vCPU/RAM.
        </li>
        <li>
          Месяц = 720 часов. Неподтверждённые и снятые SKU не участвуют.
        </li>
      </ul>

      <div className={styles.grid}>
        <div>
          <h3 className={styles.subtitle}>Пресеты Compute</h3>
          <ul className={styles.list}>
            {FAMILIES.map((family) => {
              const samples = computePresetsByFamily(family)
                .map((p) => `${p.vcpu}/${p.ramGiB}`)
                .join(', ');
              return (
                <li key={family}>
                  <strong>{COMPUTE_FAMILY_TITLE[family]}</strong> — {samples} (vCPU / GiB) + 10 GiB
                  SSD
                </li>
              );
            })}
          </ul>
          <p className={styles.meta}>{COMPUTE_PRESETS.length} конфигураций ВМ</p>
        </div>
        <div>
          <h3 className={styles.subtitle}>Пресеты GPU</h3>
          <ul className={styles.list}>
            {gpuPresets.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong> — {p.subtitle}
              </li>
            ))}
          </ul>
          <p className={styles.meta}>{gpuShapeCount} GPU-форм в каталоге</p>
        </div>
      </div>

      <h3 className={styles.subtitle}>Связанные калькуляторы</h3>
      <ul className={styles.list}>
        <li>
          <a href="/calculator/lakehouse">
            <strong>Калькулятор Lakehouse / Data Platform</strong>
          </a>
          {' — '}
          стоимость open lakehouse: Object Storage + Managed Kubernetes + worker ВМ под Iceberg,
          Spark, Trino и Airflow.
        </li>
        <li>
          <a href="/calculator/self-host">
            <strong>Калькулятор Self-host LLM</strong>
          </a>
          {' — '}
          подбор GPU H100/H200 под open-weight модели.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы · калькулятор цены облака</h3>
      <dl className={styles.faq}>
        {VM_FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SelfHostCalculatorSeo() {
  const modelNames = INFERENCE_MODELS.map((m) => m.displayName).slice(0, 12);

  return (
    <section className={styles.seo} aria-labelledby="calculator-llm-seo-title">
      <h2 id="calculator-llm-seo-title" className={styles.title}>
        Калькулятор GPU H100, H200, B300 для self-host LLM и инференса
      </h2>
      <p className={styles.lead}>
        Подберите конфигурацию под open-weight модель (квант INT4 / FP8 / BF16 / INT8) и сравните
        аренду <strong>NVIDIA H100</strong>, <strong>H200</strong>, <strong>A100</strong>,{' '}
        <strong>L4</strong> и выделенного <strong>B300</strong> у {PROVIDERS.join(', ')}. Калькулятор
        оценивает VRAM и число карт, показывает минимальную цену в каталоге по публичным тарифам — рядом ориентир
        Hosted API ₽/1M токенов, где модель есть в каталоге.
      </p>

      <h3 className={styles.subtitle}>Ключевые сценарии</h3>
      <ul className={styles.list}>
        <li>
          <strong>Сколько GPU нужно для модели</strong> — ориентир по параметрам и кванту (например
          Qwen3-Coder-Next 80B/3B active → 1×H100 INT4).
        </li>
        <li>
          <strong>Аренда H100 / H200 / B300 под инференс</strong> — сравнение Selectel, Cloud.ru, T1,
          MWS, VK, Yandex по публичным SKU.
        </li>
        <li>
          <strong>Self-host vs API</strong> — фиксированная цена GPU-узла против ₽/1M input/output
          у hosted API того же семейства моделей.
        </li>
        <li>
          Для сырого сравнения flavor без модели (включая B300 dedicated) откройте{' '}
          <a href="/calculator/vm">калькулятор цены облака</a>. Для оценки data platform / lakehouse
          на S3 + Kubernetes —{' '}
          <a href="/calculator/lakehouse">калькулятор Lakehouse</a>.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Карты в расчёте self-host</h3>
      <ul className={styles.list}>
        {GPU_CARDS.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong> — {card.text}
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Модели в базе self-host</h3>
      <p className={styles.lead}>
        {modelNames.join(', ')}
        {INFERENCE_MODELS.length > modelNames.length
          ? ` и ещё ${INFERENCE_MODELS.length - modelNames.length}`
          : ''}
        . Рецепты — инженерные оценки VRAM (weights + запас), не лабораторные бенчмарки.
      </p>

      <h3 className={styles.subtitle}>Как считается конфигурация</h3>
      <ul className={styles.list}>
        <li>Выбираете модель и квант (Auto подставляет рекомендуемый).</li>
        <li>Сервис отдаёт минимум / рекомендуемую / запасные GPU-сборки с оценкой VRAM.</li>
        <li>
          Цена узла — quote GPU из каталога (bundle flavor или GPU + host). Месяц = 720 часов.
        </li>
        <li>API-only модели (без публичных весов) показывают только Hosted API.</li>
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы · Self-host LLM</h3>
      <dl className={styles.faq}>
        {SELF_HOST_FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Server-rendered SEO for `/calculator/lakehouse`. */
export function LakehouseCalculatorSeo() {
  return (
    <section className={styles.seo} aria-labelledby="calculator-lakehouse-seo-title">
      <h2 id="calculator-lakehouse-seo-title" className={styles.title}>
        Калькулятор Lakehouse и Data Platform: стоимость платформы данных в облаках России
      </h2>
      <p className={styles.lead}>
        Бесплатный <strong>калькулятор Lakehouse</strong> и <strong>калькулятор Data Platform</strong>{' '}
        для оценки DIY open lakehouse: <strong>Object Storage (S3)</strong>,{' '}
        <strong>Managed Kubernetes</strong> и worker-ВМ под <strong>Apache Iceberg</strong>,{' '}
        <strong>Apache Spark</strong>, <strong>Trino</strong> и <strong>Airflow</strong>. Сравнение
        публичных тарифов {PROVIDERS.join(', ')}. Минимальная цена в каталоге — сопоставимая сборка по
        каталогу Cloud FinOps; месяц = 720 часов, цены в рублях с НДС. Удобно оценить стоимость{' '}
        <strong>озера данных</strong>, <strong>open lakehouse</strong> и аналитической платформы без
        выдуманных PaaS-тарифов Spark/Trino.
      </p>

      <h3 className={styles.subtitle}>Для кого калькулятор платформы данных</h3>
      <ul className={styles.list}>
        <li>
          <strong>Data / Analytics инженеры</strong> — прикинуть TCO open lakehouse на Iceberg +
          Spark/Trino до выбора managed warehouse или serverless SQL.
        </li>
        <li>
          <strong>FinOps и архитекторы</strong> — понять, где доминирует storage, idle compute или
          platform overhead; сравнить облака РФ на одном BOM.
        </li>
        <li>
          <strong>BI и data-команды</strong> — оценка пилота (Small), production-контура (Medium) и
          enterprise lake (Large) с duty-cycle ETL и SQL.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Что входит в расчёт Lakehouse</h3>
      <ul className={styles.list}>
        <li>
          <strong>Object Storage</strong> — объём озера (TiB), доля hot/standard и cold/archive при
          наличии класса у провайдера.
        </li>
        <li>
          <strong>Managed Kubernetes master</strong> — Basic или HA (провайдеры без HA выпадают из
          сравнения на HA-тире).
        </li>
        <li>
          <strong>Platform 24/7</strong> — worker-ВМ под Airflow, catalog и control plane.
        </li>
        <li>
          <strong>ETL / Spark</strong> и <strong>Query / Trino</strong> — пулы с duty-cycle (часы в
          сутки), не always-on по умолчанию.
        </li>
        <li>
          Managed Spark/Trino/ClickHouse PaaS, egress и запросы S3 в сумму не входят — это отдельный
          слой стоимости.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Стек и ключевые сценарии поиска</h3>
      <ul className={styles.list}>
        <li>
          <strong>Apache Iceberg + Object Storage</strong> — открытый table format поверх S3-совместимого
          хранилища.
        </li>
        <li>
          <strong>Spark ETL и Trino SQL</strong> — batch и интерактивная аналитика на worker-нодах
          Kubernetes.
        </li>
        <li>
          <strong>Airflow + catalog</strong> — оркестрация и метаданные на platform-пуле.
        </li>
        <li>
          <strong>Open lakehouse vs DWH</strong> — калькулятор считает DIY-модель; managed warehouse и
          serverless SQL сравнивайте качественно или через AI-ассистента.
        </li>
        <li>
          Связанные инструменты:{' '}
          <a href="/calculator/vm">калькулятор ВМ и GPU</a>,{' '}
          <a href="/catalog?category=storage">каталог Object Storage</a>,{' '}
          <a href="/chat">AI-ассистент FinOps</a>.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Провайдеры в сравнении Lakehouse</h3>
      <ul className={styles.list}>
        {CALCULATOR_PROVIDER_SEO.map((p) => (
          <li key={p.slug}>
            <a href={`/calculator/${p.slug}`}>
              <strong>{p.brandRu}</strong>
            </a>
            {p.aliases[0] ? ` / ${p.aliases[0]}` : ''} — Object Storage и Managed Kubernetes из
            публичного прайса, если есть в каталоге.
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Пресеты размера</h3>
      <ul className={styles.list}>
        <li>
          <strong>Small (~10 TiB)</strong> — пилот / один домен, низкий порог входа, nightly ETL.
        </li>
        <li>
          <strong>Medium (~75 TiB)</strong> — production-команда, отказоустойчивый master, регулярный
          ETL и SQL в рабочее время.
        </li>
        <li>
          <strong>Large (~500 TiB)</strong> — enterprise lake, отдельные пулы, выше concurrency и
          доля cold-архива.
        </li>
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы · Lakehouse и платформа данных</h3>
      <dl className={styles.faq}>
        {LAKEHOUSE_FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @deprecated use VmCalculatorSeo */
export const CalculatorSeo = VmCalculatorSeo;

const LAKEHOUSE_FAQ = [
  {
    question: 'Что считает калькулятор Lakehouse?',
    answer:
      'DIY open lakehouse / Data Platform: Object Storage + Managed Kubernetes master + worker ВМ (platform 24/7, ETL/Spark и Query/Trino с duty-cycle). Airflow, Iceberg catalog, Spark и Trino — софт на нодах, не отдельные PaaS SKU.',
  },
  {
    question: 'Сколько стоит lakehouse или платформа данных в облаке России?',
    answer:
      'Зависит от объёма озера, hot/cold, тира K8s и часов ETL/SQL. На пресете Medium (~75 TiB, HA) калькулятор сравнивает Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1 (если покрывают SKU) и показывает минимальную цену в каталоге в ₽/мес.',
  },
  {
    question: 'Чем open lakehouse отличается от data warehouse?',
    answer:
      'Open lakehouse хранит данные в открытых форматах (Iceberg) на object storage и поднимает SQL/ETL-движки отдельно. Managed warehouse обычно продаёт credits/slots и SLA «из коробки». Этот калькулятор считает именно DIY-модель на K8s + S3.',
  },
  {
    question: 'Можно ли посчитать стоимость Apache Iceberg, Spark и Trino?',
    answer:
      'Да, как инфраструктурный TCO: storage под таблицы Iceberg + compute-пулы Spark/Trino на ВМ в Managed Kubernetes. Лицензии и managed-сервисы Spark/Trino в каталоге не тарифицируются — не включаются в сумму.',
  },
  {
    question: 'Как уменьшить стоимость lakehouse?',
    answer:
      'Снизьте duty-cycle ETL/SQL, увеличьте долю cold для архива, проверьте, нужен ли отказоустойчивый master, и не держите query-пул always-on при редких запросах. Для ad hoc часто выгоднее serverless SQL — обсудите с AI-ассистентом на странице.',
  },
  {
    question: 'Какие облака сравниваются в калькуляторе Data Platform?',
    answer: `${PROVIDERS.join(', ')} — по сопоставимым SKU Object Storage и Managed Kubernetes из каталога Cloud FinOps.`,
  },
  {
    question: 'Есть ли калькулятор озера данных для Яндекс.Облака и Selectel?',
    answer:
      'Да. Откройте /calculator/lakehouse — в сравнении есть колонки Яндекс.Облако, Selectel, VK Cloud, Cloud.ru, MWS и T1 (если провайдер закрывает нужные SKU). Отдельные лендинги провайдеров: /calculator/yandex-cloud, /calculator/selectel.',
  },
  {
    question: 'Подходит ли калькулятор для ClickHouse?',
    answer:
      'Нет как отдельный ClickHouse PaaS. Цифры — DIY lakehouse (S3 + K8s + Spark/Trino). ClickHouse или другой OLAP можно рассматривать как ускоряющий слой над озером, но его managed-тариф здесь не подставляется.',
  },
];

const VM_FAQ = [
  {
    question: 'Как посчитать цену облака в калькуляторе?',
    answer:
      'Выберите конфигурацию ВМ или GPU-пресет. Калькулятор цены облака сравнит публичные тарифы Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1 и покажет минимальную цену в каталоге в ₽/час, ₽/мес или ₽/год (месяц = 720 часов, с НДС).',
  },
  {
    question: 'Как считается стоимость ВМ?',
    answer:
      'Складываем публичные unit-цены vCPU, RAM и диск одного региона и платформы либо берём точный flavor плюс SSD. Минимальная цена в каталоге — ордерабельная цена среди провайдеров по публичным тарифам.',
  },
  {
    question: 'Сколько стоит виртуальная машина в облаке России?',
    answer:
      'Зависит от vCPU, RAM, диска, сети и провайдера. На типовых пресетах 2/8, 4/16, 8/32 калькулятор показывает актуальные цены сразу у шести облаков РФ — удобнее, чем считать вручную в каждом прайсе.',
  },
  {
    question: 'Какие облака России сравниваются?',
    answer: `${PROVIDERS.join(', ')} — по единой таксономии SKU Cloud FinOps.`,
  },
  {
    question: 'Есть ли калькулятор для Яндекс.Облака?',
    answer:
      'Да. Откройте /calculator/yandex-cloud или общую страницу /calculator/vm — в таблице есть колонка Яндекс.Облако (Yandex Cloud) рядом с VK Cloud, Selectel, Cloud.ru, MWS и T1.',
  },
  {
    question: 'Есть ли калькулятор для VK Cloud и T1 Cloud?',
    answer:
      'Да. Отдельные страницы: /calculator/vk-cloud и /calculator/t1-cloud. Там же сравнение с Яндекс.Облаком, Selectel, Cloud.ru и MWS по публичным тарифам.',
  },
  {
    question: 'Можно ли посчитать аренду GPU H100, H200 или B300?',
    answer:
      'Да. Во вкладке GPU сравниваются пресеты NVIDIA L4, A100, H100 (1×/8×), H200 (1×/8×), V100 и dedicated B300 8× у Selectel — по публичным ценам каталога Cloud FinOps.',
  },
  {
    question: 'Сколько стоит аренда NVIDIA B300 в калькуляторе?',
    answer:
      'B300 в каталоге — выделенный узел Selectel (8×GPU), не обычная облачная GPU-ВМ. Калькулятор показывает bundle-цену dedicated; host vCPU/RAM в SKU не разложены.',
  },
  {
    question: 'Чем этот калькулятор отличается от калькулятора провайдера?',
    answer:
      'Мы сравниваем несколько облаков РФ на одних и тех же пресетах ВМ и H100/H200/B300/A100/L4. Калькуляторы Selectel или Яндекс.Облака считают только свой прайс.',
  },
];

const SELF_HOST_FAQ = [
  {
    question: 'Как рассчитать GPU под инференс LLM (self-host)?',
    answer:
      'Выберите open-weight модель и квант. Калькулятор оценит VRAM, предложит конфигурации (1×H100, 1×H200, multi-GPU) и сравнит цены аренды у облаков России по публичным тарифам.',
  },
  {
    question: 'Сколько стоит аренда H100 или H200 для self-host в России?',
    answer:
      'Зависит от flavor vs unit GPU + host. Для 1×H100 80GB и 1×H200 141GB смотрите актуальную минимальную цену в каталоге на странице (Selectel / Cloud.ru / T1 и др.); месяц = 720 часов. 8× узлы считаются отдельными пресетами.',
  },
  {
    question: 'Нужен ли B300 для self-host LLM?',
    answer:
      'B300 — топовый dedicated-узел (Selectel). Для многих open-weight моделей достаточно 1×H100/H200; B300 имеет смысл для максимальной плотности и спец. нагрузок. Цену B300 удобнее смотреть на /calculator/vm во вкладке GPU.',
  },
  {
    question: 'Чем INT4 отличается от FP8 и BF16 в калькуляторе?',
    answer:
      'Квант уменьшает VRAM под веса: INT4 — максимум экономии карт (часто 1×H100 вместо multi-GPU), FP8 — частый баланс на H100/H200, BF16 — ближе к полному качеству и требует больше памяти.',
  },
  {
    question: 'Какие модели поддерживаются для self-host расчёта?',
    answer: `В базе: ${INFERENCE_MODELS.map((m) => m.displayName).join(', ')}. Часть моделей API-only — для них показывается только Hosted API.`,
  },
  {
    question: 'Self-host дешевле Hosted API?',
    answer:
      'Только при высокой утилизации GPU. Калькулятор показывает фиксированную стоимость узла и ориентир ₽/1M токенов API — точку безубыточности считайте по своему tok/s и смеси input/output.',
  },
];

export function lakehouseCalculatorJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator/lakehouse#app',
        name: 'Калькулятор Lakehouse и Data Platform · Cloud FinOps',
        alternateName: [
          'Калькулятор Lakehouse',
          'Калькулятор Data Platform',
          'Калькулятор платформы данных',
          'Калькулятор озера данных',
          'Калькулятор open lakehouse',
          'Калькулятор Iceberg Spark Trino',
        ],
        url: 'https://cloudfinops.ru/calculator/lakehouse',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор Lakehouse / Data Platform: сравнение стоимости DIY open lakehouse на Object Storage, Managed Kubernetes, Apache Iceberg, Spark, Trino и Airflow у Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1 Cloud по публичным тарифам с НДС.',
        featureList: [
          'Калькулятор Lakehouse',
          'Калькулятор Data Platform',
          'Калькулятор платформы данных',
          'Стоимость Apache Iceberg',
          'Стоимость Spark и Trino на Kubernetes',
          'Object Storage и Managed Kubernetes',
          'Сравнение open lakehouse в облаках России',
          'Пресеты Small Medium Large',
          'Duty-cycle ETL и SQL',
        ],
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'RUB'},
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator/lakehouse#faq',
        mainEntity: LAKEHOUSE_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {'@type': 'Answer', text: item.answer},
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cloud FinOps',
            item: 'https://cloudfinops.ru/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Калькулятор Lakehouse',
            item: 'https://cloudfinops.ru/calculator/lakehouse',
          },
        ],
      },
    ],
  };
}

export function vmCalculatorJsonLd(gpuShapeCount: number) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator/vm#app',
        name: 'Калькулятор цены облака · Cloud FinOps',
        alternateName: [
          'Калькулятор цен облака',
          'Калькулятор стоимости облака',
          'Калькулятор ВМ и GPU',
        ],
        url: 'https://cloudfinops.ru/calculator/vm',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор цены облака: сравнение стоимости ВМ и аренды GPU NVIDIA H100, H200, B300, A100, L4 у Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS и T1 Cloud по публичным тарифам с НДС.',
        featureList: [
          'Сравнение цен облаков России',
          'Публичные цены Yandex Cloud: расчёт и сравнение',
          'Публичные цены VK Cloud: расчёт и сравнение',
          'Публичные цены Selectel: расчёт и сравнение',
          'Публичные цены Cloud.ru: расчёт и сравнение',
          'Публичные цены MWS Cloud: расчёт и сравнение',
          'Публичные цены T1 Cloud: расчёт и сравнение',
          'Калькулятор стоимости аренды GPU H100 и H200',
          'Пресеты General, High CPU, High Memory и Low-cost',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator/vm#faq',
        mainEntity: VM_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cloud FinOps',
            item: 'https://cloudfinops.ru/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Калькулятор цены облака',
            item: 'https://cloudfinops.ru/calculator/vm',
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'GPU-формы в каталоге Cloud FinOps',
        numberOfItems: gpuShapeCount,
        itemListOrder: 'https://schema.org/ItemListUnordered',
      },
    ],
  };
}

export function selfHostCalculatorJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/calculator/self-host#app',
        name: 'Калькулятор Self-host LLM H100 H200 B300 · Cloud FinOps',
        url: 'https://cloudfinops.ru/calculator/self-host',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Калькулятор GPU под self-host и инференс open-weight LLM: подбор NVIDIA H100, H200, A100, L4 и ориентир по B300; сравнение аренды в облаках России и Hosted API ₽/1M.',
        featureList: [
          'Калькулятор GPU для LLM',
          'Self-host LLM на H100',
          'Self-host LLM на H200',
          'Калькулятор инференса B300',
          'Аренда A100 L4 под модель',
          'Сравнение с Hosted API',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/calculator/self-host#faq',
        mainEntity: SELF_HOST_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Cloud FinOps',
            item: 'https://cloudfinops.ru/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Self-host LLM',
            item: 'https://cloudfinops.ru/calculator/self-host',
          },
        ],
      },
    ],
  };
}

/** @deprecated use vmCalculatorJsonLd */
export function calculatorJsonLd() {
  return vmCalculatorJsonLd(0);
}
