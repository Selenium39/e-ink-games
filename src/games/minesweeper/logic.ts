/**
 * minesweeper/logic — 扫雷纯函数逻辑层（契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（越界 r/c、非法难度/seed）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自 createRng（禁裸 Math.random，§10.6）：seeded=false 随机组局用
 *   Date.now() 种子；首击布雷时若 state.seed 非空则以该 seed 布雷（同 seed+同首击
 *   位置 → 同盘，单测确定性基础）。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 *
 * 核心规则（任务规格）：
 * - 首击安全：首击前不布雷（mines 全 false）；首击触发布雷，首击格与其 8 邻格
 *   永不为雷；首击零格触发连通展开。
 * - 数字 = 邻雷数；插旗格受保护不可挖；chord（已展开数字格旗数=数字时点开其余
 *   邻格）由 chord() 提供。
 * - 胜利 = 所有非雷格展开（won 时自动为全部雷格补旗）；失败 = 踩雷，揭示全部雷
 *   并保留错误旗（渲染层据 flags/mines 之差标错）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型与常量
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'playing' | 'won' | 'lost';

/** 各难度布局（任务规格：easy 9×9/10雷、medium 11×11/24雷、hard 13×13/40雷） */
export interface Layout {
  rows: number;
  cols: number;
  mines: number;
}

export const LAYOUTS: Record<Difficulty, Layout> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 11, cols: 11, mines: 24 },
  hard: { rows: 13, cols: 13, mines: 40 },
};

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface GameState {
  difficulty: Difficulty;
  /** null = 随机组局；非空 = 布雷确定性种子（单测/外部注入用） */
  seed: number | null;
  rows: number;
  cols: number;
  /** 雷总数（= LAYOUTS[difficulty].mines，冗余存一份便于 render/序列化免查表） */
  mineCount: number;
  /** 是否已布雷（首击后 true；false 时 mines 恒全 false） */
  placed: boolean;
  /** 布雷图（长度 rows*cols，行优先 idx = r*cols + c） */
  mines: boolean[];
  /** 已展开格 */
  revealed: boolean[];
  /** 已插旗格 */
  flags: boolean[];
  status: GameStatus;
  /** 踩中的雷格 idx；未踩雷为 -1 */
  exploded: number;
}

// ---------------------------------------------------------------------------
// 校验与内部辅助
// ---------------------------------------------------------------------------

function assertState(s: GameState): void {
  if (s === null || typeof s !== 'object') {
    throw new Error('minesweeper: state must be a GameState object');
  }
  const total = s.rows * s.cols;
  if (
    !Number.isInteger(s.rows) || !Number.isInteger(s.cols) ||
    s.rows < 2 || s.cols < 2 || total > 4096 ||
    !Array.isArray(s.mines) || s.mines.length !== total ||
    !Array.isArray(s.revealed) || s.revealed.length !== total ||
    !Array.isArray(s.flags) || s.flags.length !== total
  ) {
    throw new Error('minesweeper: state fields are inconsistent (rows/cols/arrays)');
  }
}

function idxOf(s: GameState, r: number, c: number): number {
  if (
    typeof r !== 'number' || typeof c !== 'number' ||
    !Number.isInteger(r) || !Number.isInteger(c) ||
    r < 0 || r >= s.rows || c < 0 || c >= s.cols
  ) {
    throw new Error('minesweeper: row/col out of range: r=' + String(r) + ' c=' + String(c));
  }
  return r * s.cols + c;
}

/** idx 的 8 邻格（棋盘内），升序无重复 */
export function neighborsOf(s: GameState, idx: number): number[] {
  assertState(s);
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= s.rows * s.cols) {
    throw new Error('minesweeper: idx out of range: ' + String(idx));
  }
  const r = (idx / s.cols) | 0;
  const c = idx % s.cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) continue;
      out.push(nr * s.cols + nc);
    }
  }
  return out;
}

