/**
 * nonogram/logic — 数织（Nonogram / Paint-by-numbers）纯函数逻辑层
 * （契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（越界 r/c、非法难度、marks 长度不符）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自注入的 createRng：同 seed 必产出同谜题（每日挑战正确性基础）。
 *   生成器的重试/兜底路径同样只由 rng 输出驱动——同 seed 走同路径、产同题。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 *
 * 胜负判定语义（对齐 sudoku 的「规则冲突」哲学，契约决策⑤：存档不含 solution）：
 * 经典数织规则「完成 = 填充格与图案一致」，等价于「每行每列的填充段序列与提示一致」
 * （谜题唯一解时两条件重合；本生成器只产出 line-solvable 谜题 ⇒ 唯一解）。
 * 判定只需 clues，无需 solution —— 判胜负不依赖题底，存档天然防翻答案。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 格标记三态：0=空 1=填充■ 2=排除× */
export type Mark = 0 | 1 | 2;

/** 行列提示：rows[r] = 第 r 行的填充段长度序列（升序位置、值降序无关）；空行 = [] */
export interface Clues {
  rows: number[][];
  cols: number[][];
}

export interface GameState {
  difficulty: Difficulty;
  /** null = 随机组局（非每日/非固定种子） */
  seed: number | null;
  /** 盘面边长（easy 5 / medium 10 / hard 15），冗余存 clues 校验用 */
  size: number;
  /** 题面提示（存档自含；判胜负只依赖它，不依赖 solution） */
  clues: Clues;
  /** size² 三态标记，行优先：idx = r*size + c */
  marks: Mark[];
}

export interface NewGameResult {
  /** 题底图案（true=填充）。已验证 line-solvable ⇒ 唯一解；仅供测试/render 参考，不入存档 */
  solution: boolean[];
  clues: Clues;
  /** 初始 state（免去 render 手工拼装） */
  state: GameState;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const SIZES: Record<Difficulty, number> = { easy: 5, medium: 10, hard: 15 };

/** 图案目标填充率（约 55%，任务规格） */
const DENSITY = 0.55;

/**
 * 随机对称图案的重试上限。开发机实测命中率（300 样本/组，见 logic.test.ts
 * 的 [perf] 用例复测）：5×5@55% ≈ 88%、10×10@55% ≈ 78%、15×15@55% ≈ 69%，
 * 单次 lineSolve 验证 0.01-0.14ms（真机按 ~30 倍减速预留仍 ≪1s 预算）。
 * 平均 1.1-1.5 轮即命中；上限再留数十倍余量（hard 全败概率 ~1e-9），
 * 重试轮数只由 rng 序列决定 → 跨设备一致。
 */
const MAX_ATTEMPTS: Record<Difficulty, number> = { easy: 16, medium: 32, hard: 64 };

/** 随机轮全败后的降密度重试（40% 密度命中率显著更低，仅作概率保险丝） */
const FALLBACK_DENSITY = 0.4;
const FALLBACK_ROUNDS = 32;

// ---------------------------------------------------------------------------
// 行列提示计算
// ---------------------------------------------------------------------------

/** 一条线（布尔数组）的填充段长度序列；全空 → [] */
function lineClue(cells: boolean[], from: number, to: number, step: number): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = from; i !== to; i += step) {
    if (cells[i]) {
      run++;
    } else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out;
}

/** 图案 → 行列提示。size 与 pattern 长目不符属编程错误：throw。 */
export function cluesFor(pattern: boolean[], size: number): Clues {
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 32) {
    throw new Error('nonogram: size must be an integer 1-32');
  }
  if (!Array.isArray(pattern) || pattern.length !== size * size) {
    throw new Error('nonogram: pattern must contain size*size cells');
  }
  const rows: number[][] = [];
  const cols: number[][] = [];
  for (let r = 0; r < size; r++) {
    rows.push(lineClue(pattern, r * size, (r + 1) * size, 1));
  }
  for (let c = 0; c < size; c++) {
    cols.push(lineClue(pattern, c, c + size * size, size));
  }
  return { rows, cols };
}

