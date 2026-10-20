import { useTranslation } from 'react-i18next';
import { pickText, type LocalizedText } from '@lams/shared';

/** Picks the current language from a `{ en, hi }` value stored in data. */
export function useText() {
  const { i18n } = useTranslation();
  return (text: LocalizedText | undefined) => pickText(text, i18n.language);
}
