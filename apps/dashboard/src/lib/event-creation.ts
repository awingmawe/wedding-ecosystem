/**
 * Event creation with theme application logic.
 *
 * Implements Requirement 11.7:
 * WHEN event baru dibuat, THE Platform SHALL menerapkan default theme pada dashboard
 * dan invitation sehingga tampilan langsung dapat digunakan tanpa konfigurasi manual,
 * dan IF penerapan default theme gagal karena error sistem, THEN THE Platform SHALL
 * tetap membuat event tanpa styling hingga client mengkonfigurasi theme secara manual.
 */

import { DEFAULT_THEME, type ThemeColors } from './theme';

export interface EventCreationInput {
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: string;
  tenant_id: string;
}

export interface ThemeConfig {
  dashboard: ThemeColors;
  invitation: {
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
  };
}

export interface CreatedEvent {
  id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: string;
  tenant_id: string;
  status: 'draft';
  theme_config: ThemeConfig | null;
  theme_applied: boolean;
  created_at: string;
}

export interface ThemeApplicator {
  applyDefaultTheme(eventId: string): ThemeConfig;
}

export interface EventRepository {
  createEvent(input: EventCreationInput): { id: string; created_at: string };
}

const DEFAULT_INVITATION_THEME = {
  primary_color: '#5F7161',
  secondary_color: '#A7C4A0',
  accent_color: '#C9A96E',
  background_color: '#FDFCF9',
  text_color: '#2D3436',
};

/**
 * Creates a new event with default theme application.
 * If theme application fails, the event is still created without styling.
 *
 * @returns CreatedEvent - always succeeds regardless of theme application outcome
 */
export function createEventWithTheme(
  input: EventCreationInput,
  repository: EventRepository,
  themeApplicator: ThemeApplicator
): CreatedEvent {
  // Step 1: Create the event (this must always succeed)
  const { id, created_at } = repository.createEvent(input);

  // Step 2: Attempt to apply default theme (resilient - never throws)
  let themeConfig: ThemeConfig | null = null;
  let themeApplied = false;

  try {
    themeConfig = themeApplicator.applyDefaultTheme(id);
    themeApplied = true;
  } catch {
    // Theme application failed - event is created without styling
    // Client can configure theme manually later
    themeConfig = null;
    themeApplied = false;
  }

  return {
    id,
    slug: input.slug,
    bride_name: input.bride_name,
    groom_name: input.groom_name,
    event_date: input.event_date,
    tenant_id: input.tenant_id,
    status: 'draft',
    theme_config: themeConfig,
    theme_applied: themeApplied,
    created_at,
  };
}

/**
 * Default theme applicator that returns the standard theme configuration.
 */
export function createDefaultThemeApplicator(): ThemeApplicator {
  return {
    applyDefaultTheme(_eventId: string): ThemeConfig {
      return {
        dashboard: { ...DEFAULT_THEME },
        invitation: { ...DEFAULT_INVITATION_THEME },
      };
    },
  };
}

/**
 * Creates a failing theme applicator (for testing error scenarios).
 */
export function createFailingThemeApplicator(error: Error): ThemeApplicator {
  return {
    applyDefaultTheme(_eventId: string): ThemeConfig {
      throw error;
    },
  };
}
