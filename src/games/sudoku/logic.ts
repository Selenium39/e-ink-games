/**
 * sudoku/logic — 数独纯函数逻辑层（契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（注入随机源，§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（长度≠81、越界 r/c、非法难度/值）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自注入的 createRng：同 seed 必产出同 puzzle（每日挑战正确性基础）。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type Cell = number; // 0=空，1-9
export type Grid = number[]; // 长度 81，行优先：idx = r*9 + c
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface GameState {
  difficulty: Difficulty;
  /** null = 随机组局（非每日/非固定种子） */
  seed: number | null;
  /** 81；true = 题面给定格（不可修改） */
  givens: boolean[];
  /** 81；当前盘面（givens 格恒等于题面数字） */
  values: Grid;
  /** 81；铅笔标记 bitmask，bit(v-1)=1 表示标了数字 v */
  notes: number[];
}

export interface NewGameResult {
  /** 题面（给定格数字，其余 0） */
  puzzle: Grid;
  /** 唯一解 */
  solution: Grid;
  /** true=给定格（render 用此区分样式；语义 ≠ puzzle 的副本） */
  givens: boolean[];
  /** 初始 state（免去 render 手工拼装） */
  state: GameState;
}

// ---------------------------------------------------------------------------
// 常量与查找表
// ---------------------------------------------------------------------------

const CELLS = 81;
const ALL_MASK = 0x1ff; // 9 bit 全 1：数字 1-9 集合

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * 挖洞目标 givens 数。契约 §5.2（easy 38-40 / medium 30-32 / hard 25-27 / expert 22-24）
 * 与任务书区间（easy 40-45 / medium 32-37 / hard 26-30 / expert 22-25）的交集点。
 * 挖洞只减不增，实际产出 ∈ [target, 上界]；区间断言见 logic.test.ts。
 */
const TARGET_GIVENS: Record<Difficulty, number> = {
  easy: 40,
  medium: 32,
  hard: 26,
  expert: 23,
};

/** 达不到目标 givens 时换洗牌序重试的轮数上限（确定性预算：不用真实时间做决策） */
const MAX_DIG_ROUNDS = 8;

const ROW_OF = new Array<number>(CELLS);
const COL_OF = new Array<number>(CELLS);
const BOX_OF = new Array<number>(CELLS);
const POPCOUNT = new Array<number>(ALL_MASK + 1);
const BIT_VAL = new Array<number>(ALL_MASK + 1); // 单 bit → 数字 1-9

for (let i = 0; i < CELLS; i++) {
  const r = (i / 9) | 0;
  ROW_OF[i] = r;
  COL_OF[i] = i % 9;
  BOX_OF[i] = ((r / 3) | 0) * 3 + (((i % 9) / 3) | 0);
}
for (let m = 0; m <= ALL_MASK; m++) {
  let n = 0;
  for (let t = m; t !== 0; t >>= 1) n += t & 1;
  POPCOUNT[m] = n;
}
for (let v = 1; v <= 9; v++) BIT_VAL[1 << (v - 1)] = v;

// ---------------------------------------------------------------------------
// 求解器（位掩码 + MRV 回溯，解计数上限剪枝）
// ---------------------------------------------------------------------------

interface Masks {
  rows: number[];
  cols: number[];
  boxes: number[];
  filled: number;
}

/** 装载位掩码。长度/值非法 throw（编程错误）；盘面自带冲突返回 null（业务结果）。 */
function loadGrid(grid: Grid): Masks | null {
  if (!Array.isArray(grid) || grid.length !== CELLS) {
    throw new Error('sudoku: grid must be an array of 81 cells');
  }
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  let filled = 0;
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (v === 0) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 9) {
      throw new Error('sudoku: grid cell value must be 0-9, got ' + v + ' at ' + i);
    }
    const bit = 1 << (v - 1);
    const r = ROW_OF[i];
    const c = COL_OF[i];
    const b = BOX_OF[i];
    if ((rows[r] | cols[c] | boxes[b]) & bit) return null;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
    filled++;
  }
  return { rows, cols, boxes, filled };
}

