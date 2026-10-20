import { z } from 'zod';

export const SUPPORTED_LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Text stored in data (role names, stage names, ...) carries every language it has; `en` is the fallback. */
export const localizedTextSchema = z.object({ en: z.string().min(1) }).catchall(z.string());
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export function pickText(text: LocalizedText | undefined, locale: string): string {
  if (!text) return '';
  return text[locale] ?? text.en;
}
