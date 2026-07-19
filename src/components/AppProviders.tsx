'use client';

import {ThemeProvider, MobileProvider} from '@gravity-ui/uikit';
import {createContext, useCallback, useContext, useSyncExternalStore} from 'react';

type Theme = 'light' | 'dark';
type ThemeCtx = {theme: Theme; setTheme: (t: Theme) => void};

const STORAGE_KEY = 'cf-theme';
const EVENT = 'cf-theme-change';

export const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: () => undefined,
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore quota / private mode
  }
  return 'light';
}

function subscribeTheme(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function AppProviders({children}: {children: React.ReactNode}) {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, readStoredTheme, (): Theme => 'light');

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.body.classList.remove('g-root_theme_light', 'g-root_theme_dark');
    document.body.classList.add('g-root', `g-root_theme_${next}`);
    document.body.dataset.cfTheme = next;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <MobileProvider>
        <ThemeContext.Provider value={{theme, setTheme}}>{children}</ThemeContext.Provider>
      </MobileProvider>
    </ThemeProvider>
  );
}