/** 在盘面上回溯，返回解数（达到 limit 即剪枝停止）；found 非空时捕获各解。改写传入 grid。 */
function runSearch(
  grid: Grid,
  masks: Masks,
  limit: number,
  found: Grid[] | null,
): number {
  // MRV：选当前候选最少（且非零）的空格
  let bestIdx = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] !== 0) continue;
    const mask =
      ALL_MASK & ~(masks.rows[ROW_OF[i]] | masks.cols[COL_OF[i]] | masks.boxes[BOX_OF[i]]);
    if (mask === 0) return 0; // 死路剪枝
    const n = POPCOUNT[mask];
    if (n < bestCount) {
      bestCount = n;
      bestIdx = i;
      bestMask = mask;
      if (n === 1) break;
    }
  }
  if (bestIdx === -1) {
    if (found) found.push(grid.slice());
    return 1;
  }
  const r = ROW_OF[bestIdx];
  const c = COL_OF[bestIdx];
  const b = BOX_OF[bestIdx];
  let total = 0;
  let mask = bestMask;
  while (mask !== 0 && total < limit) {
    const bit = mask & -mask;
    mask ^= bit;
    grid[bestIdx] = BIT_VAL[bit];
    masks.rows[r] |= bit;
    masks.cols[c] |= bit;
    masks.boxes[b] |= bit;
    total += runSearch(grid, masks, limit - total, found);
    grid[bestIdx] = 0;
    masks.rows[r] ^= bit;
    masks.cols[c] ^= bit;
    masks.boxes[b] ^= bit;
  }
  return total;
}

/**
 * 求解任意 81 格盘面；无解 → null。多解盘面返回其中第一个（不保证特定顺序）。
 * 输入非法（长度≠81 / 格值非 0-9）throw。
 */
export function solve(grid: Grid): Grid | null {
  const masks = loadGrid(grid);
  if (!masks) return null;
  if (masks.filled === CELLS) return (grid as Grid).slice();
  const work = (grid as Grid).slice();
  const found: Grid[] = [];
  runSearch(work, masks, 1, found);
  return found.length > 0 ? found[0] : null;
}

/**
 * 解计数（达到 limit 即停止）。默认 limit=2——唯一性校验只关心「恰 1 个」。
 * 契约外新增导出：挖洞唯一性验证与测试依赖；亦可供 render 提示功能复用。
 */
export function countSolutions(grid: Grid, limit?: number): number {
  const lim = limit === undefined ? 2 : limit;
  if (typeof lim !== 'number' || !Number.isInteger(lim) || lim < 1) {
    throw new Error('sudoku: countSolutions limit must be a positive integer');
  }
  const masks = loadGrid(grid);
  if (!masks) return 0;
  if (masks.filled === CELLS) return 1;
  return runSearch((grid as Grid).slice(), masks, lim, null);
}

// ---------------------------------------------------------------------------
// 生成：完整终盘 → 挖洞
// ---------------------------------------------------------------------------

/** 随机生成完整合法终盘。候选值顺序由 rng 决定 → 同 seed 同盘面。 */
function generateSolution(rng: Rng): Grid {
  const grid = new Array<number>(CELLS).fill(0);
  const masks: Masks = {
    rows: new Array<number>(9).fill(0),
    cols: new Array<number>(9).fill(0),
    boxes: new Array<number>(9).fill(0),
    filled: 0,
  };
  const fillAt = (pos: number): boolean => {
    if (pos === CELLS) return true;
    const r = ROW_OF[pos];
    const c = COL_OF[pos];
    const b = BOX_OF[pos];
    const used = masks.rows[r] | masks.cols[c] | masks.boxes[b];
    const cands: number[] = [];
    for (let v = 1; v <= 9; v++) {
      if ((used & (1 << (v - 1))) === 0) cands.push(v);
    }
    const order = rng.shuffle(cands);
    for (let k = 0; k < order.length; k++) {
      const bit = 1 << (order[k] - 1);
      grid[pos] = order[k];
      masks.rows[r] |= bit;
      masks.cols[c] |= bit;
      masks.boxes[b] |= bit;
      if (fillAt(pos + 1)) return true;
      grid[pos] = 0;
      masks.rows[r] ^= bit;
      masks.cols[c] ^= bit;
      masks.boxes[b] ^= bit;
    }
    return false;
  };
  fillAt(0);
  return grid;
}

