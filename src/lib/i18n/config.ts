// ── 语言配置（i18n 单一事实来源）─────────────────────────────────
//
// locales：全量备选语言，最终目标 16 个（对应实施方案 §6.3 的 hreflang 全集）。
// 当前列出 14 个；其余语言由后续任务在 W3（文案周）补齐至 16 个
// （候选：vi / hi，或依 GSC 收录数据定），届时追加到本数组、
// 在 messages/ 下补对应字典文件，再挪入 ENABLED_LOCALES 即可产出路由。
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
] as const;

export type Locale = (typeof locales)[number];

// 实际产出静态路由的语言（generateStaticParams 由此驱动）。
// 扩语言三步：补 messages/{locale}.ts → 加入此数组 →（如需 hreflang）改 config 里的 alternates 生成。
// 方案 §七.3：若 W3 吃紧，首发 8 语言，其余 12 月补。
export const ENABLED_LOCALES: readonly Locale[] = ["en", "zh"];

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