// ---------------------------------------------------------------------------
// 行列推理求解器（line solver）
// ---------------------------------------------------------------------------

/** 线求解的格值：-1 未知 / 0 空 / 1 填充（Int8Array 打包，避免每格对象） */
const UNKNOWN = -1;
const EMPTY = 0;
const FILLED = 1;

/**
 * 单线推理：给定提示 clue 与已知线状态 known（-1/0/1），推导每格必然值。
 *
 * 算法：线性 DP（绝非指数搜索）。状态 (pos, j) = 「前 pos 格已决策、
 * 前 j 段已完整放置」。
 *   1. 后缀可行性 sf(pos, j)：能否从 (pos, j) 走到 (len, k)（记忆化递归）；
 *   2. 从 (0, 0) 沿「后缀可行」的转移边遍历，run 边给覆盖格记 canFill、
 *      empty 边（含段后强制空格）记 canEmpty；
 *   3. canFill ∧ ¬canEmpty → 必填充；¬canFill ∧ canEmpty → 必空；两者兼有 → 未知。
 * 无任何可行排列 → null（线索与已知矛盾）。复杂度 O(len²·k) 每线。
 *
 * 返回值与 known 同构：已确定格为 0/1，仍未知格为 -1（不会覆盖已知格）。
 */
function solveLine(len: number, clue: number[], known: Int8Array): Int8Array | null {
  const k = clue.length;
  // 快路径：整线已知无可行排列（和+间隙超长）——交由 sf 统一判定，不特判。

  // sf[pos*(k+1)+j]：0 未算 / 1 可行 / 2 不可行
  const sf = new Int8Array((len + 1) * (k + 1));
  const seen = new Int8Array((len + 1) * (k + 1));

  const suffixFeasible = (pos: number, j: number): boolean => {
    if (pos === len) return j === k;
    const key = pos * (k + 1) + j;
    if (seen[key]) return sf[key] === 1;
    seen[key] = 1;
    let ok = false;
    // 决策 A：格 pos 为空（若与已知不冲突）
    if (known[pos] !== FILLED && suffixFeasible(pos + 1, j)) ok = true;
    // 决策 B：从 pos 起整段放 run j，随后一格空（或到线尾）
    if (!ok && j < k) {
      const end = pos + clue[j];
      if (end <= len) {
        let fit = true;
        for (let i = pos; i < end; i++) {
          if (known[i] === EMPTY) {
            fit = false;
            break;
          }
        }
        if (fit) {
          if (end === len) {
            ok = suffixFeasible(end, j + 1);
          } else if (known[end] !== FILLED) {
            ok = suffixFeasible(end + 1, j + 1);
          }
        }
      }
    }
    sf[key] = ok ? 1 : 2;
    return ok;
  };

  if (!suffixFeasible(0, 0)) return null;

  // 前向沿可行边标记 canFill/canEmpty；visited 防重访（状态图非 DAG 时也只需遍历一次）
  const canFill = new Uint8Array(len);
  const canEmpty = new Uint8Array(len);
  const visited = new Uint8Array((len + 1) * (k + 1));
  const stack: number[] = [0]; // 状态 (pos, j) 打包：pos*(k+1)+j
  visited[0] = 1;
  while (stack.length > 0) {
    const key = stack.pop() as number;
    const pos = (key / (k + 1)) | 0;
    const j = key % (k + 1);
    if (pos === len) continue;
    // 边 A：pos 空（sf 未算过的状态按需补算——suffixFeasible(0,0) 的
    // 短路求值不会预计算全部状态，直接读缓存会误判不可行）
    if (known[pos] !== FILLED && suffixFeasible(pos + 1, j)) {
      canEmpty[pos] = 1;
      const nk = (pos + 1) * (k + 1) + j;
      if (!visited[nk]) {
        visited[nk] = 1;
        stack.push(nk);
      }
    }
    // 边 B：run j 从 pos 起整段
    if (j < k) {
      const end = pos + clue[j];
      if (end <= len) {
        let fit = true;
        for (let i = pos; i < end; i++) {
          if (known[i] === EMPTY) {
            fit = false;
            break;
          }
        }
        let reachNext = false;
        let nextKey = -1;
        if (fit) {
          if (end === len) {
            reachNext = suffixFeasible(end, j + 1);
            nextKey = end * (k + 1) + (j + 1);
          } else if (known[end] !== FILLED) {
            reachNext = suffixFeasible(end + 1, j + 1);
            nextKey = (end + 1) * (k + 1) + (j + 1);
          }
        }
        if (reachNext) {
          for (let i = pos; i < end; i++) canFill[i] = 1;
          if (end < len) canEmpty[end] = 1; // 段后强制空格
          if (!visited[nextKey]) {
            visited[nextKey] = 1;
            stack.push(nextKey);
          }
        }
      }
    }
  }

  const out = new Int8Array(len);
  for (let i = 0; i < len; i++) {
    if (known[i] !== UNKNOWN) {
      out[i] = known[i];
    } else if (canFill[i] && !canEmpty[i]) {
      out[i] = FILLED;
    } else if (!canFill[i] && canEmpty[i]) {
      out[i] = EMPTY;
    } else {
      out[i] = UNKNOWN;
    }
  }
  return out;
}

