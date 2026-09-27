/**
 * tic-tac-toe/logic 单测（任务书验收标准 3 + 契约 §9.4）。
 * 纯 Node 环境（vitest），无 DOM。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  applyMove,
  findLine,
  isFull,
  legalMoves,
  bestMove,
  other,
  serialize,
  deserialize,
  LINES,
} from './logic';
import type { Board, Difficulty, GameState, Mode, Player } from './logic';
import { createState } from '../_engine/state';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 'X'/'x'→1，'O'/'o'→2，'.'/' '→0；9 字符行优先拼盘 */
function boardOf(s: string): Board {
  if (s.length !== 9) throw new Error('boardOf needs 9 chars, got ' + s);
  const out: Board = [];
  for (let i = 0; i < 9; i++) {
    const ch = s.charAt(i);
    out.push(ch === 'X' || ch === 'x' ? 1 : ch === 'O' || ch === 'o' ? 2 : 0);
  }
  return out;
}

/** 手工构造合法对局中 GameState（调用方保证局面可达且字段自洽） */
function mkState(
  board: Board,
  turn: Player,
  mode: Mode = 'ai',
  difficulty: Difficulty = 'hard',
): GameState {
  return {
    mode,
    difficulty,
    board: board.slice(),
    turn,
    status: 'playing',
    winner: 0,
    line: null,
  };
}

/** 从初始局依次落子（交替走子方由 state.turn 推进），返回终态 */
function play(start: GameState, idxs: number[]): GameState {
  let s = start;
  for (let i = 0; i < idxs.length; i++) s = applyMove(s, idxs[i]);
  return s;
}

/**
 * hard AI 不可战胜性穷举验证器（AI 执 O = 2）：
 * 玩家 X（1）在 turnToMove=1 的每个分支任意走，AI 一律用 bestMove(state,'hard') 回应；
 * 任何分支走到终局 X 都不得获胜（AI 赢或平局均可）。
 */
function aiNeverLoses(board: Board, turnToMove: Player): boolean {
  const w = findLine(board);
  if (w !== null) return w.winner !== 1;
  if (isFull(board)) return true;
  if (turnToMove === 2) {
    const m = bestMove(mkState(board, 2), 'hard');
    if (m < 0) return true;
    board[m] = 2;
    const ok = aiNeverLoses(board, 1);
    board[m] = 0;
    return ok;
  }
  for (let i = 0; i < 9; i++) {
    if (board[i] !== 0) continue;
    board[i] = 1;
    const ok = aiNeverLoses(board, 2);
    board[i] = 0;
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// newGame / 基础类型
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('初始局：空盘、X 先手、playing、无连线', () => {
    const s = newGame({ mode: 'ai', difficulty: 'hard' });
    expect(s.mode).toBe('ai');
    expect(s.difficulty).toBe('hard');
    expect(s.board).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.turn).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBe(0);
    expect(s.line).toBeNull();
    expect(findLine(s.board)).toBeNull();
    expect(isFull(s.board)).toBe(false);
  });

  it('difficulty 缺省为 easy；2p 模式合法', () => {
    expect(newGame({ mode: 'ai' }).difficulty).toBe('easy');
    expect(newGame({ mode: '2p' }).mode).toBe('2p');
  });

  it('非法 mode / difficulty throw（编程错误，§5.1）', () => {
    expect(() => newGame({ mode: 'pvp' as Mode })).toThrow();
    expect(() => newGame({ mode: 'ai', difficulty: 'medium' as Difficulty })).toThrow();
  });

  it('other：1↔2', () => {
    expect(other(1)).toBe(2);
    expect(other(2)).toBe(1);
  });

  it('legalMoves：空格升序', () => {
    expect(legalMoves(boardOf('X.O.X...X'))).toEqual([1, 3, 5, 6, 7]);
  });
});

// ---------------------------------------------------------------------------
// 胜负平判定（findLine：8 条连线 × 双方 + 无线/满盘）
// ---------------------------------------------------------------------------

