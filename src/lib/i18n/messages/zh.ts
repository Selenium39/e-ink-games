// 中文消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。

import type { Messages } from "./en";

const zh: Messages = {
  site: {
    chrome: {
      brand: "E-Ink 游戏",
      tagline: "为墨水屏阅读器打造的免费浏览器游戏",
      skipToContent: "跳到正文",
      nav: {
        label: "站点导航",
        games: "游戏",
        about: "关于",
      },
      language: {
        label: "选择语言",
      },
      footer: {
        family: "E-Ink.me 家族站点",
        familyCta: "网页转 EPUB · 电纸书工具",
        rights: "无广告、无重型追踪脚本，只做尊重你屏幕的游戏。",
      },
    },
    home: {
      title: "Kindle 与墨水屏阅读器免费游戏 — 浏览器直接玩",
      description:
        "在 Kindle 或墨水屏平板的浏览器里直接玩免费游戏：数独、扫雷、2048 等。无需下载、无需安装，专为墨水屏设计。",
      h1: "Kindle 与墨水屏阅读器免费游戏 — 浏览器直接玩",
      intro:
        "专为墨水屏设计的免费浏览器游戏：纯黑白、零动画、零闪烁。在 Kindle、BOOX、Kobo 或任何墨水屏设备的浏览器里打开即玩，无需安装任何应用。",
      catalogEyebrow: "游戏目录",
      catalogPlaceholder: "游戏目录正在筹备中，数独将率先上线，敬请期待。",
    },
    about: {
      title: "关于 — E-Ink 游戏",
      h1: "关于 E-Ink 游戏",
      intro:
        "E-Ink 游戏收录在电子墨水屏上如鱼得水的浏览器游戏：高对比、无动效、不玩花样——只做尊重你的屏幕和电池的游戏。",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "E-Ink.me 家族",
      familyCta: "网页转 EPUB · 电纸书工具",
      familyPlaceholder:
        "游戏只是开始。E-Ink.me 家族为你的整个电纸书生活打造工具——把任意网页文章转成 EPUB 装进 Kindle，以及更多。",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "解谜",
        word: "文字",
        board: "棋类",
        logic: "逻辑",
        daily: "每日",
      },
      moreGames: {
        puzzle: "更多解谜游戏",
        word: "更多文字游戏",
        board: "更多棋类游戏",
        logic: "更多逻辑游戏",
        daily: "更多每日游戏",
      },
      howToPlay: "玩法说明",
      devices: "设备兼容",
      colDevice: "设备",
      colStatus: "支持",
      colNote: "说明",
      statusYes: "可玩",
      statusLimited: "有限",
      statusNo: "不支持",
      whyEInk: "为什么适合墨水屏",
      faq: "常见问题",
      relatedEmpty:
        "这个分类下的更多游戏正在陆续上线——目录会一款一款长大。现在可以先看看已经能在浏览器里玩的全部游戏。",
      browseAll: "浏览全部游戏",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "加载中…",
      shellError: "游戏加载失败——请刷新页面重试。",
      shellFallback: "此游戏需要较新的浏览器才能运行。",
      shellNoscript: "本游戏完全在浏览器中运行——请启用 JavaScript 后游玩。",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "免费开玩",
      categories: "按分类浏览",
      gameCount: "款游戏",
      comingSoon: "即将上线",
    },
  },
};

export default zh;