/**
 * 全盘行列推理求解：反复对每行每列跑单线推理直到不动点。
 * 返回 size² 格的 -1/0/1；全部非 -1 = 该谜题 line-solvable（人类可纯逻辑解出）。
 * 线索自相矛盾（无任何图案满足）→ null。合法 clues（由图案计算而来）不会矛盾。
 */
export function lineSolve(size: number, clues: Clues): Int8Array | null {
  if (!isValidCluesShape(size, clues)) {
    throw new Error('nonogram: clues shape mismatch with size');
  }
  const board = new Int8Array(size * size);
  for (let i = 0; i < board.length; i++) board[i] = UNKNOWN;

  const buf = new Int8Array(size);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      for (let i = 0; i < size; i++) buf[i] = board[r * size + i];
      const res = solveLine(size, clues.rows[r], buf);
      if (res === null) return null;
      for (let c = 0; c < size; c++) {
        if (res[c] !== UNKNOWN && board[r * size + c] === UNKNOWN) {
          board[r * size + c] = res[c];
          changed = true;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let i = 0; i < size; i++) buf[i] = board[i * size + c];
      const res = solveLine(size, clues.cols[c], buf);
      if (res === null) return null;
      for (let r = 0; r < size; r++) {
        if (res[r] !== UNKNOWN && board[r * size + c] === UNKNOWN) {
          board[r * size + c] = res[r];
          changed = true;
        }
      }
    }
  }
  return board;
}

// ---------------------------------------------------------------------------
// 生成器
// ---------------------------------------------------------------------------

/**
 * 随机图案（左右镜像对称）：只随机左半（含中线），右半镜像。
 * 对称图案保留 "Paint-by-numbers" 的图案感；镜像不改变生成的确定性。
 */
function randomPattern(rng: Rng, size: number): boolean[] {
  const cells = new Array<boolean>(size * size);
  const half = (size + 1) >> 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < half; c++) {
      const v = rng.next() < DENSITY;
      cells[r * size + c] = v;
      cells[r * size + (size - 1 - c)] = v;
    }
  }
  return cells;
}

/** 降密度随机轮的图案（同上，密度 FALLBACK_DENSITY） */
function randomPatternSparse(rng: Rng, size: number): boolean[] {
  const cells = new Array<boolean>(size * size);
  const half = (size + 1) >> 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < half; c++) {
      const v = rng.next() < FALLBACK_DENSITY;
      cells[r * size + c] = v;
      cells[r * size + (size - 1 - c)] = v;
    }
  }
  return cells;
}

