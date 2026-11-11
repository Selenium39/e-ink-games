// 页脚家族站外链。新闻站链接留在 layout（历史注释在那里）；
// wiki 单独放这里，是因为路径规则和新闻站相反，方便单测锁住。

import type { Locale } from "./i18n/config";

const FOOTER_UTM = "utm_source=games.e-ink.me&utm_medium=footer";

// 姊妹站 wiki.e-ink.me 目前只产出 en / zh / es（其余语言索引 404）。
// 英文站在根路径 `/`，没有 `/en`（`/en` 为 404）；zh-TW 无繁体站，归入 zh。
// 与新闻站相反：wiki 的语言路径规范形式带尾斜杠
// （实测 `/zh`、`/es` 会 308 到 `/zh/`、`/es/`），英文根路径的 canonical 也是 `/`。
// 这里刻意写成带尾斜杠，避免多一次跳转。utm_* 与新闻站页脚同一套。
export function wikiHref(locale: Locale): string {
  const lang =
    locale === "zh" || locale === "zh-TW" ? "zh" : locale === "es" ? "es" : null;
  const path = lang ? `/${lang}/` : "/";
  return `https://wiki.e-ink.me${path}?${FOOTER_UTM}`;
}
