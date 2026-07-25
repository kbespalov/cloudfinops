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
        О расчёте
      </h2>
      <p className={styles.lead}>{seo.intro}</p>

      <details className={styles.method} id="provider-calc-method">
        <summary>Как считается цена</summary>
        <ul>
          <li>
            Источник: опубликованные тарифы и документация провайдеров в каталоге Cloud FinOps на{' '}
            {catalogAsOfLabel()}.
          </li>
          <li>
            Сравнение ориентировочное: близкие выбранные параметры. Поколение CPU, доля ядра, диск,
            регион и модель тарификации у провайдеров могут отличаться.
          </li>
          <li>
            Суммы приведены с НДС. Если провайдер публикует тариф без НДС, в каталоге он
            нормализован к цене с НДС. Индивидуальные скидки, промоакции и договорные условия не
            учитываются.
          </li>
          <li>
            Почасовые тарифы пересчитываются в месяц как 720 часов; помесячные берутся как в
            источнике. Перед заказом проверьте актуальные условия на сайте провайдера.
          </li>
        </ul>
      </details>

      <h3 className={styles.subtitle}>Частые вопросы</h3>
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
