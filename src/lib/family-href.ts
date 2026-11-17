// 页脚家族站链接。品牌专名在 16 种语言里保持同一写法；
// 目的地是各站根域。不改本站路由或 slug，也不再按语言改写姊妹站路径。

export const FAMILY_LINKS = [
  { label: "Inkme", href: "https://e-ink.me" },
  { label: "Inkme News", href: "https://news.e-ink.me" },
  { label: "Inkme Games", href: "https://games.e-ink.me" },
  { label: "Inkme Nav", href: "https://nav.e-ink.me" },
  { label: "Inkme Wiki", href: "https://wiki.e-ink.me" },
] as const;
