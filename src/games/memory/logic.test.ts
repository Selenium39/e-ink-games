/**
 * memory/logic 单测（契约 §5 + 任务书验收标准）。
 * 纯 Node 环境（vitest），无 DOM。
 * 覆盖：新局成对性与洗牌确定性、翻牌状态转移（no-op 语义）、两张判定、
 * 计步、胜利判定、serialize/deserialize 往返、非法输入 throw。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  flipCard,
  flipBack,
  isSolved,
  upIndices,
  serialize,
  deserialize,
  LAYOUT,
  SYMBOL_COUNT,
  CARD_DOWN,
  CARD_UP,
  CARD_MATCHED,
} from './logic';
import type { Difficulty, GameState } from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const TOTAL: Record<Difficulty, number> = {
  easy: LAYOUT.easy.cols * LAYOUT.easy.rows, // 12
  medium: LAYOUT.medium.cols * LAYOUT.medium.rows, // 16
  hard: LAYOUT.hard.cols * LAYOUT.hard.rows, // 24
};

/** 断言一副牌的成对性：每种出现的符号恰 2 张、种数 = pairs */
function expectPaired(symbols: number[], pairs: number): void {
  expect(symbols.length).toBe(pairs * 2);
  const counts = new Map<number, number>();
  for (const s of symbols) counts.set(s, (counts.get(s) || 0) + 1);
  expect(counts.size).toBe(pairs);
  for (const [sym, n] of counts) {
    expect(n).toBe(2);
    expect(sym).toBeGreaterThanOrEqual(0);
    expect(sym).toBeLessThan(SYMBOL_COUNT);
  }
}

/** 找一对同符号牌的两个 idx */
function findPair(state: GameState): [number, number] {
  for (let i = 0; i < state.symbols.length; i++) {
    for (let j = i + 1; j < state.symbols.length; j++) {
      if (state.symbols[i] === state.symbols[j]) return [i, j];
    }
  }
  throw new Error('no pair found');
}

/** 找两张不同符号、当前均为背面的牌 idx（用于构造不匹配翻牌） */
function findNonPair(state: GameState): [number, number] {
  for (let i = 0; i < state.symbols.length; i++) {
    if (state.cards[i] !== CARD_DOWN) continue;
    for (let j = i + 1; j < state.symbols.length; j++) {
      if (state.cards[j] !== CARD_DOWN) continue;
      if (state.symbols[i] !== state.symbols[j]) return [i, j];
    }
  }
  throw new Error('no non-pair found');
}

/** 把整副牌按 symbols 顺序完美配对走完（每步翻同符号两张），返回终局 state */
function solvePerfectly(input: GameState): GameState {
  let s = input;
  let guard = 0;
  while (!isSolved(s)) {
    const [a, b] = findPairOfDown(s);
    s = flipCard(flipCard(s, a), b);
    guard++;
    if (guard > 100) throw new Error('solvePerfectly did not converge');
  }
  return s;
}

/** 找当前仍背面的一对同符号牌 */
function findPairOfDown(state: GameState): [number, number] {
  for (let i = 0; i < state.symbols.length; i++) {
    if (state.cards[i] !== CARD_DOWN) continue;
    for (let j = i + 1; j < state.symbols.length; j++) {
      if (state.cards[j] !== CARD_DOWN) continue;
      if (state.symbols[i] === state.symbols[j]) return [i, j];
    }
  }
  throw new Error('no down pair found');
}

