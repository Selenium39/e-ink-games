// 复制我为新游戏：引擎 UI 英文词表（单一来源）。
//
// 本地化通道（2026-09 16 语言）：render.ts mount 时读 #game-root 的
// data-egames-words 属性（页面 SSG 写入 ui-words.json 对应语言节）与本表
// 浅合并；缺键回退英文。难度词（easy/…）也走词表——diffLabel() 查键优先。

export const EN_WORDS: Record<string, string> = {
  undo: "Undo",
  done: "Done! All cells lit.",
  hint: "Click cells to count up.",
  progressSaved: "Progress is saved automatically.",
};
