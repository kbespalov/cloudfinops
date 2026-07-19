'use client';

import {useState, type FormEvent} from 'react';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
import {Button, Flex, Icon, Text, TextInput, ThemeProvider} from '@gravity-ui/uikit';
import {ArrowRight, Magnifier} from '@gravity-ui/icons';
import {AppHeader} from '@/components/AppHeader';
import {
  HOME_EXAMPLES,
  HOME_SEARCH_PLACEHOLDER,
  chatUrlForQuery,
} from './homePrompts';
import styles from './HomeLanding.module.css';

const HeroShaderBg = dynamic(
  () => import('./HeroShaderBg').then((m) => m.HeroShaderBg),
  {
    ssr: false,
    loading: () => <div className={styles.bgFallback} aria-hidden />,
  },
);

export function HomeLanding() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const goToChat = (text: string) => {
    const next = text.trim();
    router.push(next ? chatUrlForQuery(next) : '/chat');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    goToChat(query);
  };

  return (
    <div className={styles.page}>
      <HeroShaderBg />
      <div className={styles.veil} aria-hidden />

      <div className={styles.headerSlot}>
        <AppHeader />
      </div>

      <main className={styles.stage}>
        <div className={styles.core}>
          <Text as="h1" variant="display-1" className={styles.brand}>
            Cloud FinOps
          </Text>
          <Text as="p" variant="body-2" className={styles.headline}>
            Сравнение цен облаков России
          </Text>

          {/* Light scoped theme keeps SearchInput readable when the app is dark;
              rootClassName clears .g-root's solid white square behind the card. */}
          <ThemeProvider theme="light" scoped rootClassName={styles.searchTheme}>
            <form className={styles.searchCard} onSubmit={onSubmit}>
              <Flex className={styles.searchRow} gap={3} alignItems="center">
                <TextInput
                  size="xl"
                  value={query}
                  onUpdate={setQuery}
                  placeholder={HOME_SEARCH_PLACEHOLDER}
                  className={styles.searchInput}
                  startContent={
                    <span className={styles.searchIcon} aria-hidden>
                      <Icon data={Magnifier} size={18} />
                    </span>
                  }
                  hasClear
                />
                <Button view="action" size="xl" type="submit" className={styles.searchSubmit}>
                  Сравнить
                  <Icon data={ArrowRight} size={18} />
                </Button>
              </Flex>

              <div className={styles.chips} role="list" aria-label="Примеры запросов">
                {HOME_EXAMPLES.map((example, index) => (
                  <div key={example.id} role="listitem" className={styles.chipWrap}>
                    <button
                      type="button"
                      className={styles.chip}
                      style={{animationDelay: `${0.16 + index * 0.04}s`}}
                      onClick={() => goToChat(example.prompt)}
                    >
                      <span className={styles.chipIcon} aria-hidden>
                        <Icon data={example.icon} size={16} />
                      </span>
                      <span className={styles.chipLabel}>{example.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </form>
          </ThemeProvider>
        </div>
      </main>
    </div>
  );
}
