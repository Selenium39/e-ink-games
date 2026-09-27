// ═══════════════════════════════════════════════════════════════════
// 复制我为新游戏（契约 §9）：
//   1. cp -r src/games/_template src/games/<slug>   （slug = [a-z0-9-]+）
//   2. 全局替换本目录内所有 "_template" 为 <slug>（含 meta.json 的 slug）
//   3. 按契约填实现：本文件=纯函数逻辑；render.ts=DOM patch；index.ts=入口
//   4. 新建 src/content/games/<slug>/en.json（文案，契约 §8）
//   5. npm run games:build —— registry/打包/gzip 断言全自动
// ═══════════════════════════════════════════════════════════════════
//
// 本文件 = 纯函数游戏逻辑（契约 §5.1）：零 DOM、零 React、零第三方依赖、
// 零副作用（随机只经 _engine/rng 注入）。所有转移函数不可变：返回新 state。
// 本演示游戏是「3 格点击计数」：每格点满 TARGET 次即点亮，全部点亮则完成。
// ——足以走通 挂载/状态/undo/存档 全链路，替换成真实规则即可。

/** 格子数（演示为 3 格） */
export const CELL_COUNT = 3;

/** 每格点击目标次数 */
export const TARGET = 3;

/** 纯数据状态：counts[i] = 第 i 格已点击次数（JSON-serializable，可入存档） */
export interface TemplateState {
  counts: number[];
  done: boolean;
}

/** 开新局 */
export function newGame(): TemplateState {
  const counts: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) counts.push(0);
  return { counts, done: false };
}

/**
 * 点击第 idx 格：计数 +1；全部达标后 done=true。
 * 已完成的局为 no-op（返回原引用，不可变契约）。
 * 非法 idx 属编程错误：throw（契约 §5.1，render 层负责不传非法值）。
 */
export function click(state: TemplateState, idx: number): TemplateState {
  if (typeof idx !== "number" || !isFinite(idx) || idx < 0 || idx >= state.counts.length) {
    throw new RangeError("click: idx out of range: " + idx);
  }
  if (state.done) return state;

  const counts = state.counts.slice();
  counts[idx] += 1;

  let done = true;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < TARGET) {
      done = false;
      break;
    }
  }
  return { counts, done };
}

/** 是否全部点亮（与 state.done 一致；独立导出便于测试与 render 判定） */
export function isComplete(state: TemplateState): boolean {
  for (let i = 0; i < state.counts.length; i++) {
    if (state.counts[i] < TARGET) return false;
  }
  return true;
}
