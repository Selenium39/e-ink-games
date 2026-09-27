/**
 * memory/logic — Memory Pairs（记忆翻牌配对）纯函数逻辑层（契约 §5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（注入随机源，§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（非法难度、越界 idx、非法 seed）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自注入的 createRng（禁裸 Math.random，§10.6）：符号选取与牌位摆放
 *   均由 rng 洗牌驱动 → 同 seed 必产出同布局。meta.seeded=false（不纳入每日挑战），
 *   seed 参数服务于测试确定性与可复现组局。
 * - 800ms 翻回等待属时序副作用，归 render 层 setTimeout（契约 §6）；logic 只提供
 *   `flipBack` 状态转移，保持纯函数。翻牌期间的输入锁定同样以状态表达：
 *   不匹配对挂着（CARD_UP ×2）时 `flipCard` 一律 no-op，防连点第三张。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型与常量
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 牌面三态 */
export const CARD_DOWN = 0; // 背面（细边框）
export const CARD_UP = 1; // 翻开（黑底白字；单张=待翻第二张，两张=不匹配对挂着等翻回）
export const CARD_MATCHED = 2; // 已配对（粗边框，保持符号可见）

/** 符号库大小（12 种风格统一的 1-bit 几何符号；render 层按 id 映射字形） */
export const SYMBOL_COUNT = 12;

export interface Layout {
  cols: number;
  rows: number;
  pairs: number;
}

/** 难度 → 盘面（easy 4×3=6 对 / medium 4×4=8 对 / hard 6×4=12 对） */
export const LAYOUT: Record<Difficulty, Layout> = {
  easy: { cols: 4, rows: 3, pairs: 6 },
  medium: { cols: 4, rows: 4, pairs: 8 },
  hard: { cols: 6, rows: 4, pairs: 12 },
};

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface GameState {
  difficulty: Difficulty;
  /** null = 随机组局（seed 仅用于测试/可复现，不暴露成每日挑战语义） */
  seed: number | null;
  /** 每张牌的符号 id（0..SYMBOL_COUNT-1），两两成对、洗牌摆放 */
  symbols: number[];
  /** 每张牌的状态：CARD_DOWN / CARD_UP / CARD_MATCHED */
  cards: number[];
  /** 已用步数（每翻开两张算一步；匹配与不匹配都计） */
  moves: number;
  /** 已配对**对**数（cards 中 CARD_MATCHED 张数恒为其 2 倍） */
  matched: number;
}

// ---------------------------------------------------------------------------
// newGame：符号选取 + 成对洗牌摆放（全 rng 驱动 → 同 seed 同布局）
// ---------------------------------------------------------------------------

/**
 * 生成新局：从 12 种符号洗牌取前 pairs 种，每符号两张成一副牌，再整体洗牌入格。
 * 唯一随机源 createRng(opts.seed ?? (Date.now() >>> 0))（对齐契约 §5.2 惯例）。
 * 难度非法 / seed 非 uint32 整数 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): GameState {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('memory: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('memory: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number | null = null;
  if (opts.seed !== undefined) {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('memory: seed must be a uint32 integer');
    }
    seed = s;
  }
  const rng: Rng = createRng(seed === null ? (Date.now() >>> 0) : seed);
  const layout = LAYOUT[opts.difficulty];
  const total = layout.cols * layout.rows;

  // 符号池洗牌取前 pairs 种（不同局用到的符号子集随 seed 变化）
  const pool: number[] = [];
  for (let i = 0; i < SYMBOL_COUNT; i++) pool.push(i);
  const chosen = rng.shuffle(pool).slice(0, layout.pairs);

  // 每符号两张 → 整副牌洗牌入格（Fisher-Yates，rng.shuffle 返回新数组）
  const deck: number[] = [];
  for (let i = 0; i < chosen.length; i++) {
    deck.push(chosen[i], chosen[i]);
  }
  const symbols = rng.shuffle(deck);

  const cards: number[] = [];
  for (let i = 0; i < total; i++) cards.push(CARD_DOWN);
  return { difficulty: opts.difficulty, seed, symbols, cards, moves: 0, matched: 0 };
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('memory: state must be a GameState object');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('memory: unknown difficulty "' + String(state.difficulty) + '"');
  }
  const total = LAYOUT[state.difficulty].cols * LAYOUT[state.difficulty].rows;
  if (!Array.isArray(state.symbols) || state.symbols.length !== total ||
    !Array.isArray(state.cards) || state.cards.length !== total) {
    throw new Error(
      'memory: state.symbols/cards must each contain ' + total + ' entries for ' + state.difficulty,
    );
  }
  let matchedCount = 0;
  for (let i = 0; i < total; i++) {
    const sym = state.symbols[i];
    if (typeof sym !== 'number' || !Number.isInteger(sym) || sym < 0 || sym >= SYMBOL_COUNT) {
      throw new Error('memory: symbol id out of range at ' + i + ': ' + String(sym));
    }
    const card = state.cards[i];
    if (typeof card !== 'number' || !Number.isInteger(card) || card < CARD_DOWN || card > CARD_MATCHED) {
      throw new Error('memory: card state must be 0/1/2 at ' + i + ': ' + String(card));
    }
    if (card === CARD_MATCHED) matchedCount++;
  }
  if (typeof state.moves !== 'number' || !Number.isInteger(state.moves) || state.moves < 0) {
    throw new Error('memory: moves must be a non-negative integer');
  }
  if (state.matched * 2 !== matchedCount) {
    throw new Error(
      'memory: matched pairs (' + state.matched + ') != CARD_MATCHED card count (' + matchedCount + ') / 2',
    );
  }
}

function assertIndex(state: GameState, idx: number): void {
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= state.cards.length) {
    throw new Error('memory: card index out of range: ' + String(idx));
  }
}

/** 当前翻开（CARD_UP）的牌 idx 升序列表；合法态中 0-2 张。 */
export function upIndices(state: GameState): number[] {
  assertStateShape(state);
  const out: number[] = [];
  for (let i = 0; i < state.cards.length; i++) {
    if (state.cards[i] === CARD_UP) out.push(i);
  }
  return out;
}

