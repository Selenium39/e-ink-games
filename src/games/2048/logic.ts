/**
 * 2048/logic — 经典 2048 纯函数逻辑层（契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng` 的类型（§5.1）。
 *   随机源经 `move`/`newGame` 参数注入（Rng 实例由 render 层创建），logic 自身不落随机副作用。
 * - 所有状态转移不可变：返回新 state、不改入参；无效移动 no-op 返回**原引用**（render diff 依据）。
 * - 参数非法（cells 长度≠16、非法方向、非 Rng）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 合并规则：每行每方向单遍合并（目标端优先），一格每步至多合并一次——
 *   [2,2,2,2]→[4,4]、[2,2,2]→[4,2]、[2,2,4]→[4,4]（合并产物不二次并入）。
 * - 语法 ES2015 以内、API 仅 ES2015 白名单（打包 target es2015 不补 polyfill，§10.8）：
 *   不用 flat/padStart/at/append 等 ES2016+ 内建。
 */

import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 移动方向 */
export type Dir = 'up' | 'down' | 'left' | 'right';

/** 纯数据状态（JSON-serializable，可入存档） */
export interface GameState {
  /** 16 格，行优先：idx = r*4 + c；0 = 空，其余为 2 的幂 */
  cells: number[];
  /** 当前得分（每次合并累加合并产物值） */
  score: number;
  /** 失败：无空格且无可合并方向（move 内判定） */
  over: boolean;
  /** 胜利：出现过 2048（提示后可继续玩，won 一旦为 true 不回退） */
  won: boolean;
  /** 上一步新生成块的 idx（render 一轮 1-bit 标记：粗边框）；-1 = 无 */
  spawnedAt: number;
  /** 上一步发生合并的结果格 idx 列表（render 一轮 1-bit 标记：黑白反转） */
  mergedAt: number[];
}

const SIZE = 4;
const CELLS = 16;
const WIN_TILE = 2048;
/** 新块取 4 的概率（经典 2048：90% 为 2、10% 为 4） */
const FOUR_CHANCE = 0.1;

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

// ---------------------------------------------------------------------------
// 内部：line 抽取（按移动方向，从「目标端」到「远端」排列）
// ---------------------------------------------------------------------------

/**
 * 第 lineIdx 条线的 4 个棋盘 idx，按移动方向从目标端到远端排列。
 * left  → 行首在先；right → 行尾在先；up → 列顶在先；down → 列底在先。
 */
function lineIndices(dir: Dir, lineIdx: number): number[] {
  const idxs: number[] = [];
  for (let k = 0; k < SIZE; k++) {
    if (dir === 'left') idxs.push(lineIdx * SIZE + k);
    else if (dir === 'right') idxs.push(lineIdx * SIZE + (SIZE - 1 - k));
    else if (dir === 'up') idxs.push(k * SIZE + lineIdx);
    else idxs.push((SIZE - 1 - k) * SIZE + lineIdx);
  }
  return idxs;
}

interface ShiftResult {
  cells: number[];
  mergedAt: number[];
  gained: number;
  changed: boolean;
}

/** 全盘按方向压实 + 单遍合并。不改动入参 cells。 */
function shiftAll(cells: number[], dir: Dir): ShiftResult {
  const next = cells.slice();
  const mergedAt: number[] = [];
  let gained = 0;
  let changed = false;

  for (let line = 0; line < SIZE; line++) {
    const idxs = lineIndices(dir, line);
    // 目标端→远端的非零序列
    const vals: number[] = [];
    for (let k = 0; k < SIZE; k++) {
      if (cells[idxs[k]] !== 0) vals.push(cells[idxs[k]]);
    }
    // 单遍合并：i 跳 2 —— 一格每步至多合并一次（契约）
    const out: number[] = [];
    const outMerged: boolean[] = [];
    let i = 0;
    while (i < vals.length) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const v = vals[i] * 2;
        out.push(v);
        outMerged.push(true);
        gained += v;
        i += 2;
      } else {
        out.push(vals[i]);
        outMerged.push(false);
        i += 1;
      }
    }
    // 写回：out[j] 落在该线目标端数第 j 格
    for (let k = 0; k < SIZE; k++) {
      const v = k < out.length ? out[k] : 0;
      if (next[idxs[k]] !== v) changed = true;
      next[idxs[k]] = v;
      if (k < out.length && outMerged[k]) mergedAt.push(idxs[k]);
    }
  }

  return { cells: next, mergedAt, gained, changed };
}

/** 是否还有空格或任一方向相邻同值（= 未死局） */
function anyMoveLeft(cells: number[]): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === 0) return true;
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = cells[r * SIZE + c];
      if (c + 1 < SIZE && cells[r * SIZE + c + 1] === v) return true;
      if (r + 1 < SIZE && cells[(r + 1) * SIZE + c] === v) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function assertCells(cells: number[]): void {
  if (!Array.isArray(cells) || cells.length !== CELLS) {
    throw new Error('2048: cells must be an array of 16 numbers');
  }
  for (let i = 0; i < CELLS; i++) {
    const v = cells[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || (v !== 0 && (v & (v - 1)) !== 0)) {
      throw new Error('2048: cell must be 0 or a power of two, got ' + v + ' at ' + i);
    }
  }
}

