import { describe, expect, it } from "vitest";
import { FAMILY_LINKS } from "./family-href";

describe("FAMILY_LINKS", () => {
  it("按固定顺序指向五个家族站根域", () => {
    expect(FAMILY_LINKS.map((link) => [link.label, link.href])).toEqual([
      ["Inkme", "https://e-ink.me"],
      ["Inkme News", "https://news.e-ink.me"],
      ["Inkme Games", "https://games.e-ink.me"],
      ["Inkme Nav", "https://nav.e-ink.me"],
      ["Inkme Wiki", "https://wiki.e-ink.me"],
    ]);
  });
});
