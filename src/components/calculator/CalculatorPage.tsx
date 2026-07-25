'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {startTransition, useState} from 'react';
import {
  Button,
  Flex,
  HelpMark,
  Icon,
  SegmentedRadioGroup,
  Tab,
  TabList,
  TabProvider,
  Text,
} from '@gravity-ui/uikit';
import {Calculator, ChevronRight} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import dynamic from 'next/dynamic';
import type {GpuPreset} from '@/lib/calculator/presets';
import type {CalculatorProviderId, PeriodMode} from '@/lib/calculator/quote-view';
import {catalogAsOfLabel} from '@/lib/catalog/compare-disclaimer';
import styles from './CalculatorPage.module.css';

/** Code-split panels so /calculator/vm never pulls the self-host recommend graph. */
const VmCalculatorPanel = dynamic(
  () => import('@/components/calculator/VmCalculatorPanel').then((m) => m.VmCalculatorPanel),
  {ssr: true},
);
const InferenceCalculatorPanel = dynamic(
  () =>
    import('@/components/calculator/InferenceCalculatorPanel').then(
      (m) => m.InferenceCalculatorPanel,
    ),
  {ssr: true},
);
const LakehouseCalculatorPanel = dynamic(
  () =>
    import('@/components/calculator/LakehouseCalculatorPanel').then(
      (m) => m.LakehouseCalculatorPanel,
    ),
  {ssr: true},
);
const AiCalculatorPanel = dynamic(
  () => import('@/components/calculator/AiCalculatorPanel').then((m) => m.AiCalculatorPanel),
  {ssr: false},
);

export type CalculatorMode = 'vm' | 'inference' | 'lakehouse' | 'ai';

const MODE_HREF: Record<CalculatorMode, string> = {
  vm: '/calculator/vm',
  inference: '/calculator/self-host',
  lakehouse: '/calculator/lakehouse',
  ai: '/calculator/ai',
};

/** Shared H1 — tabs carry the mode; per-mode titles made the hero jump on switch. */
const PAGE_TITLE = 'Калькулятор цены облака';

const MODE_TITLE: Record<CalculatorMode, string> = {
  vm: PAGE_TITLE,
  inference: PAGE_TITLE,
  lakehouse: PAGE_TITLE,
  ai: PAGE_TITLE,
};

const MODE_LEAD: Record<CalculatorMode, string> = {
  vm: 'Сравните стоимость ВМ и GPU в облаках России по публичным тарифам',
  inference: 'Подбор GPU-конфигурации для open-weight моделей в облаках РФ',
  lakehouse:
    'Калькулятор Lakehouse / Data Platform: Object Storage + Managed Kubernetes + worker ВМ под Apache Iceberg, Spark, Trino и Airflow. Сравнение open lakehouse и стоимости платформы данных в облаках России.',
  ai: 'Опишите конфигурацию текстом — справа минимальная расчётная цена и альтернативы провайдеров по публичным тарифам.',
};

