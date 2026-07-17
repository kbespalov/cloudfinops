'use client';

import dynamic from 'next/dynamic';
import {Button, Icon} from '@gravity-ui/uikit';
import {Sparkles, SquareListUl} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import styles from './HomeLanding.module.css';

const HeroShaderBg = dynamic(
  () => import('./HeroShaderBg').then((m) => m.HeroShaderBg),
  {
    ssr: false,
    loading: () => <div className={styles.bgFallback} aria-hidden />,
  },
);

export function HomeLanding() {
  return (
    <div className={styles.page}>
      <HeroShaderBg />
      <div className={styles.veil} aria-hidden />

      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.stage}>
        <div className={styles.core}>
          <h1 className={styles.brand}>Cloud FinOps</h1>
          <p className={styles.lead}>
            Цены облаков России — просто и прозрачно. Каталог SKU, калькулятор и ИИ-ассистент
            FinOps, который ответит на вопросы о стоимости облаков.
          </p>
          <div className={styles.cta}>
            <Button view="action" size="xl" href="/catalog">
              <Icon data={SquareListUl} size={20} />
              Каталог
            </Button>
            <Button view="outlined-action" size="xl" href="/chat">
              <Icon data={Sparkles} size={20} />
              Спросить ИИ-ассистента
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
