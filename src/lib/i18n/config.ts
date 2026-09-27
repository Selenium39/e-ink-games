// ── 语言配置（i18n 单一事实来源）─────────────────────────────────
//
// locales：全量备选语言，共 16 个（对应实施方案 §6.3 的 hreflang 全集，
// 与姊妹站 e-ink.me 的语言集合完全对齐：ar + zh-TW 于 2026-09 决议加入，
// 取代早期 vi/hi 候选）。追加在数组尾部：hreflangAlternates 与 sitemap 的
// 键序 = 此数组序，尾部追加保持既有输出顺序稳定。
export const locales = [
  "en",
  "zh",
  "de",
  "es",
  "fr",
  "it",
  "pt",
  "ja",
  "ko",
  "ru",
  "nl",
  "pl",
  "tr",
  "sv",
  "ar",
  "zh-TW",
] as const;

export type Locale = (typeof locales)[number];

/** 各语言的本地显示名（语言切换器 UI 用；清单与姊妹站 e-ink.me 一致）。 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  sv: "Svenska",
  ar: "العربية",
  "zh-TW": "繁體中文",
};

/** 书写方向为 RTL 的语言（layout 的 <html dir> 由此驱动；游戏区恒 LTR）。 */
export const RTL_LOCALES: readonly string[] = ["ar"];

// 实际产出静态路由的语言（generateStaticParams 由此驱动）。
// 2026-09-28 全量开启 16 语言：前置强制门已过——npm test（160 份 content
// JSON 契约 + 16 份字典 parity + 10 款 ui-words 全覆盖）+ tsc 零错误；
// hreflang/sitemap/generateStaticParams 全部由此数组自动跟随。
export const ENABLED_LOCALES: readonly Locale[] = locales;

export const DEFAULT_LOCALE: Locale = "en";

export const SITE_URL = "https://games.e-ink.me";

// hreflang alternates（HTML <head> 侧；sitemap 侧由后续 SEO 任务生成，双通道须一致）。
// x-default 指向默认语言 /en/。
export function hreflangAlternates(): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of ENABLED_LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}/`;
  }
  languages["x-default"] = `${SITE_URL}/${DEFAULT_LOCALE}/`;
  return languages;
}
