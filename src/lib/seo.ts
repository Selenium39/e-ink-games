// SEO 基建：绝对 URL 与 hreflang alternates（契约：语言集合与 ENABLED_LOCALES 对齐，
// x-default → /en 同路径）。
// SITE_URL 的单一事实来源在 src/lib/i18n/config.ts，此处 re-export 保持 seo 命名空间完整。

import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  SITE_URL,
  type Locale,
} from "./i18n/config";

export { SITE_URL };

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path; // 已是绝对 URL：原样返回
  const p = path.startsWith("/") ? path : "/" + path;
  return SITE_URL + p;
}

/** Next.js `Metadata["alternates"]` 可直接使用的形态 */
export interface HreflangAlternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * 去掉路径首段的语言前缀：'/zh/games/sudoku/' → '/games/sudoku/'。
 * 首段不是已启用语言时原样返回（视为已无前缀）。
 */
function stripLocalePrefix(p: string): string {
  const secondSlash = p.indexOf("/", 1);
  const first = secondSlash === -1 ? p.slice(1) : p.slice(1, secondSlash);
  if ((ENABLED_LOCALES as readonly string[]).indexOf(first) !== -1) {
    return secondSlash === -1 ? "/" : p.slice(secondSlash);
  }
  return p;
}

/**
 * 生成 hreflang alternates（HTML <head> 通道；sitemap 通道须与此保持一致）。
 *
 * @param path 当前页面的站内路径，**含语言前缀**（如 '/zh/games/sudoku/'）——
 *   canonical 指向自身语言版本（多语言站规范：每语言页 canonical = 自身）。
 *   languages 覆盖 ENABLED_LOCALES 全集；x-default → /en 同路径。
 */
export function alternatesFor(path: string): HreflangAlternates {
  const normalized = path.startsWith("/") ? path : "/" + path;
  const localeless = stripLocalePrefix(normalized);

  const languages: Record<string, string> = {};
  for (const locale of ENABLED_LOCALES) {
    languages[locale] = absoluteUrl("/" + locale + localeless);
  }
  languages["x-default"] = absoluteUrl("/" + DEFAULT_LOCALE + localeless);

  return { canonical: absoluteUrl(normalized), languages };
}

export type { Locale };
