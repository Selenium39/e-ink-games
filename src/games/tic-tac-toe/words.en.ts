// tic-tac-toe 引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。难度词（easy/hard）也走词表——diffLabel()
// 查键优先，查无才退回首字母大写。

export const EN_WORDS: Record<string, string> = {
  modeAi: "Vs Computer",
  mode2p: "2 Players",
  easy: "Easy",
  hard: "Hard",
  you: "You",
  computer: "Computer",
  player1: "Player 1",
  player2: "Player 2",
  yourMove: "Your move",
  xToMove: "X to move",
  oToMove: "O to move",
  youWin: "You win!",
  computerWins: "Computer wins",
  xWins: "X wins!",
  oWins: "O wins!",
  draw: "Draw",
  undo: "Undo",
  newGame: "New Game",
  record: "RECORD",
  progressSaved: "Progress and record are saved on this device.",
};
