/** The languages the app is translated into. A person's saved language is one of these. */
export const SUPPORTED_LOCALES = ['en-US', 'es', 'fr', 'ur-PK'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
