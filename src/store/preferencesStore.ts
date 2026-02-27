import { create } from 'zustand';

export type PreferenceLanguage = 'en-US' | 'es-ES' | 'fr-FR';
export type PreferenceDateFormat = 'short' | 'long';

export interface UserPreferences {
  notifications: boolean;
  soundEnabled: boolean;
  language: PreferenceLanguage;
  dateFormat: PreferenceDateFormat;
  reminderWindowDays: number;
  reduceMotion: boolean;
}

interface PreferencesStore extends UserPreferences {
  setPreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

const STORAGE_KEY = 'lms_settings_preferences_v2';
const LEGACY_STORAGE_KEY = 'lms_settings_preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: true,
  soundEnabled: true,
  language: 'en-US',
  dateFormat: 'short',
  reminderWindowDays: 7,
  reduceMotion: false,
};

function normalizeLanguage(value: unknown): PreferenceLanguage {
  if (value === 'en' || value === 'en-US') return 'en-US';
  if (value === 'es' || value === 'es-ES') return 'es-ES';
  if (value === 'fr' || value === 'fr-FR') return 'fr-FR';
  return DEFAULT_PREFERENCES.language;
}

function normalizeDateFormat(value: unknown): PreferenceDateFormat {
  return value === 'long' ? 'long' : 'short';
}

function loadStoredPreferences(): UserPreferences {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      notifications:
        typeof parsed.notifications === 'boolean'
          ? parsed.notifications
          : DEFAULT_PREFERENCES.notifications,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_PREFERENCES.soundEnabled,
      language: normalizeLanguage(parsed.language),
      dateFormat: normalizeDateFormat(parsed.dateFormat),
      reminderWindowDays:
        typeof parsed.reminderWindowDays === 'number'
          ? Math.min(30, Math.max(1, Math.round(parsed.reminderWindowDays)))
          : DEFAULT_PREFERENCES.reminderWindowDays,
      reduceMotion:
        typeof parsed.reduceMotion === 'boolean'
          ? parsed.reduceMotion
          : DEFAULT_PREFERENCES.reduceMotion,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persistPreferences(preferences: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function applyPreferencesToDocument(preferences: UserPreferences): void {
  document.documentElement.lang = preferences.language;
  if (preferences.reduceMotion) {
    document.documentElement.dataset.motion = 'reduced';
  } else {
    delete document.documentElement.dataset.motion;
  }
}

const initialPreferences = loadStoredPreferences();
applyPreferencesToDocument(initialPreferences);

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  ...initialPreferences,
  setPreferences: (updates) => {
    set((state) => {
      const next: UserPreferences = {
        notifications:
          typeof updates.notifications === 'boolean'
            ? updates.notifications
            : state.notifications,
        soundEnabled:
          typeof updates.soundEnabled === 'boolean'
            ? updates.soundEnabled
            : state.soundEnabled,
        language:
          updates.language !== undefined
            ? normalizeLanguage(updates.language)
            : state.language,
        dateFormat:
          updates.dateFormat !== undefined
            ? normalizeDateFormat(updates.dateFormat)
            : state.dateFormat,
        reminderWindowDays:
          updates.reminderWindowDays !== undefined
            ? Math.min(30, Math.max(1, Math.round(updates.reminderWindowDays)))
            : state.reminderWindowDays,
        reduceMotion:
          typeof updates.reduceMotion === 'boolean'
            ? updates.reduceMotion
            : state.reduceMotion,
      };
      persistPreferences(next);
      applyPreferencesToDocument(next);
      return next;
    });
  },
  resetPreferences: () => {
    persistPreferences(DEFAULT_PREFERENCES);
    applyPreferencesToDocument(DEFAULT_PREFERENCES);
    set({ ...DEFAULT_PREFERENCES });
  },
}));

export function getUserPreferences(): UserPreferences {
  const {
    notifications,
    soundEnabled,
    language,
    dateFormat,
    reminderWindowDays,
    reduceMotion,
  } = usePreferencesStore.getState();
  return {
    notifications,
    soundEnabled,
    language,
    dateFormat,
    reminderWindowDays,
    reduceMotion,
  };
}