// ---------------------------------------------------------------------------
// newGame：成对性 / 确定性
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('每难度 × 20 固定种子：牌数与难度一致、符号成对、初始全背面、moves/matched 归零', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const state = newGame({ difficulty, seed });
        expect(state.difficulty).toBe(difficulty);
        expect(state.seed).toBe(seed);
        expect(state.symbols.length).toBe(TOTAL[difficulty]);
        expect(state.cards.length).toBe(TOTAL[difficulty]);
        expectPaired(state.symbols, LAYOUT[difficulty].pairs);
        for (let i = 0; i < TOTAL[difficulty]; i++) {
          expect(state.cards[i]).toBe(CARD_DOWN);
        }
        expect(state.moves).toBe(0);
        expect(state.matched).toBe(0);
        expect(isSolved(state)).toBe(false);
      }
    }
  });

  it('同 seed 同布局（洗牌确定性）；不同 seed 布局几乎必然不同', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const a = newGame({ difficulty, seed: 42 });
      const b = newGame({ difficulty, seed: 42 });
      expect(a.symbols).toEqual(b.symbols);
      expect(a).toEqual(b);
    }
    const x = newGame({ difficulty: 'hard', seed: 1 }).symbols;
    const y = newGame({ difficulty: 'hard', seed: 2 }).symbols;
    expect(x).not.toEqual(y);
  });

  it('未传 seed → state.seed = null，成对性仍成立', () => {
    const state = newGame({ difficulty: 'medium' });
    expect(state.seed).toBeNull();
    expectPaired(state.symbols, LAYOUT.medium.pairs);
  });

  it('非法参数 throw（编程错误契约）', () => {
    expect(() => newGame({ difficulty: 'impossible' as Difficulty })).toThrow();
    expect(() => newGame(null as unknown as { difficulty: Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: -1 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 1.5 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 4294967296 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: '7' as unknown as number })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// flipCard：状态转移与两张判定
// ---------------------------------------------------------------------------

describe('flipCard', () => {
  it('翻第一张：down→up，不计步；翻开的牌再点 no-op（原引用）', () => {
    const state = newGame({ difficulty: 'easy', seed: 1 });
    const [a] = findNonPair(state);
    const one = flipCard(state, a);
    expect(one).not.toBe(state);
    expect(one.cards[a]).toBe(CARD_UP);
    expect(one.moves).toBe(0); // 单张不算步
    expect(upIndices(one)).toEqual([a]);
    // 再点同张 → no-op
    expect(flipCard(one, a)).toBe(one);
  });

  it('匹配判定：两张同符号 → 双双 CARD_MATCHED、moves+1、matched+1', () => {
    const state = newGame({ difficulty: 'easy', seed: 2 });
    const [a, b] = findPair(state);
    const after = flipCard(flipCard(state, a), b);
    expect(after.cards[a]).toBe(CARD_MATCHED);
    expect(after.cards[b]).toBe(CARD_MATCHED);
    expect(after.moves).toBe(1);
    expect(after.matched).toBe(1);
    expect(upIndices(after)).toEqual([]);
    // 已配对牌再点 no-op（原引用）
    expect(flipCard(after, a)).toBe(after);
    expect(flipCard(after, b)).toBe(after);
  });

  it('不匹配判定：两张不同符号 → 挂起 up、moves+1、matched 不变', () => {
    const state = newGame({ difficulty: 'easy', seed: 3 });
    const [a, b] = findNonPair(state);
    const after = flipCard(flipCard(state, a), b);
    expect(after.cards[a]).toBe(CARD_UP);
    expect(after.cards[b]).toBe(CARD_UP);
    expect(after.moves).toBe(1);
    expect(after.matched).toBe(0);
    expect(upIndices(after)).toEqual([a, b].sort((x, y) => x - y));
  });

  it('不匹配对挂起期间锁输入：第三张 no-op（原引用）', () => {
    const state = newGame({ difficulty: 'medium', seed: 4 });
    const all = state.symbols.slice();
    let a = -1, b = -1, c = -1;
    outer:
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i] !== all[j]) { a = i; b = j; break outer; }
      }
    }
    for (let k = 0; k < all.length; k++) {
      if (k !== a && k !== b) { c = k; break; }
    }
    const stuck = flipCard(flipCard(state, a), b);
    expect(flipCard(stuck, c)).toBe(stuck); // 锁输入
  });

  it('不可变：原 state 的 cards/symbols 不被改写', () => {
    const state = newGame({ difficulty: 'hard', seed: 5 });
    const [a] = findPair(state);
    const one = flipCard(state, a);
    expect(state.cards[a]).toBe(CARD_DOWN);
    expect(one.cards[a]).toBe(CARD_UP);
    const [, b] = findPair(state);
    const two = flipCard(one, b);
    expect(one.cards[a]).toBe(CARD_UP);
    expect(one.cards[b]).toBe(CARD_DOWN);
    expect(two.matched).toBe(1);
  });

  it('非法 idx / 非法 state throw，不静默', () => {
    const state = newGame({ difficulty: 'easy', seed: 6 });
    expect(() => flipCard(state, -1)).toThrow();
    expect(() => flipCard(state, TOTAL.easy)).toThrow();
    expect(() => flipCard(state, 1.5)).toThrow();
    expect(() => flipCard(state, '2' as unknown as number)).toThrow();
    expect(() => flipCard(null as unknown as GameState, 0)).toThrow();
    const broken = { ...state, matched: 3 } as GameState; // matched 与 cards 不一致
    expect(() => flipCard(broken, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// flipBack：翻回窗口结束的状态转移
// ---------------------------------------------------------------------------

describe('flipBack', () => {
  it('挂起的不匹配对 → 双双翻回 CARD_DOWN；moves/matched 保留；matched 牌不受影响', () => {
    let state = newGame({ difficulty: 'medium', seed: 7 });
    // 先配对一对
    const [p, q] = findPair(state);
    state = flipCard(flipCard(state, p), q);
    expect(state.matched).toBe(1);
    // 再挂起一对不匹配
    const [a, b] = findNonPair(state);
    state = flipCard(flipCard(state, a), b);
    expect(state.moves).toBe(2);
    const back = flipBack(state);
    expect(back.cards[a]).toBe(CARD_DOWN);
    expect(back.cards[b]).toBe(CARD_DOWN);
    expect(back.cards[p]).toBe(CARD_MATCHED); // 已配对不动
    expect(back.moves).toBe(2);
    expect(back.matched).toBe(1);
  });

  it('无挂起牌 → no-op（原引用）；单张挂起也一并收回', () => {
    const state = newGame({ difficulty: 'easy', seed: 8 });
    expect(flipBack(state)).toBe(state);
    const one = flipCard(state, 0);
    const back = flipBack(one); // render 只在 up=2 时调度，但单张收回同语义（存档恢复清理用）
    expect(back).not.toBe(one);
    expect(back.cards[0]).toBe(CARD_DOWN);
  });

  it('非法 state throw', () => {
    expect(() => flipBack({ cards: [] } as unknown as GameState)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 计步 / 胜利判定
// ---------------------------------------------------------------------------

describe('moves & win', () => {
  it('每翻两张算一步：匹配与不匹配都计 1 步，单张与翻回不计步', () => {
    const state = newGame({ difficulty: 'easy', seed: 9 });
    const [a, b] = findPair(state);
    const s1 = flipCard(flipCard(state, a), b); // 匹配 1 步
    expect(s1.moves).toBe(1);

    // 在剩余背面牌中找两张不同符号的（d、e），构造不匹配
    let d = -1;
    let e = -1;
    for (let i = 0; i < s1.cards.length; i++) {
      if (s1.cards[i] !== CARD_DOWN) continue;
      if (d === -1) {
        d = i;
        continue;
      }
      if (state.symbols[i] !== state.symbols[d]) {
        e = i;
        break;
      }
    }
    expect(d).toBeGreaterThanOrEqual(0);
    expect(e).toBeGreaterThanOrEqual(0);

    const s2 = flipCard(s1, d); // 翻第一张：不计步
    expect(s2.moves).toBe(1);
    const s3 = flipCard(s2, e); // 不匹配也算 1 步
    expect(s3.moves).toBe(2);
    expect(s3.matched).toBe(1);
    const s4 = flipBack(s3); // 翻回不计步
    expect(s4.moves).toBe(2);
  });

  it('胜利判定：全部配对 → isSolved true，此后翻牌 no-op；中间态恒 false', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const state = newGame({ difficulty, seed: 11 });
      const final = solvePerfectly(state);
      expect(final.matched).toBe(LAYOUT[difficulty].pairs);
      expect(final.moves).toBe(LAYOUT[difficulty].pairs); // 完美局每对恰 1 步
      expect(isSolved(final)).toBe(true);
      // 终局后翻任何牌 no-op（原引用）
      expect(flipCard(final, 0)).toBe(final);
    }
    const state = newGame({ difficulty: 'easy', seed: 12 });
    expect(isSolved(state)).toBe(false);
    const [p, q] = findPair(state);
    const half = flipCard(flipCard(state, p), q);
    expect(half.matched).toBe(1);
    expect(isSolved(half)).toBe(false);
  });

  it('moves 计步与 matched 一致性：matched 张数恒等于 state.matched', () => {
    let state = newGame({ difficulty: 'hard', seed: 13 });
    let guard = 0;
    while (!isSolved(state)) {
      const [a, b] = findPairOfDown(state);
      state = flipCard(flipCard(state, a), b);
      const count = state.cards.filter((c) => c === CARD_MATCHED).length;
      expect(state.matched * 2).toBe(count); // matched 按对计
      guard++;
      if (guard > 100) throw new Error('not converged');
    }
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('newGame 初始 state roundtrip 等值（含 seed 与 seed=null）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const seeded = newGame({ difficulty, seed: 99 });
      expect(deserialize(serialize(seeded))).toEqual(seeded);
      const random = newGame({ difficulty });
      expect(random.seed).toBeNull();
      expect(deserialize(serialize(random))).toEqual(random);
    }
  });

  it('进行中盘面（半配对 + 挂起不匹配对）roundtrip 等值', () => {
    let state = newGame({ difficulty: 'medium', seed: 31 });
    const [p, q] = findPair(state);
    state = flipCard(flipCard(state, p), q); // 配对一对
    const [a, b] = findNonPair({ ...state } as GameState);
    state = flipCard(flipCard(state, a), b); // 挂起不匹配
    const round = deserialize(serialize(state));
    expect(round).toEqual(state);
    expect(upIndices(round as GameState)).toEqual(upIndices(state));
  });

  it('serialize 输出紧凑、可从字符串头识别', () => {
    const state = newGame({ difficulty: 'hard', seed: 41 });
    const s = serialize(state);
    // 5+1 段：magic+难度+seed+24 符号+24 状态+moves
    expect(s.length).toBeLessThan(70);
    expect(s.startsWith('memory1;hard;41;')).toBe(true);
    expect(s.split(';').length).toBe(6);
  });

  it('损坏/伪造存档一律 null，绝不抛', () => {
    const good = serialize(newGame({ difficulty: 'easy', seed: 51 }));
    const segs = good.split(';');

    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize('memory1;easy')).toBeNull();
    expect(deserialize('memory2;' + segs.slice(1).join(';'))).toBeNull();
    expect(deserialize(good.replace('easy', 'daily'))).toBeNull();

    // seed 越界 / 非数字
    const badSeed = segs.slice();
    badSeed[2] = '4294967296';
    expect(deserialize(badSeed.join(';'))).toBeNull();
    const badSeed2 = segs.slice();
    badSeed2[2] = '-1';
    expect(deserialize(badSeed2.join(';'))).toBeNull();

    // 符号段长度错 / 非法字符 / 值越界（'c' = 12 超 SYMBOL_COUNT）
    const badSymLen = segs.slice();
    badSymLen[3] = badSymLen[3].slice(0, 11);
    expect(deserialize(badSymLen.join(';'))).toBeNull();
    const badSymChar = segs.slice();
    badSymChar[3] = 'z' + badSymChar[3].slice(1);
    expect(deserialize(badSymChar.join(';'))).toBeNull();
    const badSymVal = segs.slice();
    badSymVal[3] = 'c' + badSymVal[3].slice(1);
    expect(deserialize(badSymVal.join(';'))).toBeNull();

    // 破坏成对性：把首张符号换成整副牌未出现的符号 → 原符号变单张
    const soloSym = segs.slice();
    const used = new Set(segs[3].split(''));
    let unused = '';
    for (const ch of '0123456789ab') {
      if (!used.has(ch)) {
        unused = ch;
        break;
      }
    }
    expect(unused).not.toBe(''); // easy 6 对只用 6/12 种符号，必有空位
    soloSym[3] = unused + soloSym[3].slice(1);
    expect(deserialize(soloSym.join(';'))).toBeNull();

    // 牌状态段：长度错 / 非法字符 / 半对 matched（单张 '2' 其搭档 '0'）
    const badCardLen = segs.slice();
    badCardLen[4] = badCardLen[4].slice(0, 11);
    expect(deserialize(badCardLen.join(';'))).toBeNull();
    const badCardChar = segs.slice();
    badCardChar[4] = '9' + badCardChar[4].slice(1);
    expect(deserialize(badCardChar.join(';'))).toBeNull();

    const state = newGame({ difficulty: 'easy', seed: 51 });
    const [p, q] = findPair(state);
    const matchedOne = flipCard(flipCard(state, p), q);
    const halfSegs = serialize(matchedOne).split(';');
    const halfCard = halfSegs[4].split('');
    // 把两张 matched 之一改回 down → 半对非法
    const pos = halfCard.indexOf('2');
    halfCard[pos] = '0';
    halfSegs[4] = halfCard.join('');
    expect(deserialize(halfSegs.join(';'))).toBeNull();

    // 挂起同符号两张 up（合法流程不可达：同符号第二张必被判定为 matched）
    const stuckSame = serialize(flipCard(state, p)).split(';'); // 单张 up 合法
    expect(deserialize(stuckSame.join(';'))).not.toBeNull();
    const twoSame = stuckSame.slice();
    const cards2 = twoSame[4].split('');
    cards2[q] = '1'; // 手工把同符号搭档也置 up
    twoSame[4] = cards2.join('');
    expect(deserialize(twoSame.join(';'))).toBeNull();

    // moves < matched（配对 1 次至少 1 步）
    const fewer = serialize(matchedOne).split(';');
    fewer[5] = '0';
    expect(deserialize(fewer.join(';'))).toBeNull();

    // 非 string 输入
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize({} as unknown as string)).toBeNull();
  });

  it('手动构造的最小合法存档可解析', () => {
    // easy 12 张：6 种符号两两成对（0,1,2,3,4,5 各两张）+ 全 down + 0 步
    const manual = 'memory1;easy;-;' + '012345543210' + ';' + '000000000000' + ';0';
    const parsed = deserialize(manual);
    expect(parsed).not.toBeNull();
    expect(parsed?.difficulty).toBe('easy');
    expect(parsed?.seed).toBeNull();
    expect(parsed?.moves).toBe(0);
    expect(parsed?.matched).toBe(0);
  });
});
