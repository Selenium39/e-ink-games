// 葡萄牙语消息字典（欧葡/巴葡中性的国际写法）。结构须与 en.ts 逐键对齐
//（见 Messages 类型约束）；缺键时 t() 自动回退英文。

import type { Messages } from "./en";

const pt: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Jogos grátis para leitores de tinta eletrônica",
      skipToContent: "Ir para o conteúdo",
      nav: {
        label: "Navegação do site",
        games: "Jogos",
        about: "Sobre",
      },
      language: {
        label: "Selecionar idioma",
      },
      footer: {
        family: "Parte da família E-Ink.me",
        familyCta: "Web para EPUB, ferramentas para e-readers",
        news: "E-Ink News",
        rights: "Sem anúncios. Sem scripts de rastreamento. Apenas jogos que respeitam a sua tela.",
      },
    },
    home: {
      title: "Jogos grátis para Kindle e leitores E-Ink — jogue no seu navegador",
      description:
        "Jogue grátis direto no navegador do seu Kindle ou tablet de tinta eletrônica: Sudoku, Minesweeper, 2048 e muito mais. Sem download, sem instalação — feito para telas e-ink.",
      h1: "Jogos grátis para Kindle e leitores E-Ink — jogue no seu navegador",
      intro:
        "Jogos de navegador feitos para telas de tinta eletrônica: preto e branco puro, zero animações, zero cintilação. Abra este site no navegador do seu Kindle, BOOX, Kobo ou qualquer dispositivo e-ink e comece a jogar — não há nada para instalar.",
      catalogEyebrow: "Catálogo de jogos",
      catalogPlaceholder:
        "O catálogo de jogos está sendo montado. O Sudoku chega primeiro — volte em breve.",
    },
    about: {
      title: "Sobre — E-Ink Games",
      h1: "Sobre o E-Ink Games",
      intro:
        "O E-Ink Games reúne jogos de navegador que parecem feitos para a tinta eletrônica: alto contraste, sem movimento e sem artifícios — apenas jogos que respeitam a sua tela e a sua bateria.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "A família E-Ink.me",
      familyCta: "Web para EPUB, ferramentas para e-readers",
      familyPlaceholder:
        "Os jogos são só metade da história. A família E-Ink.me cria ferramentas para toda a sua vida com o e-reader — converta qualquer artigo da web em um EPUB para o seu Kindle, e muito mais.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Quebra-cabeça",
        word: "Palavras",
        board: "Tabuleiro",
        logic: "Lógica",
        daily: "Diário",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Mais jogos de quebra-cabeça",
        word: "Mais jogos de palavras",
        board: "Mais jogos de tabuleiro",
        logic: "Mais jogos de lógica",
        daily: "Mais jogos diários",
      },
      howToPlay: "Como jogar",
      devices: "Compatibilidade de dispositivos",
      colDevice: "Dispositivo",
      colStatus: "Status",
      colNote: "Observações",
      statusYes: "Funciona",
      statusLimited: "Limitado",
      statusNo: "Não compatível",
      whyEInk: "Por que funciona na tinta eletrônica",
      faq: "Perguntas frequentes",
      relatedEmpty:
        "Mais jogos desta categoria estão em construção agora — o catálogo cresce jogo a jogo. Enquanto isso, explore tudo o que já roda no seu navegador.",
      browseAll: "Ver todos os jogos",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Carregando…",
      shellError: "Não foi possível carregar o jogo — atualize a página para tentar de novo.",
      shellFallback: "Este jogo precisa de um navegador mais recente.",
      shellNoscript: "Este jogo roda inteiramente no seu navegador — ative o JavaScript para jogar.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Jogar grátis",
      categories: "Explorar por categoria",
      gameCount: "jogo",
      comingSoon: "Em breve",
    },
  },
};

export default pt;
