// 法语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。

import type { Messages } from "./en";

const fr: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Des jeux navigateur gratuits pour liseuses e-ink",
      skipToContent: "Aller au contenu",
      nav: {
        label: "Navigation du site",
        games: "Jeux",
        about: "À propos",
      },
      language: {
        label: "Choisir la langue",
      },
      footer: {
        family: "Membre de la famille E-Ink.me",
        familyCta: "Web vers EPUB, outils pour liseuses",
        rights:
          "Pas de pub. Pas de scripts de suivi intrusifs. Juste des jeux qui respectent ton écran.",
      },
    },
    home: {
      title: "Jeux gratuits pour Kindle & liseuses e-ink — Joue dans ton navigateur",
      description:
        "Joue à des jeux gratuits directement dans le navigateur de ta Kindle ou de ta tablette e-ink : Sudoku, Minesweeper, 2048 et plus encore. Sans téléchargement, sans installation — conçus pour les écrans e-ink.",
      h1: "Jeux gratuits pour Kindle & liseuses e-ink — Joue dans ton navigateur",
      intro:
        "Des jeux navigateur gratuits conçus pour les écrans e-ink : noir et blanc pur, zéro animation, zéro scintillement. Ouvre ce site dans le navigateur de ta Kindle, ta BOOX, ta Kobo ou de n'importe quel appareil e-ink, et joue — rien à installer.",
      catalogEyebrow: "Catalogue de jeux",
      catalogPlaceholder:
        "Le catalogue de jeux se prépare. Sudoku arrive en premier — à très vite.",
    },
    about: {
      title: "À propos — E-Ink Games",
      h1: "À propos d'E-Ink Games",
      intro:
        "E-Ink Games réunit des jeux navigateur qui se sentent chez eux sur l'encre électronique : contraste élevé, aucun mouvement, aucun artifice — simplement des jeux qui respectent ton écran et ta batterie.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "La famille E-Ink.me",
      familyCta: "Web vers EPUB, outils pour liseuses",
      familyPlaceholder:
        "Les jeux ne sont qu'une partie de l'histoire. La famille E-Ink.me construit des outils pour toute ta vie de lecteur — transforme n'importe quel article web en EPUB pour ta Kindle, et bien plus encore.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Casse-tête",
        word: "Mots",
        board: "Plateau",
        logic: "Logique",
        daily: "Quotidien",
      },
      moreGames: {
        puzzle: "Plus de casse-têtes",
        word: "Plus de jeux de mots",
        board: "Plus de jeux de plateau",
        logic: "Plus de jeux de logique",
        daily: "Plus de jeux quotidiens",
      },
      howToPlay: "Comment jouer",
      devices: "Compatibilité des appareils",
      colDevice: "Appareil",
      colStatus: "Statut",
      colNote: "Remarques",
      statusYes: "Fonctionne",
      statusLimited: "Limité",
      statusNo: "Non compatible",
      whyEInk: "Pourquoi ça marche sur e-ink",
      faq: "Questions fréquentes",
      relatedEmpty:
        "D'autres jeux de cette catégorie sont en construction — le catalogue grandit jeu après jeu. En attendant, découvre tout ce qui tourne déjà dans ton navigateur.",
      browseAll: "Voir tous les jeux",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Chargement…",
      shellError: "Impossible de charger le jeu — actualise la page pour réessayer.",
      shellFallback: "Ce jeu nécessite un navigateur plus récent.",
      shellNoscript:
        "Ce jeu fonctionne entièrement dans ton navigateur — active JavaScript pour y jouer.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Jouer gratuitement",
      categories: "Parcourir par catégorie",
      gameCount: "jeu",
      comingSoon: "Bientôt disponible",
    },
  },
};

export default fr;
