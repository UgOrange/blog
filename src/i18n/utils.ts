import { ui, defaultLang, languages } from "./ui";

export type Locale = keyof typeof ui;

export function getLangFromUrl(url: URL): Locale {
  const [, lang] = url.pathname.split("/");
  if (lang in ui) return lang as Locale;
  return defaultLang;
}

export function useTranslations(lang: Locale) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

export function getPathWithoutLang(pathname: string): string {
  const [, maybeLang, ...rest] = pathname.split("/");
  if (maybeLang in languages) {
    return "/" + rest.join("/");
  }
  return pathname;
}

export function getLocalizedPath(path: string, lang: Locale): string {
  const cleanPath = getPathWithoutLang(path);
  if (lang === defaultLang) {
    return cleanPath || "/";
  }
  return `/${lang}${cleanPath}`;
}

export function getAlternateLinks(currentPath: string) {
  const cleanPath = getPathWithoutLang(currentPath);
  return Object.keys(languages).map((lang) => ({
    lang,
    href: getLocalizedPath(cleanPath, lang as Locale),
  }));
}
