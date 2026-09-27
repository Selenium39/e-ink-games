// 2048 引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。难度词（standard）一并入表，保持键集统一。

export const EN_WORDS: Record<string, string> = {
  timeLabel: "TIME",
  scoreLabel: "SCORE",
  bestLabel: "BEST",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  undo: "Undo",
  newGame: "New Game",
  keepGoing: "Keep going",
  winTitle: "2048! You win!",
  overTitle: "Game over",
  finalScore: "Final score",
  confirm: "Start a new game? Current progress will be lost.",
  ok: "OK",
  cancel: "Cancel",
  hint: "Arrow keys or swipe to move. New tiles are framed; merged tiles flip black for one turn.",
  progressSaved: "Progress is saved automatically.",
  standard: "Standard",
};
