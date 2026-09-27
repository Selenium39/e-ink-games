/**
 * hidden-code/logic — 经典符号破译玩法（同类桌游机制的独立实现）纯函数逻辑层
 * （契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（注入随机源，§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（越界槽位/符号、非法难度、长度不匹配）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 反馈算法为经典两遍计数：先消耗位置完全匹配（exact），剩余再算位置错（partial）——
 *   重复符号的计数坑由测试钉死（[A,A,B,B] 猜 [A,B,B,A] → exact 2 / partial 2）。
 * - 商标红线：本文件及整个 bundle 不出现商标词；游戏自称 "Hidden Code"（符号破译）。
 * - 存档与决策⑤（不含 solution）：state.seed 恒记录本局实际种子（uint32，随机局也不例外），
 *   serialize 只落 seed；deserialize 经 newGame({difficulty, seed}) 重建 solution——
 *   同 seed 必产出同码（rng 契约），翻档者无法从存档字符串直接读出答案。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型与难度配置
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 难度 → 局参数（任务书规格：槽位 / 符号种类 / 可猜轮数） */
export interface DifficultySpec {
  codeLength: number;
  symbolCount: number;
  maxRounds: number;
}

export const DIFFICULTY_SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { codeLength: 4, symbolCount: 5, maxRounds: 10 },
  medium: { codeLength: 4, symbolCount: 6, maxRounds: 8 },
  hard: { codeLength: 5, symbolCount: 6, maxRounds: 10 },
};

/** 符号域上限（全难度最大 6 种符号：内部索引 0-5，render 层映射为 ●■▲★◆▼） */
export const MAX_SYMBOLS = 6;

/** 每次猜测的反馈：peg 计数，不指明具体槽位 */
export interface Feedback {
  /** 位置+符号都对的数量（render 画实心 ●） */
  exact: number;
  /** 符号在码中但位置错的数量（render 画空心 ○） */
  partial: number;
}

/** 一条已提交的猜测（历史行不可撤：提交即锁定） */
export interface GuessEntry {
  guess: number[];
  exact: number;
  partial: number;
}

export interface GameState {
  difficulty: Difficulty;
  /** 本局实际种子（uint32）。随机局也记录——存档恢复靠它重建 solution（见文件头） */
  seed: number;
  /** 隐藏码（符号索引数组）。serialize 丢弃；deserialize 经 newGame 重建 */
  solution: number[];
  /** 已提交猜测（时间升序） */
  history: GuessEntry[];
  /** 当前行槽位：-1=空，否则符号索引 0..symbolCount-1；未提交的输入归 here（可撤） */
  current: number[];
}

export interface NewGameResult {
  solution: number[];
  state: GameState;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// ---------------------------------------------------------------------------
// 内部校验
// ---------------------------------------------------------------------------

function assertSymbol(v: number, where: string): void {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= MAX_SYMBOLS) {
    throw new Error('hidden-code: ' + where + ' symbol must be an integer 0-' + (MAX_SYMBOLS - 1) + ', got ' + String(v));
  }
}

