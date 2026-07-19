'use client';

import Link from 'next/link';
import {Button, Flex, Icon, Text} from '@gravity-ui/uikit';
import {LogoTelegram, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import styles from './AboutPage.module.css';

export function AboutPage() {
  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <Text variant="header-1">О нас</Text>
          <Text variant="body-2" className={styles.lead}>
            Cloud FinOps — открытое сообщество практиков. Мы разбираемся в стоимости облака и
            помогаем сравнивать публичные облака в России проще и прозрачнее.
          </Text>
        </header>

        <div className={styles.sections}>
          <section className={styles.section}>
            <Text variant="subheader-2">Что здесь</Text>
            <p>
              Каталог сравнимых SKU и новости о возможностях провайдеров. В планах — открытые
              инструменты FinOps: калькулятор, методики и общие подходы к учёту затрат.
            </p>
          </section>

          <section className={styles.section}>
            <Text variant="subheader-2">Участвуйте</Text>
            <p>
              Присоединяйтесь к обсуждению в Telegram — делимся опытом, уточняем данные и вместе
              развиваем проект.
            </p>
            <Flex className={styles.actions}>
              <Button
                view="action"
                size="l"
                href="https://t.me/cloudfinopsru"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon data={LogoTelegram} size={16} />
                Сообщество в Telegram
              </Button>
              <Button component={Link} href="/catalog" view="outlined" size="l" prefetch>
                <Icon data={SquareListUl} size={16} />
                Каталог SKU
              </Button>
            </Flex>
          </section>
        </div>
      </main>
    </>
  );
}
