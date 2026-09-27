// 游戏 content JSON 契约测试(2026-09 16 语言):
// fs 遍历 src/content/games/{slug}/{locale}.json 全量文件,逐份校验:
//   1. assertGameContent 字段契约(与构建期同一份断言,提前失败信息更可读)
//   2. meta.title / meta.description 长度阈值(按语言族放宽:德/俄等长词语言余量)
//   3. cta.href 白名单、relatedSlugs ⊆ registry、deviceTable.status 封闭词表
//   4. 文件名 ∈ locales(防拼错语言码产出死路由)

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { locales } from "../../lib/i18n/config";
import { GAMES } from "../../lib/games.registry";
import { assertGameContent } from "./assert";
import type { GameContent } from "./types";

const CONTENT_DIR = dirname(fileURLToPath(import.meta.url));

/** 语言族长度阈值:en 按 README 硬约束;CJK 按字数;拉丁系放宽(德/俄长词现实余量) */
function limits(locale: string): { title: number; description: number } {
  if (locale === "en") return { title: 60, description: 155 };
  if (["zh", "zh-TW", "ja", "ko"].includes(locale)) return { title: 40, description: 90 };
  return { title: 75, description: 180 };
}

const SLUGS = new Set(GAMES.map((g) => g.slug));
const CTA_HREFS = new Set(["https://e-ink.me"]);
const STATUSES = new Set(["yes", "limited", "no"]);
const CATEGORIES = new Set(["puzzle", "word", "board", "logic", "daily"]);

function contentFiles(): { slug: string; locale: string; path: string }[] {
  const out: { slug: string; locale: string; path: string }[] = [];
  for (const slug of readdirSync(CONTENT_DIR)) {
    const dir = join(CONTENT_DIR, slug);
    try {
      if (!readdirSync(dir).some(() => true)) continue; // 非目录
    } catch {
      continue;
    }
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      out.push({ slug, locale: file.replace(/\.json$/, ""), path: join(dir, file) });
    }
  }
  return out;
}

describe("content JSON 契约", () => {
  it("存在至少 en/zh 两语言 × 10 款内容文件", () => {
    expect(contentFiles().length).toBeGreaterThanOrEqual(20);
  });

  for (const { slug, locale, path } of contentFiles()) {
    it(`${slug}/${locale}.json`, () => {
      // 文件名语言码合法
      expect(locales as readonly string[]).toContain(locale);
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      expect(() => assertGameContent(slug, locale, raw)).not.toThrow();
      const c = raw as GameContent;

      // 长度阈值
      const { title, description } = limits(locale);
      expect(
        c.meta.title.length,
        `title ${c.meta.title.length} > ${title}: ${c.meta.title}`,
      ).toBeLessThanOrEqual(title);
      expect(
        c.meta.description.length,
        `description ${c.meta.description.length} > ${description}`,
      ).toBeLessThanOrEqual(description);

      // 值域
      expect(CTA_HREFS).toContain(c.cta.href);
      expect(CATEGORIES).toContain(c.related.category);
      for (const s of c.related.relatedSlugs) expect(SLUGS).toContain(s);
      for (const row of c.deviceTable.rows) expect(STATUSES).toContain(row.status);
      for (const item of c.faq) {
        expect(item.q.length).toBeGreaterThan(0);
        expect(item.a.length).toBeGreaterThan(0);
      }
    });
  }
});