/**
 * 贪心挖洞：洗牌序逐格尝试移除，每次移除后校验解仍唯一，不唯一即放回。
 * 一轮扫完仍未到目标则重洗剩余格再挖（最多 MAX_DIG_ROUNDS 轮）。
 * 全程仅由 rng 驱动决策 → 同 seed 同谜题；产出 givens ∈ [targetGivens, 81]。
 */
function digHoles(solution: Grid, targetGivens: number, rng: Rng): Grid {
  const puzzle = solution.slice();
  let remaining = CELLS;
  const order = new Array<number>(CELLS);
  for (let i = 0; i < CELLS; i++) order[i] = i;
  for (let round = 0; round < MAX_DIG_ROUNDS && remaining > targetGivens; round++) {
    const shuffled = rng.shuffle(order);
    for (let k = 0; k < CELLS; k++) {
      if (remaining <= targetGivens) break;
      const idx = shuffled[k];
      const saved = puzzle[idx];
      if (saved === 0) continue;
      puzzle[idx] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        remaining--;
      } else {
        puzzle[idx] = saved;
      }
    }
  }
  return puzzle;
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 生成新局。唯一随机源 createRng(opts.seed ?? (Date.now() >>> 0))（契约 §5.2）。
 * 难度非法 / seed 非 uint32 整数 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): NewGameResult {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('sudoku: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('sudoku: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number | null = null;
  let rng: Rng;
  if (opts.seed === undefined) {
    rng = createRng(Date.now() >>> 0);
  } else {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('sudoku: seed must be a uint32 integer');
    }
    seed = s;
    rng = createRng(s);
  }
  const solution = generateSolution(rng);
  const puzzle = digHoles(solution, TARGET_GIVENS[opts.difficulty], rng);
  const givens = puzzle.map((v) => v !== 0);
  const state: GameState = {
    difficulty: opts.difficulty,
    seed,
    givens,
    values: puzzle.slice(),
    notes: new Array<number>(CELLS).fill(0),
  };
  return { puzzle, solution, givens, state };
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('sudoku: state must be a GameState object');
  }
  if (
    !Array.isArray(state.values) || state.values.length !== CELLS ||
    !Array.isArray(state.givens) || state.givens.length !== CELLS ||
    !Array.isArray(state.notes) || state.notes.length !== CELLS
  ) {
    throw new Error('sudoku: state.values/givens/notes must each contain 81 entries');
  }
}

function cellIndex(r: number, c: number): number {
  if (typeof r !== 'number' || typeof c !== 'number' || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 8 || c < 0 || c > 8) {
    throw new Error('sudoku: row/col out of range: r=' + String(r) + ' c=' + String(c));
  }
  return r * 9 + c;
}

function assertValue(v: number): void {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 9) {
    throw new Error('sudoku: cell value must be an integer 1-9, got ' + String(v));
  }
}

/**
 * 落子。v ∈ 1-9；对 givens 格为 no-op（返回原引用）；同值重填亦 no-op；
 * 否则写入并清除该格 notes。
 */
export function applyMove(state: GameState, r: number, c: number, v: number): GameState {
  assertStateShape(state);
  const idx = cellIndex(r, c);
  assertValue(v);
  if (state.givens[idx] || state.values[idx] === v) return state;
  const values = state.values.slice();
  const notes = state.notes.slice();
  values[idx] = v;
  notes[idx] = 0;
  return { difficulty: state.difficulty, seed: state.seed, givens: state.givens, values, notes };
}

/**
 * 清玩家格数字+notes（含「空格仅剩笔记」的清理）；givens 格 no-op（原引用）；
 * 数字与笔记均已空时无变化，同样返回原引用。
 */
export function clearCell(state: GameState, r: number, c: number): GameState {
  assertStateShape(state);
  const idx = cellIndex(r, c);
  if (state.givens[idx]) return state;
  if (state.values[idx] === 0 && state.notes[idx] === 0) return state;
  const values = state.values.slice();
  const notes = state.notes.slice();
  values[idx] = 0;
  notes[idx] = 0;
  return { difficulty: state.difficulty, seed: state.seed, givens: state.givens, values, notes };
}

