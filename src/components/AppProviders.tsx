'use client';

import {ThemeProvider, MobileProvider} from '@gravity-ui/uikit';
import {createContext, useContext, useEffect, useState} from 'react';

type Theme = 'light' | 'dark';
type ThemeCtx = {theme: Theme; setTheme: (t: Theme) => void};

export const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: () => undefined,
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

export function AppProviders({children}: {children: React.ReactNode}) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem('cf-theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('cf-theme', theme);
  }, [theme]);

  return (
    <ThemeProvider theme={theme}>
      <MobileProvider>
        <ThemeContext.Provider value={{theme, setTheme}}>{children}</ThemeContext.Provider>
      </MobileProvider>
    </ThemeProvider>
  );
}
