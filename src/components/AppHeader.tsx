'use client';

import {Flex, Text, Button, Icon} from '@gravity-ui/uikit';
import {
  BookOpen,
  Calculator,
  CircleInfo,
  LogoTelegram,
  Moon,
  SquareListUl,
  Sun,
} from '@gravity-ui/icons';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useAppTheme} from '@/components/AppProviders';
import styles from './AppHeader.module.css';

const NAV = [
  {href: '/catalog', label: 'Каталог SKU', icon: SquareListUl},
  {href: '/news', label: 'Новости', icon: BookOpen},
  {
    href: '/calculator',
    label: 'Калькулятор',
    disabled: true,
    icon: Calculator,
    badge: 'coming soon',
  },
  {href: '/about', label: 'О нас', icon: CircleInfo},
  {
    href: 'https://t.me/cloudfinopsru',
    label: 'Сообщество',
    icon: LogoTelegram,
    external: true,
  },
];

export function AppHeader() {
  const pathname = usePathname();
  const {theme, setTheme} = useAppTheme();

  return (
    <header className={styles.header}>
      <Flex alignItems="center" justifyContent="space-between" gap={4} className={styles.inner}>
        <Flex alignItems="center" gap={3}>
          <Link href="/catalog" className={styles.brand}>
            <span className={styles.mark}>CF</span>
            <Text variant="subheader-2">Cloud FinOps</Text>
          </Link>
          <nav className={styles.nav}>
            <Flex gap={1} alignItems="center">
              {NAV.map((item) => {
                const external = 'external' in item && item.external;
                const active =
                  !external &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));
                return (
                  <Button
                    key={item.href}
                    view={active ? 'flat-action' : 'flat'}
                    size="l"
                    disabled={'disabled' in item ? item.disabled : false}
                    href={'disabled' in item && item.disabled ? undefined : item.href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    selected={active}
                  >
                    <Icon data={item.icon} size={16} />
                    {item.label}
                    {'badge' in item && item.badge ? (
                      <Text variant="caption-2" color="secondary" className={styles.navBadge}>
                        {item.badge}
                      </Text>
                    ) : null}
                  </Button>
                );
              })}
            </Flex>
          </nav>
        </Flex>
        <Button
          view="flat"
          size="l"
          aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          <Icon data={theme === 'light' ? Moon : Sun} size={18} />
        </Button>
      </Flex>
    </header>
  );
}
