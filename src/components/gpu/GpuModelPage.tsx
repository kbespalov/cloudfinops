'use client';

import Link from 'next/link';
import {Button, Flex, HelpMark, Icon, Text} from '@gravity-ui/uikit';
import {ArrowRight, Magnifier, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {getGpuLanding, type GpuLandingDef} from '@/data/gpu-landings';
import {buildGpuLandingStats, periodWord, type GpuOfferSummary} from '@/lib/gpu-landing';
import styles from './GpuLanding.module.css';

const PROMO_NOTE = 'Без промо и индивидуальных скидок — только публичные тарифы каталога.';

function offerLine(offer: GpuOfferSummary | null, empty: string): string {
  if (!offer) return empty;
  const basis = offer.basis ? ` · ${offer.basis}` : '';
  const synth = offer.synthetic ? ' · оценка *' : '';
  return `${offer.amountLabel}/${periodWord(offer.period)} · ${offer.providerName}${basis}${synth}`;
}

export function GpuModelPage({def}: {def: GpuLandingDef}) {
  const stats = buildGpuLandingStats(def);
  const primary = def.preferNode
    ? stats.cheapestNode ?? stats.cheapestSingle
    : stats.cheapestSingle ?? stats.cheapestNode;
  const secondary = def.preferNode ? stats.cheapestSingle : stats.cheapestNode;

  const chatQ = encodeURIComponent(`Сколько стоит ${def.shortTitle} в месяц в облаках РФ?`);
  const related = def.related
    .map((slug) => getGpuLanding(slug))
    .filter((x): x is GpuLandingDef => Boolean(x));

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.main}>
        <header className={styles.heroBand}>
          <div className={styles.heroCopy}>
            <p className={styles.backLink}>
              <Link href="/gpu">← Все GPU</Link>
            </p>
            <Text as="h1" variant="display-1" className={styles.title}>
              {def.title}
            </Text>
            <ul className={styles.cardFacts}>
              {def.hubFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
            <Flex className={styles.actions}>
              <Button view="action" size="xl" href={stats.catalogHref} component={Link} prefetch>
                <Icon data={SquareListUl} size={18} />
                Открыть в каталоге
                <Icon data={ArrowRight} size={18} />
              </Button>
              <Button view="outlined" size="xl" href={`/chat?q=${chatQ}`} component={Link} prefetch>
                <Icon data={Magnifier} size={18} />
                Обсудить в чате
              </Button>
            </Flex>
            <p className={styles.metaLine}>
              {stats.offerCount} предложений · обновлено {stats.updatedLabel} · цены с НДС{' '}
              <HelpMark aria-label="Про состав цен" iconSize="s">
                {PROMO_NOTE}
              </HelpMark>
            </p>
          </div>

          <aside className={styles.heroPanel} aria-label="Ориентир цены">
            <div className={styles.heroMetrics}>
              <div className={styles.heroMetric}>
                <Text variant="body-2">
                  {def.preferNode ? 'Узел / 8×GPU' : '1× GPU'}
                </Text>
                <Text as="div" variant="display-1" className={styles.heroMetricValue}>
                  {primary ? primary.amountLabel : '—'}
                </Text>
                <Text variant="body-2">
                  {offerLine(primary, 'Нет минимума в срезе')}
                </Text>
              </div>
              <div className={styles.heroMetric}>
                <Text variant="body-2">
                  {def.preferNode ? '1× GPU' : 'Узел / multi'}
                </Text>
                <Text as="div" variant="header-1" className={styles.statValue}>
                  {secondary ? secondary.amountLabel : '—'}
                </Text>
                <Text variant="body-2">
                  {offerLine(secondary, 'Смотрите каталог')}
                </Text>
              </div>
            </div>
          </aside>
        </header>

        <section className={styles.section} aria-labelledby="gpu-highlights-title">
          <Text as="h2" variant="header-2" id="gpu-highlights-title" className={styles.sectionTitle}>
            На что смотреть
          </Text>
          <ul className={styles.list}>
            {def.highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Flex className={styles.actions}>
            <Button view="action" size="l" href={stats.catalogHref} component={Link} prefetch>
              Все цены {def.shortTitle} в каталоге
            </Button>
            <Button view="flat" size="l" href="/calculator/self-host" component={Link} prefetch>
              Подобрать GPU под LLM
            </Button>
          </Flex>
        </section>

        {related.length > 0 ? (
          <section className={styles.section} aria-labelledby="gpu-related-title">
            <Text as="h2" variant="header-2" id="gpu-related-title" className={styles.sectionTitle}>
              Рядом
            </Text>
            <Flex className={styles.related}>
              {related.map((item) => (
                <Button
                  key={item.slug}
                  view="outlined"
                  size="l"
                  href={`/gpu/${item.slug}`}
                  component={Link}
                  prefetch
                >
                  {item.shortTitle}
                </Button>
              ))}
              <Button view="flat" size="l" href="/gpu" component={Link} prefetch>
                Все GPU
              </Button>
            </Flex>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="gpu-faq-title">
          <Text as="h2" variant="header-2" id="gpu-faq-title" className={styles.sectionTitle}>
            Вопросы
          </Text>
          <div className={styles.faq}>
            {def.faq.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
            <details className={styles.faqItem}>
              <summary>Почему цифры могут отличаться от сайта провайдера?</summary>
              <p>
                Мы нормализуем публичные тарифы в единый каталог (₽ с НДС, час/месяц). У провайдера
                могут быть другие единицы, скрытые компоненты, региональные отличия или актуальные
                изменения после даты среза {stats.asOfLabel}.
              </p>
            </details>
          </div>
        </section>

        <footer className={styles.disclaimer}>
          <p>{stats.scopeHint}</p>
          <p>
            Обозначения NVIDIA и названия GPU — товарные знаки правообладателей. Cloud FinOps не
            продаёт серверы и не гарантирует наличие квот; страница помогает сравнить опубликованные
            тарифы и перейти к строкам каталога.
          </p>
        </footer>
      </main>
    </div>
  );
}