// ---------------------------------------------------------------------------
// 开局 / 移动 / 判定
// ---------------------------------------------------------------------------

/** 在 cells 的空格中随机落一个新块（90% 为 2、10% 为 4），返回 [next, spawnedAt] */
function spawn(cells: number[], rng: Rng): { cells: number[]; at: number } {
  const empties: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === 0) empties.push(i);
  }
  const at = empties[rng.int(empties.length)];
  const next = cells.slice();
  next[at] = rng.next() < FOUR_CHANCE ? 4 : 2;
  return { cells: next, at };
}

/**
 * 开新局：两个起始块（同样 90/10 规则）。
 * opts.seed 可注入确定性种子（测试用；正式局由 render 传随机种子的 Rng）。
 */
export function newGame(rng: Rng): GameState {
  if (!rng || typeof rng.next !== 'function' || typeof rng.int !== 'function') {
    throw new Error('2048: newGame requires an Rng (use _engine/rng createRng)');
  }
  const first = spawn(new Array<number>(CELLS).fill(0), rng);
  const second = spawn(first.cells, rng);
  return {
    cells: second.cells,
    score: 0,
    over: false,
    won: false,
    spawnedAt: second.at,
    mergedAt: [],
  };
}

/**
 * 朝 dir 移动一步：
 * - 单遍合并 + 计分；盘面无变化 → 返回原引用（no-op，不生成新块）；
 * - 有效移动后生成新块；新块或合并产生 2048 → won = true（只翻转一次）；
 * - 落块后无空格且无可合并 → over = true；
 * - 已 over 的局为 no-op（原引用）。
 * 随机全部来自注入的 rng（§5.1：禁裸 Math.random）。
 */
export function move(state: GameState, dir: Dir, rng: Rng): GameState {
  if (DIRS.indexOf(dir) === -1) {
    throw new Error('2048: invalid dir ' + JSON.stringify(dir));
  }
  if (!rng || typeof rng.next !== 'function' || typeof rng.int !== 'function') {
    throw new Error('2048: move requires an Rng (use _engine/rng createRng)');
  }
  assertCells(state.cells);
  if (state.over) return state;

  const shifted = shiftAll(state.cells, dir);
  if (!shifted.changed) {
    // 死局首次被发现时落 over（此时任一方向都 changed=false）；
    // 已 over 的局在函数开头已被拦截，这里只会经过一次
    if (!anyMoveLeft(state.cells)) {
      return { cells: state.cells, score: state.score, over: true, won: state.won, spawnedAt: -1, mergedAt: [] };
    }
    return state;
  }

  const after = spawn(shifted.cells, rng);
  let won = state.won;
  if (!won) {
    for (let i = 0; i < CELLS; i++) {
      if (after.cells[i] === WIN_TILE) {
        won = true;
        break;
      }
    }
  }
  const over = !anyMoveLeft(after.cells);

  return {
    cells: after.cells,
    score: state.score + shifted.gained,
    over,
    won,
    spawnedAt: after.at,
    mergedAt: shifted.mergedAt,
  };
}

/** 是否仍有空格或可合并方向（render 备用判定；over 恒与之互补） */
export function canMove(state: GameState): boolean {
  assertCells(state.cells);
  return anyMoveLeft(state.cells);
}

/** 出现 2048 即达成胜利条件（含初始/存档盘面的独立判定） */
export function isWinningCells(cells: number[]): boolean {
  assertCells(cells);
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === WIN_TILE) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 存档序列化（不含 undo 栈，契约决策⑤）
// ---------------------------------------------------------------------------

/** 存档格式版本：破坏性变更时 +1，旧档 deserialize 返回 null 自动作废 */
const STATE_VERSION = 1;

interface SerializedState {
  v: number;
  cells: number[];
  score: number;
  over: boolean;
  won: boolean;
}

export function serialize(state: GameState): string {
  return JSON.stringify({
    v: STATE_VERSION,
    cells: state.cells,
    score: state.score,
    over: state.over,
    won: state.won,
  } as SerializedState);
}

/** 非法 / 缺字段 / 版本不符 → null，绝不抛（存档可能来自外部或旧版本） */
export function deserialize(raw: string): GameState | null {
  let data: SerializedState | null = null;
  try {
    data = JSON.parse(raw) as SerializedState;
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.v !== STATE_VERSION) return null;
  if (typeof data.score !== 'number' || !isFinite(data.score) || data.score < 0) return null;
  if (typeof data.over !== 'boolean' || typeof data.won !== 'boolean') return null;
  try {
    assertCells(data.cells);
  } catch {
    return null;
  }
  return {
    cells: data.cells.slice(),
    score: Math.floor(data.score),
    over: data.over,
    won: data.won,
    spawnedAt: -1,
    mergedAt: [],
  };
}