/**
 * 构造式条纹兜底：整列（或整行，rng 决定方向与相位）隔列填充。
 * 每行提示 = [1,1,…]（段和恰等于行长，free=0）→ 每线唯一排列，
 * 恒 line-solvable。仅当随机轮全败（概率极低）时触达；仍由 rng 决定
 * 具体形态 → 同 seed 同题保持成立。
 */
function stripePattern(rng: Rng, size: number): boolean[] {
  const vertical = rng.int(2) === 0;
  const phase = rng.int(2);
  const cells = new Array<boolean>(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const along = vertical ? c : r;
      cells[r * size + c] = (along + phase) % 2 === 0;
    }
  }
  return cells;
}

/**
 * 生成新局。唯一随机源 createRng(opts.seed ?? (Date.now() >>> 0))（契约 §5.2）。
 *
 * 流程（全程确定性）：随机对称图案（~55% 密度）→ 算行列提示 → lineSolve 验证
 * 全盘可解；不可解换下一轮随机图案；MAX_ATTEMPTS 轮后降密度 0.4 再试
 * FALLBACK_ROUNDS 轮；仍全败落条纹兜底（恒可解）。
 *
 * 难度非法 / seed 非 uint32 整数 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): NewGameResult {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('nonogram: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('nonogram: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number | null = null;
  let rng: Rng;
  if (opts.seed === undefined) {
    rng = createRng(Date.now() >>> 0);
  } else {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('nonogram: seed must be a uint32 integer');
    }
    seed = s;
    rng = createRng(s);
  }

  const size = SIZES[opts.difficulty];
  let pattern: boolean[] | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS[opts.difficulty] && pattern === null; attempt++) {
    const candidate = randomPattern(rng, size);
    if (isLineSolvable(size, candidate)) pattern = candidate;
  }
  for (let attempt = 0; attempt < FALLBACK_ROUNDS && pattern === null; attempt++) {
    const candidate = randomPatternSparse(rng, size);
    if (isLineSolvable(size, candidate)) pattern = candidate;
  }
  if (pattern === null) pattern = stripePattern(rng, size);

  const clues = cluesFor(pattern, size);
  const marks = new Array<Mark>(size * size);
  for (let i = 0; i < marks.length; i++) marks[i] = 0;
  const state: GameState = { difficulty: opts.difficulty, seed, size, clues, marks };
  return { solution: pattern, clues, state };
}

/** 图案是否 line-solvable（提示由图案计算 → 线索必自洽，lineSolve 不会返回 null） */
function isLineSolvable(size: number, pattern: boolean[]): boolean {
  const clues = cluesFor(pattern, size);
  const board = lineSolve(size, clues);
  if (board === null) return false;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === UNKNOWN) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('nonogram: state must be a GameState object');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('nonogram: unknown difficulty "' + String(state.difficulty) + '"');
  }
  const size = SIZES[state.difficulty];
  if (state.size !== size) {
    throw new Error('nonogram: state.size mismatch with difficulty');
  }
  if (!Array.isArray(state.marks) || state.marks.length !== size * size) {
    throw new Error('nonogram: state.marks must contain size*size entries');
  }
  for (let i = 0; i < state.marks.length; i++) {
    const m = state.marks[i];
    if (m !== 0 && m !== 1 && m !== 2) {
      throw new Error('nonogram: mark must be 0/1/2, got ' + String(m) + ' at ' + i);
    }
  }
  if (!isValidCluesShape(size, state.clues)) {
    throw new Error('nonogram: state.clues shape mismatch');
  }
}