export function CalculatorPage({
  mode,
  gpuPresets = [],
  title,
  lead,
  independenceNote,
  independenceTooltip,
  focusProviderId,
}: {
  mode: CalculatorMode;
  gpuPresets?: GpuPreset[];
  /** Optional H1 override (provider landings). */
  title?: string;
  /** Optional lead override (provider landings). */
  lead?: string;
  /** Short independence phrase under the lead (provider landings). */
  independenceNote?: string;
  /** Tooltip for independenceNote (provider landings). */
  independenceTooltip?: string;
  /** Provider landing focus for sidebar comparison labels. */
  focusProviderId?: CalculatorProviderId;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodMode>('month');
  const heading = title ?? MODE_TITLE[mode];
  const subtitle = lead ?? MODE_LEAD[mode];
  /** Hide default leads visually; keep in DOM for SEO. Provider `lead` stays visible. */
  const leadClassName =
    !lead &&
    (mode === 'vm' || mode === 'inference' || mode === 'lakehouse' || mode === 'ai')
      ? `${styles.heroLead} ${styles.heroLeadSeo}`
      : styles.heroLead;

  return (
    <>
      <AppHeader />
      <main className={styles.page} data-mode={mode}>
        <header className={styles.hero}>
          <Flex
            justifyContent="space-between"
            alignItems="center"
            gap={4}
            wrap
            className={styles.heroTop}
          >
            <Flex direction="column" className={styles.heroCopy}>
              <Flex alignItems="center" className={styles.heroTitleRow}>
                <Icon data={Calculator} size={20} />
                <Text as="h1" className={styles.heroTitle}>
                  {heading}
                </Text>
              </Flex>
              <Text color="complementary" className={leadClassName}>
                {subtitle}
              </Text>
              {focusProviderId && independenceNote ? (
                <div className={styles.methodLine}>
                  <Text variant="caption-2" color="hint" className={styles.methodLineText}>
                    {independenceNote}
                    {' · '}
                    Обновлено {catalogAsOfLabel()}
                  </Text>
                  {independenceTooltip ? (
                    <HelpMark
                      aria-label="О независимости расчёта"
                      iconSize="s"
                      className={styles.independenceHelp}
                    >
                      {independenceTooltip}
                    </HelpMark>
                  ) : null}
                </div>
              ) : independenceNote ? (
                <Text variant="caption-2" color="hint" className={styles.independenceNote}>
                  {independenceNote}
                </Text>
              ) : null}
            </Flex>

            <Flex alignItems="center" gap={2} className={styles.periodWrap}>
              <SegmentedRadioGroup
                size="m"
                value={period}
                onUpdate={(v) => {
                  startTransition(() => setPeriod(v as PeriodMode));
                }}
                aria-label="Период тарификации"
              >
                <SegmentedRadioGroup.Option value="unit">Час</SegmentedRadioGroup.Option>
                <SegmentedRadioGroup.Option value="month">Месяц</SegmentedRadioGroup.Option>
                <SegmentedRadioGroup.Option value="year">Год</SegmentedRadioGroup.Option>
              </SegmentedRadioGroup>
              <HelpMark aria-label="Про период тарификации" iconSize="s">
                Период отображения стоимости. Фактическая тарификация зависит от условий
                провайдера.
              </HelpMark>
            </Flex>
          </Flex>

          <TabProvider
            value={mode}
            onUpdate={(v) => {
              const next = v as CalculatorMode;
              startTransition(() => {
                router.push(MODE_HREF[next]);
              });
            }}
          >
            <TabList size="l" className={styles.tabs}>
              <Tab value="vm">Виртуальные машины</Tab>
              <Tab value="inference">Хостинг LLM</Tab>
              <Tab value="lakehouse">Lakehouse и платформа данных</Tab>
              <Tab value="ai">AI конфигурация</Tab>
            </TabList>
          </TabProvider>
        </header>

        <div className={styles.workspace} data-tab={mode}>
          {mode === 'vm' ? (
            <VmCalculatorPanel
              period={period}
              gpuPresets={gpuPresets}
              focusProviderId={focusProviderId}
            />
          ) : mode === 'inference' ? (
            <InferenceCalculatorPanel period={period} />
          ) : mode === 'lakehouse' ? (
            <LakehouseCalculatorPanel period={period} />
          ) : (
            <AiCalculatorPanel period={period} />
          )}
        </div>

        <footer className={styles.footer}>
          <Flex justifyContent="center" gap={3} wrap>
            <Button
              component={Link}
              href={
                mode === 'lakehouse'
                  ? '/calculator/vm'
                  : mode === 'ai'
                    ? '/calculator/vm'
                    : mode === 'vm'
                      ? '/calculator/lakehouse'
                      : '/calculator/vm'
              }
              view="flat-secondary"
              size="m"
              prefetch
            >
              {mode === 'lakehouse' || mode === 'ai'
                ? 'Калькулятор ВМ и GPU'
                : 'Калькулятор Lakehouse'}
              <Icon data={ChevronRight} size={16} />
            </Button>
            <Button
              component={Link}
              href={
                mode === 'inference' ? '/catalog?category=gpu' : '/catalog?category=storage'
              }
              view="flat-secondary"
              size="m"
              prefetch
            >
              Полный каталог SKU
              <Icon data={ChevronRight} size={16} />
            </Button>
          </Flex>
          {!focusProviderId ? (
            <Text variant="caption-2" color="hint" className={styles.disclaimer}>
              * Meta признана экстремистской организацией, её деятельность на территории России
              запрещена
            </Text>
          ) : null}
        </footer>
      </main>
    </>
  );
}
