// 德语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。称谓用非正式 du（游戏产品惯例），
// 术语对齐姊妹站 e-ink.me 德语词表（Sprache wählen / Web zu EPUB / E-Reader）。

import type { Messages } from "./en";

const de: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Kostenlose Browsergames für E-Ink-Reader",
      skipToContent: "Zum Inhalt springen",
      nav: {
        label: "Seitennavigation",
        games: "Spiele",
        about: "Über uns",
      },
      language: {
        label: "Sprache wählen",
      },
      footer: {
        family: "Teil der E-Ink.me-Familie",
        familyCta: "Web zu EPUB, E-Reader-Tools",
        news: "E-Ink News",
        rights: "Keine Werbung. Keine schweren Tracking-Skripte. Nur Spiele, die deinen Bildschirm respektieren.",
      },
    },
    home: {
      title: "Kostenlose Spiele für Kindle & E-Ink-Reader – direkt im Browser spielen",
      description:
        "Kostenlose Spiele direkt im Browser deines Kindle oder E-Ink-Tablets: Sudoku, Minesweeper, 2048 und mehr. Kein Download, keine Installation – gemacht für E-Ink-Bildschirme.",
      h1: "Kostenlose Spiele für Kindle & E-Ink-Reader – direkt im Browser spielen",
      intro:
        "Kostenlose Browsergames, gebaut für E-Ink-Bildschirme: reines Schwarz-Weiß, null Animationen, null Flackern. Öffne diese Seite im Browser deines Kindle, BOOX, Kobo oder eines anderen E-Ink-Geräts und leg einfach los – nichts zu installieren.",
      catalogEyebrow: "Spielekatalog",
      catalogPlaceholder:
        "Der Spielekatalog wird gerade aufgebaut. Sudoku kommt als Erstes – schau bald wieder vorbei.",
    },
    about: {
      title: "Über uns – E-Ink Games",
      h1: "Über E-Ink Games",
      intro:
        "E-Ink Games versammelt Browsergames, die sich auf E-Ink-Bildschirmen zuhause fühlen: hoher Kontrast, keine Bewegung, keine Gimmicks – nur Spiele, die deinen Bildschirm und deinen Akku respektieren.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "Die E-Ink.me-Familie",
      familyCta: "Web zu EPUB, E-Reader-Tools",
      familyPlaceholder:
        "Spiele sind nur die halbe Geschichte. Die E-Ink.me-Familie baut Werkzeuge für dein ganzes E-Reader-Leben – verwandle jeden Webartikel in ein EPUB für deinen Kindle und vieles mehr.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Puzzle",
        word: "Wortspiele",
        board: "Brettspiele",
        logic: "Logikspiele",
        daily: "Täglich",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Weitere Puzzlespiele",
        word: "Weitere Wortspiele",
        board: "Weitere Brettspiele",
        logic: "Weitere Logikspiele",
        daily: "Weitere tägliche Spiele",
      },
      howToPlay: "Spielanleitung",
      devices: "Gerätekompatibilität",
      colDevice: "Gerät",
      colStatus: "Status",
      colNote: "Hinweise",
      statusYes: "Funktioniert",
      statusLimited: "Eingeschränkt",
      statusNo: "Nicht unterstützt",
      whyEInk: "Warum es auf E-Ink funktioniert",
      faq: "Häufig gestellte Fragen",
      relatedEmpty:
        "Weitere Spiele dieser Kategorie entstehen gerade – der Katalog wächst Spiel für Spiel. Wirf bis dahin einen Blick auf alles, was bei dir im Browser schon jetzt läuft.",
      browseAll: "Alle Spiele ansehen",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Wird geladen…",
      shellError: "Das Spiel konnte nicht geladen werden – bitte lade die Seite neu und versuche es erneut.",
      shellFallback: "Dieses Spiel benötigt einen neueren Browser.",
      shellNoscript: "Dieses Spiel läuft vollständig in deinem Browser – bitte aktiviere JavaScript, um zu spielen.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Kostenlos spielen",
      categories: "Nach Kategorie stöbern",
      gameCount: "Spiele",
      comingSoon: "Kommt bald",
    },
  },
};

export default de;
