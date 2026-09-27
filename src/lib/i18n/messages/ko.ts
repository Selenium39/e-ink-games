// 한국어 메시지 사전。新增语言时结构须与 en.ts 逐键对齐。
// en.ts 구조와 키 단위로 완전히 일치합니다(게임명·브랜드어는 원문 유지).

import type { Messages } from "./en";

const ko: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "전자잉크 리더를 위한 무료 브라우저 게임",
      skipToContent: "본문으로 건너뛰기",
      nav: {
        label: "사이트 내비게이션",
        games: "게임",
        about: "소개",
      },
      language: {
        label: "언어 선택",
      },
      footer: {
        family: "E-Ink.me 패밀리의 일원입니다",
        familyCta: "웹을 EPUB로, 전자책 리더 도구",
        rights: "광고 없음. 추적 스크립트 없음. 화면을 아끼는 게임만 있습니다.",
      },
    },
    home: {
      title: "Kindle·전자잉크 리더용 무료 게임 — 브라우저에서 바로 플레이",
      description:
        "Kindle이나 전자잉크 태블릿 브라우저에서 Sudoku, Minesweeper, 2048 등 무료 게임을 즐기세요. 다운로드도 설치도 없이, 전자잉크 화면을 위해 설계했습니다.",
      h1: "Kindle·전자잉크 리더용 무료 게임 — 브라우저에서 바로 플레이",
      intro:
        "전자잉크 화면을 위해 설계된 무료 브라우저 게임입니다: 순수 흑백, 애니메이션 제로, 깜빡임 제로. Kindle, BOOX, Kobo 등 전자잉크 기기의 브라우저에서 이 사이트를 열면 바로 플레이할 수 있어요 — 설치할 것은 아무것도 없습니다.",
      catalogEyebrow: "게임 카탈로그",
      catalogPlaceholder:
        "게임 카탈로그를 준비하고 있어요. Sudoku가 가장 먼저 찾아갑니다 — 조금만 기다려 주세요.",
    },
    about: {
      title: "소개 — E-Ink Games",
      h1: "E-Ink Games 소개",
      intro:
        "E-Ink Games는 전자잉크에 잘 어울리는 브라우저 게임을 모았습니다: 높은 명암비, 움직임 없음, 억지 기교 없음 — 화면과 배터리를 아끼는 플레이만 있습니다.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "E-Ink.me 패밀리",
      familyCta: "웹을 EPUB로, 전자책 리더 도구",
      familyPlaceholder:
        "게임은 이야기의 절반일 뿐입니다. E-Ink.me 패밀리는 전자책 생활 전체를 위한 도구를 만듭니다 — 어떤 웹 글이든 Kindle에서 읽을 EPUB로 바꾸고, 그 밖의 것도.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1）
    common: {
      category: {
        puzzle: "퍼즐",
        word: "워드",
        board: "보드",
        logic: "로직",
        daily: "데일리",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "더 많은 퍼즐 게임",
        word: "더 많은 워드 게임",
        board: "더 많은 보드 게임",
        logic: "더 많은 로직 게임",
        daily: "더 많은 데일리 게임",
      },
      howToPlay: "플레이 방법",
      devices: "기기 호환성",
      colDevice: "기기",
      colStatus: "상태",
      colNote: "비고",
      statusYes: "작동",
      statusLimited: "제한적",
      statusNo: "미지원",
      whyEInk: "전자잉크에서 잘 작동하는 이유",
      faq: "자주 묻는 질문",
      relatedEmpty:
        "이 카테고리의 다른 게임을 지금 만들고 있어요 — 카탈로그는 게임 하나하나 자라납니다. 그동안 브라우저에서 바로 돌아가는 모든 게임을 둘러보세요.",
      browseAll: "모든 게임 보기",
      // GameShell 壳层四词
      shellLoading: "불러오는 중…",
      shellError: "게임을 불러오지 못했어요 — 새로고침 후 다시 시도해 주세요.",
      shellFallback: "이 게임에는 더 최신 브라우저가 필요합니다.",
      shellNoscript:
        "이 게임은 브라우저 안에서 전부 실행됩니다 — 플레이하려면 JavaScript를 켜 주세요.",
    },
    // 首页目录区公共词
    home: {
      playCta: "무료로 플레이",
      categories: "카테고리별로 보기",
      gameCount: "개 게임",
      comingSoon: "곧 공개",
    },
  },
};

export default ko;