/** 码/猜测数组形状校验：非空、长度上界 8、元素为合法符号索引（长度语义由调用方比对） */
function assertCode(code: number[], where: string): void {
  if (!Array.isArray(code) || code.length < 1 || code.length > 8) {
    throw new Error('hidden-code: ' + where + ' must be an array of 1-8 symbol indexes');
  }
  for (let i = 0; i < code.length; i++) assertSymbol(code[i], where + '[' + i + ']');
}

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('hidden-code: state must be a GameState object');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('hidden-code: unknown difficulty "' + String(state.difficulty) + '"');
  }
  const spec = DIFFICULTY_SPECS[state.difficulty];
  if (typeof state.seed !== 'number' || !Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) {
    throw new Error('hidden-code: state.seed must be a uint32 integer');
  }
  assertCode(state.solution, 'state.solution');
  if (state.solution.length !== spec.codeLength) {
    throw new Error('hidden-code: state.solution length must equal codeLength of its difficulty');
  }
  for (let i = 0; i < state.solution.length; i++) {
    if (state.solution[i] >= spec.symbolCount) {
      throw new Error('hidden-code: state.solution[' + i + '] out of difficulty symbol range');
    }
  }
  if (!Array.isArray(state.history) || state.history.length > spec.maxRounds) {
    throw new Error('hidden-code: state.history must contain at most maxRounds entries');
  }
  for (let e = 0; e < state.history.length; e++) {
    const entry = state.history[e];
    if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.guess) || entry.guess.length !== spec.codeLength) {
      throw new Error('hidden-code: state.history[' + e + '] must hold a guess of codeLength entries');
    }
    for (let k = 0; k < entry.guess.length; k++) {
      const v = entry.guess[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= spec.symbolCount) {
        throw new Error('hidden-code: state.history[' + e + '].guess[' + k + '] out of difficulty symbol range');
      }
    }
    if (!isValidPeg(entry.exact, spec.codeLength) || !isValidPeg(entry.partial, spec.codeLength) || entry.exact + entry.partial > spec.codeLength) {
      throw new Error('hidden-code: state.history[' + e + '] has invalid peg counts');
    }
  }
  if (!Array.isArray(state.current) || state.current.length !== spec.codeLength) {
    throw new Error('hidden-code: state.current length must equal codeLength of its difficulty');
  }
  for (let i = 0; i < state.current.length; i++) {
    const v = state.current[i];
    if (v === -1) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= spec.symbolCount) {
      throw new Error('hidden-code: state.current[' + i + '] out of difficulty symbol range');
    }
  }
}

/** peg 计数合法域：[0, codeLength] 的整数 */
function isValidPeg(v: unknown, codeLength: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= codeLength;
}

// ---------------------------------------------------------------------------
// 反馈算法（经典两遍计数；重复符号先消耗 exact）
// ---------------------------------------------------------------------------

/**
 * 计算猜测反馈。solution 与 guess 长度必须相等（不等 throw，编程错误）。
 *
 * 语义（经典，被测试钉死）：
 * - exact = 位置 i 上 guess[i] === solution[i] 的数量；
 * - 参与比较后，两侧剩余符号分别按种类计数，partial = Σ min(solution 剩余, guess 剩余)。
 * 例：码 [A,A,B,B] 猜 [A,B,B,A] → exact 2（位 0/2），剩余 solution [A,B] vs guess [B,A]
 * → partial 2；码 [A,A,A,B] 猜 [A,C,C,C] → exact 1，partial 0（A 的额度已被位 0 消耗）。
 */