/**
 * 翻牌。状态机：
 * - 终局 / 已翻开（CARD_UP）/ 已配对（CARD_MATCHED）→ no-op（原引用）；
 * - 不匹配对挂着（up=2，render 的 800ms 翻回窗口内）→ no-op（锁输入，防连点第三张）；
 * - 翻开第一张 → up；翻开第二张 → 立即判定（匹配双双重置 CARD_MATCHED 并计 1 步；
 *   不匹配保持两张 CARD_UP 挂起并计 1 步，等 render 调 flipBack 翻回）。
 */
export function flipCard(state: GameState, idx: number): GameState {
  assertStateShape(state);
  assertIndex(state, idx);
  if (state.matched * 2 === state.cards.length) return state; // 终局（matched 按对计）
  if (state.cards[idx] !== CARD_DOWN) return state; // 已翻开/已配对 no-op

  // 扫当前挂起的 up 牌（合法态 0-2 张）；≥2 张 = 翻回窗口内，锁输入防连点第三张
  let firstUp = -1;
  let openCount = 0;
  for (let i = 0; i < state.cards.length; i++) {
    if (state.cards[i] === CARD_UP) {
      openCount++;
      firstUp = i;
    }
  }
  if (openCount >= 2) return state;

  const cards = state.cards.slice();
  cards[idx] = CARD_UP;

  if (openCount === 0) {
    // 第一张：不判定不计步
    return { difficulty: state.difficulty, seed: state.seed, symbols: state.symbols, cards, moves: state.moves, matched: state.matched };
  }

  // 第二张：立即判定；计步无论匹配与否
  const moves = state.moves + 1;
  if (state.symbols[firstUp] === state.symbols[idx]) {
    cards[firstUp] = CARD_MATCHED;
    cards[idx] = CARD_MATCHED;
    return { difficulty: state.difficulty, seed: state.seed, symbols: state.symbols, cards, moves, matched: state.matched + 1 };
  }
  return { difficulty: state.difficulty, seed: state.seed, symbols: state.symbols, cards, moves, matched: state.matched };
}

/**
 * 把挂起的不匹配对翻回背面（render 层 800ms setTimeout 后调用）。
 * 无 CARD_UP 牌 → no-op（原引用）；CARD_MATCHED 不受影响。
 */
export function flipBack(state: GameState): GameState {
  assertStateShape(state);
  const cards = state.cards.slice();
  let changed = false;
  for (let i = 0; i < cards.length; i++) {
    if (cards[i] === CARD_UP) {
      cards[i] = CARD_DOWN;
      changed = true;
    }
  }
  if (!changed) return state;
  return { difficulty: state.difficulty, seed: state.seed, symbols: state.symbols, cards, moves: state.moves, matched: state.matched };
}

