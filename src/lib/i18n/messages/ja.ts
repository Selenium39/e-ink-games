// 日本語メッセージ辞書。構造は en.ts とキー単位で完全一致（Messages 型による制約）。
// 欠落キーは t() が自動的に英語へフォールバックします。

import type { Messages } from "./en";

const ja: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "電子書籍リーダーのための無料ブラウザゲーム",
      skipToContent: "本文へスキップ",
      nav: {
        label: "サイトナビゲーション",
        games: "ゲーム",
        about: "サイトについて",
      },
      language: {
        label: "言語を選択",
      },
      footer: {
        family: "E-Ink.me ファミリーの一角",
        familyCta: "ウェブからEPUB・リーダーツール",
        rights:
          "広告なし、重いトラッキングスクリプトなし。あなたの画面に寄り添うゲームだけを。",
      },
    },
    home: {
      title: "Kindle・電子インクリーダー向け無料ゲーム — ブラウザでそのままプレイ",
      description:
        "Kindle や電子インクタブレットのブラウザで無料ゲームをそのままプレイ。数独、マインスイーパ、2048 など。ダウンロードもインストールも不要、電子インク画面向けの設計です。",
      h1: "Kindle・電子インクリーダー向け無料ゲーム — ブラウザでそのままプレイ",
      intro:
        "電子インク画面のために設計された無料ブラウザゲーム：純粋な白黒、アニメーションゼロ、ちらつきゼロ。Kindle、BOOX、Kobo など電子インク端末のブラウザでこのサイトを開けば、すぐに遊べます。アプリのインストールは一切不要です。",
      catalogEyebrow: "ゲームカタログ",
      catalogPlaceholder:
        "ゲームカタログは準備中です。まず数独が登場予定です。もうしばらくお待ちください。",
    },
    about: {
      title: "サイトについて — E-Ink Games",
      h1: "E-Ink Games について",
      intro:
        "E-Ink Games は、電子インク画面でこそ生きるブラウザゲームを集めています。高コントラスト、動きなし、余計な仕掛けなし——画面とバッテリーに寄り添うプレイだけを提供します。",
      // プレースホルダー：本家サイトへの導線段落。中身は後続の about コンテンツタスクで投入。
      familyTitle: "E-Ink.me ファミリー",
      familyCta: "ウェブからEPUB・リーダーツール",
      familyPlaceholder:
        "ゲームは物語の半分にすぎません。E-Ink.me ファミリーは、電子書籍ライフ全体を支えるツールを開発しています——どんなウェブ記事でも EPUB に変換して Kindle で読めるようにするなど、まだまだあります。",
    },
  },
  games: {
    // ゲームページテンプレート共通語（規約 §8.1；旧 page.tsx 内 TEMPLATE_WORDS をここに集約）
    common: {
      category: {
        puzzle: "パズル",
        word: "ワード",
        board: "ボード",
        logic: "ロジック",
        daily: "デイリー",
      },
      // カテゴリ別にキー分割（t() に補間パラメータなし）
      moreGames: {
        puzzle: "他のパズルゲーム",
        word: "他のワードゲーム",
        board: "他のボードゲーム",
        logic: "他のロジックゲーム",
        daily: "他のデイリーゲーム",
      },
      howToPlay: "遊び方",
      devices: "動作環境",
      colDevice: "端末",
      colStatus: "対応",
      colNote: "備考",
      statusYes: "動作",
      statusLimited: "一部対応",
      statusNo: "非対応",
      whyEInk: "電子インクに向いている理由",
      faq: "よくある質問",
      relatedEmpty:
        "このカテゴリのゲームを続々と準備しています。カタログは一つずつ大きくなっていきます。それまでの間、すでにブラウザで遊べるすべてのゲームをご覧ください。",
      browseAll: "すべてのゲームを見る",
      // GameShell シェルの四語（読み込み状態の語義分割は GameShell.tsx のファイル頭コメント参照）
      shellLoading: "読み込み中…",
      shellError: "ゲームの読み込みに失敗しました。ページを再読み込みしてお試しください。",
      shellFallback: "このゲームを動かすには、より新しいブラウザが必要です。",
      shellNoscript:
        "このゲームはブラウザ内で完結して動作します。プレイするには JavaScript を有効にしてください。",
    },
    // ホームカタログ部の共通語（旧 [locale]/page.tsx 内 HOME_WORDS をここに集約）
    home: {
      playCta: "無料で遊ぶ",
      categories: "カテゴリで見る",
      gameCount: "本",
      comingSoon: "近日登場",
    },
  },
};

export default ja;
