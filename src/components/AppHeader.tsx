'use client';

import {useState} from 'react';
import {Flex, Text, Button, Icon, Drawer} from '@gravity-ui/uikit';
import {
  Bars,
  BookOpen,
  Calculator,
  CircleInfo,
  Code,
  LogoTelegram,
  Moon,
  Sparkles,
  SquareListUl,
  Sun,
  Xmark,
} from '@gravity-ui/icons';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useAppTheme} from '@/components/AppProviders';
import styles from './AppHeader.module.css';

type NavItem = {
  href: string;
  label: string;
  icon: typeof SquareListUl;
  external?: boolean;
  disabled?: boolean;
  badge?: string;
  accent?: boolean;
};

const NAV: NavItem[] = [
  {href: '/chat', label: 'AI-ассистент', icon: Sparkles, accent: true},
  {href: '/catalog', label: 'Каталог SKU', icon: SquareListUl},
  {href: '/calculator', label: 'Калькулятор', icon: Calculator},
  {href: '/news', label: 'Новости', icon: BookOpen},
  {href: '/api', label: 'API', icon: Code, badge: 'planned'},
  {href: '/about', label: 'О нас', icon: CircleInfo},
  {
    href: 'https://t.me/cloudfinopsru',
    label: 'Сообщество',
    icon: LogoTelegram,
    external: true,
  },
];

function NavButton({
  item,
  active,
  onNavigate,
  width,
  useHref = true,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  width?: 'auto' | 'max';
  /** Desktop: Next.js Link soft-nav. Mobile drawer: onClick + router. */
  useHref?: boolean;
}) {
  const external = Boolean(item.external);
  const common = {
    view: (active ? 'flat-action' : 'flat') as 'flat-action' | 'flat',
    size: 'l' as const,
    width,
    disabled: Boolean(item.disabled),
    selected: active,
    children: (
      <>
        <Icon data={item.icon} size={16} className={item.accent ? styles.accentIcon : undefined} />
        {item.label}
        {item.badge ? (
          <Text variant="caption-2" color="secondary" className={styles.navBadge}>
            {item.badge}
          </Text>
        ) : null}
      </>
    ),
  };

  if (item.disabled) {
    return <Button {...common} />;
  }

  if (external) {
    return (
      <Button
        {...common}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
      />
    );
  }

  // Soft client navigation — avoids full reload (theme/font flash).
  if (useHref) {
    return <Button {...common} component={Link} href={item.href} prefetch />;
  }

  return <Button {...common} onClick={onNavigate} />;
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const {theme, setTheme} = useAppTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeAndGo = (item: NavItem) => {
    setMenuOpen(false);
    if (item.disabled) return;
    if (item.external) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(item.href);
  };

  return (
    <header className={styles.header}>
      <Flex alignItems="center" justifyContent="space-between" gap={4} className={styles.inner}>
        <Flex alignItems="center" gap={3} className={styles.brandRow}>
          <Link href="/" className={styles.brand}>
            <span className={styles.mark}>CF</span>
            <Text variant="subheader-2">Cloud FinOps</Text>
          </Link>
          <nav className={styles.nav} aria-label="Основная навигация">
            <Flex gap={1} alignItems="center">
              {NAV.map((item) => {
                const external = Boolean(item.external);
                const active =
                  !external &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));
                return <NavButton key={item.href} item={item} active={active} />;
              })}
            </Flex>
          </nav>
        </Flex>
        <Flex alignItems="center" gap={1} className={styles.actions}>
          <Button
            view="flat"
            size="l"
            className={styles.menuButton}
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMenuOpen(true)}
          >
            <Icon data={Bars} size={18} />
          </Button>
          <Button
            view="flat"
            size="l"
            aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Icon data={theme === 'light' ? Moon : Sun} size={18} />
          </Button>
        </Flex>
      </Flex>

      <Drawer
        open={menuOpen}
        onOpenChange={(next) => {
          if (!next) setMenuOpen(false);
        }}
        placement="right"
        size={300}
        contentOverflow="auto"
        aria-label="Меню сайта"
      >
        <div id="mobile-nav-drawer" className={styles.mobileMenu}>
          <Flex justifyContent="space-between" alignItems="center" gap={3} className={styles.mobileMenuHead}>
            <Text variant="subheader-2">Меню</Text>
            <Button
              view="flat-secondary"
              size="m"
              aria-label="Закрыть меню"
              onClick={() => setMenuOpen(false)}
            >
              <Icon data={Xmark} size={18} />
            </Button>
          </Flex>
          <nav className={styles.mobileNav} aria-label="Мобильная навигация">
            <Flex direction="column" gap={1}>
              {NAV.map((item) => {
                const external = Boolean(item.external);
                const active =
                  !external &&
                  (pathname === item.href || pathname.startsWith(`${item.href}/`));
                return (
                  <NavButton
                    key={item.href}
                    item={item}
                    active={active}
                    width="max"
                    useHref={false}
                    onNavigate={() => closeAndGo(item)}
                  />
                );
              })}
            </Flex>
          </nav>
        </div>
      </Drawer>
    </header>
  );
}
