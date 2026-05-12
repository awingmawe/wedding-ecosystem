import { describe, it, expect } from 'vitest';
import {
  isValidHexColor,
  validateThemeColors,
  DEFAULT_THEME,
  THEME_PRESETS,
  type ThemeColors,
} from './theme';

describe('isValidHexColor', () => {
  it('accepts valid 6-digit hex colors', () => {
    expect(isValidHexColor('#A8BBA3')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#a8bba3')).toBe(true);
    expect(isValidHexColor('#1a2B3c')).toBe(true);
  });

  it('accepts valid 3-digit hex colors', () => {
    expect(isValidHexColor('#ABC')).toBe(true);
    expect(isValidHexColor('#000')).toBe(true);
    expect(isValidHexColor('#fff')).toBe(true);
    expect(isValidHexColor('#F0A')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidHexColor('')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('#AB')).toBe(false);
    expect(isValidHexColor('#ABCDE')).toBe(false);
    expect(isValidHexColor('#ABCDEFG')).toBe(false);
    expect(isValidHexColor('ABC')).toBe(false);
    expect(isValidHexColor('#GGG')).toBe(false);
    expect(isValidHexColor('#ZZZZZZ')).toBe(false);
    expect(isValidHexColor('123456')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false);
    expect(isValidHexColor('#1234')).toBe(false);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(isValidHexColor('')).toBe(false);
    expect(isValidHexColor(' ')).toBe(false);
    expect(isValidHexColor('  ')).toBe(false);
  });
});

describe('validateThemeColors', () => {
  it('returns null for valid theme colors', () => {
    const result = validateThemeColors(DEFAULT_THEME);
    expect(result).toBeNull();
  });

  it('returns null for valid 3-digit hex colors', () => {
    const colors: ThemeColors = {
      primary: '#ABC',
      secondary: '#DEF',
      accent: '#123',
      surface: '#456',
      text: '#789',
    };
    expect(validateThemeColors(colors)).toBeNull();
  });

  it('returns errors for invalid colors', () => {
    const colors: ThemeColors = {
      primary: 'red',
      secondary: '#F7F4EA',
      accent: '#B87C4C',
      surface: '#EBD9D1',
      text: '#2D3436',
    };
    const errors = validateThemeColors(colors);
    expect(errors).not.toBeNull();
    expect(errors!.primary).toBeDefined();
    expect(errors!.secondary).toBeUndefined();
  });

  it('returns errors for empty color values', () => {
    const colors: ThemeColors = {
      primary: '',
      secondary: '#F7F4EA',
      accent: '#B87C4C',
      surface: '',
      text: '#2D3436',
    };
    const errors = validateThemeColors(colors);
    expect(errors).not.toBeNull();
    expect(errors!.primary).toBe('Warna tidak boleh kosong');
    expect(errors!.surface).toBe('Warna tidak boleh kosong');
  });

  it('returns errors for partial hex values', () => {
    const colors: ThemeColors = {
      primary: '#AB',
      secondary: '#F7F4EA',
      accent: '#B87C4C',
      surface: '#EBD9D1',
      text: '#2D3436',
    };
    const errors = validateThemeColors(colors);
    expect(errors).not.toBeNull();
    expect(errors!.primary).toContain('Format warna harus hex valid');
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const colors: ThemeColors = {
      primary: 'invalid',
      secondary: '',
      accent: '#XYZ',
      surface: '#EBD9D1',
      text: '#2D3436',
    };
    const errors = validateThemeColors(colors);
    expect(errors).not.toBeNull();
    expect(Object.keys(errors!).length).toBe(3);
  });
});

describe('THEME_PRESETS', () => {
  it('provides exactly 5 preset palettes', () => {
    expect(THEME_PRESETS).toHaveLength(5);
  });

  it('each preset has valid hex colors', () => {
    for (const preset of THEME_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(isValidHexColor(preset.colors.primary)).toBe(true);
      expect(isValidHexColor(preset.colors.secondary)).toBe(true);
      expect(isValidHexColor(preset.colors.accent)).toBe(true);
      expect(isValidHexColor(preset.colors.surface)).toBe(true);
      expect(isValidHexColor(preset.colors.text)).toBe(true);
    }
  });

  it('each preset has a unique id', () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default sage-blush preset', () => {
    const sageBlush = THEME_PRESETS.find((p) => p.id === 'sage-blush');
    expect(sageBlush).toBeDefined();
    expect(sageBlush!.colors).toEqual(DEFAULT_THEME);
  });
});

describe('DEFAULT_THEME', () => {
  it('has the correct default values', () => {
    expect(DEFAULT_THEME.primary).toBe('#A8BBA3');
    expect(DEFAULT_THEME.secondary).toBe('#F7F4EA');
    expect(DEFAULT_THEME.accent).toBe('#B87C4C');
    expect(DEFAULT_THEME.surface).toBe('#EBD9D1');
    expect(DEFAULT_THEME.text).toBe('#2D3436');
  });
});
