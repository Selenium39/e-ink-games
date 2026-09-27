// Svenskt meddelandelexikon. Strukturen ska vara nyckel för nyckel
// lika med en.ts (se type-constrainten i Messages); saknade nycklar
// faller automatiskt tillbaka till engelska via t(). Du-tilltal
// (svensk produktkonvention), terminologi i linje med systerwebbplatsen
// e-ink.me:s svenska ordlista (Välj språk / Webb till EPUB / e-läsare).

import type { Messages } from "./en";

const sv: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Gratis browserspel för e-läsare med e-ink",
      skipToContent: "Hoppa till innehållet",
      nav: {
        label: "Webbplatsnavigering",
        games: "Spel",
        about: "Om oss",
      },
      language: {
        label: "Välj språk",
      },
      footer: {
        family: "En del av E-Ink.me-familjen",
        familyCta: "Webb till EPUB, e-läsarverktyg",
        rights:
          "Ingen reklam. Inga spårningstunga skript. Bara spel som respekterar din skärm.",
      },
    },
    home: {
      title: "Gratis spel för Kindle & e-läsare med e-ink – spela i webbläsaren",
      description:
        "Spela gratis spel direkt i webbläsaren på din Kindle eller e-ink-surfplatta: Sudoku, Minesweeper, 2048 med flera. Ingen nedladdning, ingen installation – byggt för e-ink-skärmar.",
      h1: "Gratis spel för Kindle & e-läsare med e-ink – spela i webbläsaren",
      intro:
        "Gratis browserspel byggda för e-ink-skärmar: ren svartvitt, noll animationer, noll flimmer. Öppna webbplatsen i webbläsaren på din Kindle, BOOX, Kobo eller annan e-ink-enhet och börja spela – inget att installera.",
      catalogEyebrow: "Spelkatalog",
      catalogPlaceholder:
        "Spelkatalogen byggs just nu upp. Sudoku kommer först – titta in igen snart.",
    },
    about: {
      title: "Om oss – E-Ink Games",
      h1: "Om E-Ink Games",
      intro:
        "E-Ink Games samlar browserspel som trivs på elektroniskt bläck: hög kontrast, ingen rörelse, inga gimmicks – bara spel som respekterar din skärm och ditt batteri.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "E-Ink.me-familjen",
      familyCta: "Webb till EPUB, e-läsarverktyg",
      familyPlaceholder:
        "Spel är bara halva historien. E-Ink.me-familjen bygger verktyg för hela ditt e-läsarliv – förvandle vilken webbartikel som helst till en EPUB för din Kindle, och mycket mer.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Pussel",
        word: "Ordspel",
        board: "Brädspel",
        logic: "Logikspel",
        daily: "Dagligt",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Fler pussel",
        word: "Fler ordspel",
        board: "Fler brädspel",
        logic: "Fler logikspel",
        daily: "Fler dagliga spel",
      },
      howToPlay: "Så spelar du",
      devices: "Enhetskompatibilitet",
      colDevice: "Enhet",
      colStatus: "Status",
      colNote: "Kommentarer",
      statusYes: "Fungerar",
      statusLimited: "Begränsat",
      statusNo: "Stöds inte",
      whyEInk: "Därför fungerar det på e-ink",
      faq: "Vanliga frågor",
      relatedEmpty:
        "Fler spel i den här kategorin byggs just nu – katalogen växer spel för spel. Tills dess, kolla in allt som redan kör i din webbläsare.",
      browseAll: "Se alla spel",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Laddar…",
      shellError:
        "Spelet kunde inte laddas – uppdatera sidan och försök igen.",
      shellFallback: "Det här spelet kräver en nyare webbläsare.",
      shellNoscript:
        "Det här spelet körs helt i din webbläsare – aktivera JavaScript för att spela.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Spela gratis",
      categories: "Bläddra efter kategori",
      gameCount: "spel",
      comingSoon: "Kommer snart",
    },
  },
};

export default sv;
