'use client';

import Link from 'next/link';
import {startTransition, useState} from 'react';
import {Button, Flex, Icon, SegmentedRadioGroup, Text} from '@gravity-ui/uikit';
import {Calculator, ChevronRight, Cpu, Display} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {VmCalculatorPanel} from '@/components/calculator/VmCalculatorPanel';
import {InferenceCalculatorPanel} from '@/components/calculator/InferenceCalculatorPanel';
import type {PeriodMode} from '@/lib/calculator/quote-view';
import styles from './CalculatorPage.module.css';

type CalculatorTab = 'vm' | 'inference';

export function CalculatorPage() {
  const [tab, setTab] = useState<CalculatorTab>('vm');
  const [period, setPeriod] = useState<PeriodMode>('month');

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap>
            <Flex direction="column" gap={2}>
              <Flex alignItems="center" gap={2}>
                <Icon data={Calculator} size={24} />
                <Text variant="header-1">Калькулятор облачных нагрузок</Text>
              </Flex>
              <Text variant="body-1" color="secondary" className={styles.heroLead}>
                Рассчитайте виртуальную машину или подберите GPU-конфигурацию под open-source
                модель. Сравнение провайдеров — всегда справа.
              </Text>
            </Flex>
            <SegmentedRadioGroup
              size="m"
              value={period}
              onUpdate={(v) => {
                startTransition(() => setPeriod(v as PeriodMode));
              }}
            >
              <SegmentedRadioGroup.Option value="unit">Час</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="month">Месяц</SegmentedRadioGroup.Option>
              <SegmentedRadioGroup.Option value="year">Год</SegmentedRadioGroup.Option>
            </SegmentedRadioGroup>
          </Flex>

          <SegmentedRadioGroup
            size="l"
            aria-label="Тип калькулятора"
            value={tab}
            onUpdate={(v) => {
              startTransition(() => setTab(v as CalculatorTab));
            }}
            className={styles.modeTabs}
          >
            <SegmentedRadioGroup.Option value="vm" title="Виртуальные машины">
              <Flex alignItems="center" gap={2}>
                <Icon data={Cpu} size={16} />
                <span>Виртуальные машины</span>
              </Flex>
            </SegmentedRadioGroup.Option>
            <SegmentedRadioGroup.Option value="inference" title="AI inference">
              <Flex alignItems="center" gap={2}>
                <Icon data={Display} size={16} />
                <span>AI inference</span>
              </Flex>
            </SegmentedRadioGroup.Option>
          </SegmentedRadioGroup>
        </header>

        <div className={styles.workspace} data-tab={tab}>
          {tab === 'vm' ? (
            <VmCalculatorPanel period={period} />
          ) : (
            <InferenceCalculatorPanel period={period} />
          )}
        </div>

        <Flex justifyContent="center">
          <Button
            component={Link}
            href="/catalog?category=compute"
            view="flat-secondary"
            size="l"
            prefetch
          >
            Открыть полный каталог SKU
            <Icon data={ChevronRight} size={16} />
          </Button>
        </Flex>
      </main>
    </>
  );
}