export function computeFeedback(solution: number[], guess: number[]): Feedback {
  assertCode(solution, 'solution');
  assertCode(guess, 'guess');
  if (solution.length !== guess.length) {
    throw new Error(
      'hidden-code: solution and guess lengths must match (' + solution.length + ' vs ' + guess.length + ')',
    );
  }
  let exact = 0;
  const solutionLeft = new Array<number>(MAX_SYMBOLS).fill(0);
  const guessLeft = new Array<number>(MAX_SYMBOLS).fill(0);
  for (let i = 0; i < solution.length; i++) {
    if (guess[i] === solution[i]) {
      exact++;
    } else {
      solutionLeft[solution[i]]++;
      guessLeft[guess[i]]++;
    }
  }
  let partial = 0;
  for (let s = 0; s < MAX_SYMBOLS; s++) {
    partial += Math.min(solutionLeft[s], guessLeft[s]);
  }
  return { exact, partial };
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/**
 * 生成新局。唯一随机源 createRng(opts.seed ?? (Date.now() >>> 0))（契约 §5.1）。
 * 隐藏码每槽独立均匀取自符号域（允许重复符号，经典玩法）。
 * 难度非法 / seed 非 uint32 整数 → throw。
 * 注意：即使不传 seed，state.seed 也记录实际使用的种子（存档恢复依据，见文件头）。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): NewGameResult {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('hidden-code: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('hidden-code: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number;
  if (opts.seed === undefined) {
    seed = Date.now() >>> 0;
  } else {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('hidden-code: seed must be a uint32 integer');
    }
    seed = s;
  }
  const spec = DIFFICULTY_SPECS[opts.difficulty];
  const rng: Rng = createRng(seed);
  const solution: number[] = [];
  for (let i = 0; i < spec.codeLength; i++) {
    solution.push(rng.int(spec.symbolCount));
  }
  const current: number[] = [];
  for (let i = 0; i < spec.codeLength; i++) current.push(-1);
  const state: GameState = {
    difficulty: opts.difficulty,
    seed,
    solution,
    history: [],
    current,
  };
  return { solution, state };
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

/** 终局判定：破译（最后一击 exact 全对）或轮次耗尽 */
export function isWon(state: GameState): boolean {
  assertStateShape(state);
  const h = state.history;
  if (h.length === 0) return false;
  return h[h.length - 1].exact === DIFFICULTY_SPECS[state.difficulty].codeLength;
}

export function isLost(state: GameState): boolean {
  assertStateShape(state);
  if (isWon(state)) return false;
  return state.history.length >= DIFFICULTY_SPECS[state.difficulty].maxRounds;
}

export function isOver(state: GameState): boolean {
  return isWon(state) || isLost(state);
}

/**
 * 当前槽位填入符号。终局为 no-op；同符号重填亦 no-op（原引用）。
 * slot 越界 / sym 越界属编程错误：throw。
 */
export function fillSymbol(state: GameState, slot: number, sym: number): GameState {
  assertStateShape(state);
  const spec = DIFFICULTY_SPECS[state.difficulty];
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= spec.codeLength) {
    throw new Error('hidden-code: slot out of range: ' + String(slot));
  }
  assertSymbol(sym, 'fillSymbol');
  if (sym >= spec.symbolCount) {
    throw new Error('hidden-code: symbol ' + String(sym) + ' not available in difficulty "' + state.difficulty + '"');
  }
  if (isOver(state) || state.current[slot] === sym) return state;
  const current = state.current.slice();
  current[slot] = sym;
  return { difficulty: state.difficulty, seed: state.seed, solution: state.solution, history: state.history, current };
}

/** 清空单个槽位。终局/已空槽 no-op（原引用）；slot 越界 throw。 */
export function clearSlot(state: GameState, slot: number): GameState {
  assertStateShape(state);
  const spec = DIFFICULTY_SPECS[state.difficulty];
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= spec.codeLength) {
    throw new Error('hidden-code: slot out of range: ' + String(slot));
  }
  if (isOver(state) || state.current[slot] === -1) return state;
  const current = state.current.slice();
  current[slot] = -1;
  return { difficulty: state.difficulty, seed: state.seed, solution: state.solution, history: state.history, current };
}

/**
 * 提交当前行：填满才生效（未填满为 no-op，返回原引用）；追加 history 并清空 current。
 * 终局为 no-op。反馈由 computeFeedback 计算；胜负判定见 isWon/isLost。
 */
export function submitGuess(state: GameState): GameState {
  assertStateShape(state);
  if (isOver(state)) return state;
  for (let i = 0; i < state.current.length; i++) {
    if (state.current[i] === -1) return state; // 未填满：no-op（render 层按钮同步禁用）
  }
  const guess = state.current.slice();
  const fb = computeFeedback(state.solution, guess);
  const history = state.history.slice();
  history.push({ guess, exact: fb.exact, partial: fb.partial });
  const current: number[] = [];
  for (let i = 0; i < state.current.length; i++) current.push(-1);
  return { difficulty: state.difficulty, seed: state.seed, solution: state.solution, history, current };
}

