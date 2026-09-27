// 游戏落地页通用模板（实施方案 §6.2 的 9 要素；契约 §7.3/§8.3）。
//
// 服务全部游戏、零 per-game 代码：路由参数来自 games.registry（构建期由
// meta.json glob 生成），文案来自 content/games/{slug}/{locale}.json。
// 新增游戏 = 填 4 个游戏文件 + 1 个文案文件，本页零改动（规约 §9）。
//
// 9 要素与 DOM 顺序（§6.2）：
//   1 H1+价值主张 → 2 游戏本体（GameFrame 内 GameShell）→ 3 How to play
//   → 4 设备兼容表 → 5 Why it works on e-ink → 6 FAQ → 7 同类游戏内链
//   → 8 导流位 → 9 结构化数据。
//   其中导流位（8）按契约 §7.2 渲染在 GameFrame 的 promo 位——物理上
//   紧随游戏区（转化位最优），故 DOM 上位于内容区块组之前；JSON-LD（9）
//   输出在页面末尾。
//
// 本地化缺口（打样裁决，报告已列）：i18n messages 尚无 games.common 公共词表
//（规约 §8.1 预留位），本页的区块标题/表头/状态展示词暂以 TEMPLATE_WORDS
//（en/zh 映射）承载；games.common 就位后逐项替换为 t() 调用。GameShell 的
// 加载/失败/降级/noscript 四词已同在此表（shell* 前缀）传入。
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GameFrame from "@/components/GameFrame";
import GameShell from "@/components/GameShell";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import Faq from "@/components/seo/Faq";
import JsonLd, { type JsonLdObject } from "@/components/seo/JsonLd";
import { ENABLED_LOCALES, t, type Locale } from "@/lib/i18n";
import { getGame, GAMES } from "@/lib/games.registry";
import { absoluteUrl, alternatesFor } from "@/lib/seo";
import type { DeviceStatus, GameContent } from "@/content/games/types";

type Params = Promise<{ locale: string; slug: string }>;

// ── content JSON 加载（webpack 模板串 context：构建期全静态求值，零手工列表）──

