'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {startTransition, useState} from 'react';
import {
  Button,
  Flex,
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
import type {PeriodMode} from '@/lib/calculator/quote-view';
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

export type CalculatorMode = 'vm' | 'inference';

const MODE_HREF: Record<CalculatorMode, string> = {
  vm: '/calculator/vm',
  inference: '/calculator/self-host',
};

const MODE_TITLE: Record<CalculatorMode, string> = {
  vm: 'Калькулятор облачных нагрузок',
  inference: 'Калькулятор облачных нагрузок',
};

const MODE_LEAD: Record<CalculatorMode, string> = {
  vm: 'Сравнение цен ВМ и GPU: Яндекс.Облако, VK Cloud, Selectel, Cloud.ru, MWS, T1',
  inference: 'Подбор GPU под open-weight модель в облаках РФ',
};

export function CalculatorPage({
  mode,
  gpuPresets = [],
  title,
  lead,
}: {
  mode: CalculatorMode;
  gpuPresets?: GpuPreset[];
  /** Optional H1 override (provider landings). */
  title?: string;
  /** Optional lead override (provider landings). */
  lead?: string;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodMode>('month');
  const heading = title ?? MODE_TITLE[mode];
  const subtitle = lead ?? MODE_LEAD[mode];

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <Flex justifyContent="space-between" alignItems="flex-start" gap={4} wrap>
            <Flex direction="column" className={styles.heroCopy}>
              <Flex alignItems="center" className={styles.heroTitleRow}>
                <Icon data={Calculator} size={20} />
                <Text as="h1" className={styles.heroTitle}>
                  {heading}
                </Text>
              </Flex>
              <Text color="secondary" className={styles.heroLead}>
                {subtitle}
              </Text>
            </Flex>

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
              <Tab value="inference">Self-host LLM</Tab>
            </TabList>
          </TabProvider>
        </header>

        <div className={styles.workspace} data-tab={mode}>
          {mode === 'vm' ? (
            <VmCalculatorPanel period={period} gpuPresets={gpuPresets} />
          ) : (
            <InferenceCalculatorPanel period={period} />
          )}
        </div>

        <footer className={styles.footer}>
          <Flex justifyContent="center" gap={3} wrap>
            <Button
              component={Link}
              href={mode === 'vm' ? '/calculator/self-host' : '/calculator/vm'}
              view="flat-secondary"
              size="m"
              prefetch
            >
              {mode === 'vm' ? 'Калькулятор Self-host LLM' : 'Калькулятор ВМ и GPU'}
              <Icon data={ChevronRight} size={16} />
            </Button>
            <Button
              component={Link}
              href={mode === 'vm' ? '/catalog?category=compute' : '/catalog?category=gpu'}
              view="flat-secondary"
              size="m"
              prefetch
            >
              Полный каталог SKU
              <Icon data={ChevronRight} size={16} />
            </Button>
          </Flex>
          <Text variant="caption-2" color="hint" className={styles.disclaimer}>
            * Meta признана экстремистской организацией, её деятельность на территории России
            запрещена
          </Text>
        </footer>
      </main>
    </>
  );
}