// ---------------------------------------------------------------------------
// 存档序列化（决策⑤变体：不含 solution，恢复经 seed 重建，见文件头）
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（难度+种子+历史+当前行；不含 solution）。
 *
 * 格式（`;` 分 5 段）：
 *   `hc1;<difficulty>;<seed>;<history|->;<current>`
 *
 * - history：`,` 分隔的条目；条目 = codeLength 个符号字符（'0'-'5'）；空历史为 `-`。
 * - current：codeLength 个字符，'.'=空槽，否则符号字符。
 * - 各条目的 exact/partial 不落盘：deserialize 重建 solution 后重算，天然防伪造反馈。
 *
 * 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀
 * （与 sudoku/logic 同一决策）。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  const spec = DIFFICULTY_SPECS[state.difficulty];
  const parts: string[] = [];
  for (let i = 0; i < state.history.length; i++) {
    const entry = state.history[i];
    if (entry.guess.length !== spec.codeLength) {
      throw new Error('hidden-code: serialize got history entry with wrong length at ' + i);
    }
    let s = '';
    for (let k = 0; k < entry.guess.length; k++) {
      const v = entry.guess[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= spec.symbolCount) {
        throw new Error('hidden-code: serialize got invalid symbol in history at ' + i + ':' + k);
      }
      s += String(v);
    }
    parts.push(s);
  }
  let currentStr = '';
  for (let i = 0; i < state.current.length; i++) {
    const v = state.current[i];
    if (v === -1) {
      currentStr += '.';
    } else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < spec.symbolCount) {
      currentStr += String(v);
    } else {
      throw new Error('hidden-code: serialize got invalid current slot at ' + i);
    }
  }
  return 'hc1;' + state.difficulty + ';' + (state.seed >>> 0) + ';' + (parts.length > 0 ? parts.join(',') : '-') + ';' + currentStr;
}

/**
 * 解析 serialize 产物；任何非法/损坏/伪造输入 → null（绝不抛）。
 * 严格校验：段数、难度词表、seed 范围、历史条目形状与符号域、条目数上限、
 * 胜局后不得再有条目、当前行形状；solution 经 newGame 重建并重算全部反馈。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 5 || segs[0] !== 'hc1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;
    const spec = DIFFICULTY_SPECS[difficulty];

    if (!/^\d{1,10}$/.test(segs[2])) return null;
    const seed = Number(segs[2]);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;

    const history: GuessEntry[] = [];
    if (segs[3] !== '-') {
      const entries = segs[3].split(',');
      if (entries.length > spec.maxRounds) return null;
      for (let e = 0; e < entries.length; e++) {
        const s = entries[e];
        if (s.length !== spec.codeLength) return null;
        const guess: number[] = [];
        for (let k = 0; k < s.length; k++) {
          const code = s.charCodeAt(k);
          if (code < 48 || code >= 48 + spec.symbolCount) return null;
          guess.push(code - 48);
        }
        history.push({ guess, exact: 0, partial: 0 }); // 反馈占位，下一步重算
      }
    }

    if (segs[4].length !== spec.codeLength) return null;
    const current: number[] = [];
    for (let k = 0; k < segs[4].length; k++) {
      const ch = segs[4].charAt(k);
      if (ch === '.') {
        current.push(-1);
      } else {
        const code = segs[4].charCodeAt(k);
        if (code < 48 || code >= 48 + spec.symbolCount) return null;
        current.push(code - 48);
      }
    }

    // 重建 solution（同 seed 同码）并重算反馈（存档不落盘反馈，见 serialize 注释）
    const regen = newGame({ difficulty, seed });
    let wonAt = -1;
    for (let e = 0; e < history.length; e++) {
      const fb = computeFeedback(regen.solution, history[e].guess);
      history[e].exact = fb.exact;
      history[e].partial = fb.partial;
      if (fb.exact === spec.codeLength) {
        if (wonAt !== -1) return null; // 胜局后不得再有猜测（不可伪造）
        wonAt = e;
      }
    }
    if (wonAt !== -1 && wonAt !== history.length - 1) return null;
    if (wonAt !== -1) {
      for (let k = 0; k < current.length; k++) {
        if (current[k] !== -1) return null; // 已胜的局不该有未提交输入
      }
    }

    return { difficulty, seed, solution: regen.solution, history, current };
  } catch (e) {
    return null;
  }
}