/** 字段存在性校验（fail-fast：构建期失败优于运行期出错，规约 §0.5）。只读，不改写文案。 */
function assertGameContent(slug: string, locale: string, raw: unknown): asserts raw is GameContent {
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

/** en 为 source of truth 的浅回退：目标 locale 缺的顶层字段用 en 补（契约 §8.1） */
async function loadContent(slug: string, locale: Locale): Promise<GameContent> {
  const mod = (await import(`@/content/games/${slug}/${locale}.json`)) as {
    default: unknown;
  };
  assertGameContent(slug, locale, mod.default);
  const localized = mod.default;
  if (locale === "en") return localized;
  const enMod = (await import(`@/content/games/${slug}/en.json`)) as { default: unknown };
  assertGameContent(slug, "en", enMod.default);
  return { ...enMod.default, ...localized } as GameContent;
}

// ── 模板公共词（games.common 缺口期的 en/zh 映射，见文件头说明）──

const CATEGORY_LABEL: Record<string, { en: string; zh: string }> = {
  puzzle: { en: "Puzzle", zh: "解谜" },
  word: { en: "Word", zh: "文字" },
  board: { en: "Board", zh: "棋类" },
  logic: { en: "Logic", zh: "逻辑" },
  daily: { en: "Daily", zh: "每日" },
};

const TEMPLATE_WORDS = {
  howToPlay: { en: "How to play", zh: "玩法说明" },
  devices: { en: "Device compatibility", zh: "设备兼容" },
  colDevice: { en: "Device", zh: "设备" },
  colStatus: { en: "Status", zh: "支持" },
  colNote: { en: "Notes", zh: "说明" },
  statusYes: { en: "Works", zh: "可玩" },
  statusLimited: { en: "Limited", zh: "有限" },
  statusNo: { en: "Not supported", zh: "不支持" },
  whyEInk: { en: "Why it works on e-ink", zh: "为什么适合墨水屏" },
  faq: { en: "Frequently asked questions", zh: "常见问题" },
  moreGames: {
    en: "More puzzle-style games",
    zh: "更多同类游戏",
  },
  relatedEmpty: {
    en: "More games in this category are being built right now — the catalog grows game by game. In the meantime, browse everything that already runs in your browser.",
    zh: "这个分类下的更多游戏正在陆续上线——目录会一款一款长大。现在可以先看看已经能在浏览器里玩的全部游戏。",
  },
  browseAll: { en: "Browse all games", zh: "浏览全部游戏" },
  // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）：
  // 占位=加载中；加载失败=刷新重试；浏览器过老仅由 bundle 特性检测失败时写入
  shellLoading: { en: "Loading…", zh: "加载中…" },
  shellError: {
    en: "Failed to load the game — please refresh to retry.",
    zh: "游戏加载失败——请刷新页面重试。",
  },
  shellFallback: {
    en: "This game needs a newer browser.",
    zh: "此游戏需要较新的浏览器才能运行。",
  },
  shellNoscript: {
    en: "This game runs entirely in your browser — please enable JavaScript to play.",
    zh: "本游戏完全在浏览器中运行——请启用 JavaScript 后游玩。",
  },
} as const;

function word(
  locale: string,
  entry: { readonly en: string; readonly zh: string },
): string {
  return (locale as Locale) === "zh" ? entry.zh : entry.en;
}

const STATUS_WORD: Record<DeviceStatus, { en: string; zh: string }> = {
  yes: TEMPLATE_WORDS.statusYes,
  limited: TEMPLATE_WORDS.statusLimited,
  no: TEMPLATE_WORDS.statusNo,
};

// ── 路由与元数据 ──

export function generateStaticParams() {
  // ENABLED_LOCALES × registry 全部游戏（规约 §2.2：registry 是唯一游戏清单）
  return ENABLED_LOCALES.flatMap((locale) =>
    GAMES.map((game) => ({ locale, slug: game.slug })),
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = ((ENABLED_LOCALES as readonly string[]).includes(rawLocale)
    ? rawLocale
    : "en") as Locale;
  const game = getGame(slug);
  if (!game) return {};
  const content = await loadContent(slug, locale);
  const path = `/${locale}/games/${slug}/`;
  const alternates = alternatesFor(path);
  return {
    title: { absolute: content.meta.title },
    description: content.meta.description,
    alternates,
    openGraph: {
      title: content.meta.title,
      description: content.meta.description,
      url: alternates.canonical,
      siteName: "E-Ink Games",
      type: "website",
      // 分享图由 scripts/gen-og.mjs 按 registry 生成（1200×630 黑白印刷风）；
      // metadataBase 在 [locale]/layout.tsx，相对路径自动解析为绝对 URL。
      images: [
        {
          url: `/og/${slug}.png`,
          width: 1200,
          height: 630,
          alt: `${game.title} — free browser game for e-ink readers`,
        },
      ],
    },
  };
}

// ── 页面 ──

export default async function GamePage({ params }: { params: Params }) {
  const { locale: rawLocale, slug } = await params;
  const locale = ((ENABLED_LOCALES as readonly string[]).includes(rawLocale)
    ? rawLocale
    : "en") as Locale;
  const game = getGame(slug);
  if (!game) notFound();

  const content = await loadContent(slug, locale);
  const path = `/${locale}/games/${slug}/`;
  const canonical = absoluteUrl(path);

  // 可见面包屑（首页即游戏目录；分类页上线后在此插入一级 crumb）
  const crumbs = [
    { name: t(locale, "site.chrome.brand"), href: `/${locale}/` },
    { name: game.title, href: path },
  ];

  // ── 结构化数据三件套（VideoGame / FAQPage / BreadcrumbList；§6.2 第 9 要素）──
  const videoGame: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: content.meta.description,
    genre: game.seo?.videoGameGenre ?? "Puzzle",
    gamePlatform: "Web Browser",
    operatingSystem: "Any e-reader browser",
    applicationCategory: "Game",
    inLanguage: locale,
    url: canonical,
    // 免费站：price 0 明示（§6.2 第 9 要素）
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    publisher: { "@type": "Organization", name: "E-Ink.me", url: "https://e-ink.me" },
  };

  const faqPage: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const breadcrumbList: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.href),
    })),
  };

  // 同类游戏内链（§6.2 第 7 要素）：relatedSlugs 非空渲染游戏卡；
  // 仅首发游戏时渲染 category 引导（空分类不出空壳，模板任务约定）
  const relatedCards = content.related.relatedSlugs
    .map((s) => getGame(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <article className="site-game">
      {/* 组件自带样式：React 19 按 href 去重提升，静态导出无额外请求 */}
      <style href="game-page" precedence="default">{PAGE_CSS}</style>

      <Breadcrumbs items={crumbs} />

      {/* ① H1 + 一句话价值主张（含设备词） */}
      <header className="site-game-head">
        <h1>{content.h1}</h1>
        <p className="site-intro">{content.tagline}</p>
      </header>

      {/* ② 游戏本体 + ⑧ 导流位（promo 挂 GameFrame，契约 §7.2） */}
      <GameFrame
        promo={
          <p className="site-promo">
            {/* data-egames-cta：游戏 render 层在 e-result 终局面板复用此文案的
                DOM 通道（content JSON → SSG HTML → bundle 读取，全静态） */}
            <a data-egames-cta href={content.cta.href} rel="noopener">
              {content.cta.label}
            </a>
          </p>
        }
      >
        {/* 壳层文案本地化（TEMPLATE_WORDS 承载，games.common 就位后换 t()） */}
        <GameShell
          slug={slug}
          loading={word(locale, TEMPLATE_WORDS.shellLoading)}
          error={word(locale, TEMPLATE_WORDS.shellError)}
          fallback={word(locale, TEMPLATE_WORDS.shellFallback)}
          noscript={word(locale, TEMPLATE_WORDS.shellNoscript)}
        />
      </GameFrame>

      {/* ③ How to play（结构化步骤） */}
      <section className="site-section" aria-labelledby="game-how-heading">
        <h2 id="game-how-heading">{word(locale, TEMPLATE_WORDS.howToPlay)}</h2>
        <ol className="site-steps">
          {content.howToPlay.steps.map((step) => (
            <li key={step.slice(0, 24)}>{step}</li>
          ))}
        </ol>
      </section>

      <hr className="ink-rule" />

      {/* ④ 设备兼容表 */}
      <section className="site-section" aria-labelledby="game-devices-heading">
        <h2 id="game-devices-heading">{word(locale, TEMPLATE_WORDS.devices)}</h2>
        <div className="site-table-scroll">
          <table className="site-devices">
            <thead>
              <tr>
                <th scope="col">{word(locale, TEMPLATE_WORDS.colDevice)}</th>
                <th scope="col">{word(locale, TEMPLATE_WORDS.colStatus)}</th>
                <th scope="col">{word(locale, TEMPLATE_WORDS.colNote)}</th>
              </tr>
            </thead>
            <tbody>
              {content.deviceTable.rows.map((row) => (
                <tr key={row.device}>
                  <th scope="row">{row.device}</th>
                  <td>
                    <span className={`site-status site-status--${row.status}`}>
                      {word(locale, STATUS_WORD[row.status])}
                    </span>
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="ink-rule" />

      {/* ⑤ Why it works on e-ink */}
      <section className="site-section" aria-labelledby="game-why-heading">
        <h2 id="game-why-heading">{word(locale, TEMPLATE_WORDS.whyEInk)}</h2>
        <p>{content.whyEInk}</p>
      </section>

      <hr className="ink-rule" />

      {/* ⑥ FAQ 4 问（FAQPage JSON-LD 见页尾） */}
      <Faq items={content.faq} title={word(locale, TEMPLATE_WORDS.faq)} />

      <hr className="ink-rule" />

      {/* ⑦ 同类游戏内链：relatedSlugs 空 → category 引导（不出空壳） */}
      <section className="site-section" aria-labelledby="game-related-heading">
        <h2 id="game-related-heading">
          {word(locale, {
            en: `More ${(
              CATEGORY_LABEL[content.related.category] ?? CATEGORY_LABEL.puzzle
            ).en.toLowerCase()} games`,
            zh: `更多${(CATEGORY_LABEL[content.related.category] ?? CATEGORY_LABEL.puzzle).zh}游戏`,
          })}
        </h2>
        {relatedCards.length > 0 ? (
          <ul className="site-related">
            {relatedCards.map((g) => (
              <li key={g.slug}>
                <Link href={`/${locale}/games/${g.slug}/`}>{g.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {word(locale, TEMPLATE_WORDS.relatedEmpty)}{" "}
            <Link href={`/${locale}/`}>{word(locale, TEMPLATE_WORDS.browseAll)}</Link>
          </p>
        )}
      </section>

      {/* ⑨ 结构化数据三件套 */}
      <JsonLd data={[videoGame, faqPage, breadcrumbList]} />
    </article>
  );
}

// 页面模板私有样式（印刷美学：3px 粗线区块分隔、1px 表格细线、零圆角零动画）
const PAGE_CSS = `
.site-game-head h1{margin-bottom:.5rem}
.site-promo{margin:0}
.site-promo a{font-weight:700}
.site-steps{padding-left:1.25rem;margin:0}
.site-steps li{margin-bottom:.625rem;line-height:1.6}
.site-table-scroll{overflow-x:auto}
.site-devices{width:100%;border-collapse:collapse;font-size:.9375rem}
.site-devices th,.site-devices td{border:1px solid var(--ink-fg,#000);padding:.5rem .625rem;text-align:left;vertical-align:top}
.site-devices thead th{background:var(--ink-fg,#000);color:var(--ink-bg,#fff)}
.site-devices tbody th{font-weight:700;white-space:nowrap}
.site-status{display:inline-block;border:1px solid var(--ink-fg,#000);padding:.125rem .5rem;font-size:.8125rem;white-space:nowrap}
.site-status--yes{background:var(--ink-fg,#000);color:var(--ink-bg,#fff)}
.site-related{list-style:none;padding:0;margin:0;display:grid;gap:.5rem}
.site-related a{font-weight:700}
`;