/** 指定格的邻雷数（就地图；未布雷恒 0）。内部辅助。 */
function mineCountAt(s: GameState, mines: boolean[], idx: number): number {
  const r = (idx / s.cols) | 0;
  const c = idx % s.cols;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) continue;
      if (mines[nr * s.cols + nc]) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 生成新局（未布雷初始态：盘面全隐藏，等待首击触发布雷）。
 * 难度非法 / seed 非 uint32 整数 / opts 非对象 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): GameState {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('minesweeper: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('minesweeper: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number | null = null;
  if (opts.seed !== undefined) {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('minesweeper: seed must be a uint32 integer');
    }
    seed = s;
  }
  const L = LAYOUTS[opts.difficulty];
  const total = L.rows * L.cols;
  return {
    difficulty: opts.difficulty,
    seed,
    rows: L.rows,
    cols: L.cols,
    mineCount: L.mines,
    placed: false,
    mines: new Array<boolean>(total).fill(false),
    revealed: new Array<boolean>(total).fill(false),
    flags: new Array<boolean>(total).fill(false),
    status: 'playing',
    exploded: -1,
  };
}

/**
 * 首击布雷：排除首击格及其 8 邻格后从剩余格随机取 mineCount 个。
 * 三档规格下安全区余量（72/112/160）恒远大于雷数（10/24/40），退化分支仅为
 * 防御性兜底（若未来出现超密雷盘）：只保护首击格本身重试，仍不够则 throw。
 */
function placeMines(s: GameState, safeIdx: number, rng: Rng): boolean[] {
  const total = s.rows * s.cols;
  const forbidden = new Array<boolean>(total).fill(false);
  forbidden[safeIdx] = true;
  const ns = neighborsOf(s, safeIdx);
  for (let k = 0; k < ns.length; k++) forbidden[ns[k]] = true;
  let candidates: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!forbidden[i]) candidates.push(i);
  }
  if (candidates.length < s.mineCount) {
    candidates = [safeIdx];
    for (let i = 0; i < total; i++) {
      if (i !== safeIdx) candidates.push(i);
    }
  }
  if (candidates.length < s.mineCount) {
    throw new Error('minesweeper: mine count exceeds board size');
  }
  const order = rng.shuffle(candidates);
  const mines = new Array<boolean>(total).fill(false);
  for (let k = 0; k < s.mineCount; k++) mines[order[k]] = true;
  return mines;
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

/** 失败收尾：揭示全部雷、记录爆格（exploded 也置 revealed）。 */
function loseGame(state: GameState, mines: boolean[], placed: boolean, exploded: number): GameState {
  const revealed = state.revealed.slice();
  for (let i = 0; i < revealed.length; i++) {
    if (mines[i]) revealed[i] = true;
  }
  revealed[exploded] = true;
  return { difficulty: state.difficulty, seed: state.seed, rows: state.rows, cols: state.cols,
    mineCount: state.mineCount, placed, mines, revealed, flags: state.flags,
    status: 'lost', exploded };
}

/**
 * 从 startIdxs 展开（调用方保证全非雷）：零格 flood 连通展开，插旗格受保护跳过。
 * 展开数达到 非雷格总数 → won（自动为全部雷格补旗，庆祝显示）。
 */
function openFrom(state: GameState, mines: boolean[], placed: boolean, startIdxs: number[]): GameState {
  const total = state.rows * state.cols;
  const revealed = state.revealed.slice();
  const stack: number[] = [];
  for (let k = 0; k < startIdxs.length; k++) {
    if (mines[startIdxs[k]]) {
      throw new Error('minesweeper: internal error — openFrom got a mine cell');
    }
    stack.push(startIdxs[k]);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (revealed[i] || state.flags[i]) continue; // 旗格保护（含 flood 路径）
    revealed[i] = true;
    if (mineCountAt(state, mines, i) === 0) {
      const ns = neighborsOf(state, i);
      for (let k = 0; k < ns.length; k++) {
        const n = ns[k];
        if (!revealed[n] && !state.flags[n]) stack.push(n);
      }
    }
  }
  let opened = 0;
  for (let i = 0; i < total; i++) {
    if (revealed[i]) opened++;
  }
  if (opened === total - state.mineCount) {
    const flags = state.flags.slice();
    for (let i = 0; i < total; i++) {
      if (mines[i]) flags[i] = true;
    }
    return { difficulty: state.difficulty, seed: state.seed, rows: state.rows, cols: state.cols,
      mineCount: state.mineCount, placed, mines, revealed, flags, status: 'won', exploded: -1 };
  }
  return { difficulty: state.difficulty, seed: state.seed, rows: state.rows, cols: state.cols,
    mineCount: state.mineCount, placed, mines, revealed, flags: state.flags,
    status: 'playing', exploded: -1 };
}

