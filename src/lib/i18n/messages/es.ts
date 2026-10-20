// 西班牙语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。

import type { Messages } from "./en";

const es: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "Juegos gratis para lectores de tinta electrónica",
      skipToContent: "Saltar al contenido",
      nav: {
        label: "Navegación del sitio",
        games: "Juegos",
        about: "Acerca de",
      },
      language: {
        label: "Seleccionar idioma",
      },
      footer: {
        family: "Parte de la familia E-Ink.me",
        familyCta: "Web a EPUB, herramientas para e-readers",
        news: "E-Ink News",
        rights: "Sin anuncios. Sin scripts de rastreo. Solo juegos que respetan tu pantalla.",
      },
    },
    home: {
      title: "Juegos gratis para Kindle y lectores E-Ink — juega en tu navegador",
      description:
        "Juega gratis directamente en el navegador de tu Kindle o tablet de tinta electrónica: Sudoku, Minesweeper, 2048 y más. Sin descargas ni instalaciones, diseñado para pantallas e-ink.",
      h1: "Juegos gratis para Kindle y lectores E-Ink — juega en tu navegador",
      intro:
        "Juegos de navegador diseñados para pantallas de tinta electrónica: blanco y negro puro, cero animaciones, cero parpadeos. Abre este sitio en el navegador de tu Kindle, BOOX, Kobo o cualquier dispositivo e-ink y empieza a jugar — no hay nada que instalar.",
      catalogEyebrow: "Catálogo de juegos",
      catalogPlaceholder:
        "El catálogo de juegos se está preparando. El Sudoku llega primero — vuelve pronto.",
    },
    about: {
      title: "Acerca de — E-Ink Games",
      h1: "Acerca de E-Ink Games",
      intro:
        "E-Ink Games reúne juegos de navegador que se sienten en su elemento sobre tinta electrónica: alto contraste, sin movimiento y sin artificios — solo juegos que respetan tu pantalla y tu batería.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "La familia E-Ink.me",
      familyCta: "Web a EPUB, herramientas para e-readers",
      familyPlaceholder:
        "Los juegos son solo la mitad de la historia. La familia E-Ink.me crea herramientas para toda tu vida con el e-reader — convierte cualquier artículo de la web en un EPUB para tu Kindle, y mucho más.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Puzles",
        word: "Palabras",
        board: "Tablero",
        logic: "Lógica",
        daily: "Diario",
      },
      moreGames: {
        puzzle: "Más juegos de puzles",
        word: "Más juegos de palabras",
        board: "Más juegos de tablero",
        logic: "Más juegos de lógica",
        daily: "Más juegos diarios",
      },
      howToPlay: "Cómo jugar",
      devices: "Compatibilidad de dispositivos",
      colDevice: "Dispositivo",
      colStatus: "Estado",
      colNote: "Notas",
      statusYes: "Funciona",
      statusLimited: "Limitado",
      statusNo: "No compatible",
      whyEInk: "Por qué funciona en tinta electrónica",
      faq: "Preguntas frecuentes",
      relatedEmpty:
        "Más juegos de esta categoría están en construcción ahora mismo — el catálogo crece juego a juego. Mientras tanto, explora todo lo que ya puedes jugar en tu navegador.",
      browseAll: "Ver todos los juegos",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Cargando…",
      shellError: "No se pudo cargar el juego — actualiza la página para reintentar.",
      shellFallback: "Este juego necesita un navegador más reciente.",
      shellNoscript: "Este juego funciona por completo en tu navegador — activa JavaScript para jugar.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Jugar gratis",
      categories: "Explorar por categoría",
      gameCount: "juego",
      comingSoon: "Próximamente",
    },
  },
};

export default es;
