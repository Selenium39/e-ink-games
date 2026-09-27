/**
 * tic-tac-toe/logic — 井字棋纯函数逻辑层（契约《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（越界 idx、非法 mode/difficulty、结构损坏的 state）属编程错误：throw 让开发期
 *   暴露；唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 玩家执 X 先手（固定）；vs Computer 模式 AI 执 O。easy = 带基础防守的随机走子
 *   （先找自己的即时赢棋，再堵玩家的即时赢棋，其余走 `_engine/rng` 随机）；
 *   hard = minimax（alpha-beta 剪枝）完美博弈，9 格状态空间全穷举，同步瞬时完成。
 * - 随机全部来自 `_engine/rng`（§10.6 禁裸 Math.random）；`bestMove` 的 rand 参数
 *   缺省时内部以 Date.now() 做种子（与 sudoku newGame 先例同语义）。
 * - 语法 ES2015 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 1 = X（先手），2 = O */
export type Player = 1 | 2;

/** 长度 9，行优先：idx = r*3 + c；0=空 1=X 2=O */
export type Board = number[];

/** 'ai' = vs Computer（AI 执 O），'2p' = 双人同屏 pass-and-play */
export type Mode = 'ai' | '2p';

export type Difficulty = 'easy' | 'hard';

export type GameStatus = 'playing' | 'won' | 'draw';

export interface GameState {
  mode: Mode;
  /** 仅 'ai' 模式有意义；'2p' 模式恒保留当前值（切换模式时由 render 重置） */
  difficulty: Difficulty;
  board: Board;
  /** 即将落子的一方；终局后保留「若无终局则下一手」的值（手数一致性见 deserialize） */
  turn: Player;
  status: GameStatus;
  /** status='won' 时为赢方（1|2）；其余恒 0 */
  winner: 0 | Player;
  /** 获胜连线三格 idx；无连线为 null */
  line: number[] | null;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const CELLS = 9;

const MODES: Mode[] = ['ai', '2p'];
const DIFFICULTIES: Difficulty[] = ['easy', 'hard'];

/** 8 条获胜连线：3 行 + 3 列 + 2 对角 */
export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// ---------------------------------------------------------------------------
// 内部校验（编程错误 throw；deserialize 才负责宽容）
// ---------------------------------------------------------------------------

function assertBoard(board: Board): void {
  if (!Array.isArray(board) || board.length !== CELLS) {
    throw new Error('tic-tac-toe: board must be an array of 9 cells');
  }
  for (let i = 0; i < CELLS; i++) {
    const v = board[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 2) {
      throw new Error('tic-tac-toe: board cell must be 0/1/2, got ' + v + ' at ' + i);
    }
  }
}

function assertState(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('tic-tac-toe: state must be an object');
  }
  if (MODES.indexOf(state.mode) === -1) {
    throw new Error('tic-tac-toe: unknown mode "' + String(state.mode) + '"');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('tic-tac-toe: unknown difficulty "' + String(state.difficulty) + '"');
  }
  assertBoard(state.board);
  if (state.turn !== 1 && state.turn !== 2) {
    throw new Error('tic-tac-toe: turn must be 1 or 2, got ' + String(state.turn));
  }
  if (
    (state.status === 'won' && (state.winner !== 1 && state.winner !== 2)) ||
    (state.status !== 'won' && state.winner !== 0)
  ) {
    throw new Error('tic-tac-toe: winner ' + state.winner + ' inconsistent with status ' + state.status);
  }
}

// ---------------------------------------------------------------------------
// 盘面判定
// ---------------------------------------------------------------------------

/** 另一方 */
export function other(p: Player): Player {
  return p === 1 ? 2 : 1;
}

/** 三连线判定：有连线返回 { winner, line }，否则 null（LINES 序第一个命中） */
export function findLine(board: Board): { winner: Player; line: number[] } | null {
  assertBoard(board);
  for (let i = 0; i < LINES.length; i++) {
    const ln = LINES[i];
    const a = board[ln[0]];
    if (a !== 0 && a === board[ln[1]] && a === board[ln[2]]) {
      return { winner: a as Player, line: ln };
    }
  }
  return null;
}

