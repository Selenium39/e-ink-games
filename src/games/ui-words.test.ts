// 引擎词表契约测试(2026-09 16 语言):
// 对 registry 每款游戏:
//   1. words.en.ts 存在且非空(英文单一来源)
//   2. ui-words.json 每个已存在 locale 节的键集与 EN_WORDS 严格相等(不增不减)
//   3. 节名 ∈ locales 且不含 en(en 走 words.en.ts,防全语言 JSON 打进 bundle)
//   4. 全覆盖断言(15 个非 en 语言全部就位)由 REQUIRE_FULL_COVERAGE 门控:
//      Wave B(阶段③)收尾后置 true,缺语言即 fail——扩 ENABLED_LOCALES 前的强制门。
// 注意:动态 import 在文件顶层 await(describe 回调内不允许顶层 await)。

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { locales } from "../lib/i18n/config";
import { GAMES } from "../lib/games.registry";

const GAMES_DIR = dirname(fileURLToPath(import.meta.url));

/** 阶段③ Wave B 已收尾:全部 15 非 en 语言节就位,全覆盖断言生效 */
const REQUIRE_FULL_COVERAGE = true;

const NON_EN = (locales as readonly string[]).filter((l) => l !== "en");

/** 顶层收集:每款游戏的英文键集 + ui-words 各节键集 */
const GAME_WORDS = await Promise.all(
  GAMES.map(async (g) => {
    const mod = (await import(join(GAMES_DIR, g.slug, "words.en.ts"))) as {
      EN_WORDS: Record<string, string>;
    };
    const ui = JSON.parse(
      readFileSync(join(GAMES_DIR, g.slug, "ui-words.json"), "utf8"),
    ) as Record<string, Record<string, string>>;
    return { slug: g.slug, enWords: mod.EN_WORDS, ui };
  }),
);

describe("引擎词表契约", () => {
  it("registry 每款游戏都有 words.en.ts 与 ui-words.json", () => {
    for (const g of GAMES) {
      expect(existsSync(join(GAMES_DIR, g.slug, "words.en.ts")), `${g.slug}/words.en.ts`).toBe(true);
      expect(existsSync(join(GAMES_DIR, g.slug, "ui-words.json")), `${g.slug}/ui-words.json`).toBe(true);
    }
  });
});

for (const { slug, enWords, ui } of GAME_WORDS) {
  const enKeys = Object.keys(enWords).sort();

  describe(slug, () => {
    it("EN_WORDS 非空且无空值", () => {
      expect(enKeys.length).toBeGreaterThan(0);
      for (const k of enKeys) expect(enWords[k].length, `空值键 ${k}`).toBeGreaterThan(0);
    });

    it('ui-words.json 不含 "en" 节(en 走 words.en.ts,防全语言 JSON 入 bundle)', () => {
      expect(ui.en).toBeUndefined();
    });

    for (const loc of Object.keys(ui)) {
      it(`ui-words ${loc} 节键集与 EN_WORDS 严格相等`, () => {
        expect(NON_EN).toContain(loc);
        const keys = Object.keys(ui[loc]).sort();
        expect(
          {
            missing: enKeys.filter((k) => !keys.includes(k)),
            extra: keys.filter((k) => !enKeys.includes(k)),
          },
          `${slug}/${loc}: missing/extra 见上`,
        ).toEqual({ missing: [], extra: [] });
        for (const k of keys) {
          expect(ui[loc][k].length, `${slug}/${loc} 空值键 ${k}`).toBeGreaterThan(0);
        }
      });
    }

    it(
      REQUIRE_FULL_COVERAGE ? "ui-words 覆盖全部 15 个非 en 语言" : "ui-words 全覆盖(门控关闭,占位)",
      () => {
        if (!REQUIRE_FULL_COVERAGE) return;
        const missing = NON_EN.filter((l) => !(l in ui));
        expect(missing, `缺少语言节: ${missing.join(", ")}`).toEqual([]);
      },
    );
  });
}
