// 英文消息字典（缺省回退语言）。新增语言时结构须与本文件逐键对齐。
// 当前仅覆盖 site.chrome（导航/页脚）+ 首页/关于占位所需的少量键；
// 游戏文案（games.* 命名空间）由后续任务补充。

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
};

export default en;
export type Messages = typeof en;
