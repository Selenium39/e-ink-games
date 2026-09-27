// memory 引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。难度词（easy/medium/…）也走词表——diffLabel()
// 查键优先，查无才退回首字母大写。

export const EN_WORDS: Record<string, string> = {
  confirm: "Start a new game? Current progress will be lost.",
  ok: "OK",
  cancel: "Cancel",
  newGame: "New Game",
  solved: "All pairs found!",
  timeLabel: "TIME",
  movesLabel: "MOVES",
  pairsLabel: "PAIRS",
  bestLabel: "Best on", // 后接难度名，如 "Best on Easy"
  newBest: "New personal best on this difficulty!",
  progressSaved: "Progress is saved automatically.",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
