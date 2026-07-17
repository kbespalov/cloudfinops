import {CHAT_SUGGESTIONS} from './suggestions';
import styles from './ChatSeo.module.css';

const PROVIDERS = [
  'Yandex Cloud',
  'VK Cloud',
  'Selectel',
  'Cloud.ru',
  'MWS Cloud',
  'T1 Cloud',
];

const CAPABILITIES: {title: string; text: string}[] = [
  {
    title: 'ИИ-ассистент FinOps',
    text: 'Задавайте вопросы про облака России обычными словами — ассистент понимает контекст диалога, ищет по каталогу SKU и отвечает готовыми таблицами с ценами (₽ с НДС, месяц = 720 часов). Никаких выдуманных цифр: всё только из публичных прайс-листов.',
  },
  {
    title: 'Рекомендательная система',
    text: 'Опишите нагрузку (например «8 vCPU / 32 GiB для 1С» или «H100 под инференс») — ИИ подберёт оптимального по цене провайдера и ордерабельную конфигурацию, объяснит разницу между выделенными и shared vCPU, bundle-флейворами и типами дисков.',
  },
  {
    title: 'Аналитика цен облаков',
    text: 'Сравнение стоимости ВМ, GPU, хранилища, трафика и AI-моделей по шести облакам РФ в одном ответе. Ассистент сортирует варианты по цене, отмечает самый дешёвый и приводит конфигурации к паритету для честного сравнения.',
  },
  {
    title: 'Единая таксономия SKU',
    text: 'Под капотом — тот же каталог SKU и движок калькулятора Cloud FinOps, что и на остальных страницах. ИИ вызывает поиск по прайсам и расчёт «конфигурации целиком», поэтому цифры совпадают с каталогом и калькулятором.',
  },
];

const FAQ: {question: string; answer: string}[] = [
  {
    question: 'Что такое ИИ-ассистент FinOps на Cloud FinOps?',
    answer:
      'Это бесплатный чат с искусственным интеллектом, который консультирует по ценам публичных облаков России. Ассистент ищет по каталогу SKU и рассчитывает стоимость конфигураций, отвечая таблицами с ценами в рублях с НДС.',
  },
  {
    question: 'Как ИИ подбирает оптимального облачного провайдера?',
    answer:
      'Рекомендательная система приводит запрошенную конфигурацию ВМ или GPU к паритету по всем провайдерам, считает итоговую стоимость по публичным тарифам и выбирает минимальную цену (Best offer), поясняя различия конфигураций.',
  },
  {
    question: 'По каким облакам работает аналитика цен?',
    answer: `Ассистент сравнивает ${PROVIDERS.join(', ')} — только по публичным прайс-листам, без промо-тарифов и без выдуманных цен.`,
  },
  {
    question: 'Можно ли спросить про цену GPU H100, H200 или AI-моделей?',
    answer:
      'Да. Спросите про аренду GPU (L4, A100, H100, H200, B300) или стоимость AI-моделей (GigaChat, GLM, Qwen, DeepSeek) — ассистент найдёт, у каких провайдеров это есть, и сравнит цену за час, месяц, год или за 1M токенов.',
  },
  {
    question: 'Ассистент придумывает цены?',
    answer:
      'Нет. ИИ отвечает только на основе публичного каталога SKU Cloud FinOps. Если данных по услуге нет, он честно об этом сообщает и предлагает уточнить запрос. Важные цифры всё равно стоит перепроверять.',
  },
];

/**
 * Server-rendered SEO copy for /chat. The interactive ChatContainer is
 * client-only (ssr: false), so this block gives crawlers real, indexable
 * content around the target keywords (ИИ FinOps, ИИ-ассистент, рекомендательная
 * система, аналитика цен облаков).
 */
export function ChatSeo() {
  return (
    <section className={styles.seo} aria-labelledby="chat-seo-title">
      <h2 id="chat-seo-title" className={styles.title}>
        ИИ-ассистент FinOps по ценам облаков России
      </h2>
      <p className={styles.lead}>
        Cloud FinOps — это ИИ для FinOps: специализированный чат с искусственным интеллектом,
        который отвечает на вопросы о стоимости облачной инфраструктуры в России. Рекомендательная
        система и аналитика цен работают по единому каталогу SKU и сравнивают тарифы{' '}
        {PROVIDERS.join(', ')}. Спросите своими словами — ответ придёт таблицей с ценами в рублях
        с НДС.
      </p>

      <div className={styles.grid}>
        {CAPABILITIES.map((c) => (
          <div key={c.title} className={styles.card}>
            <h3 className={styles.subtitle}>{c.title}</h3>
            <p className={styles.cardText}>{c.text}</p>
          </div>
        ))}
      </div>

      <h3 className={styles.subtitle}>Примеры вопросов ассистенту</h3>
      <ul className={styles.list}>
        {CHAT_SUGGESTIONS.map((s) => (
          <li key={s.id}>{s.title}</li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Частые вопросы</h3>
      <dl className={styles.faq}>
        {FAQ.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function chatJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': 'https://cloudfinops.ru/chat#app',
        name: 'ИИ-ассистент FinOps · Cloud FinOps',
        url: 'https://cloudfinops.ru/chat',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'AI Assistant',
        operatingSystem: 'Web',
        inLanguage: 'ru-RU',
        description:
          'Специализированный ИИ-ассистент FinOps по ценам публичных облаков России. Рекомендательная система подбирает оптимального провайдера и конфигурацию, аналитика цен сравнивает ВМ, GPU (H100, H200, A100, B300), хранилище, трафик и AI-модели у Yandex Cloud, VK Cloud, Selectel, Cloud.ru, MWS и T1 по публичным тарифам.',
        featureList: [
          'ИИ-ассистент по ценам облаков',
          'Рекомендательная система подбора конфигураций',
          'Аналитика и сравнение цен облаков РФ',
          'Расчёт стоимости ВМ и аренды GPU',
          'Поиск по каталогу SKU',
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'RUB',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Cloud FinOps',
          url: 'https://cloudfinops.ru',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://cloudfinops.ru/chat#faq',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
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
            name: 'ИИ-ассистент FinOps',
            item: 'https://cloudfinops.ru/chat',
          },
        ],
      },
    ],
  };
}