/**
 * 挖格。首击（placed=false）先安全布雷再展开；旗格与已展开格 no-op（原引用）；
 * 已终局（won/lost）no-op；踩雷 → lost。
 */
export function dig(state: GameState, r: number, c: number): GameState {
  assertState(state);
  const idx = idxOf(state, r, c);
  if (state.status !== 'playing') return state;
  if (state.revealed[idx] || state.flags[idx]) return state;
  let mines = state.mines;
  let placed = state.placed;
  if (!placed) {
    const rng = createRng(state.seed !== null ? state.seed : (Date.now() >>> 0));
    mines = placeMines(state, idx, rng);
    placed = true;
  }
  if (mines[idx]) return loseGame(state, mines, placed, idx);
  return openFrom(state, mines, placed, [idx]);
}

/**
 * 插旗/取消旗。已展开格、已终局 no-op（原引用）；placed 前允许预插旗。
 * 状态始终转移（翻转必产生新对象）——同格再点一次即取消。
 */
export function toggleFlag(state: GameState, r: number, c: number): GameState {
  assertState(state);
  const idx = idxOf(state, r, c);
  if (state.status !== 'playing') return state;
  if (state.revealed[idx]) return state;
  const flags = state.flags.slice();
  flags[idx] = !flags[idx];
  return { difficulty: state.difficulty, seed: state.seed, rows: state.rows, cols: state.cols,
    mineCount: state.mineCount, placed: state.placed, mines: state.mines,
    revealed: state.revealed, flags, status: state.status, exploded: state.exploded };
}

/**
 * chord：已展开数字格旗数恰等于数字时，点开其余未插旗邻格。
 * 未展开格 / 零格 / 旗数不符 / 未布雷 / 已终局 → no-op（原引用）。
 * 任一目标格是雷 → lost（爆第一颗，loseGame 同时揭示其余雷）。
 */
export function chord(state: GameState, r: number, c: number): GameState {
  assertState(state);
  const idx = idxOf(state, r, c);
  if (state.status !== 'playing' || !state.placed) return state;
  if (!state.revealed[idx]) return state;
  const n = mineCountAt(state, state.mines, idx);
  if (n === 0) return state;
  const ns = neighborsOf(state, idx);
  let flagN = 0;
  for (let k = 0; k < ns.length; k++) {
    if (state.flags[ns[k]]) flagN++;
  }
  if (flagN !== n) return state;
  const targets: number[] = [];
  for (let k = 0; k < ns.length; k++) {
    const x = ns[k];
    if (!state.revealed[x] && !state.flags[x]) targets.push(x);
  }
  if (targets.length === 0) return state;
  for (let k = 0; k < targets.length; k++) {
    if (state.mines[targets[k]]) {
      return loseGame(state, state.mines, state.placed, targets[k]);
    }
  }
  return openFrom(state, state.mines, state.placed, targets);
}

/** 该格邻雷数（render 数字用）；placed 前恒 0；越界 throw。 */
export function cellNumber(state: GameState, r: number, c: number): number {
  assertState(state);
  const idx = idxOf(state, r, c);
  if (!state.placed) return 0;
  return mineCountAt(state, state.mines, idx);
}

/** 剩余雷数显示（总雷 - 旗数，可为负）。 */
export function mineCounter(state: GameState): number {
  assertState(state);
  let f = 0;
  for (let i = 0; i < state.flags.length; i++) {
    if (state.flags[i]) f++;
  }
  return state.mineCount - f;
}

/**
 * 是否胜利。以「所有非雷格均已展开」独立计算（不单信 status 字段），
 * state 数据非法时按未胜处理（返回 false）。
 */
