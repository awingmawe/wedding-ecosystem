'use client';

import { useEffect } from 'react';
import type { InvitationThemeData } from '@/lib/api';

interface ThemeProviderProps {
  theme: InvitationThemeData;
  children: React.ReactNode;
}

/**
 * Applies invitation theme colors as CSS custom properties.
 * These override the default values defined in globals.css.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.primary_color);
    root.style.setProperty('--color-secondary', theme.secondary_color);
    root.style.setProperty('--color-accent', theme.accent_color);
    root.style.setProperty('--color-background', theme.background_color);
    root.style.setProperty('--color-text', theme.text_color);

    return () => {
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-secondary');
      root.style.removeProperty('--color-accent');
      root.style.removeProperty('--color-background');
      root.style.removeProperty('--color-text');
    };
  }, [theme]);

  return <>{children}</>;
}