/** clues 结构校验：行/列数、每线段值 1..size、段和+最小间隙 ≤ size */
function isValidCluesShape(size: number, clues: Clues): boolean {
  if (clues === null || typeof clues !== 'object') return false;
  if (!Array.isArray(clues.rows) || clues.rows.length !== size) return false;
  if (!Array.isArray(clues.cols) || clues.cols.length !== size) return false;
  const okLine = (line: number[]): boolean => {
    if (!Array.isArray(line)) return false;
    let sum = 0;
    for (let i = 0; i < line.length; i++) {
      const v = line[i];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > size) return false;
      sum += v;
    }
    return sum + Math.max(0, line.length - 1) <= size;
  };
  for (let r = 0; r < size; r++) {
    if (!okLine(clues.rows[r])) return false;
  }
  for (let c = 0; c < size; c++) {
    if (!okLine(clues.cols[c])) return false;
  }
  return true;
}

function cellIndex(state: GameState, r: number, c: number): number {
  const size = SIZES[state.difficulty];
  if (
    typeof r !== 'number' || typeof c !== 'number' ||
    !Number.isInteger(r) || !Number.isInteger(c) ||
    r < 0 || r >= size || c < 0 || c >= size
  ) {
    throw new Error('nonogram: row/col out of range: r=' + String(r) + ' c=' + String(c));
  }
  return r * size + c;
}

/**
 * 三态循环：空(0) → 填充(1) → 排除×(2) → 空(0)。
 * 完成局（isSolved 为真）为 no-op——由 render 层在交互入口拦住，
 * 本函数不做完成判定（保持纯转移语义；对已完成局循环也不破坏判胜，
 * 但 render 不会到达此处）。
 */
export function cycleCell(state: GameState, r: number, c: number): GameState {
  assertStateShape(state);
  const idx = cellIndex(state, r, c);
  const marks = state.marks.slice();
  marks[idx] = ((marks[idx] + 1) % 3) as Mark;
  return { difficulty: state.difficulty, seed: state.seed, size: state.size, clues: state.clues, marks };
}

/** 直接设置格标记（幂等：设为当前值返回原引用；mark 非法 throw） */
export function setCell(state: GameState, r: number, c: number, mark: Mark): GameState {
  assertStateShape(state);
  if (mark !== 0 && mark !== 1 && mark !== 2) {
    throw new Error('nonogram: mark must be 0/1/2, got ' + String(mark));
  }
  const idx = cellIndex(state, r, c);
  if (state.marks[idx] === mark) return state;
  const marks = state.marks.slice();
  marks[idx] = mark;
  return { difficulty: state.difficulty, seed: state.seed, size: state.size, clues: state.clues, marks };
}

// ---------------------------------------------------------------------------
// 行/列完成态与胜负判定（clues 满足性语义，不依赖 solution）
// ---------------------------------------------------------------------------

/** 一条 marks 线的填充段序列（只看 1=填充；排除标记×不参与判定） */
function marksRuns(marks: Mark[], from: number, to: number, step: number): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = from; i !== to; i += step) {
    if (marks[i] === 1) {
      run++;
    } else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out;
}

