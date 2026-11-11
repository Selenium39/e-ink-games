import { describe, expect, it } from "vitest";
import { ENABLED_LOCALES } from "./i18n/config";
import { wikiHref } from "./family-href";

const UTM = "utm_source=games.e-ink.me&utm_medium=footer";

describe("wikiHref", () => {
  it("英文与没有 wiki 语言的访问者落到站点根，而不是 /en", () => {
    expect(wikiHref("en")).toBe(`https://wiki.e-ink.me/?${UTM}`);
    for (const locale of ENABLED_LOCALES) {
      if (locale === "zh" || locale === "zh-TW" || locale === "es") continue;
      expect(wikiHref(locale)).toBe(`https://wiki.e-ink.me/?${UTM}`);
    }
  });

  it("zh 与 zh-TW 指向简体 wiki", () => {
    expect(wikiHref("zh")).toBe(`https://wiki.e-ink.me/zh/?${UTM}`);
    expect(wikiHref("zh-TW")).toBe(`https://wiki.e-ink.me/zh/?${UTM}`);
  });

  it("es 指向西班牙语 wiki", () => {
    expect(wikiHref("es")).toBe(`https://wiki.e-ink.me/es/?${UTM}`);
  });

  it("每一条都指向 wiki，而不是游戏站自身", () => {
    for (const locale of ENABLED_LOCALES) {
      const href = wikiHref(locale);
      expect(href.startsWith("https://wiki.e-ink.me/")).toBe(true);
      expect(href).not.toContain("://games.e-ink.me");
    }
  });
});