/** 9 格全满（调用前应已确认无连线，否则是「满且无连线 = 平局」语义） */
export function isFull(board: Board): boolean {
  assertBoard(board);
  for (let i = 0; i < CELLS; i++) {
    if (board[i] === 0) return false;
  }
  return true;
}

/** 空格 idx 升序列表 */
export function legalMoves(board: Board): number[] {
  assertBoard(board);
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (board[i] === 0) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 对局推进
// ---------------------------------------------------------------------------

export function newGame(opts: { mode: Mode; difficulty?: Difficulty }): GameState {
  if (!opts || MODES.indexOf(opts.mode) === -1) {
    throw new Error('tic-tac-toe: newGame mode must be "ai" or "2p"');
  }
  const difficulty =
    opts.difficulty === undefined ? 'easy' : opts.difficulty;
  if (DIFFICULTIES.indexOf(difficulty) === -1) {
    throw new Error('tic-tac-toe: newGame unknown difficulty "' + String(opts.difficulty) + '"');
  }
  return {
    mode: opts.mode,
    difficulty,
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    turn: 1,
    status: 'playing',
    winner: 0,
    line: null,
  };
}

/**
 * 在 idx 格落当前回合方的子。
 * - 占位格 / 已终局：no-op（返回**原引用**，render 依此不入 undo 栈）。
 * - 越界或非整数 idx：throw（编程错误，§5.1）。
 * 落子后按新盘面判定胜负：三连线 → won（含连线）；满盘无连线 → draw。
 */
export function applyMove(state: GameState, idx: number): GameState {
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= CELLS) {
    throw new RangeError('tic-tac-toe: cell index out of range: ' + idx);
  }
  assertState(state);
  if (state.status !== 'playing') return state;
  if (state.board[idx] !== 0) return state;

  const board = state.board.slice();
  board[idx] = state.turn;

  const win = findLine(board);
  if (win !== null) {
    return {
      mode: state.mode,
      difficulty: state.difficulty,
      board,
      turn: other(state.turn),
      status: 'won',
      winner: win.winner,
      line: win.line,
    };
  }
  if (isFull(board)) {
    return {
      mode: state.mode,
      difficulty: state.difficulty,
      board,
      turn: other(state.turn),
      status: 'draw',
      winner: 0,
      line: null,
    };
  }
  return {
    mode: state.mode,
    difficulty: state.difficulty,
    board,
    turn: other(state.turn),
    status: 'playing',
    winner: 0,
    line: null,
  };
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** 立即获胜位：player 在任一空格落子即成线 → 该格 idx；无则 -1（LINES 序第一个） */
function immediateWin(board: Board, player: Player): number {
  const moves = legalMoves(board);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    board[m] = player;
    const win = findLine(board);
    board[m] = 0;
    if (win !== null && win.winner === player) return m;
  }
  return -1;
}

/**
 * easy：带基础防守的随机走子——
 * 1) 自己有即时赢棋 → 走之；2) 玩家有即时赢棋 → 堵之；3) 其余空格随机。
 * 随机源只走 _engine/rng（§10.6）：外部注入 rand（可测），缺省内部 Date.now() 种子。
 */
function easyMove(board: Board, player: Player, rand: () => number): number {
  const win = immediateWin(board, player);
  if (win !== -1) return win;
  const block = immediateWin(board, other(player));
  if (block !== -1) return block;
  const moves = legalMoves(board);
  return moves[Math.floor(rand() * moves.length) % moves.length];
}

/**
 * minimax + alpha-beta（me 视角分数）：赢 10-depth（快赢高分）、输 depth-10（慢输
 * 低分 = 必败时拖延最久）、平 0。9 格全穷举 ≤ 5478 状态，同步瞬时完成。
 */
function minimax(
  board: Board,
  me: Player,
  turn: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const win = findLine(board);
  if (win !== null) return win.winner === me ? 10 - depth : depth - 10;
  if (isFull(board)) return 0;

  let best: number;
  if (turn === me) {
    best = -100;
    for (let i = 0; i < CELLS; i++) {
      if (board[i] !== 0) continue;
      board[i] = turn;
      const v = minimax(board, me, other(turn), depth + 1, alpha, beta);
      board[i] = 0;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
  } else {
    best = 100;
    for (let i = 0; i < CELLS; i++) {
      if (board[i] !== 0) continue;
      board[i] = turn;
      const v = minimax(board, me, other(turn), depth + 1, alpha, beta);
      board[i] = 0;
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }
  return best;
}

/** hard：完美博弈走子（确定性——同局面同走；首步空盘对称位等价，选首个最优点） */
function hardMove(board: Board, player: Player): number {
  let best = -100;
  let choice = -1;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0) continue;
    board[i] = player;
    const v = minimax(board, player, other(player), 1, -100, 100);
    board[i] = 0;
    if (v > best) {
      best = v;
      choice = i;
    }
  }
  return choice;
}