function sameRuns(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 行/列提示完成态（render 用于提示数字的反转/删除线态）：
 * 某线的填充段序列与提示一致 = 该线完成。行 r 完成 ⇔ 玩家在该行的
 * 填充集合与题底该行一致（唯一解保证下）。
 */
export function lineStatus(state: GameState): { rows: boolean[]; cols: boolean[] } {
  assertStateShape(state);
  const size = state.size;
  const rows = new Array<boolean>(size);
  const cols = new Array<boolean>(size);
  for (let r = 0; r < size; r++) {
    rows[r] = sameRuns(marksRuns(state.marks, r * size, (r + 1) * size, 1), state.clues.rows[r]);
  }
  for (let c = 0; c < size; c++) {
    cols[c] = sameRuns(marksRuns(state.marks, c, c + size * size, size), state.clues.cols[c]);
  }
  return { rows, cols };
}

/**
 * 完成判定：所有行与所有列的填充段序列均与提示一致。
 * 经典规则：错误不即时提示，最终判胜负（排除标记×不影响判定——
 * 即使在题底为填充的格上打×，只要填充集合满足全部提示即算完成；
 * 这与「填充格与图案一致」在唯一解下等价）。
 */
export function isSolved(state: GameState): boolean {
  const st = lineStatus(state);
  for (let i = 0; i < st.rows.length; i++) {
    if (!st.rows[i]) return false;
  }
  for (let i = 0; i < st.cols.length; i++) {
    if (!st.cols[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 存档序列化
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（进度+题面提示；不含 solution，契约决策⑤）。
 *
 * 格式（`;` 分 6 段）：
 *   `nono1;<difficulty>;<seed|->;<rowClues>;<colClues>;<marks>`
 *
 * - rowClues/colClues：线与线用 `.` 分隔；每线内段长按 base36 单字符连接
 *   （段长 1..size ≤ 32 → base36 恰单字符；空线 = 空串）。
 * - marks：size² 个字符 `0`/`1`/`2`。
 *
 * 不用 JSON：存档经 storage 载荷二次 JSON.stringify，无引号转义膨胀，
 * cookie 层 3.5KB 上限更安全（hard 15×15 全档约 300-400 字符）。
 * 抛错条件同 assertStateShape（编程错误）；deserialize 才负责宽容。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);

  const encodeClue = (clue: number[]): string => {
    let s = '';
    for (let i = 0; i < clue.length; i++) s += clue[i].toString(36);
    return s;
  };
  const encodeLines = (lines: number[][]): string => {
    const parts: string[] = [];
    for (let i = 0; i < lines.length; i++) parts.push(encodeClue(lines[i]));
    return parts.join('.');
  };

  let marksStr = '';
  for (let i = 0; i < state.marks.length; i++) marksStr += String(state.marks[i]);

  const seedStr = state.seed === null ? '-' : String(state.seed >>> 0);
  return (
    'nono1;' + state.difficulty + ';' + seedStr + ';' +
    encodeLines(state.clues.rows) + ';' + encodeLines(state.clues.cols) + ';' + marksStr
  );
}

function parseClueLine(seg: string, size: number): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < seg.length; i++) {
    const v = parseInt(seg.charAt(i), 36);
    if (!(v >= 1 && v <= size)) return null;
    out.push(v);
  }
  return out;
}

function parseClues(seg: string, size: number): number[][] | null {
  const parts = seg.split('.');
  if (parts.length !== size) return null;
  const lines: number[][] = [];
  for (let i = 0; i < parts.length; i++) {
    const line = parseClueLine(parts[i], size);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、难度词表、seed 范围、clues 结构（值域/段和间隙约束/
 * 线数）、marks 字符与长度、clues 至少存在一个非空线（空盘谜题拒绝）。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 6 || segs[0] !== 'nono1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;
    const size = SIZES[difficulty];

    let seed: number | null;
    if (segs[2] === '-') {
      seed = null;
    } else {
      if (!/^\d{1,10}$/.test(segs[2])) return null;
      seed = Number(segs[2]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    }

    const rows = parseClues(segs[3], size);
    if (rows === null) return null;
    const cols = parseClues(segs[4], size);
    if (cols === null) return null;

    const marksStr = segs[5];
    if (marksStr.length !== size * size) return null;
    const marks = new Array<Mark>(size * size);
    for (let i = 0; i < marksStr.length; i++) {
      const code = marksStr.charCodeAt(i) - 48;
      if (code < 0 || code > 2) return null;
      marks[i] = code as Mark;
    }

    const clues = { rows, cols };
    if (!isValidCluesShape(size, clues)) return null;
    let anyClue = false;
    for (let i = 0; i < size && !anyClue; i++) {
      if (rows[i].length > 0 || cols[i].length > 0) anyClue = true;
    }
    if (!anyClue) return null; // 全空线索 = 空图案谜题，拒绝

    return { difficulty, seed, size, clues, marks };
  } catch (e) {
    return null;
  }
}
