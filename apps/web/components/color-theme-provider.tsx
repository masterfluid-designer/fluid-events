'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { COLOR_THEME_IDS, DEFAULT_COLOR_THEME, type ColorThemeId } from '@/lib/color-themes';

/**
 * ColorThemeProvider — thème de couleur (page Apparence, Manager/Admin,
 * 2026-07-17), indépendant du clair/sombre (next-themes, theme-provider.tsx).
 * Même mécanisme que ce dernier (attribut sur <html>, persisté en
 * localStorage) mais un attribut séparé (data-color-theme) : les deux se
 * combinent librement dans globals.css ([data-color-theme="x"].dark).
 * Préférence personnelle par navigateur — pas de champ backend (décision
 * produit : chaque Manager/Admin choisit pour lui-même, comme le
 * clair/sombre existant).
 */

const STORAGE_KEY = 'color-theme';

interface ColorThemeContextValue {
  colorTheme: ColorThemeId;
  setColorTheme: (theme: ColorThemeId) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored && COLOR_THEME_IDS.includes(stored) ? (stored as ColorThemeId) : DEFAULT_COLOR_THEME;
    setColorThemeState(initial);
    document.documentElement.setAttribute('data-color-theme', initial);
  }, []);

  const setColorTheme = (theme: ColorThemeId) => {
    setColorThemeState(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-color-theme', theme);
  };

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>{children}</ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const ctx = useContext(ColorThemeContext);
  if (!ctx) {
    throw new Error('useColorTheme doit être utilisé à l’intérieur de ColorThemeProvider');
  }
  return ctx;
}
