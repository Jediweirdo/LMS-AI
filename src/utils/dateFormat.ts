import type { PreferenceDateFormat, PreferenceLanguage } from '../store/preferencesStore';

interface DateFormatOptions {
  locale?: PreferenceLanguage;
  dateFormat?: PreferenceDateFormat;
  includeYear?: boolean;
}

export function parseDateInput(dateInput: string | null | undefined): Date | null {
  if (!dateInput) return null;
  const trimmed = dateInput.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatReadableDate(
  dateInput: string | null | undefined,
  options: DateFormatOptions = {},
): string {
  const parsed = parseDateInput(dateInput);
  if (!parsed) return 'TBD';

  const locale = options.locale ?? 'en-US';
  const dateFormat = options.dateFormat ?? 'short';
  const includeYear = options.includeYear ?? dateFormat === 'long';

  const formatOptions: Intl.DateTimeFormatOptions =
    dateFormat === 'long'
      ? {
          month: 'long',
          day: 'numeric',
          year: includeYear ? 'numeric' : undefined,
        }
      : {
          month: 'short',
          day: 'numeric',
          year: includeYear ? 'numeric' : undefined,
        };

  return parsed.toLocaleDateString(locale, formatOptions);
}

export function toDateOnlyString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
