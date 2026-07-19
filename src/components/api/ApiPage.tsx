'use client';

import Link from 'next/link';
import {Button, Flex, Icon, Label, Text} from '@gravity-ui/uikit';
import {Calculator, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {ApiProviderScan} from './ApiProviderScan';
import styles from './ApiPage.module.css';

const STEPS = [
  {
    title: 'Передайте конфигурацию',
    text: 'Опишите vCPU, память, диски, GPU и период одним запросом — без знания формата каждого облака.',
  },
  {
    title: 'Получите сравнимые варианты',
    text: 'API проверит публичные предложения провайдеров и приведёт цены и состав ресурсов к общей модели.',
  },
  {
    title: 'Выберите лучший вариант',
    text: 'В ответе будут стоимость, доступность, состав тарифа и ссылка на источник для принятия решения.',
  },
] as const;

export function ApiPage() {
  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <Label size="s" theme="unknown">
            В разработке
          </Label>
          <Text as="h1" variant="display-1" className={styles.heroHeading}>
            Один API для расчёта ресурсов во всех облаках
          </Text>
          <Text as="p" variant="body-1" color="secondary" className={styles.heroLead}>
            Мы проектируем единый интерфейс Cloud FinOps: вы передаёте конфигурацию один раз, а
            сервис сравнивает подходящие предложения Yandex Cloud, VK Cloud, Cloud.ru, T1 Cloud,
            Selectel и MWS.
          </Text>
        </header>

        <ApiProviderScan />

        <section className={styles.howItWorks}>
          <Flex direction="column" gap={2}>
            <Text as="h2" variant="header-1">
              Как это будет работать
            </Text>
            <Text variant="body-2" color="secondary" className={styles.sectionLead}>
              Один формат запроса вместо отдельных калькуляторов, прайс-листов и правил каждого
              провайдера.
            </Text>
          </Flex>
          <div className={styles.steps}>
            {STEPS.map((step, index) => (
              <div key={step.title} className={styles.step}>
                <Flex direction="column" gap={2} alignItems="flex-start">
                  <Text variant="caption-2" color="secondary">
                    {`0${index + 1}`}
                  </Text>
                  <Text variant="subheader-2">{step.title}</Text>
                  <Text variant="body-2" color="secondary">
                    {step.text}
                  </Text>
                </Flex>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <Flex direction="column" gap={2} alignItems="center">
            <Text as="h2" variant="header-1">
              Сравнить облака можно уже сейчас
            </Text>
            <Text variant="body-2" color="secondary" className={styles.sectionLead}>
              Пока публичный API готовится, используйте калькулятор или откройте исходные SKU в
              каталоге.
            </Text>
          </Flex>
          <Flex gap={2} wrap justifyContent="center">
            <Button component={Link} href="/calculator" view="action" size="l" prefetch>
              <Icon data={Calculator} size={16} />
              Открыть калькулятор
            </Button>
            <Button component={Link} href="/catalog" view="outlined" size="l" prefetch>
              <Icon data={SquareListUl} size={16} />
              Каталог SKU
            </Button>
          </Flex>
        </section>
      </main>
    </>
  );
}
