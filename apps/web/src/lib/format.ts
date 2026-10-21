import { useTranslation } from 'react-i18next';

const intlLocale = (lng: string) => (lng === 'hi' ? 'hi-IN' : 'en-IN');

/** Locale-aware date/number formatting (Indian conventions: lakh/crore grouping, DD MMM YYYY). */
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  return {
    date: (v?: string | Date | null) => (v ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(v)) : '—'),
    dateTime: (v?: string | Date | null) => (v ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '—'),
    number: (v?: number | null, digits = 2) => (v == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)),
  };
}

/** Whole days between a past date and now. */
export const daysSince = (v: string | Date) => Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000));
