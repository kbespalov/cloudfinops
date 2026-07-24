import Link from 'next/link';
import {
  CALCULATOR_PROVIDER_SEO,
  type CalculatorProviderSeo,
} from '@/data/calculator-providers-seo';
import styles from './ProviderCalculatorSeo.module.css';

export function ProviderCalculatorSeo({seo}: {seo: CalculatorProviderSeo}) {
  const others = CALCULATOR_PROVIDER_SEO.filter((p) => p.slug !== seo.slug);

  return (
    <section className={styles.seo} aria-labelledby="provider-calc-seo-title">
      <h2 id="provider-calc-seo-title" className={styles.title}>
        {seo.h1}
      </h2>
      <p className={styles.lead}>{seo.intro}</p>

      <p className={styles.meta}>
        Также ищут: {[seo.brandRu, seo.brandEn, ...seo.aliases].join(', ')}. Полное сравнение без
        фокуса на одном провайдере — в{' '}
        <Link href="/calculator/vm">калькуляторе ВМ и GPU</Link> и{' '}
        <Link href="/calculator/self-host">хостинге LLM</Link>.
      </p>

      <details className={styles.method}>
        <summary>Как рассчитывается цена</summary>
        <ul>
          <li>Источник: публичные тарифы провайдеров в каталоге Cloud FinOps.</li>
          <li>
            Валюта: рубли. Для каждого тарифа используется налоговый статус, указанный в каталоге и
            источнике цены.
          </li>
          <li>Расчётный период: час, месяц (720 ч) или год — переключатель на странице.</li>
          <li>
            В итог входят компоненты выбранной конфигурации (например vCPU, RAM, диск, GPU, публичный
            IP), если они участвуют в расчёте.
          </li>
          <li>Индивидуальные скидки, промоакции и закрытые прайсы не учитываются.</li>
          <li>
            Предложения могут различаться по модели предоставления ресурсов, производительности и
            включённым услугам (VM, flavor, dedicated, доля CPU, класс диска и др.).
          </li>
          <li>
            Перед заказом проверьте итоговую стоимость и доступность ресурсов на официальном сайте
            провайдера.
          </li>
        </ul>
      </details>

      <h3 className={styles.subtitle}>Частые вопросы · {seo.brandDisplay}</h3>
      <dl className={styles.faq}>
        {seo.faq.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>

      <h3 className={styles.subtitle}>Калькуляторы публичных цен других облаков</h3>
      <ul className={styles.links}>
        {others.map((p) => (
          <li key={p.slug}>
            <Link href={`/calculator/${p.slug}`}>{p.h1}</Link>
          </li>
        ))}
        <li>
          <Link href="/calculator/vm">Все облака · ВМ и GPU</Link>
        </li>
      </ul>
    </section>
  );
}