describe('findLine 三连线判定', () => {
  const rowCases: Array<[string, Player, number[]]> = [
    // 3 行
    ['XXX.O.O..', 1, [0, 1, 2]],
    ['O..XXX.O.', 1, [3, 4, 5]],
    ['O.O...XXX', 1, [6, 7, 8]],
    // 3 列
    ['O..O..OXX', 2, [0, 3, 6]],
    ['.X..X..XO', 1, [1, 4, 7]],
    ['X.O.XO..O', 2, [2, 5, 8]],
    // 2 对角
    ['X..OXO..X', 1, [0, 4, 8]],
    ['..OXOXO..', 2, [2, 4, 6]],
  ];

  it.each(rowCases)('盘面 %s → %s 方连线 %j', (b, winner, line) => {
    const r = findLine(boardOf(b));
    expect(r).not.toBeNull();
    expect(r!.winner).toBe(winner);
    expect(r!.line).toEqual(line);
  });

  it('LINES 恰 8 条、每条 3 格', () => {
    expect(LINES.length).toBe(8);
    for (const ln of LINES) expect(ln.length).toBe(3);
  });

  it('进行中盘面无连线 → null', () => {
    expect(findLine(boardOf('X.O.X.O..'))).toBeNull();
    expect(findLine(boardOf('.........'))).toBeNull();
  });

  it('满盘平局：isFull=true 且无连线', () => {
    // X={1,4,5,6,8} O={0,2,3,7}（play 序列 [4,0,8,2,6,3,1,7,5] 的终态盘面）
    const draw = boardOf('OXOOXXXOX');
    expect(isFull(draw)).toBe(true);
    expect(findLine(draw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

describe('applyMove', () => {
  it('正常落子：写入当前方、切换回合、不可变（不改入参）', () => {
    const s0 = mkState(boardOf('.........'), 1);
    const s1 = applyMove(s0, 4);
    expect(s1.board[4]).toBe(1);
    expect(s1.turn).toBe(2);
    expect(s1.status).toBe('playing');
    expect(s0.board[4]).toBe(0); // 入参未被改写
    expect(s1).not.toBe(s0);
  });

  it('占位格 no-op：返回原引用', () => {
    const s = mkState(boardOf('X.O......'), 2);
    expect(applyMove(s, 0)).toBe(s);
    expect(applyMove(s, 2)).toBe(s);
  });

  it('终局 no-op：won / draw 均返回原引用', () => {
    const won = play(newGame({ mode: '2p' }), [0, 3, 1, 4, 2]); // X 行赢
    expect(won.status).toBe('won');
    expect(applyMove(won, 5)).toBe(won);
    const draw = play(newGame({ mode: '2p' }), [4, 0, 8, 2, 6, 3, 1, 7, 5]);
    expect(draw.status).toBe('draw');
    expect(applyMove(draw, 5)).toBe(draw);
  });

  it('落子成线 → won + winner + line', () => {
    // X={1,4} O={0,8}，X 落 7 成列 1,4,7
    const s = play(newGame({ mode: 'ai' }), [4, 0, 1, 8]);
    const end = applyMove(s, 7);
    expect(end.status).toBe('won');
    expect(end.winner).toBe(1);
    expect(end.line).toEqual([1, 4, 7]);
  });

  it('满盘无连线 → draw', () => {
    const end = play(newGame({ mode: '2p' }), [4, 0, 8, 2, 6, 3, 1, 7, 5]);
    expect(end.status).toBe('draw');
    expect(end.winner).toBe(0);
    expect(end.line).toBeNull();
    expect(isFull(end.board)).toBe(true);
  });

  it('O 方成线 → winner=2', () => {
    // X 失误不堵：O={4,6} 落 2 成 2,4,6
    const s = play(newGame({ mode: 'ai' }), [0, 4, 8, 6, 5]);
    const end = applyMove(s, 2);
    expect(end.status).toBe('won');
    expect(end.winner).toBe(2);
    expect(end.line).toEqual([2, 4, 6]);
  });

  it('越界 / 非整数 idx throw', () => {
    const s = newGame({ mode: '2p' });
    expect(() => applyMove(s, -1)).toThrow(RangeError);
    expect(() => applyMove(s, 9)).toThrow(RangeError);
    expect(() => applyMove(s, 1.5)).toThrow(RangeError);
    expect(() => applyMove(s, NaN)).toThrow(RangeError);
  });

  it('结构损坏的 state throw（编程错误）', () => {
    const bad = { ...newGame({ mode: '2p' }), board: [0, 0, 0] };
    expect(() => applyMove(bad as GameState, 0)).toThrow();
    const badMode = { ...newGame({ mode: '2p' }), mode: 'pvp' };
    expect(() => applyMove(badMode as GameState, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// undo（配合 _engine/state：vs AI 撤玩家+AI 各一步；双人撤一步）
// ---------------------------------------------------------------------------

describe('undo 行为', () => {
  it('vs AI：一次玩家步 + 一次 AI 回应构成两步，undo×2 依次撤 AI、撤玩家', () => {
    const machine = createState(newGame({ mode: 'ai', difficulty: 'hard' }));
    const s0 = machine.get();

    machine.commit(applyMove(machine.get(), 4)); // 玩家 X 中心
    const afterPlayer = machine.get();
    expect(afterPlayer.turn).toBe(2);

    const aiIdx = bestMove(machine.get(), 'hard');
    expect(aiIdx).toBeGreaterThanOrEqual(0);
    machine.commit(applyMove(machine.get(), aiIdx)); // AI O 回应
    expect(machine.get().turn).toBe(1);
    expect(machine.get().board[aiIdx]).toBe(2);

    // 撤第一步 = 撤 AI（render 语义：撤到玩家回合）
    expect(machine.undo()).toBe(afterPlayer);
    expect(machine.get().board[aiIdx]).toBe(0);
    expect(machine.get().turn).toBe(2);
    // 撤第二步 = 撤玩家
    expect(machine.undo()).toBe(s0);
    expect(machine.get().board[4]).toBe(0);
    expect(machine.get().turn).toBe(1);
  });

  it('vs AI 终局后撤销：AI 赢局撤两步回到玩家落子前', () => {
    // easy AI 固定 rand=0（赢>堵>首个空格）的确定性回应序列：
    // X@0 → O 回 1（无赢无堵取首空格）；X@8 → O 堵 4（X 对角威胁）；
    // X@2 → O 走 7 成线 [1,4,7]（O 自己的即时赢优先于一切）
    const machine = createState(newGame({ mode: 'ai', difficulty: 'easy' }));
    const rand0 = () => 0;
    machine.commit(applyMove(machine.get(), 0)); // X@0
    const afterX0 = machine.get();
    machine.commit(applyMove(machine.get(), bestMove(machine.get(), 'easy', rand0))); // O@1
    expect(machine.get().board[1]).toBe(2);
    machine.commit(applyMove(machine.get(), 8)); // X@8
    machine.commit(applyMove(machine.get(), bestMove(machine.get(), 'easy', rand0))); // O@4 堵
    expect(machine.get().board[4]).toBe(2);
    const afterO4 = machine.get(); // X@2 落子前（轮 X）
    machine.commit(applyMove(machine.get(), 2)); // X@2
    const afterX2 = machine.get();
    machine.commit(applyMove(machine.get(), bestMove(machine.get(), 'easy', rand0))); // O@7 赢
    const end = machine.get();
    expect(end.status).toBe('won');
    expect(end.winner).toBe(2);
    expect(end.line).toEqual([1, 4, 7]);

    // 撤销：render 语义 = 撤到玩家回合为止（撤 AI 一步 + 撤玩家一步）
    expect(machine.undo()).toBe(afterX2); // 撤 O@7 → 轮 O
    expect(machine.get().turn).toBe(2);
    expect(machine.undo()).toBe(afterO4); // 撤 X@2 → 轮玩家
    expect(machine.get().turn).toBe(1);
    expect(machine.get().status).toBe('playing');
    expect(machine.get().board[2]).toBe(0);
    expect(afterX0.turn).toBe(2);
  });

  it('双人模式：undo 一次只撤一步', () => {
    const machine = createState(newGame({ mode: '2p' }));
    machine.commit(applyMove(machine.get(), 4)); // X
    const afterX = machine.get();
    machine.commit(applyMove(machine.get(), 0)); // O
    expect(machine.get().turn).toBe(1);
    expect(machine.undo()).toBe(afterX); // 只撤 O 这一步
    expect(machine.get().board[0]).toBe(0);
    expect(machine.get().turn).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// easy AI：必堵即时威胁 / 必走即时赢棋 / 其余随机
// ---------------------------------------------------------------------------

describe('easy AI（基础防守的随机走子）', () => {
  it('玩家有两连 → 无论随机源如何必堵第三格', () => {
    const rands: Array<() => number> = [() => 0, () => 0.5, () => 0.999];
    // X={0,1} 威胁 2
    for (const r of rands) {
      expect(bestMove(mkState(boardOf('XX.......'), 2), 'easy', r)).toBe(2);
    }
    // X={2,4} 威胁 6（对角），O={0,8} 无自己的即时赢
    for (const r of rands) {
      expect(bestMove(mkState(boardOf('O.X.X...O'), 2), 'easy', r)).toBe(6);
    }
    // X={3,5} 威胁 4（列中缝）
    for (const r of rands) {
      expect(bestMove(mkState(boardOf('...X.X...'), 2), 'easy', r)).toBe(4);
    }
  });

  it('自己有即时赢棋 → 优先赢而不是堵', () => {
    // O={3,4} 即时赢位 5；X={0,1} 威胁 2 —— 必走 5
    expect(bestMove(mkState(boardOf('XX.OO....'), 2), 'easy', () => 0)).toBe(5);
    expect(bestMove(mkState(boardOf('XX.OO....'), 2), 'easy', () => 0.999)).toBe(5);
  });

  it('无赢无堵 → 随机落在空格（随机源走注入 rand，确定性可复现）', () => {
    const s = mkState(boardOf('X.......O'), 2); // 空格 [1..7]
    const m0 = bestMove(s, 'easy', () => 0);
    const m9 = bestMove(s, 'easy', () => 0.999);
    expect(legalMoves(s.board)).toContain(m0);
    expect(legalMoves(s.board)).toContain(m9);
    // rand=0 → 首个空格；rand≈1 → 最后一个空格（floor(n*0.999) 落尾段）
    expect(m0).toBe(1);
    expect(m9).toBe(7);
  });

  it('rand 缺省不抛（内部 Date.now() 种子）且返回合法空格', () => {
    const s = mkState(boardOf('X.O.X.O..'), 2); // X={0,4} 无线未满
    const m = bestMove(s, 'easy');
    expect(legalMoves(s.board)).toContain(m);
  });

  it('终局 / 满盘返回 -1', () => {
    const won = play(newGame({ mode: 'ai' }), [0, 3, 1, 4, 2]);
    expect(bestMove(won, 'easy')).toBe(-1);
    const draw = play(newGame({ mode: 'ai' }), [4, 0, 8, 2, 6, 3, 1, 7, 5]);
    expect(bestMove(draw, 'hard')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// hard AI：minimax 完美博弈、不可战胜性穷举
// ---------------------------------------------------------------------------

describe('hard AI（minimax 完美博弈）', () => {
  it('有即时赢棋必走', () => {
    // O={0,1} 赢位 2（X={6,7} 也有赢位 8，但轮 AI 走自己的 2）
    expect(bestMove(mkState(boardOf('OO....XX.'), 2), 'hard')).toBe(2);
    // O={2,6} 对角赢位 4；X={0,5} 无即时赢
    expect(bestMove(mkState(boardOf('X.O..XO..'), 2), 'hard')).toBe(4);
  });

  it('玩家单威胁必堵', () => {
    // X={0,8} 双角威胁对角中缝 4（O 无即时赢）→ 必堵
    expect(bestMove(mkState(boardOf('X.......X'), 2), 'hard')).toBe(4);
    // X={1,2} 威胁 0；O={3,8} 无自己的即时赢
    expect(bestMove(mkState(boardOf('.XXO....O'), 2), 'hard')).toBe(0);
  });

  it('即时赢优先于堵（双方都有即时位）', () => {
    // O={3,5} 赢位 4（列 3,4,5）；X={0,1} 威胁 2 → 走 4 赢
    expect(bestMove(mkState(boardOf('XX.O.O...'), 2), 'hard')).toBe(4);
  });

  it('不可战胜性：空盘出发，玩家 X 任意走法穷举，AI（O）never lose', () => {
    expect(aiNeverLoses(boardOf('.........'), 1)).toBe(true);
  });

  it('不可战胜性：若干中盘局面（轮玩家或轮 AI）never lose', () => {
    // 轮玩家 X（手数 X=O）——局面均经「X 无即时赢且无双叉点」筛选
    //（X 有必胜策略的局面 AI 必败，验证无意义）：
    // 1) X 占中心、O 占角
    expect(aiNeverLoses(boardOf('O...X....'), 1)).toBe(true);
    // 2) X 角0+中心、O 对角两端 2/8（挡掉两条对角）
    expect(aiNeverLoses(boardOf('X.O.X...O'), 1)).toBe(true);
    // 3) 残局 X={0,4,6} O={2,3,8}（X 无单格威胁，O 含 2,5,8 潜在反击）
    expect(aiNeverLoses(boardOf('X.OOX.X.O'), 1)).toBe(true);
    // 4) X 角8+中心、O 双角 0/2（case 2 的镜像）
    expect(aiNeverLoses(boardOf('O.O.X...X'), 1)).toBe(true);
    // 轮 AI O（手数 X=O+1，AI 尚未回应的中盘）：
    // 5) X 双角 0/8、O 中心，轮 AI（AI 需立即破坏 2/6 双叉点）
    expect(aiNeverLoses(boardOf('X...O...X'), 2)).toBe(true);
    // 6) X 中心、轮 AI
    expect(aiNeverLoses(boardOf('....X....'), 2)).toBe(true);
  });

  it('不可战胜性：程序生成的中盘局面序列（固定种子，多难度玩家侧随机扰动）', () => {
    // 模拟：玩家 X 用伪随机走、AI hard 回应，录制每个「轮 X」的中盘快照，
    // 逐个从该快照穷举验证 AI never lose。多种子覆盖更多局面形态。
    for (let seed = 1; seed <= 5; seed++) {
      let mul = seed >>> 0;
      const rand = () => {
        mul = (Math.imul(mul ^ (mul >>> 15), mul | 1) ^ (mul + Math.imul(mul ^ (mul >>> 7), mul | 61))) >>> 0;
        return (mul % 1000) / 1000;
      };
      let s = newGame({ mode: 'ai', difficulty: 'hard' });
      for (let ply = 0; ply < 6; ply++) {
        if (s.status !== 'playing') break;
        if (s.turn === 1) {
          // 快照点：轮玩家 X 的中盘，从此处穷举 AI 不败
          expect(aiNeverLoses(s.board.slice(), 1)).toBe(true);
          const moves = legalMoves(s.board);
          s = applyMove(s, moves[Math.floor(rand() * moves.length) % moves.length]);
        } else {
          s = applyMove(s, bestMove(s, 'hard'));
        }
      }
    }
  });

  it('同步瞬时：空盘 hard 首步在毫秒级返回且落子合法', () => {
    const s = newGame({ mode: 'ai', difficulty: 'hard' });
    const t0 = Date.now();
    const m = bestMove(mkState(boardOf('.........'), 2), 'hard');
    const dt = Date.now() - t0;
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(8);
    expect(dt).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  const cases: Array<{ name: string; state: GameState }> = [
    { name: '初始局（ai/easy）', state: newGame({ mode: 'ai', difficulty: 'easy' }) },
    { name: '初始局（2p）', state: newGame({ mode: '2p' }) },
    {
      name: '进行中（ai/hard，轮 O）',
      state: play(newGame({ mode: 'ai', difficulty: 'hard' }), [4, 0]),
    },
    {
      name: '进行中（2p，轮 X）',
      state: play(newGame({ mode: '2p' }), [4, 0, 8]),
    },
    {
      name: 'X 胜（列 1,4,7）',
      state: play(newGame({ mode: 'ai', difficulty: 'easy' }), [4, 0, 1, 8, 7]),
    },
    {
      name: 'O 胜（对角 2,4,6）',
      state: play(newGame({ mode: 'ai', difficulty: 'easy' }), [0, 4, 8, 6, 5, 2]),
    },
    {
      name: '平局',
      state: play(newGame({ mode: '2p' }), [4, 0, 8, 2, 6, 3, 1, 7, 5]),
    },
  ];

  it.each(cases)('往返一致：$name', ({ state }) => {
    const back = deserialize(serialize(state));
    expect(back).not.toBeNull();
    expect(back).toEqual(state);
  });

  it('serialize 输出紧凑 5 段格式（空格编码为字符 0）', () => {
    expect(serialize(newGame({ mode: 'ai', difficulty: 'easy' }))).toBe('ttt1;ai;easy;000000000;1');
    // X@4 → O@0：board idx0=2、idx4=1，轮 X
    expect(serialize(play(newGame({ mode: '2p' }), [4, 0]))).toBe('ttt1;2p;easy;200010000;1');
  });

  it('损坏输入 → null（绝不抛）', () => {
    const bads: unknown[] = [
      '',
      'ttt1',
      'ttt1;ai',
      'ttt1;ai;easy;000000000',
      'ttt1;ai;easy;000000000;1;extra',
      'sudoku1;ai;easy;000000000;1',
      'ttt1;pvp;easy;000000000;1',
      'ttt1;ai;medium;000000000;1',
      'ttt1;ai;easy;00000000;1', // board 8 字符
      'ttt1;ai;easy;0000000000;1', // board 10 字符
      'ttt1;ai;easy;00000X000;1', // 非法字符
      'ttt1;ai;easy;000000000;3',
      'ttt1;ai;easy;000000000;x',
      'ttt1;ai;easy;000000000;',
      null,
      undefined,
      123,
      {},
    ];
    for (const b of bads) {
      expect(deserialize(b as string)).toBeNull();
    }
  });

  it('手数一致性：turn 与盘面手数矛盾 → null', () => {
    // X=2 O=0：轮 X 要求 X===O（2≠0）、轮 O 要求 X===O+1（2≠1）→ 皆非法
    expect(deserialize('ttt1;2p;easy;100100000;1')).toBeNull();
    expect(deserialize('ttt1;2p;easy;100100000;2')).toBeNull();
    // X=1 O=0：合法为轮 O；标轮 1 非法
    expect(deserialize('ttt1;2p;easy;100000000;1')).toBeNull();
    // X=1 O=0 轮 O：合法
    const ok = deserialize('ttt1;2p;easy;100000000;2');
    expect(ok).not.toBeNull();
    expect(ok!.turn).toBe(2);
    // X=2 O=2 轮 X：合法
    const ok2 = deserialize('ttt1;2p;easy;101020200;1');
    expect(ok2).not.toBeNull();
    expect(ok2!.turn).toBe(1);
  });

  it('status/winner/line 由盘面重建：X 成线盘 → won', () => {
    const back = deserialize('ttt1;ai;hard;111020200;2');
    expect(back!.status).toBe('won');
    expect(back!.winner).toBe(1);
    expect(back!.line).toEqual([0, 1, 2]);
  });

  it('deserialize 非字符串不抛且返回 null', () => {
    expect(() => deserialize(null as unknown as string)).not.toThrow();
    expect(deserialize(null as unknown as string)).toBeNull();
  });
});
