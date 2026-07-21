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
        {seo.h1}: ВМ и GPU по публичным тарифам
      </h2>
      <p className={styles.lead}>{seo.intro}</p>

      <p className={styles.meta}>
        Также ищут: {[seo.brandRu, seo.brandEn, ...seo.aliases].join(', ')}. Полное сравнение без
        фильтра провайдера — в{' '}
        <Link href="/calculator/vm">калькуляторе ВМ и GPU</Link> и{' '}
        <Link href="/calculator/self-host">Self-host LLM</Link>.
      </p>

      <h3 className={styles.subtitle}>Частые вопросы · {seo.brandRu}</h3>
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
