import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

export function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { t, i18n } = useTranslation();
  const style =
    tone === 'dark' ? 'border-white/30 bg-brand-800 text-white' : 'border-line bg-surface text-ink';
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className={`rounded-md border px-2 py-1.5 ${style}`}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
