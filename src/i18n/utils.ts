import { ui, defaultLang, languages, type SupportedLanguage } from './ui';

/**
 * Extracts the current locale from an Astro URL.
 * e.g., '/es/...' -> 'es', '/ja/privacy' -> 'ja', '/' -> 'en'
 * @param {URL} url
 * @returns {SupportedLanguage}
 */
export function getLangFromUrl(url: URL): SupportedLanguage {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in languages) {
    return lang as SupportedLanguage;
  }
  return defaultLang;
}

/**
 * Returns the dictionary of translations for the specified language.
 * @param {SupportedLanguage} lang
 * @returns {typeof ui[SupportedLanguage]}
 */
export function useTranslations(lang: SupportedLanguage) {
  return ui[lang] || ui[defaultLang];
}

/**
 * Generates the correct localized pathname for language switching.
 * e.g.,
 *   getLocalizedPath('/', 'es') -> '/es/'
 *   getLocalizedPath('/es/', 'en') -> '/'
 *   getLocalizedPath('/privacy/', 'de') -> '/de/privacy/'
 *   getLocalizedPath('/ja/privacy/', 'fr') -> '/fr/privacy/'
 *
 * @param {string} pathname - Current pathname
 * @param {SupportedLanguage} targetLang - Desired target language
 * @returns {string}
 */
export function getLocalizedPath(pathname: string, targetLang: SupportedLanguage): string {
  // Normalize pathname
  let cleanPath = pathname || '/';
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }

  // Remove any existing language prefix from pathname
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] in languages) {
    segments.shift();
  }

  const remainingPath = segments.join('/');

  if (targetLang === defaultLang) {
    return remainingPath ? `/${remainingPath}/` : '/';
  }

  return remainingPath ? `/${targetLang}/${remainingPath}/` : `/${targetLang}/`;
}

/**
 * Helper hook to get a path localized to the active language.
 * @param {SupportedLanguage} currentLang
 */
export function useTranslatedPath(currentLang: SupportedLanguage) {
  return function translatePath(path: string, lang?: SupportedLanguage) {
    return getLocalizedPath(path, lang || currentLang);
  };
}
