'use client';

import type {CSSProperties} from 'react';
import Link from 'next/link';
import {Button, Flex, Icon, Text} from '@gravity-ui/uikit';
import {ArrowRight, Magnifier, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {LegalMetaNotice} from '@/components/LegalMetaNotice';
import {getGpuLanding, type GpuLandingSlug} from '@/data/gpu-landings';
import {MODEL_FAMILY_META, type ModelFamily} from '@/lib/calculator/model-family';
import {hubGpuStats, showcaseModelsForLanding} from '@/lib/gpu-landing';
import styles from './GpuLanding.module.css';

const VIRTUAL_SLUGS: GpuLandingSlug[] = ['h200', 'h200-nvl', 'h100', 'a100', 'l40s', 'l4'];
const DEDICATED_SLUGS: GpuLandingSlug[] = ['b300', 'hgx-h200', 'hgx-b300'];

type HubCard = ReturnType<typeof hubGpuStats>['familyCards'][number];

function labChipLabel(family: ModelFamily): string {
  if (family === 'gpt-oss') return 'gpt-oss';
  if (family === 'mixtral') return 'Mixtral';
  return MODEL_FAMILY_META[family].title;
}

function cardStatusBadge(card: HubCard): string | null {
  if (card.slug === 'h200-nvl') return 'NVL';
  if (card.preferNode) return 'выделенный';
  return null;
}

function cardSpecsLine(card: HubCard, badge: string | null): string {
  return card.hubFacts
    .filter((fact) => {
      if (badge === 'NVL' && /^nvl$/i.test(fact.trim())) return false;
      if (badge === 'выделенный' && /выделен/i.test(fact)) return false;
      return true;
    })
    .join(' · ');
}

function suitedLabs(card: HubCard): {labels: string[]; more: number} {
  const landing = getGpuLanding(card.slug);
  if (!landing) return {labels: [], more: 0};
  const showcase = showcaseModelsForLanding(landing, 8);
  const families: ModelFamily[] = [];
  const seen = new Set<ModelFamily>();
  for (const item of showcase) {
    if (seen.has(item.family) || item.family === 'other') continue;
    seen.add(item.family);
    families.push(item.family);
  }
  const shown = families.slice(0, 3);
  return {
    labels: shown.map(labChipLabel),
    more: Math.max(0, families.length - shown.length),
  };
}

function HubModelCard({card, index}: {card: HubCard; index: number}) {
  const href = `/gpu/${card.slug}`;
  const badge = cardStatusBadge(card);
  const specs = cardSpecsLine(card, badge);
  const labs = suitedLabs(card);
  const hasPrice = Boolean(card.fromLabel);

  return (
    <Link
      href={href}
      className={styles.hubCard}
      prefetch
      style={{'--card-i': index} as CSSProperties}
    >
      <div className={styles.hubCardHead}>
        <Text as="h3" variant="header-2" className={styles.hubCardTitle}>
          {card.shortTitle}
        </Text>
        <Icon data={ArrowRight} size={16} className={styles.hubCardArrow} />
      </div>

      <p className={styles.hubCardSpecs}>
        {specs}
        {badge ? <span className={styles.hubCardBadge}>{badge}</span> : null}
      </p>

      {labs.labels.length > 0 ? (
        <div className={styles.hubSuit}>
          <span className={styles.hubSuitLabel}>Подходит для</span>
          <ul className={styles.hubSuitList}>
            {labs.labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
            {labs.more > 0 ? <li className={styles.hubSuitMore}>+{labs.more}</li> : null}
          </ul>
        </div>
      ) : null}

      <div className={styles.hubCardFoot}>
        {hasPrice ? (
          <>
            <Text as="div" variant="subheader-2" className={styles.hubCardPrice}>
              {card.fromLabel}
            </Text>
            <Text as="div" variant="body-2" className={styles.hubCardMeta}>
              {card.offerCount} предложений
            </Text>
          </>
        ) : (
          <>
            <Text as="div" variant="subheader-2" className={styles.hubCardPriceMuted}>
              Конфигурации в каталоге
            </Text>
            <Text as="div" variant="body-2" className={styles.hubCardMeta}>
              {card.offerCount > 0 ? `${card.offerCount} предложений` : 'Несколько вариантов'}
            </Text>
          </>
        )}
      </div>
    </Link>
  );
}

function CardGroup({
  title,
  cards,
  startIndex,
}: {
  title?: string;
  cards: HubCard[];
  startIndex: number;
}) {
  if (cards.length === 0) return null;
  return (
    <div className={styles.hubGroup}>
      {title ? (
        <Text as="h3" variant="subheader-2" className={styles.hubGroupTitle}>
          {title}
        </Text>
      ) : null}
      <div className={styles.hubGrid}>
        {cards.map((card, i) => (
          <HubModelCard key={card.slug} card={card} index={startIndex + i} />
        ))}
      </div>
    </div>
  );
}

export function GpuHubPage() {
  const hub = hubGpuStats();
  const bySlug = new Map(hub.familyCards.map((c) => [c.slug, c]));
  const virtual = VIRTUAL_SLUGS.map((s) => bySlug.get(s)).filter((c): c is HubCard => c != null);
  const dedicated = DEDICATED_SLUGS.map((s) => bySlug.get(s)).filter((c): c is HubCard => c != null);

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden />
      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.main}>
        <header className={styles.hubHero}>
          <Text as="h1" variant="display-1" className={styles.hubTitle}>
            Аренда GPU в облаке России
          </Text>
          <Text as="p" variant="body-2" className={styles.hubLead}>
            Сравнивайте публичные тарифы на NVIDIA H200, H100, A100, B300 и L4 в российских облаках.
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
        </header>

        <section className={styles.section} aria-labelledby="gpu-models-title">
          <Text as="h2" variant="header-1" id="gpu-models-title" className={styles.sectionTitle}>
            Модели и цены
          </Text>

          <CardGroup cards={virtual} startIndex={0} />
          <CardGroup
            title="Выделенные GPU-серверы"
            cards={dedicated}
            startIndex={virtual.length}
          />
        </section>

        <footer className={styles.disclaimer}>
          <p>Срез каталога Cloud FinOps на {hub.updatedLabel}.</p>
          <LegalMetaNotice className={styles.legalMeta} />
        </footer>
      </main>
    </div>
  );
}
