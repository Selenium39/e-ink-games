// 英文消息字典（缺省回退语言）。新增语言时结构须与本文件逐键对齐。
// 覆盖 site.chrome（导航/页脚/语言切换器）+ 首页/关于 + games.common
//（游戏页模板公共词，规约 §8.1）+ games.home（首页目录区）。

const en = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Free browser games for e-ink readers",
      skipToContent: "Skip to content",
      nav: {
        label: "Site navigation",
        games: "Games",
        about: "About",
      },
      language: {
        label: "Select language",
      },
      footer: {
        family: "Part of the E-Ink.me family",
        familyCta: "Web to EPUB, e-reader tools",
        rights: "No ads. No tracking-heavy scripts. Just games that respect your screen.",
      },
    },
    home: {
      title: "Free Games for Kindle & E-Ink Readers — Play in Your Browser",
      description:
        "Play free games right in your Kindle or e-ink tablet browser: Sudoku, Minesweeper, 2048 and more. No download, no install — designed for e-ink screens.",
      h1: "Free Games for Kindle & E-Ink Readers — Play in Your Browser",
      intro:
        "Free browser games designed for e-ink screens: pure black and white, zero animations, zero flicker. Open this site in the browser of your Kindle, BOOX, Kobo or any e-ink device and start playing — nothing to install.",
      catalogEyebrow: "Game Catalog",
      catalogPlaceholder:
        "The game catalog is being assembled. Sudoku arrives first — check back soon.",
    },
    about: {
      title: "About — E-Ink Games",
      h1: "About E-Ink Games",
      intro:
        "E-Ink Games collects browser games that feel at home on electronic ink: high contrast, no motion, no gimmicks — just play that respects your screen and your battery.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "The E-Ink.me Family",
      familyCta: "Web to EPUB, e-reader tools",
      familyPlaceholder:
        "Games are only half the story. The E-Ink.me family builds tools for your whole e-reader life — turn any web article into an EPUB for your Kindle, and more.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Puzzle",
        word: "Word",
        board: "Board",
        logic: "Logic",
        daily: "Daily",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "More puzzle games",
        word: "More word games",
        board: "More board games",
        logic: "More logic games",
        daily: "More daily games",
      },
      howToPlay: "How to play",
      devices: "Device compatibility",
      colDevice: "Device",
      colStatus: "Status",
      colNote: "Notes",
      statusYes: "Works",
      statusLimited: "Limited",
      statusNo: "Not supported",
      whyEInk: "Why it works on e-ink",
      faq: "Frequently asked questions",
      relatedEmpty:
        "More games in this category are being built right now — the catalog grows game by game. In the meantime, browse everything that already runs in your browser.",
      browseAll: "Browse all games",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Loading…",
      shellError: "Failed to load the game — please refresh to retry.",
      shellFallback: "This game needs a newer browser.",
      shellNoscript: "This game runs entirely in your browser — please enable JavaScript to play.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Play free",
      categories: "Browse by category",
      gameCount: "game",
      comingSoon: "Coming soon",
    },
  },
};

export default en;
export type Messages = typeof en;
