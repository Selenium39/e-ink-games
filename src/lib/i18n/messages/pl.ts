// 波兰语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 称谓用非正式 ty（游戏产品惯例），术语对齐姊妹站 e-ink.me 波兰语词表
//（Wybierz język / Web na EPUB / czytniki e-ink）。

import type { Messages } from "./en";

const pl: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Darmowe gry przeglądarkowe dla czytników e-ink",
      skipToContent: "Przejdź do treści",
      nav: {
        label: "Nawigacja po witrynie",
        games: "Gry",
        about: "O nas",
      },
      language: {
        label: "Wybierz język",
      },
      footer: {
        family: "Część rodziny E-Ink.me",
        familyCta: "Web na EPUB, narzędzia dla czytników",
        rights: "Bez reklam. Bez skryptów pełnych śledzenia. Tylko gry, które szanują Twój ekran.",
      },
    },
    home: {
      title: "Darmowe gry dla czytników Kindle i e-ink — graj w przeglądarce",
      description:
        "Graj za darmo w przeglądarce czytnika Kindle lub tabletu e-ink: Sudoku, Minesweeper, 2048 i więcej. Bez pobierania, bez instalacji — zaprojektowane dla ekranów e-ink.",
      h1: "Darmowe gry dla czytników Kindle i e-ink — graj w przeglądarce",
      intro:
        "Darmowe gry przeglądarkowe zaprojektowane dla ekranów e-ink: czysta czerń i biel, zero animacji, zero migotania. Otwórz tę witrynę w przeglądarce czytnika Kindle, BOOX, Kobo lub innego urządzenia e-ink i po prostu graj — niczego nie trzeba instalować.",
      catalogEyebrow: "Katalog gier",
      catalogPlaceholder:
        "Katalog gier jest właśnie tworzony. Najpierw pojawi się Sudoku — zajrzyj wkrótce.",
    },
    about: {
      title: "O nas — E-Ink Games",
      h1: "O E-Ink Games",
      intro:
        "E-Ink Games zbiera gry przeglądarkowe, które doskonale czują się na elektronicznym tuszu: wysoki kontrast, bez ruchu, bez bajerów — tylko rozgrywka, która szanuje Twój ekran i Twoją baterię.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "Rodzina E-Ink.me",
      familyCta: "Web na EPUB, narzędzia dla czytników",
      familyPlaceholder:
        "Gry to tylko połowa historii. Rodzina E-Ink.me tworzy narzędzia na całe życie z czytnikiem — zamień dowolny artykuł z sieci w EPUB dla Kindle i wiele więcej.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Puzzle",
        word: "Słowne",
        board: "Planszowe",
        logic: "Logiczne",
        daily: "Codzienne",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Więcej gier puzzle",
        word: "Więcej gier słownych",
        board: "Więcej gier planszowych",
        logic: "Więcej gier logicznych",
        daily: "Więcej codziennych gier",
      },
      howToPlay: "Jak grać",
      devices: "Zgodność z urządzeniami",
      colDevice: "Urządzenie",
      colStatus: "Status",
      colNote: "Uwagi",
      statusYes: "Działa",
      statusLimited: "Ograniczone",
      statusNo: "Nieobsługiwane",
      whyEInk: "Dlaczego to działa na e-ink",
      faq: "Często zadawane pytania",
      relatedEmpty:
        "Kolejne gry z tej kategorii powstają właśnie teraz — katalog rośnie gra po grze. W międzyczasie przejrzyj wszystko, co już teraz działa w Twojej przeglądarce.",
      browseAll: "Przeglądaj wszystkie gry",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Wczytywanie…",
      shellError: "Nie udało się wczytać gry — odśwież stronę i spróbuj ponownie.",
      shellFallback: "Ta gra wymaga nowszej przeglądarki.",
      shellNoscript: "Ta gra działa w całości w Twojej przeglądarce — włącz JavaScript, aby grać.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Graj za darmo",
      categories: "Przeglądaj według kategorii",
      gameCount: "gier",
      comingSoon: "Wkrótce",
    },
  },
};

export default pl;
