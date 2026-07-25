'use client';

import Link from 'next/link';
import {Button, Flex, Icon, Text} from '@gravity-ui/uikit';
import {ArrowRight, ChevronDown, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {LegalMetaNotice} from '@/components/LegalMetaNotice';
import {ModelFamilyMark} from '@/components/calculator/ModelFamilyMark';
import {faqForLanding, getGpuLanding, type GpuLandingDef} from '@/data/gpu-landings';
import {buildGpuLandingStats, showcaseModelsForLanding} from '@/lib/gpu-landing';
import styles from './GpuLanding.module.css';

export function GpuModelPage({def}: {def: GpuLandingDef}) {
  const stats = buildGpuLandingStats(def);
  const showcase = showcaseModelsForLanding(def, 5);
  const faq = faqForLanding(def);

  const related = def.related
    .map((slug) => getGpuLanding(slug))
    .filter((x): x is GpuLandingDef => x != null && x.slug !== def.slug);

  const familyLabel = def.shortTitle.replace(/\s*NVL$/i, '').trim() || def.shortTitle;
  const primaryCta = stats.narrowEmpty
    ? `Смотреть ${stats.familyOfferCount} предложений ${familyLabel}`
    : `Смотреть ${stats.offerCount} предложений`;
  const metaLine = stats.narrowEmpty
    ? `Отдельных строк ${def.catalogQuery} в срезе нет · ${stats.familyOfferCount} предложений семейства ${familyLabel} · обновлено ${stats.updatedLabel}`
    : `${stats.offerCount} предложений · обновлено ${stats.updatedLabel} · цены с НДС`;

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.main}>
        <header className={styles.heroSolo}>
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
          <div className={styles.heroActions}>
            <Button view="action" size="xl" href={stats.catalogHref} component={Link} prefetch>
              <Icon data={SquareListUl} size={18} />
              {primaryCta}
              <Icon data={ArrowRight} size={18} />
            </Button>
            <Button
              view="outlined"
              size="xl"
              href="/calculator/self-host"
              component={Link}
              prefetch
            >
              Подобрать конфигурацию
            </Button>
          </div>
          <p className={styles.metaLine}>{metaLine}</p>
        </header>

        <section className={styles.modelBand} aria-labelledby="gpu-about-title">
          <div className={styles.aboutCol}>
            <Text as="h2" variant="header-1" id="gpu-about-title" className={styles.sectionTitle}>
              О модели
            </Text>
            <Text as="p" variant="body-2" className={styles.aboutText}>
              {def.about}
            </Text>
            {def.aboutFacts.length > 0 ? (
              <ul className={styles.aboutFacts}>
                {def.aboutFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {showcase.length > 0 ? (
            <aside className={styles.showcasePanel} aria-labelledby="gpu-showcase-title">
              <Text
                as="h2"
                variant="subheader-2"
                id="gpu-showcase-title"
                className={styles.showcaseTitle}
              >
                Можно запустить
              </Text>
              <ul className={styles.showcaseList}>
                {showcase.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className={styles.showcaseItem} prefetch>
                      <ModelFamilyMark name={item.name} size={22} />
                      <span className={styles.showcaseText}>
                        <span className={styles.showcaseName}>{item.name}</span>
                        <span className={styles.showcaseNote}>{item.note}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </section>

        {def.useCases.length > 0 ? (
          <section className={styles.useCasesSection} aria-labelledby="gpu-usecases-title">
            <Text as="h2" variant="header-1" id="gpu-usecases-title" className={styles.sectionTitle}>
              Подходит для
            </Text>
            <ul className={styles.useCases}>
              {def.useCases.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className={styles.section} aria-labelledby="gpu-related-title">
            <Text as="h2" variant="header-1" id="gpu-related-title" className={styles.sectionTitle}>
              Другие модели
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

        <section className={styles.faqSection} aria-labelledby="gpu-faq-title">
          <Text as="h2" variant="header-1" id="gpu-faq-title" className={styles.sectionTitle}>
            Частые вопросы
          </Text>
          <div className={styles.faq}>
            {faq.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary>
                  <span>{item.question}</span>
                  <Icon data={ChevronDown} size={16} className={styles.faqChevron} />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className={styles.disclaimer}>
          <p>
            Цены рассчитаны по публичным тарифам, доступным в каталоге Cloud FinOps на{' '}
            {stats.updatedLabel}. Итоговая стоимость может отличаться из-за конфигурации, скидок и
            условий провайдера.
          </p>
          <LegalMetaNotice className={styles.legalMeta} />
        </footer>
      </main>
    </div>
  );
}
