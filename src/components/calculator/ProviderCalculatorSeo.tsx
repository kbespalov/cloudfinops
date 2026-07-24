import Link from 'next/link';
import {
  CALCULATOR_PROVIDER_SEO,
  type CalculatorProviderSeo,
} from '@/data/calculator-providers-seo';
import {catalogAsOfLabel} from '@/lib/catalog/compare-disclaimer';
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

      <details className={styles.method} id="provider-calc-method">
        <summary>Как считается цена</summary>
        <ul>
          <li>
            Цены получены из открытых источников. Каталог Cloud FinOps на {catalogAsOfLabel()}.
            Cloud FinOps не связан с {seo.brandDisplay} и не является его официальным калькулятором.
          </li>
          <li>
            Для сравнения используются максимально близкие конфигурации. Предложения могут
            различаться по модели предоставления ресурсов, производительности и включённым услугам.
          </li>
          <li>
            Показанные суммы приведены с НДС. Если провайдер публикует тариф без НДС, в каталоге он
            нормализован к цене с НДС для сопоставимости. Индивидуальные скидки и специальные
            условия договоров не учитываются.
          </li>
          <li>
            Расчётный месяц = 720 часов. Перед заказом проверьте итоговую стоимость, регион и
            доступность на сайте провайдера.
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

      <h3 className={styles.subtitle}>Калькуляторы других облаков</h3>
      <ul className={styles.links}>
        {others.map((p) => (
          <li key={p.slug}>
            <Link href={`/calculator/${p.slug}`}>Калькулятор стоимости {p.brandDisplay}</Link>
          </li>
        ))}
        <li>
          <Link href="/calculator/vm">Все облака · ВМ и GPU</Link>
        </li>
      </ul>
    </section>
  );
}
