// 首页：registry 驱动的游戏目录页。
//
// 目录区数据源：
//   - 游戏清单：src/lib/games.registry.ts（构建期由 meta.json glob 生成）——
//     新游戏上线后本页自动出现其卡片，无需改这里（契约 §2.2 / §9）
//   - 卡片副文案：content/games/{slug}/{locale}.json 的 tagline（en 回退；
//     半成品游戏缺文案时卡片降级为纯标题行，不阻断首页）
//   - 分类导航：registry.getGamesByCategory() 的封闭分类键恒齐全，
//     游戏数自动随目录增长；分类页上线前不出链接（无死链）
// H1 与导流位（footer 家族条在 [locale]/layout.tsx）保持不变。
// 区块公共词沿用游戏页的文件内 en/zh 映射模式（games.common 就位后统一收编）。

import type { Metadata } from "next";
import Link from "next/link";
import {
  hreflangAlternates,
  SITE_URL,
  t,
  type Locale,
} from "@/lib/i18n";
import { getGamesByCategory, GAMES } from "@/lib/games.registry";
import type { GameCategory } from "@/content/games/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: t(locale, "site.home.title"),
    description: t(locale, "site.home.description"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/`,
      languages: hreflangAlternates(),
    },
  };
}

// ── 文件内双语词（games.common 缺口期模式，与游戏落地页一致）──

const CATEGORY_LABEL: Record<GameCategory, { en: string; zh: string }> = {
  puzzle: { en: "Puzzle", zh: "解谜" },
  word: { en: "Word", zh: "文字" },
  board: { en: "Board", zh: "棋类" },
  logic: { en: "Logic", zh: "逻辑" },
  daily: { en: "Daily", zh: "每日" },
};

const HOME_WORDS = {
  playCta: { en: "Play free", zh: "免费开玩" },
  categories: { en: "Browse by category", zh: "按分类浏览" },
  gameCount: { en: "game", zh: "款游戏" },
  comingSoon: { en: "Coming soon", zh: "即将上线" },
} as const;

function word(
  locale: string,
  entry: { readonly en: string; readonly zh: string },
): string {
  return (locale as Locale) === "zh" ? entry.zh : entry.en;
}

/** 卡片副文案：目标语言 tagline → en tagline → ""（半成品降级为纯标题卡） */
async function loadTagline(slug: string, locale: Locale): Promise<string> {
  const tryLoad = async (loc: string): Promise<string | undefined> => {
    try {
      const mod = await import(`@/content/games/${slug}/${loc}.json`);
      const tagline = (mod.default as { tagline?: unknown }).tagline;
      return typeof tagline === "string" && tagline.length > 0 ? tagline : undefined;
    } catch {
      return undefined;
    }
  };
  if (locale !== "en") {
    const localized = await tryLoad(locale);
    if (localized) return localized;
  }
  return (await tryLoad("en")) ?? "";
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const loc = locale as Locale;

  // 分类键恒齐全（registry 空分类也是数组）——目录长大时此处零改动
  const byCategory = getGamesByCategory();
  const taglines = await Promise.all(
    GAMES.map((g) => loadTagline(g.slug, loc)),
  );
  const taglineBySlug = new Map(
    GAMES.map((g, i) => [g.slug, taglines[i]] as const),
  );

  return (
    <div className="site-home">
      {/* 组件自带样式：React 19 按 href 去重提升，静态导出无额外请求 */}
      <style href="home-page" precedence="default">{PAGE_CSS}</style>

      {/* H1 按任务约定 en/zh 两语言页均保留英文原句：核心关键词
       * （kindle games / e-ink games）是英文搜索词。 */}
      <h1 className="site-home-title">
        Free Games for Kindle &amp; E-Ink Readers — Play in Your Browser
      </h1>
      <p className="site-intro">{t(loc, "site.home.intro")}</p>

      <hr className="ink-rule ink-rule--thick" />

      <section className="site-section" aria-labelledby="catalog-heading">
        <h2 className="ink-spec-label" id="catalog-heading">
          {t(loc, "site.home.catalogEyebrow")}
        </h2>
        <ul className="site-games">
          {GAMES.map((game) => (
            <li key={game.slug} className="site-game-card">
              <p className="site-card-label">
                <span>{word(loc, CATEGORY_LABEL[game.category])}</span>
                <Link href={`/${loc}/games/${game.slug}/`} className="site-card-cta">
                  {word(loc, HOME_WORDS.playCta)} →
                </Link>
              </p>
              <h3 className="site-card-title">
                <Link href={`/${loc}/games/${game.slug}/`}>{game.title}</Link>
              </h3>
              {taglineBySlug.get(game.slug) ? (
                <p className="site-card-tagline">{taglineBySlug.get(game.slug)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <hr className="ink-rule" />

      {/* 分类导航占位：分类页（/{locale}/category/{cat}/）上线前不出链接 */}
      <section className="site-section" aria-labelledby="cats-heading">
        <h2 className="ink-spec-label" id="cats-heading">
          {word(loc, HOME_WORDS.categories)}
        </h2>
        <ul className="site-cats">
          {(Object.keys(byCategory) as GameCategory[]).map((cat) => {
            const games = byCategory[cat];
            return (
              <li key={cat} className="site-cat-row">
                <span className="site-cat-name">{word(loc, CATEGORY_LABEL[cat])}</span>
                <span className="site-cat-count">
                  {games.length > 0
                    ? `${games.length} ${word(loc, HOME_WORDS.gameCount)}`
                    : word(loc, HOME_WORDS.comingSoon)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <hr className="ink-rule" />
    </div>
  );
}

// 首页目录样式（印刷美学：卡片 1px 细线分隔、等宽小标签、零圆角零动画）
const PAGE_CSS = `
.site-games{list-style:none;padding:0;margin:0}
.site-game-card{border-top:1px solid var(--ink-fg,#000);padding:1.25rem 0}
.site-game-card:first-child{border-top:0;padding-top:.5rem}
.site-card-label{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;margin:0 0 .375rem;font-family:var(--ink-mono,ui-monospace,monospace);font-size:.8125rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.site-card-cta{color:var(--ink-fg,#000);white-space:nowrap}
.site-card-title{margin:0;font-size:1.5rem;line-height:1.2}
.site-card-title a{color:var(--ink-fg,#000)}
.site-card-tagline{margin:.5rem 0 0;line-height:1.6}
.site-cats{list-style:none;padding:0;margin:0}
.site-cat-row{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;border-top:1px solid var(--ink-fg,#000);padding:.625rem 0}
.site-cat-row:first-child{border-top:0;padding-top:.25rem}
.site-cat-name{font-weight:700}
.site-cat-count{font-family:var(--ink-mono,ui-monospace,monospace);font-size:.8125rem;letter-spacing:.04em;text-transform:uppercase}
`;
