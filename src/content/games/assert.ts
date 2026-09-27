// GameContent 字段契约校验(fail-fast:构建期失败优于运行期出错,规约 §0.5)。
// 由游戏落地页与 content 测试共用(2026-09 16 语言扩容时抽出)。
// 只读,不改写文案。

import type { GameContent } from "./types";

export function assertGameContent(
  slug: string,
  locale: string,
  raw: unknown,
): asserts raw is GameContent {
  const c = raw as Partial<GameContent> | null;
  const ok =
    c !== null &&
    typeof c === "object" &&
    typeof c.h1 === "string" &&
    typeof c.tagline === "string" &&
    typeof c.meta?.title === "string" &&
    typeof c.meta?.description === "string" &&
    Array.isArray(c.howToPlay?.steps) && c.howToPlay.steps.length >= 4 &&
    Array.isArray(c.deviceTable?.rows) && c.deviceTable.rows.length >= 5 &&
    typeof c.whyEInk === "string" &&
    Array.isArray(c.faq) && c.faq.length === 4 &&
    typeof c.cta?.label === "string" &&
    typeof c.cta?.href === "string" &&
    typeof c.related?.category === "string" &&
    Array.isArray(c.related?.relatedSlugs);
  if (!ok) {
    throw new Error(
      `content/games/${slug}/${locale}.json 缺少必填字段（GameContent schema，见 src/content/games/types.ts）`,
    );
  }
}
