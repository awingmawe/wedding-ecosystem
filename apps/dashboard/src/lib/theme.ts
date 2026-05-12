// Theme system for dashboard - dynamic color management

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  text: string;
}

// Hex color validation regex: #RGB or #RRGGBB
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/**
 * Validate a hex color string
 * Returns true for valid #RGB or #RRGGBB format
 */
export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

/**
 * Validate all theme colors
 * Returns an object with field-level errors, or null if all valid
 */
export function validateThemeColors(colors: ThemeColors): Record<string, string> | null {
  const errors: Record<string, string> = {};
  const fields: (keyof ThemeColors)[] = ['primary', 'secondary', 'accent', 'surface', 'text'];

  for (const field of fields) {
    const value = colors[field];
    if (!value || value.trim() === '') {
      errors[field] = 'Warna tidak boleh kosong';
    } else if (!isValidHexColor(value.trim())) {
      errors[field] = 'Format warna harus hex valid (contoh: #RRGGBB atau #RGB)';
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Apply theme colors to CSS custom properties (< 1 second, no reload)
 */
export function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-surface', colors.surface);
  root.style.setProperty('--color-text', colors.text);
}

/**
 * Get current theme colors from CSS custom properties
 */
export function getCurrentThemeColors(): ThemeColors {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    primary: style.getPropertyValue('--color-primary').trim() || DEFAULT_THEME.primary,
    secondary: style.getPropertyValue('--color-secondary').trim() || DEFAULT_THEME.secondary,
    accent: style.getPropertyValue('--color-accent').trim() || DEFAULT_THEME.accent,
    surface: style.getPropertyValue('--color-surface').trim() || DEFAULT_THEME.surface,
    text: style.getPropertyValue('--color-text').trim() || DEFAULT_THEME.text,
  };
}

// --- Default Theme ---

export const DEFAULT_THEME: ThemeColors = {
  primary: '#A8BBA3',
  secondary: '#F7F4EA',
  accent: '#B87C4C',
  surface: '#EBD9D1',
  text: '#2D3436',
};

// --- 5 Preset Color Palettes ---

export interface ThemePreset {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'sage-blush',
    name: 'Sage & Blush',
    colors: {
      primary: '#A8BBA3',
      secondary: '#F7F4EA',
      accent: '#B87C4C',
      surface: '#EBD9D1',
      text: '#2D3436',
    },
  },
  {
    id: 'navy-gold',
    name: 'Navy & Gold',
    colors: {
      primary: '#2C3E50',
      secondary: '#F8F9FA',
      accent: '#C9A96E',
      surface: '#ECF0F1',
      text: '#1A1A2E',
    },
  },
  {
    id: 'dusty-rose',
    name: 'Dusty Rose',
    colors: {
      primary: '#C9A5A0',
      secondary: '#FDF6F0',
      accent: '#8B5E3C',
      surface: '#F5E6E0',
      text: '#3D2C2E',
    },
  },
  {
    id: 'forest-cream',
    name: 'Forest & Cream',
    colors: {
      primary: '#5F7161',
      secondary: '#FDFCF9',
      accent: '#D4A574',
      surface: '#E8E4D9',
      text: '#2D3436',
    },
  },
  {
    id: 'lavender-silver',
    name: 'Lavender & Silver',
    colors: {
      primary: '#9B8EC0',
      secondary: '#F8F7FC',
      accent: '#A0A0A0',
      surface: '#EDE8F5',
      text: '#2D2B3A',
    },
  },
];

// --- Theme persistence ---

const THEME_STORAGE_KEY = 'wedding_dashboard_theme';

/**
 * Save theme to localStorage
 */
export function saveThemeToStorage(colors: ThemeColors): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(colors));
}

/**
 * Load theme from localStorage
 */
export function loadThemeFromStorage(): ThemeColors | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}