export function isSolved(state: GameState): boolean {
  assertState(state);
  if (state.status !== 'playing' || !state.placed) return state.status === 'won';
  for (let i = 0; i < state.mines.length; i++) {
    if (!state.mines[i] && !state.revealed[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 存档序列化
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（契约决策⑤：无 solution 概念——雷图即谜底，但 status=playing 的
 * 中途存档只在首击后才含雷图；首击前存档雷图恒空，天然不泄底）。
 *
 * 格式（`;` 分 10 段）：
 *   `ms1;<difficulty>;<seed|->;<rows>x<cols>;<placed 0/1>;<status p/w/l>;<exploded>;<minesHex>;<revealedHex>;<flagsHex>`
 *
 * - 各位图 total bits 按序每 4 bit 一个小写 hex 字符（ceil(total/4) 字符，尾 padding bit 恒 0）。
 *
 * 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀，
 * cookie 层 3.5KB 上限更安全（与 sudoku 打样同一先例）。
 * 抛错条件同 assertState/难度校验（编程错误）；deserialize 才负责宽容。
 */
export function serialize(state: GameState): string {
  assertState(state);
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('minesweeper: unknown difficulty "' + String(state.difficulty) + '"');
  }
  const total = state.rows * state.cols;
  const statusChar = state.status === 'playing' ? 'p' : state.status === 'won' ? 'w' : 'l';
  return [
    'ms1', state.difficulty,
    state.seed === null ? '-' : String(state.seed >>> 0),
    state.rows + 'x' + state.cols,
    state.placed ? '1' : '0',
    statusChar,
    String(state.exploded),
    packBits(state.mines, total),
    packBits(state.revealed, total),
    packBits(state.flags, total),
  ].join(';');
}

function packBits(bits: boolean[], total: number): string {
  const nib = (total + 3) >> 2;
  let out = '';
  for (let k = 0; k < nib; k++) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const i = k * 4 + j;
      if (i < total && bits[i]) v |= 1 << (3 - j);
    }
    out += '0123456789abcdef'.charAt(v);
  }
  return out;
}

function hexVal(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  return -1;
}

function unpackBits(hex: string, total: number): boolean[] | null {
  const nib = (total + 3) >> 2;
  if (hex.length !== nib) return null;
  const bits = new Array<boolean>(total);
  for (let i = 0; i < total; i++) {
    const h = hexVal(hex.charCodeAt(i >> 2));
    if (h < 0) return null;
    bits[i] = ((h >>> (3 - (i & 3))) & 1) === 1;
  }
  // 尾 padding bit（total..nib*4-1）必须全 0
  const tail = hexVal(hex.charCodeAt(nib - 1));
  if (tail < 0) return null;
  const padBits = nib * 4 - total;
  if (padBits > 0 && (tail & ((1 << padBits) - 1)) !== 0) return null;
  return bits;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、难度词表与布局匹配、seed 范围、status/exploded 语义、
 * 位图字符集与尾 padding、雷数=mineCount、旗/展开不相交、终局一致性。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 10 || segs[0] !== 'ms1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;
    const L = LAYOUTS[difficulty];
    const total = L.rows * L.cols;
    if (segs[3] !== L.rows + 'x' + L.cols) return null;

    let seed: number | null;
    if (segs[2] === '-') {
      seed = null;
    } else {
      if (!/^\d{1,10}$/.test(segs[2])) return null;
      seed = Number(segs[2]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    }

    if (segs[4] !== '0' && segs[4] !== '1') return null;
    const placed = segs[4] === '1';

    let status: GameStatus;
    if (segs[5] === 'p') status = 'playing';
    else if (segs[5] === 'w') status = 'won';
    else if (segs[5] === 'l') status = 'lost';
    else return null;

    if (!/^-?\d{1,6}$/.test(segs[6])) return null;
    const exploded = Number(segs[6]);
    if (exploded !== -1 && (exploded < 0 || exploded >= total)) return null;

    const mines = unpackBits(segs[7], total);
    const revealed = unpackBits(segs[8], total);
    const flags = unpackBits(segs[9], total);
    if (mines === null || revealed === null || flags === null) return null;

    // 雷数一致
    let mineN = 0;
    for (let i = 0; i < total; i++) {
      if (mines[i]) mineN++;
    }
    if (mineN !== (placed ? L.mines : 0)) return null;

    // 旗/展开不相交；终局一致性
    for (let i = 0; i < total; i++) {
      if (flags[i] && revealed[i]) return null;
    }
    if (status === 'playing' && exploded !== -1) return null;
    if (status === 'won') {
      if (exploded !== -1) return null;
      for (let i = 0; i < total; i++) {
        if (!mines[i] && !revealed[i]) return null;
      }
    }
    if (status === 'lost') {
      if (exploded < 0 || !mines[exploded] || !revealed[exploded]) return null;
      for (let i = 0; i < total; i++) {
        if (mines[i] && !revealed[i]) return null; // 失败必揭示全部雷
      }
    }
    if (status !== 'playing' && !placed) return null;

    return { difficulty, seed, rows: L.rows, cols: L.cols, mineCount: L.mines,
      placed, mines, revealed, flags, status, exploded };
  } catch (e) {
    return null;
  }
}