/** 铅笔标记翻转（bit v-1 异或）；givens 格或该格已有数字时 no-op（原引用）。 */
export function toggleNote(state: GameState, r: number, c: number, v: number): GameState {
  assertStateShape(state);
  const idx = cellIndex(r, c);
  assertValue(v);
  if (state.givens[idx] || state.values[idx] !== 0) return state;
  const notes = state.notes.slice();
  notes[idx] ^= 1 << (v - 1);
  return { difficulty: state.difficulty, seed: state.seed, givens: state.givens, values: state.values, notes };
}

/** 格位上按当前盘面同行/列/宫排除后的可用数字 bitmask（9 bit）。内部辅助。 */
function availableMaskAt(state: GameState, idx: number): number {
  const r = ROW_OF[idx];
  const c = COL_OF[idx];
  const b = BOX_OF[idx];
  let used = 0;
  for (let i = 0; i < 9; i++) {
    const rv = state.values[r * 9 + i];
    if (rv !== 0) used |= 1 << (rv - 1);
    const cv = state.values[i * 9 + c];
    if (cv !== 0) used |= 1 << (cv - 1);
  }
  const br = ((r / 3) | 0) * 3;
  const bc = ((c / 3) | 0) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const bv = state.values[(br + dr) * 9 + bc + dc];
      if (bv !== 0) used |= 1 << (bv - 1);
    }
  }
  return ALL_MASK & ~used;
}

/**
 * 该空格按当前盘面 rules 可填的数字，升序 1-9（用于提示与自动笔记）。
 * 该格已填（非空）时返回 []。
 */
export function getCandidates(state: GameState, r: number, c: number): number[] {
  assertStateShape(state);
  const idx = cellIndex(r, c);
  if (state.values[idx] !== 0) return [];
  const mask = availableMaskAt(state, idx);
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) {
    if ((mask & (1 << (v - 1))) !== 0) out.push(v);
  }
  return out;
}

/**
 * 与数独规则冲突（同行/列/宫重复）的格子 idx 列表（升序），含冲突双方/多方；
 * 不含 notes；不对照 solution（存档天然防翻答案）。规则冲突语义见契约 §5.2。
 */
export function checkErrors(state: GameState): number[] {
  assertStateShape(state);
  const flagged = new Array<boolean>(CELLS).fill(false);
  const seen = new Array<number>(10).fill(-1); // 值 v → 本单元内首个出现 idx
  const scan = (idxAt: (k: number) => number): void => {
    for (let i = 0; i <= 9; i++) seen[i] = -1;
    for (let k = 0; k < 9; k++) {
      const idx = idxAt(k);
      const v = state.values[idx];
      if (v === 0) continue;
      if (seen[v] === -1) {
        seen[v] = idx;
      } else {
        flagged[seen[v]] = true;
        flagged[idx] = true;
      }
    }
  };
  for (let r = 0; r < 9; r++) {
    scan((k) => r * 9 + k);
  }
  for (let c = 0; c < 9; c++) {
    scan((k) => k * 9 + c);
  }
  for (let b = 0; b < 9; b++) {
    const br = ((b / 3) | 0) * 3;
    const bc = (b % 3) * 3;
    scan((k) => (br + ((k / 3) | 0)) * 9 + bc + (k % 3));
  }
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (flagged[i]) out.push(i);
  }
  return out;
}