/**
 * AI 走子（纯函数）：以 state.board + state.turn 为准（走子方 = state.turn），
 * difficulty 参数显式生效（与 state.difficulty 不一致时以参数为准）。
 * 返回落子 idx；无棋可走（终局/满盘）返回 -1，调用方应先确认 status==='playing'。
 * rand 仅 easy 模式消费（hard 为确定性 minimax，不依赖随机）。
 */
export function bestMove(
  state: GameState,
  difficulty: Difficulty,
  rand?: () => number,
): number {
  assertState(state);
  if (DIFFICULTIES.indexOf(difficulty) === -1) {
    throw new Error('tic-tac-toe: bestMove unknown difficulty "' + String(difficulty) + '"');
  }
  if (state.status !== 'playing') return -1;
  const moves = legalMoves(state.board);
  if (moves.length === 0) return -1;

  if (difficulty === 'hard') {
    return hardMove(state.board.slice(), state.turn);
  }
  let rngNext: () => number = rand as () => number;
  let rng: Rng | null = null;
  if (typeof rngNext !== 'function') {
    rng = createRng(Date.now() >>> 0);
    rngNext = rng.next;
  }
  return easyMove(state.board.slice(), state.turn, rngNext);
}

// ---------------------------------------------------------------------------
// 存档序列化（紧凑分号串；二次 JSON 化无引号膨胀，cookie 层 3.5KB 上限友好）
// ---------------------------------------------------------------------------

/**
 * 格式：`ttt1;{mode};{difficulty};{board};{turn}`
 * - board：9 个字符 '0'/'1'/'2'（行优先）。
 * - status/winner/line 不存——全部可由 board 重算（deserialize 时重建），
 *   turn 保留「即将落子方」语义并做手数一致性校验。
 */
export function serialize(state: GameState): string {
  assertState(state);
  let boardStr = '';
  for (let i = 0; i < CELLS; i++) boardStr += String(state.board[i]);
  return 'ttt1;' + state.mode + ';' + state.difficulty + ';' + boardStr + ';' + state.turn;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、mode/difficulty 词表、board 字符与长度、turn 值域、
 * 手数一致性（X 先手：turn=1 ⇔ X 数=O 数；turn=2 ⇔ X 数=O 数+1）。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 5 || segs[0] !== 'ttt1') return null;

    const mode = segs[1] as Mode;
    if (MODES.indexOf(mode) === -1) return null;

    const difficulty = segs[2] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;

    const boardStr = segs[3];
    if (boardStr.length !== CELLS) return null;
    const board = new Array<number>(CELLS);
    let countX = 0;
    let countO = 0;
    for (let i = 0; i < CELLS; i++) {
      const code = boardStr.charCodeAt(i);
      if (code < 48 || code > 50) return null; // '0'-'2'
      board[i] = code - 48;
      if (board[i] === 1) countX++;
      else if (board[i] === 2) countO++;
    }

    if (segs[4] !== '1' && segs[4] !== '2') return null;
    const turn = (segs[4] === '1' ? 1 : 2) as Player;
    // 手数一致性（X 先手）：轮 X ⇔ 数量相等；轮 O ⇔ X 多一手
    if (turn === 1 ? countX !== countO : countX !== countO + 1) return null;

    // status/winner/line 由盘面重建（serialize 不存，见上）
    const win = findLine(board);
    if (win !== null) {
      return { mode, difficulty, board, turn, status: 'won', winner: win.winner, line: win.line };
    }
    if (isFull(board)) {
      return { mode, difficulty, board, turn, status: 'draw', winner: 0, line: null };
    }
    return { mode, difficulty, board, turn, status: 'playing', winner: 0, line: null };
  } catch (e) {
    return null;
  }
}
