// ── 游戏内容 schema（单一事实来源）──────────────────────────────
//
// 本文件同时承载两份契约的类型（见仓库根《开发规约-游戏扩展框架.md》§2.1、§8）：
//   1. `src/games/{slug}/meta.json`      → GameMeta（构建期 registry 的数据源）
//   2. `src/content/games/{slug}/{locale}.json` → GameContent（游戏落地页文案）
//
// JSON 不经 import 断言强绑类型（构建期由 zod/校验脚本把守），本文件是
// 字段清单的权威参考；新增字段必须先改这里，再同步 content/README.md。

// ── §2.1 meta.json ───────────────────────────────────────────────

export type GameCategory = "puzzle" | "word" | "board" | "logic" | "daily";

/** 封闭词表；新增值须同步改本联合类型（一行），build 校验报未知值 */
export type EngineFeature =
  | "grid"
  | "keypad"
  | "timer"
  | "undo"
  | "notes"
  | "hints"
  | "daily";

export interface GameMeta {
  slug: string; // = 目录名，^[a-z0-9-]+$，全语言统一（hreflang 干净）
  title: string; // 英文游戏名，如 "Sudoku"（站点内通用标识，非 SEO title）
  category: GameCategory;
  difficulties: string[]; // 如 ["easy","medium","hard","expert"]；无难度游戏给 ["standard"]
  engineFeatures: EngineFeature[];
  seeded: boolean; // true = 支持每日种子（_engine/rng），纳入 /daily 聚合（P2）
  seo?: {
    keywordsHint?: string[]; // 如 ["sudoku for kindle", "e ink sudoku"]
    videoGameGenre?: string; // VideoGame JSON-LD 的 genre，如 "Puzzle"
  };
}

// ── §8 内容与文案契约 ────────────────────────────────────────────

/** 设备兼容表行。status 展示词由 `lib/i18n` 的 games.common 映射，不在每游戏 JSON 重复 */
export type DeviceStatus = "yes" | "limited" | "no";

export interface DeviceRow {
  device: string; // 设备/系列名（品牌词不译：Kindle Paperwhite、BOOX…）
  status: DeviceStatus;
  note: string; // 一句说明——每游戏差异化内容，是竞品没有的 SEO 差异点
  //   事实红线：不得虚构支持状态。老 Kindle 的实验性浏览器（NetFront，
  //   ES3 级 JS）无法运行游戏脚本，须如实标 "no" 并在 note 说明。
}

export interface FaqItem {
  q: string; // en 首发四问固定：免费？我的设备？要越狱吗？能离线吗？
  a: string; // en 每答 40-60 词（约 250-380 字符）；不得与 deviceTable 事实冲突
}

export interface GameContent {
  meta: {
    // SEO <title> 与 meta description。
    // en：title ≤60 字符、description ≤155 字符。
    // zh 及其他 CJK locale：按「1 个中文字符 ≈ 2 个英文字符」的展示宽度折算，
    //   建议 title ≤32 个中文字符、description ≤78 个中文字符（品牌词按原文计半宽）。
    //   这是展示宽度约束而非硬字节限制，超出会被搜索结果截断。
    title: string;
    description: string;
  };
  /** 模板（en）："{Game} for Kindle & E-Ink — Free, No Download"；含设备词 */
  h1: string;
  /** 一句话价值主张，含设备词 */
  tagline: string;
  /** 结构化玩法步骤。en 合计 ≥150 词、5-8 步；须覆盖键盘与触屏两种操作及
   *  pencil marks（若 engineFeatures 含 "notes"）。步骤须与游戏实际功能一致。 */
  howToPlay: {
    steps: string[];
  };
  /** ≥5 行；覆盖任务指定的设备矩阵（Paperwhite/Scribe/Colorsoft/BOOX/Kobo/reMarkable±老 Kindle） */
  deviceTable: {
    rows: DeviceRow[];
  };
  /** 无闪烁/静态刷新技术叙事，30-70 词。竞品全无的差异化区块，也是 guides 内链钩子 */
  whyEInk: string;
  /** 恰 4 条 → FAQPage JSON-LD */
  faq: FaqItem[];
  /** 游戏结束导流位。href 域名白名单：e-ink.me / news.e-ink.me / games.e-ink.me；
   *  label ≤140 字符（CJK 减半），文案须自然衔接"玩完游戏"场景 */
  cta: {
    label: string;
    href: string;
  };
  /** 同类游戏内链。category 用于分类页归属与 "more puzzle games" 链接；
   *  relatedSlugs 构建期校验须存在于 registry——首发游戏先留空数组，
   *  同类游戏上线后由构建管线/后续任务填充（3-5 个）。 */
  related: {
    category: GameCategory;
    relatedSlugs: string[];
  };
}