/** 81 格非空且行/列/宫各恰含 1-9。（state 内数据非法时按未解处理，返回 false） */
export function isSolved(state: GameState): boolean {
  assertStateShape(state);
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const v = state.values[i];
    if (v === 0) return false;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 9) return false;
    const bit = 1 << (v - 1);
    const r = ROW_OF[i];
    const c = COL_OF[i];
    const b = BOX_OF[i];
    if ((rows[r] | cols[c] | boxes[b]) & bit) return false;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 存档序列化
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（盘面+进度+铅笔标记；不含 solution，契约决策⑤）。
 *
 * 格式（`;` 分 6 段）：
 *   `sudoku1;<difficulty>;<seed|->;<givensHex21>;<values81>;<notes|->
 *
 * - givensHex：81 bit 按序每 4 bit 一个小写 hex 字符（21 字符，尾 3 bit 恒 0）。
 * - values81：81 个十进制数字字符（0-9）。
 * - notes：非零格条目 `<idx base36>.<mask base36>` 逗号分隔；全零时为 `-`。
 *
 * 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀，
 * cookie 层 3.5KB 上限更安全（与契约 §5.2「JSON 字符串」注释的偏差，已在任务报告列出）。
 * 抛错条件同 assertStateShape/值域校验（编程错误）；deserialize 才负责宽容。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('sudoku: unknown difficulty "' + String(state.difficulty) + '"');
  }
  let hex = '';
  for (let nib = 0; nib < 21; nib++) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const idx = nib * 4 + j;
      if (idx < CELLS && state.givens[idx]) v |= 1 << (3 - j);
    }
    hex += '0123456789abcdef'.charAt(v);
  }
  let valuesStr = '';
  for (let i = 0; i < CELLS; i++) {
    const v = state.values[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9) {
      throw new Error('sudoku: serialize got invalid cell value at ' + i);
    }
    valuesStr += String(v);
  }
  const noteParts: string[] = [];
  for (let i = 0; i < CELLS; i++) {
    const n = state.notes[i];
    if (n === 0) continue;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > ALL_MASK) {
      throw new Error('sudoku: serialize got invalid note mask at ' + i);
    }
    noteParts.push(i.toString(36) + '.' + n.toString(36));
  }
  const seedStr = state.seed === null ? '-' : String(state.seed >>> 0);
  return (
    'sudoku1;' + state.difficulty + ';' + seedStr + ';' + hex + ';' + valuesStr + ';' +
    (noteParts.length > 0 ? noteParts.join(',') : '-')
  );
}

function hexVal(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  return -1;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、难度词表、seed 范围、hex 与补位 bit、值域、notes 条目与去重、
 * givens 格值非空。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 6 || segs[0] !== 'sudoku1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;

    let seed: number | null;
    if (segs[2] === '-') {
      seed = null;
    } else {
      if (!/^\d{1,10}$/.test(segs[2])) return null;
      seed = Number(segs[2]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    }

    const hex = segs[3];
    if (hex.length !== 21) return null;
    const tail = hexVal(hex.charCodeAt(20));
    if (tail < 0 || (tail & 0x7) !== 0) return null; // idx 81-83 的补位 bit 必须为 0
    const givens = new Array<boolean>(CELLS);
    for (let i = 0; i < CELLS; i++) {
      const h = hexVal(hex.charCodeAt(i >> 2));
      if (h < 0) return null;
      givens[i] = ((h >>> (3 - (i & 3))) & 1) === 1;
    }

    const valuesStr = segs[4];
    if (valuesStr.length !== CELLS) return null;
    const values = new Array<number>(CELLS);
    for (let i = 0; i < CELLS; i++) {
      const code = valuesStr.charCodeAt(i);
      if (code < 48 || code > 57) return null;
      values[i] = code - 48;
    }

    const notes = new Array<number>(CELLS).fill(0);
    if (segs[5] !== '-') {
      const parts = segs[5].split(',');
      for (let p = 0; p < parts.length; p++) {
        const dot = parts[p].indexOf('.');
        if (dot <= 0) return null;
        const idxStr = parts[p].slice(0, dot);
        const maskStr = parts[p].slice(dot + 1);
        if (!/^[0-9a-z]{1,2}$/.test(idxStr) || !/^[0-9a-z]{1,2}$/.test(maskStr)) return null;
        const idx = parseInt(idxStr, 36);
        const mask = parseInt(maskStr, 36);
        if (!(idx >= 0 && idx < CELLS) || !(mask >= 1 && mask <= ALL_MASK)) return null;
        if (notes[idx] !== 0) return null; // 重复条目
        notes[idx] = mask;
      }
    }

    for (let i = 0; i < CELLS; i++) {
      if (givens[i] && values[i] === 0) return null; // givens 格不可为空
    }

    return { difficulty, seed, givens, values, notes };
  } catch (e) {
    return null;
  }
}
