// 荷兰语消息字典(nl)。结构须与 en.ts 逐键对齐。
// 品牌口径与姊妹站 e-ink.me 的 nl.json 对齐(如 "Taal selecteren"、"Web naar EPUB")。

import type { Messages } from "./en";

const nl: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Gratis browserspellen voor e-ink-readers",
      skipToContent: "Naar de inhoud springen",
      nav: {
        label: "Sitenavigatie",
        games: "Spellen",
        about: "Over",
      },
      language: {
        label: "Taal selecteren",
      },
      footer: {
        family: "Onderdeel van de E-Ink.me-familie",
        familyCta: "Web naar EPUB, e-reader-tools",
        news: "E-Ink News",
        rights:
          "Geen advertenties. Geen scripts vol tracking. Gewoon spellen die respect hebben voor je scherm.",
      },
    },
    home: {
      title: "Gratis spellen voor Kindle & E-Ink-readers – speel in je browser",
      description:
        "Speel gratis spellen rechtstreeks in de browser van je Kindle of e-ink-tablet: Sudoku, Minesweeper, 2048 en meer. Geen download, geen installatie – ontworpen voor e-inkschermen.",
      h1: "Gratis spellen voor Kindle & E-Ink-readers – speel in je browser",
      intro:
        "Gratis browserspellen, ontworpen voor e-inkschermen: puur zwart-wit, nul animaties, nul flikkering. Open deze site in de browser van je Kindle, BOOX, Kobo of een ander e-ink-apparaat en begin met spelen – niets te installeren.",
      catalogEyebrow: "Spelcatalogus",
      catalogPlaceholder:
        "De spelcatalogus wordt samengesteld. Sudoku komt als eerste – kom nog eens terug.",
    },
    about: {
      title: "Over – E-Ink Games",
      h1: "Over E-Ink Games",
      intro:
        "E-Ink Games verzamelt browserspellen die thuishoren op elektronisch inkt: hoog contrast, geen beweging, geen trucs – gewoon spelplezier met respect voor je scherm en je batterij.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "De E-Ink.me-familie",
      familyCta: "Web naar EPUB, e-reader-tools",
      familyPlaceholder:
        "Spellen zijn maar de helft van het verhaal. De E-Ink.me-familie bouwt tools voor je hele e-readerleven – zet elk webartikel om in een EPUB voor je Kindle, en nog veel meer.",
    },
  },
  games: {
    common: {
      category: {
        puzzle: "Puzzel",
        word: "Woord",
        board: "Bord",
        logic: "Logica",
        daily: "Dagelijks",
      },
      moreGames: {
        puzzle: "Meer puzzelspellen",
        word: "Meer woordspellen",
        board: "Meer bordspellen",
        logic: "Meer logicspellen",
        daily: "Meer dagelijkse spellen",
      },
      howToPlay: "Hoe speel je het",
      devices: "Apparaatcompatibiliteit",
      colDevice: "Apparaat",
      colStatus: "Status",
      colNote: "Opmerkingen",
      statusYes: "Werkt",
      statusLimited: "Beperkt",
      statusNo: "Niet ondersteund",
      whyEInk: "Waarom het werkt op e-ink",
      faq: "Veelgestelde vragen",
      relatedEmpty:
        "Er worden nu meer spellen in deze categorie gebouwd – de catalogus groeit spel voor spel. Bekijk ondertussen alles wat al in je browser draait.",
      browseAll: "Alle spellen bekijken",
      shellLoading: "Laden…",
      shellError: "Het spel kon niet worden geladen – vernieuw de pagina en probeer het opnieuw.",
      shellFallback: "Dit spel heeft een nieuwere browser nodig.",
      shellNoscript:
        "Dit spel draait volledig in je browser – schakel JavaScript in om te spelen.",
    },
    home: {
      playCta: "Gratis spelen",
      categories: "Bladeren per categorie",
      gameCount: "spel",
      comingSoon: "Binnenkort",
    },
  },
};

export default nl;