/** 全部配对完成（matched 按对计：matched×2 覆盖整副牌）。 */
export function isSolved(state: GameState): boolean {
  assertStateShape(state);
  return state.matched * 2 === state.cards.length;
}

// ---------------------------------------------------------------------------
// 存档序列化
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（布局+进度；matched 由 cards 重算不落盘，契约决策⑤精神：能推导的不存）。
 *
 * 格式（`;` 分 5 段）：
 *   `memory1;<difficulty>;<seed|->;<symbols36>;<cards>;<moves>`
 *
 * - symbols36：每张牌符号 id 的 base36 单字符（0..b；符号 id ≤ 11 恰好单字符）。
 * - cards：每张牌状态字符 `0`/`1`/`2`（长度=该难度牌数）。
 * - moves：十进制。
 *
 * 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀，
 * cookie 层 3.5KB 上限更安全（沿用 sudoku 打样的偏差决策，报告已列）。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  let symStr = '';
  let cardStr = '';
  for (let i = 0; i < state.cards.length; i++) {
    symStr += state.symbols[i].toString(36);
    cardStr += String(state.cards[i]);
  }
  const seedStr = state.seed === null ? '-' : String(state.seed >>> 0);
  return 'memory1;' + state.difficulty + ';' + seedStr + ';' + symStr + ';' + cardStr + ';' + state.moves;
}

/** 0..35 的 base36 字符 → 数值；非法字符 -1（手写避开 parseInt 宽容行为） */
function b36Val(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 122) return code - 87; // a-z
  return -1;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、难度词表、seed 范围、长度与难度一致、符号值域与成对性
 * （每种符号恰 2 张）、牌状态值域、挂起对不变量（up ≤2、两张必不同符号、
 * 已配对牌的另一半必同为 matched）、moves ≥ matched。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 6 || segs[0] !== 'memory1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;
    const total = LAYOUT[difficulty].cols * LAYOUT[difficulty].rows;
    const pairs = LAYOUT[difficulty].pairs;

    let seed: number | null;
    if (segs[2] === '-') {
      seed = null;
    } else {
      if (!/^\d{1,10}$/.test(segs[2])) return null;
      seed = Number(segs[2]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    }

    const symStr = segs[3];
    if (symStr.length !== total) return null;
    const symbols: number[] = [];
    const symCount: number[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) symCount.push(0);
    for (let i = 0; i < total; i++) {
      const v = b36Val(symStr.charCodeAt(i));
      if (v < 0 || v >= SYMBOL_COUNT) return null;
      symbols.push(v);
      symCount[v]++;
    }
    // 成对性：每种出现的符号恰 2 张，且出现的符号种数 = pairs
    let kinds = 0;
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      if (symCount[s] === 0) continue;
      if (symCount[s] !== 2) return null;
      kinds++;
    }
    if (kinds !== pairs) return null;

    const cardStr = segs[4];
    if (cardStr.length !== total) return null;
    const cards: number[] = [];
    let upTotal = 0;
    const upList: number[] = [];
    let matchedTotal = 0;
    // 每符号的 matched 计数（配对完整性：0 或 2，不许半对）
    const matchedBySym: number[] = [];
    for (let s = 0; s < SYMBOL_COUNT; s++) matchedBySym.push(0);
    for (let i = 0; i < total; i++) {
      const code = cardStr.charCodeAt(i);
      if (code < 48 || code > 50) return null; // '0'/'1'/'2'
      const v = code - 48;
      cards.push(v);
      if (v === CARD_UP) {
        upTotal++;
        upList.push(i);
      } else if (v === CARD_MATCHED) {
        matchedTotal++;
        matchedBySym[symbols[i]]++;
      }
    }
    if (upTotal > 2) return null;
    if (upTotal === 2 && symbols[upList[0]] === symbols[upList[1]]) return null; // 同符号必已判定
    for (let s = 0; s < SYMBOL_COUNT; s++) {
      if (matchedBySym[s] === 1) return null; // 半对非法
    }

    if (!/^\d{1,7}$/.test(segs[5])) return null;
    const moves = Number(segs[5]);
    const matched = matchedTotal / 2; // 张数 → 对数（半对已排除，恒整）
    if (moves < matched) return null; // 每配对至少一步
    if (matched > pairs) return null;

    return { difficulty, seed, symbols, cards, moves, matched };
  } catch (e) {
    return null;
  }
}
