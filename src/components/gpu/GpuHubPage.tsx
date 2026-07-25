'use client';

import type {CSSProperties} from 'react';
import Link from 'next/link';
import {Button, Flex, Icon, Text} from '@gravity-ui/uikit';
import {ArrowRight, Magnifier, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {catalogHrefForLanding} from '@/data/gpu-landings';
import {hubGpuStats} from '@/lib/gpu-landing';
import styles from './GpuLanding.module.css';

const CATALOG_CHIPS = [
  {label: 'Все GPU', href: '/catalog?category=gpu'},
  {label: 'H200', href: catalogHrefForLanding({gpuFacet: 'h200'})},
  {label: 'H100', href: catalogHrefForLanding({gpuFacet: 'h100'})},
  {label: 'A100', href: catalogHrefForLanding({gpuFacet: 'a100'})},
  {label: 'B300', href: catalogHrefForLanding({gpuFacet: 'b300'})},
  {label: 'L40S', href: catalogHrefForLanding({gpuFacet: 'l40s'})},
  {label: 'L4', href: catalogHrefForLanding({gpuFacet: 'l4'})},
] as const;

export function GpuHubPage() {
  const hub = hubGpuStats();

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.main}>
        <header className={styles.heroBand}>
          <div className={styles.heroCopy}>
            <Text as="h1" variant="display-1" className={`${styles.title} ${styles.titleOneLine}`}>
              Аренда GPU в облаке России
            </Text>
            <Text as="p" variant="body-2" className={styles.lead}>
              Сравнивайте публичные тарифы российских облаков на NVIDIA H200, H100, A100, B300 и L4.
            </Text>
            <Flex className={styles.actions}>
              <Button view="action" size="xl" href="/catalog?category=gpu" component={Link} prefetch>
                <Icon data={SquareListUl} size={18} />
                Каталог GPU
                <Icon data={ArrowRight} size={18} />
              </Button>
              <Button
                view="outlined"
                size="xl"
                href="/chat?q=%D0%A1%D0%B0%D0%BC%D1%8B%D0%B9%20%D0%B4%D0%B5%D1%88%D1%91%D0%B2%D1%8B%D0%B9%20H100%20%D0%B2%20%D0%BC%D0%B5%D1%81%D1%8F%D1%86"
                component={Link}
                prefetch
              >
                <Icon data={Magnifier} size={18} />
                Спросить ассистента
              </Button>
            </Flex>
          </div>

          <aside className={styles.heroPanel} aria-label="Срез каталога">
            <div className={styles.heroMetrics}>
              <div className={styles.heroMetric}>
                <Text as="div" variant="display-1" className={styles.heroMetricValue}>
                  {hub.gpuOfferCount}
                </Text>
                <Text variant="body-2">предложений</Text>
              </div>
              <div className={styles.heroMetric}>
                <Text as="div" variant="display-1" className={styles.heroMetricValue}>
                  {hub.providerCount}
                </Text>
                <Text variant="body-2">облачных провайдеров</Text>
              </div>
            </div>
            <div className={styles.heroPanelMeta}>
              <p>Обновлено {hub.updatedLabel}</p>
              <p>Цены с НДС, без промо и индивидуальных скидок</p>
            </div>
            <div className={styles.heroChips}>
              {CATALOG_CHIPS.map((chip) => (
                <Button
                  key={chip.href}
                  view="outlined"
                  size="m"
                  href={chip.href}
                  component={Link}
                  prefetch
                >
                  {chip.label}
                </Button>
              ))}
            </div>
          </aside>
        </header>

        <section className={styles.section} aria-labelledby="gpu-models-title">
          <Text as="h2" variant="header-2" id="gpu-models-title" className={styles.sectionTitle}>
            Модели и цены
          </Text>
          <div className={styles.grid}>
            {hub.familyCards.map((card, index) => {
              const href = `/gpu/${card.slug}`;
              const meta = [
                card.offerCount > 0 ? `${card.offerCount} предложений` : null,
                card.fromProvider,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Link
                  key={card.slug}
                  href={href}
                  className={styles.card}
                  prefetch
                  style={{'--card-i': index} as CSSProperties}
                >
                  <div className={styles.cardTop}>
                    <Text as="h3" variant="header-1" className={styles.cardTitle}>
                      {card.shortTitle}
                    </Text>
                    <ul className={styles.cardFacts}>
                      {card.hubFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.cardFoot}>
                    <div className={styles.cardPriceBlock}>
                      <Text variant="header-1" className={styles.cardPrice}>
                        {card.fromLabel ?? 'В каталоге'}
                      </Text>
                      {meta ? (
                        <Text variant="body-2" className={styles.cardMeta}>
                          {meta}
                        </Text>
                      ) : null}
                    </div>
                    <span className={styles.cardGo} aria-hidden>
                      <Icon data={ArrowRight} size={16} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className={styles.disclaimer}>
          <p>{hub.scopeHint}</p>
          <p>
            NVIDIA, H100, H200, A100, B300, L40S, L4, HGX и связанные обозначения — товарные знаки
            соответствующих правообладателей. Cloud FinOps не аффилирован с NVIDIA и облачными
            провайдерами; страницы носят информационно-сравнительный характер и не являются офертой
            или витриной продажи оборудования.
          </p>
        </footer>
      </main>
    </div>
  );
}
