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
};

export default zh;
