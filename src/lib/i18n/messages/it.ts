// 意大利语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。

import type { Messages } from "./en";

const it: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Giochi gratis nel browser per e-reader e-ink",
      skipToContent: "Salta al contenuto",
      nav: {
        label: "Navigazione del sito",
        games: "Giochi",
        about: "Chi siamo",
      },
      language: {
        label: "Seleziona lingua",
      },
      footer: {
        family: "Parte della famiglia E-Ink.me",
        familyCta: "Web in EPUB, strumenti per e-reader",
        rights:
          "Nessuna pubblicità. Nessuno script che ti traccia. Solo giochi che rispettano il tuo schermo.",
      },
    },
    home: {
      title: "Giochi gratis per Kindle e lettori e-ink — gioca nel browser",
      description:
        "Gioca gratis direttamente nel browser del tuo Kindle o tablet e-ink: Sudoku, Minesweeper, 2048 e altro. Nessun download, nessuna installazione — pensato per gli schermi e-ink.",
      h1: "Giochi gratis per Kindle e lettori e-ink — gioca nel browser",
      intro:
        "Giochi da browser disegnati per gli schermi e-ink: bianco e nero puro, zero animazioni, zero sfarfallii. Apri questo sito nel browser del tuo Kindle, BOOX, Kobo o di qualsiasi dispositivo e-ink e inizia a giocare — non c'è nulla da installare.",
      catalogEyebrow: "Catalogo dei giochi",
      catalogPlaceholder:
        "Il catalogo dei giochi sta prendendo forma. Il Sudoku arriva per primo — torna presto.",
    },
    about: {
      title: "Chi siamo — E-Ink Games",
      h1: "Chi siamo — E-Ink Games",
      intro:
        "E-Ink Games raccoglie giochi da browser che si trovano a casa propria sull'inchiostro elettronico: alto contrasto, nessun movimento, nessun trucco — solo giochi che rispettano il tuo schermo e la tua batteria.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "La famiglia E-Ink.me",
      familyCta: "Web in EPUB, strumenti per e-reader",
      familyPlaceholder:
        "I giochi sono solo metà della storia. La famiglia E-Ink.me costruisce strumenti per tutta la tua vita da lettore digitale — trasforma qualsiasi articolo web in un EPUB per il tuo Kindle, e molto altro.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Rompicapo",
        word: "Parole",
        board: "Tavolo",
        logic: "Logica",
        daily: "Quotidiano",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Altri rompicapi",
        word: "Altri giochi di parole",
        board: "Altri giochi da tavolo",
        logic: "Altri giochi di logica",
        daily: "Altri giochi quotidiani",
      },
      howToPlay: "Come si gioca",
      devices: "Compatibilità dei dispositivi",
      colDevice: "Dispositivo",
      colStatus: "Stato",
      colNote: "Note",
      statusYes: "Funziona",
      statusLimited: "Limitato",
      statusNo: "Non supportato",
      whyEInk: "Perché funziona sugli schermi e-ink",
      faq: "Domande frequenti",
      relatedEmpty:
        "Altri giochi di questa categoria sono in costruzione proprio adesso — il catalogo cresce un gioco alla volta. Nel frattempo, dai un'occhiata a tutto ciò che già gira nel tuo browser.",
      browseAll: "Vedi tutti i giochi",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Caricamento…",
      shellError: "Impossibile caricare il gioco — aggiorna la pagina per riprovare.",
      shellFallback: "Questo gioco richiede un browser più recente.",
      shellNoscript:
        "Questo gioco funziona interamente nel tuo browser — attiva JavaScript per giocare.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Gioca gratis",
      categories: "Esplora per categoria",
      gameCount: "gioco",
      comingSoon: "In arrivo",
    },
  },
};

export default it;
