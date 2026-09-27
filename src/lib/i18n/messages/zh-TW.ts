// 繁體中文（台灣用語）訊息字典。結構須與 en.ts 逐鍵對齊（見 Messages 型別約束）；
// 缺鍵時 t() 自動回退英文。以 zh.ts 為源：簡轉繁 + 台灣用語重寫
// （軟體/支援/影片/螢幕/資訊/網路/儲存/預設/設定/點擊/執行/載入…）。

import type { Messages } from "./en";

const zhTW: Messages = {
  site: {
    chrome: {
      brand: "E-Ink 遊戲",
      tagline: "為墨水屏閱讀器打造的免費瀏覽器遊戲",
      skipToContent: "跳至主要內容",
      nav: {
        label: "網站導覽",
        games: "遊戲",
        about: "關於",
      },
      language: {
        label: "選擇語言",
      },
      footer: {
        family: "E-Ink.me 家族網站",
        familyCta: "網頁轉 EPUB · 電子書工具",
        rights: "無廣告、無重量級追蹤腳本，只做尊重你螢幕的遊戲。",
      },
    },
    home: {
      title: "Kindle 與墨水屏閱讀器免費遊戲 — 瀏覽器直接玩",
      description:
        "在 Kindle 或墨水屏平板的瀏覽器裡直接玩免費遊戲：數獨、踩地雷、2048 等。無需下載、無需安裝，專為墨水屏設計。",
      h1: "Kindle 與墨水屏閱讀器免費遊戲 — 瀏覽器直接玩",
      intro:
        "專為墨水屏設計的免費瀏覽器遊戲：純黑白、零動畫、零閃爍。在 Kindle、BOOX、Kobo 或任何墨水屏裝置的瀏覽器裡開啟即玩，無需安裝任何應用程式。",
      catalogEyebrow: "遊戲目錄",
      catalogPlaceholder: "遊戲目錄正在籌備中，數獨將率先上線，敬請期待。",
    },
    about: {
      title: "關於 — E-Ink 遊戲",
      h1: "關於 E-Ink 遊戲",
      intro:
        "E-Ink 遊戲收錄在電子墨水屏上如魚得水的瀏覽器遊戲：高對比、無動態效果、不玩花樣——只做尊重你的螢幕和電池的遊戲。",
      // 佔位：導流主站段落，內容由後續 about 內容任務填充。
      familyTitle: "E-Ink.me 家族",
      familyCta: "網頁轉 EPUB · 電子書工具",
      familyPlaceholder:
        "遊戲只是開始。E-Ink.me 家族為你的整個電子書生活打造工具——把任意網頁文章轉成 EPUB 裝進 Kindle，以及更多。",
    },
  },
  games: {
    // 遊戲頁模板公共詞（規約 §8.1；原 page.tsx 內 TEMPLATE_WORDS 收編於此）
    common: {
      category: {
        puzzle: "解謎",
        word: "文字",
        board: "棋類",
        logic: "邏輯",
        daily: "每日",
      },
      moreGames: {
        puzzle: "更多解謎遊戲",
        word: "更多文字遊戲",
        board: "更多棋類遊戲",
        logic: "更多邏輯遊戲",
        daily: "更多每日遊戲",
      },
      howToPlay: "玩法說明",
      devices: "裝置相容",
      colDevice: "裝置",
      colStatus: "支援",
      colNote: "說明",
      statusYes: "可玩",
      statusLimited: "有限",
      statusNo: "不支援",
      whyEInk: "為什麼適合墨水屏",
      faq: "常見問題",
      relatedEmpty:
        "這個分類下的更多遊戲正在陸續上線——目錄會一款一款長大。現在可以先看看已經能在瀏覽器裡玩的全部遊戲。",
      browseAll: "瀏覽全部遊戲",
      // GameShell 殼層四詞（載入狀態語義拆分見 GameShell.tsx 檔頭註釋）
      shellLoading: "載入中…",
      shellError: "遊戲載入失敗——請重新整理頁面再試一次。",
      shellFallback: "此遊戲需要較新的瀏覽器才能執行。",
      shellNoscript: "本遊戲完全在瀏覽器中執行——請啟用 JavaScript 後遊玩。",
    },
    // 首頁目錄區公共詞（原 [locale]/page.tsx 內 HOME_WORDS 收編於此）
    home: {
      playCta: "免費開玩",
      categories: "依分類瀏覽",
      gameCount: "款遊戲",
      comingSoon: "即將上線",
    },
  },
};

export default zhTW;
