// word-daily 引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。standard/daily 等模式词也走词表（本作无难度
// 拼接点，全部直接查键）。

export const EN_WORDS: Record<string, string> = {
  daily: "Daily",
  practice: "Practice",
  enter: "Enter",
  del: "Del",
  notEnough: "Not enough letters",
  notInList: "Not in the word list",
  win: "You got it!",
  lost: "Out of tries",
  theWordWas: "The word was",
  shareHint: "Long-press the box below to select and copy your result:",
  practiceNote: "Practice round — your daily streak is unaffected.",
  played: "Played",
  won: "Won",
  streak: "Streak",
  best: "Best",
  tomorrow: "A new word arrives tomorrow.",
  saved: "Today's progress is saved on your device.",
  standard: "Standard",
};
