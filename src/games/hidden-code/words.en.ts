// hidden-code 引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。难度词（easy/medium/…）也走词表——diffLabel()
// 查键优先，查无才退回首字母大写。
//
// 商标红线：词表不出现任何商标词。

export const EN_WORDS: Record<string, string> = {
  round: 'ROUND',
  check: 'Check',
  undo: 'Undo',
  newGame: 'New Game',
  confirm: 'Start a new game? Current progress will be lost.',
  ok: 'OK',
  cancel: 'Cancel',
  win: 'Code broken!',
  lose: 'Out of rounds',
  answer: 'THE CODE WAS',
  wonLabel: 'WON',
  avgLabel: 'AVG',
  legendExact: 'right slot',
  legendPartial: 'wrong slot',
  progressSaved: 'Progress is saved automatically.',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
