'use client';

import { LOCALES, LOCALE_LABELS, type Locale } from '../i18n/dictionaries';
import { useTranslations } from '../i18n/locale-provider';

/** Language selector — writes the locale (localStorage + cookie) and flips RTL. */
export function LocalePicker() {
  const { locale, setLocale, t } = useTranslations();
  return (
    <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6" data-testid="language-section">
      <h2 className="text-lg font-semibold text-content-strong" data-testid="language-heading">
        {t('profile.language')}
      </h2>
      <p className="mt-1 text-sm text-content-muted">{t('profile.languageHint')}</p>
      <select
        data-testid="locale-select"
        aria-label={t('profile.language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="mt-3 rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </section>
  );
}
