'use client';

import { useTheme } from '@/contexts/theme-context';
import type { ThemeColors } from '@/lib/theme';

const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
];

export default function ThemePage() {
  const { colors, presets, errors, updateColor, applyPreset, resetToDefault } = useTheme();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Pengaturan Tema</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kustomisasi warna dashboard sesuai tema pernikahan Anda
        </p>
      </div>

      {/* Preset Palettes */}
      <section className="mb-8">
        <h2 className="mb-4 font-heading text-lg font-semibold">Preset Palette</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className="rounded-xl border-2 border-gray-200 p-4 text-left transition-all hover:border-primary hover:shadow-md"
            >
              <p className="mb-3 text-sm font-medium">{preset.name}</p>
              <div className="flex gap-1.5">
                {Object.values(preset.colors).map((color, i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full border border-gray-200"
                    style={{ backgroundColor: color }}
                    aria-label={`Warna ${Object.keys(preset.colors)[i]}: ${color}`}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Custom Color Inputs */}
      <section className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Warna Kustom</h2>
          <button onClick={resetToDefault} className="text-sm text-gray-500 hover:text-gray-700">
            Reset ke default
          </button>
        </div>
        <p className="mb-4 mt-1 text-sm text-gray-500">
          Masukkan kode warna hex (#RRGGBB atau #RGB)
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label
                htmlFor={`color-${key}`}
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                {label}
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="h-10 w-10 shrink-0 rounded-lg border border-gray-200"
                  style={{ backgroundColor: colors[key] }}
                />
                <input
                  id={`color-${key}`}
                  type="text"
                  value={colors[key]}
                  onChange={(e) => updateColor(key, e.target.value)}
                  placeholder="#RRGGBB"
                  className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
                    errors?.[key]
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary focus:ring-primary/20'
                  }`}
                  aria-invalid={!!errors?.[key]}
                  aria-describedby={errors?.[key] ? `error-${key}` : undefined}
                />
              </div>
              {errors?.[key] && (
                <p id={`error-${key}`} className="mt-1 text-xs text-red-600" role="alert">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Preview */}
      <section>
        <h2 className="mb-4 font-heading text-lg font-semibold">Preview</h2>
        <div className="rounded-xl border p-6" style={{ backgroundColor: colors.surface }}>
          <h3 className="font-heading text-xl font-bold" style={{ color: colors.primary }}>
            Contoh Heading
          </h3>
          <p className="mt-2 text-sm" style={{ color: colors.text }}>
            Ini adalah contoh teks body dengan warna tema yang dipilih.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: colors.primary }}
            >
              Tombol Primary
            </button>
            <button
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: colors.accent }}
            >
              Tombol Accent
            </button>
          </div>
          <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: colors.secondary }}>
            <p className="text-sm" style={{ color: colors.text }}>
              Ini adalah contoh card dengan warna secondary sebagai background.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
