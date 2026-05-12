'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  type ThemeColors,
  DEFAULT_THEME,
  THEME_PRESETS,
  type ThemePreset,
  applyThemeColors,
  validateThemeColors,
  saveThemeToStorage,
  loadThemeFromStorage,
} from '@/lib/theme';

interface ThemeContextValue {
  colors: ThemeColors;
  presets: ThemePreset[];
  errors: Record<string, string> | null;
  setColors: (colors: ThemeColors) => void;
  applyPreset: (presetId: string) => void;
  updateColor: (field: keyof ThemeColors, value: string) => void;
  resetToDefault: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colors, setColorsState] = useState<ThemeColors>(DEFAULT_THEME);
  const [errors, setErrors] = useState<Record<string, string> | null>(null);

  // Load saved theme on mount
  useEffect(() => {
    const saved = loadThemeFromStorage();
    if (saved) {
      setColorsState(saved);
      applyThemeColors(saved);
    }
  }, []);

  const setColors = useCallback((newColors: ThemeColors) => {
    const validationErrors = validateThemeColors(newColors);
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors(null);
    setColorsState(newColors);
    applyThemeColors(newColors);
    saveThemeToStorage(newColors);
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setErrors(null);
      setColorsState(preset.colors);
      applyThemeColors(preset.colors);
      saveThemeToStorage(preset.colors);
    }
  }, []);

  const updateColor = useCallback((field: keyof ThemeColors, value: string) => {
    setColorsState((prev) => {
      const updated = { ...prev, [field]: value };
      const validationErrors = validateThemeColors(updated);
      if (validationErrors) {
        setErrors(validationErrors);
        // Don't apply invalid colors but update state for input display
        return updated;
      }
      setErrors(null);
      applyThemeColors(updated);
      saveThemeToStorage(updated);
      return updated;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setErrors(null);
    setColorsState(DEFAULT_THEME);
    applyThemeColors(DEFAULT_THEME);
    saveThemeToStorage(DEFAULT_THEME);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        colors,
        presets: THEME_PRESETS,
        errors,
        setColors,
        applyPreset,
        updateColor,
        resetToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
