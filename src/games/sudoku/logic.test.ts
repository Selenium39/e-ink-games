/**
 * sudoku/logic 单测（契约 §5.2 + 任务书验收标准）。
 * 纯 Node 环境（vitest），无 DOM。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  solve,
  applyMove,
  clearCell,
  toggleNote,
  getCandidates,
  checkErrors,
  isSolved,
  serialize,
  deserialize,
  countSolutions,
} from './logic';
import type { Difficulty, GameState, Grid } from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * givens 区间断言。
 * 实现目标值（两文档交集点）：easy 40 / medium 32 / hard 26 / expert 23；
 * 断言带同时落在契约 §5.2（±2 容差）与任务书（±1 容差）的交集内：
 * easy [39,42]∩[40,44] 取 [40,42]；medium [31,34]；hard [25,29]∩[26,30] 取 [26,29]；expert [21,26]∩[22,26] 取 [23,26]。
 */
const GIVENS_RANGE: Record<Difficulty, [number, number]> = {
  easy: [40, 42],
  medium: [32, 34],
  hard: [26, 29],
  expert: [23, 26],
};

/** 每行 9 字符拼 81 格盘面，'.' 或 '0' 为空 */
function rows(...rowsIn: string[]): Grid {
  expect(rowsIn.length).toBe(9);
  const out: Grid = [];
  for (const row of rowsIn) {
    expect(row.length).toBe(9);
    for (const ch of row) {
      out.push(ch === '.' || ch === '0' ? 0 : Number(ch));
    }
  }
  return out;
}

/** 以给定盘面构造最小合法 GameState（全玩家格、无 notes） */
function stateFrom(values: Grid): GameState {
  return {
    difficulty: 'easy',
    seed: null,
    givens: new Array<boolean>(81).fill(false),
    values,
    notes: new Array<number>(81).fill(0),
  };
}

/** solution 适配 isSolved 的快速断言 */
function expectFullSolution(grid: Grid): void {
  expect(grid.length).toBe(81);
  for (let i = 0; i < 81; i++) {
    expect(grid[i]).toBeGreaterThanOrEqual(1);
    expect(grid[i]).toBeLessThanOrEqual(9);
  }
  expect(isSolved(stateFrom(grid))).toBe(true);
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('每难度 × 20 固定种子：唯一解、givens 区间、盘面一致性、初始 state 正确', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const res = newGame({ difficulty, seed });

        // 形状
        expect(res.puzzle.length).toBe(81);
        expect(res.solution.length).toBe(81);
        expect(res.givens.length).toBe(81);

        // solution 是完整合法解
        expectFullSolution(res.solution);

        // puzzle：givens 格 = 题面数字，非 givens 格 = 0，且与 givens 位图一致
        let givensCount = 0;
        for (let i = 0; i < 81; i++) {
          const isGiven = res.puzzle[i] !== 0;
          expect(res.givens[i]).toBe(isGiven);
          if (isGiven) givensCount++;
        }

        // 难度区间（任务书区间为准，允许个别种子 ±1；实现在契约/任务区间交集内）
        const [lo, hi] = GIVENS_RANGE[difficulty];
        expect(givensCount).toBeGreaterThanOrEqual(lo);
        expect(givensCount).toBeLessThanOrEqual(hi);

        // 唯一解：解计数恰 1，且求解结果即生成时的 solution
        expect(countSolutions(res.puzzle, 2)).toBe(1);
        expect(solve(res.puzzle)).toEqual(res.solution);

        // 初始 state
        expect(res.state.difficulty).toBe(difficulty);
        expect(res.state.seed).toBe(seed);
        expect(res.state.values).toEqual(res.puzzle);
        expect(res.state.givens).toEqual(res.givens);
        expect(res.state.notes).toEqual(new Array(81).fill(0));
        expect(isSolved(res.state)).toBe(false); // 挖过洞必未完成
      }
    }
  });

  it('同 seed 同谜题（每日挑战基础）；不同 seed 产出不同盘面', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const a = newGame({ difficulty, seed: 42 });
      const b = newGame({ difficulty, seed: 42 });
      expect(a.puzzle).toEqual(b.puzzle);
      expect(a.solution).toEqual(b.solution);
      expect(a.givens).toEqual(b.givens);
      expect(a.state).toEqual(b.state);
    }
    // 不同 seed 在 20 种子扫描中已有隐式覆盖；此处显式抽验两个 expert 种子不同
    const x = newGame({ difficulty: 'expert', seed: 1 });
    const y = newGame({ difficulty: 'expert', seed: 2 });
    expect(x.puzzle).not.toEqual(y.puzzle);
  });

  it('未传 seed → state.seed = null（随机组局），盘面仍合法且唯一解', () => {
    const res = newGame({ difficulty: 'medium' });
    expect(res.state.seed).toBeNull();
    expect(countSolutions(res.puzzle, 2)).toBe(1);
    const [lo, hi] = GIVENS_RANGE.medium;
    expect(res.givens.filter(Boolean).length).toBeGreaterThanOrEqual(lo);
    expect(res.givens.filter(Boolean).length).toBeLessThanOrEqual(hi);
  });

  it('非法参数 throw（编程错误契约）', () => {
    expect(() => newGame({ difficulty: 'impossible' as Difficulty })).toThrow();
    expect(() => newGame(null as unknown as { difficulty: Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: -1 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 1.5 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 4294967296 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: '7' as unknown as number })).toThrow();
  });

  it('expert 生成耗时：单次 < 1000ms（目标 <300ms；放宽防 CI 抖动）', () => {
    const times: number[] = [];
    for (const seed of SEEDS) {
      const t0 = Date.now();
      const res = newGame({ difficulty: 'expert', seed });
      const dt = Date.now() - t0;
      times.push(dt);
      expect(res.puzzle.length).toBe(81);
      expect(dt).toBeLessThan(1000);
    }
    const max = Math.max.apply(null, times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    // 供任务报告引用实测数据
    console.log('[perf] expert x20 seeds avg=%sms max=%sms all=%j', avg.toFixed(1), max, times);
    expect(avg).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// solve / countSolutions
// ---------------------------------------------------------------------------

describe('solve', () => {
  it('空盘返回一个完整合法解', () => {
    const s = solve(new Array<number>(81).fill(0));
    expect(s).not.toBeNull();
    expectFullSolution(s as Grid);
  });

  it('完整解盘返回其自身（拷贝）', () => {
    const res = newGame({ difficulty: 'hard', seed: 5 });
    const s = solve(res.solution);
    expect(s).toEqual(res.solution);
    expect(s).not.toBe(res.solution); // 返回副本，不改入参
  });

  it('唯一解盘面返回唯一解', () => {
    const res = newGame({ difficulty: 'expert', seed: 3 });
    expect(solve(res.puzzle)).toEqual(res.solution);
  });

  it('无解/多解盘面：冲突盘 → null；多解盘计数 >1', () => {
    const conflict = rows(
      '11.......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    );
    expect(solve(conflict)).toBeNull();
    expect(countSolutions(conflict, 2)).toBe(0);

    // 仅 1 个 givens 的盘面必然多解
    const sparse = rows(
      '1........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    );
    expect(countSolutions(sparse, 2)).toBe(2);
  });

  it('非法输入 throw（长度≠81、格值越界）', () => {
    expect(() => solve(new Array<number>(80).fill(0))).toThrow();
    expect(() => solve(new Array<number>(82).fill(0))).toThrow();
    const bad = new Array<number>(81).fill(0);
    bad[0] = 10;
    expect(() => solve(bad)).toThrow();
    expect(() => countSolutions(bad, 2)).toThrow();
    expect(() => countSolutions(new Array<number>(81).fill(0), 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyMove / clearCell / toggleNote
// ---------------------------------------------------------------------------

describe('applyMove', () => {
  it('合法落子：写入、清除该格 notes、不可变（原 state 不变）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 11 });
    // 找一个非 givens 空格
    let idx = -1;
    for (let i = 0; i < 81; i++) {
      if (!state.givens[i]) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = Math.floor(idx / 9);
    const c = idx % 9;

    const withNote = toggleNote(state, r, c, 4);
    expect(withNote.notes[idx]).toBe(1 << 3);

    const moved = applyMove(withNote, r, c, 7);
    expect(moved).not.toBe(withNote);
    expect(moved.values[idx]).toBe(7);
    expect(moved.notes[idx]).toBe(0);
    // 不可变：原 state 数组未被改写
    expect(state.values[idx]).toBe(0);
    expect(withNote.notes[idx]).toBe(1 << 3);
  });

  it('givens 格 no-op 返回原引用；同值重填 no-op 原引用', () => {
    const { state, givens } = newGame({ difficulty: 'easy', seed: 12 });
    const givenIdx = givens.indexOf(true);
    expect(givenIdx).toBeGreaterThanOrEqual(0);
    const r = Math.floor(givenIdx / 9);
    const c = givenIdx % 9;

    expect(applyMove(state, r, c, state.values[givenIdx])).toBe(state);
    expect(applyMove(state, r, c, state.values[givenIdx] === 9 ? 8 : 9)).toBe(state);

    const emptyIdx = state.values.indexOf(0);
    const er = Math.floor(emptyIdx / 9);
    const ec = emptyIdx % 9;
    const once = applyMove(state, er, ec, 3);
    expect(applyMove(once, er, ec, 3)).toBe(once); // 同值重填
  });

  it('非法坐标/值 throw，不静默', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 13 });
    expect(() => applyMove(state, -1, 0, 5)).toThrow();
    expect(() => applyMove(state, 0, 9, 5)).toThrow();
    expect(() => applyMove(state, 9, 0, 5)).toThrow();
    expect(() => applyMove(state, 0.5, 0, 5)).toThrow();
    expect(() => applyMove(state, 0, 0, 0)).toThrow();
    expect(() => applyMove(state, 0, 0, 10)).toThrow();
    expect(() => applyMove(state, 0, 0, 2.5)).toThrow();
    expect(() => applyMove(state, 0, 0, '5' as unknown as number)).toThrow();
  });
});

describe('clearCell', () => {
  it('玩家格：数字与 notes 一并清除；原 state 不变', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 14 });
    const emptyIdx = state.values.indexOf(0);
    const r = Math.floor(emptyIdx / 9);
    const c = emptyIdx % 9;
    const filled = applyMove(state, r, c, 6);
    const noted = toggleNote(filled, r, c, 2); // 已填格 → no-op，先清再标
    const cleared = clearCell(noted, r, c);
    // noted 与 filled 同值（toggleNote no-op 返回原引用），clear 后验证干净
    expect(cleared.values[emptyIdx]).toBe(0);
    expect(cleared.notes[emptyIdx]).toBe(0);
    expect(state.values[emptyIdx]).toBe(0);
  });

  it('空格上加 notes 后 clear：notes 同步清空', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 15 });
    const emptyIdx = state.values.indexOf(0);
    const r = Math.floor(emptyIdx / 9);
    const c = emptyIdx % 9;
    const noted = toggleNote(state, r, c, 9);
    expect(noted.notes[emptyIdx]).not.toBe(0);
    const cleared = clearCell(noted, r, c);
    expect(cleared.notes[emptyIdx]).toBe(0);
  });

  it('givens 格 / 已空格 no-op 原引用；越界 throw', () => {
    const { state, givens } = newGame({ difficulty: 'easy', seed: 16 });
    const givenIdx = givens.indexOf(true);
    expect(clearCell(state, Math.floor(givenIdx / 9), givenIdx % 9)).toBe(state);
    const emptyIdx = state.values.indexOf(0);
    expect(clearCell(state, Math.floor(emptyIdx / 9), emptyIdx % 9)).toBe(state);
    expect(() => clearCell(state, 9, 0)).toThrow();
  });
});

describe('toggleNote', () => {
  it('空格可多 bit 并存，重复 toggle 翻转', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 17 });
    const emptyIdx = state.values.indexOf(0);
    const r = Math.floor(emptyIdx / 9);
    const c = emptyIdx % 9;
    const n1 = toggleNote(state, r, c, 3);
    const n2 = toggleNote(n1, r, c, 5);
    expect(n2.notes[emptyIdx]).toBe((1 << 2) | (1 << 4));
    const n3 = toggleNote(n2, r, c, 3);
    expect(n3.notes[emptyIdx]).toBe(1 << 4);
    const n4 = toggleNote(n3, r, c, 5);
    expect(n4.notes[emptyIdx]).toBe(0);
    expect(state.notes[emptyIdx]).toBe(0); // 不可变
  });

  it('givens 格 / 已填格 no-op 原引用；非法值 throw', () => {
    const { state, givens } = newGame({ difficulty: 'easy', seed: 18 });
    const givenIdx = givens.indexOf(true);
    expect(toggleNote(state, Math.floor(givenIdx / 9), givenIdx % 9, 1)).toBe(state);
    const emptyIdx = state.values.indexOf(0);
    const er = Math.floor(emptyIdx / 9);
    const ec = emptyIdx % 9;
    const filled = applyMove(state, er, ec, 4);
    expect(toggleNote(filled, er, ec, 1)).toBe(filled);
    expect(() => toggleNote(state, er, ec, 0)).toThrow();
    expect(() => toggleNote(state, er, ec, -3)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getCandidates
// ---------------------------------------------------------------------------

describe('getCandidates', () => {
  it('按行/列/宫排除；升序；空盘全 1-9', () => {
    const grid = rows(
      '.1...5...',
      '..5......',
      '.........',
      '.........',
      '.........',
      '5........',
      '.........',
      '.........',
      '.........',
    );
    const state = stateFrom(grid);
    // r0c0：行含 {1,5}、宫含 {5}、列含 {5} → 排除 {1,5}
    expect(getCandidates(state, 0, 0)).toEqual([2, 3, 4, 6, 7, 8, 9]);
    // 空盘任意格 → 1-9
    expect(getCandidates(stateFrom(new Array<number>(81).fill(0)), 4, 4)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('已填格返回 []；越界/非法 state throw', () => {
    const { state, givens } = newGame({ difficulty: 'easy', seed: 19 });
    const givenIdx = givens.indexOf(true);
    expect(getCandidates(state, Math.floor(givenIdx / 9), givenIdx % 9)).toEqual([]);
    expect(() => getCandidates(state, -1, 0)).toThrow();
    expect(() => getCandidates(state, 0, 9)).toThrow();
    expect(() => getCandidates(null as unknown as GameState, 0, 0)).toThrow();
    expect(() => getCandidates(state, 0, 0)).not.toThrow();
  });

  it('与独立实现的掩码逻辑一致（抽样校验）', () => {
    const { state } = newGame({ difficulty: 'hard', seed: 8 });
    for (let idx = 0; idx < 81; idx += 7) {
      if (state.values[idx] !== 0) continue; // 已填格约定返回 []，不参与抽样比对
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      const expected: number[] = [];
      for (let v = 1; v <= 9; v++) {
        let ok = true;
        for (let k = 0; k < 9; k++) {
          if (state.values[r * 9 + k] === v || state.values[k * 9 + c] === v) ok = false;
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            if (state.values[(br + dr) * 9 + bc + dc] === v) ok = false;
          }
        }
        if (ok) expected.push(v);
      }
      expect(getCandidates(state, r, c)).toEqual(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// checkErrors / isSolved
// ---------------------------------------------------------------------------

describe('checkErrors', () => {
  it('合法盘面（含挖洞题面）→ []', () => {
    const { state } = newGame({ difficulty: 'medium', seed: 21 });
    expect(checkErrors(state)).toEqual([]);
  });

  it('行冲突双方都被标记；三重冲突全标；升序 idx', () => {
    const pair = rows(
      '5....5...',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    );
    expect(checkErrors(stateFrom(pair))).toEqual([0, 5]);

    const triple = rows(
      '1.1.1....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    );
    expect(checkErrors(stateFrom(triple))).toEqual([0, 2, 4]);
  });

  it('列/宫冲突；行+列+宫交叉冲突全部列入', () => {
    // idx0/idx1 宫+行冲突；idx9 与 idx0 列+宫冲突
    const cross = rows(
      '55.......',
      '5........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    );
    expect(checkErrors(stateFrom(cross))).toEqual([0, 1, 9]);

    // 列冲突：r0c0=3, r8c0=3
    const colPair = rows(
      '3........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '3........',
    );
    expect(checkErrors(stateFrom(colPair))).toEqual([0, 72]);
  });

  it('notes 不参与冲突判定；非法 state throw', () => {
    const grid = rows(
      '5........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....5....',
    );
    const state = stateFrom(grid);
    const noted = toggleNote(state, 0, 8, 5); // 与 idx0 同行但只是笔记
    expect(checkErrors(noted)).toEqual([]);
    expect(() => checkErrors({ values: [] } as unknown as GameState)).toThrow();
  });
});

describe('isSolved', () => {
  it('完整合法解 → true；挖洞题面/空盘 → false', () => {
    const { solution, state } = newGame({ difficulty: 'easy', seed: 22 });
    expect(isSolved(stateFrom(solution))).toBe(true);
    expect(isSolved(state)).toBe(false);
    expect(isSolved(stateFrom(new Array<number>(81).fill(0)))).toBe(false);
  });

  it('满盘但含冲突 → false', () => {
    const { solution } = newGame({ difficulty: 'easy', seed: 23 });
    const broken = solution.slice();
    const t = broken[0];
    broken[0] = broken[1];
    broken[1] = t;
    expect(isSolved(stateFrom(broken))).toBe(false);
  });

  it('非法 state throw', () => {
    expect(() => isSolved(undefined as unknown as GameState)).toThrow();
    expect(() => isSolved({ values: new Array(81).fill(0) } as unknown as GameState)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('newGame 初始 state roundtrip 等值（含 seed 与 seed=null 两种）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const seeded = newGame({ difficulty, seed: 99 });
      expect(deserialize(serialize(seeded.state))).toEqual(seeded.state);

      const random = newGame({ difficulty });
      expect(random.state.seed).toBeNull();
      expect(deserialize(serialize(random.state))).toEqual(random.state);
    }
  });

  it('进行中盘面（落子+notes）roundtrip 等值', () => {
    const { state, givens } = newGame({ difficulty: 'hard', seed: 31 });
    let s = state;
    let placed = 0;
    for (let i = 0; i < 81 && placed < 6; i++) {
      if (!givens[i] && s.values[i] === 0) {
        s = applyMove(s, Math.floor(i / 9), i % 9, ((i % 9) + 1) as number);
        placed++;
      }
    }
    const emptyIdx = s.values.indexOf(0);
    s = toggleNote(s, Math.floor(emptyIdx / 9), emptyIdx % 9, 2);
    s = toggleNote(s, Math.floor(emptyIdx / 9), emptyIdx % 9, 7);
    expect(placed).toBe(6);
    expect(s.notes[emptyIdx]).not.toBe(0);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('serialize 输出紧凑且不含 solution 痕迹', () => {
    const { state } = newGame({ difficulty: 'expert', seed: 41 });
    const s = serialize(state);
    expect(s.length).toBeLessThan(220); // 6 段：头+难度+seed+21hex+81 值+notes
    expect(s.startsWith('sudoku1;expert;41;')).toBe(true);
    // 题面非空格才出现在 values 段，solution 的独有数字不应可复原（防翻答案：不含 solution 字段）
    expect(s.indexOf('solution')).toBe(-1);
  });

  it('损坏/伪造存档一律 null，绝不抛', () => {
    const good = serialize(newGame({ difficulty: 'easy', seed: 51 }).state);
    const goodSegs = good.split(';');

    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize('sudoku1;easy')).toBeNull();
    expect(deserialize('sudoku2;' + goodSegs.slice(1).join(';'))).toBeNull();
    expect(deserialize(good.replace('easy', 'daily'))).toBeNull();

    // hex 段长度错 / 补位 bit 置 1（21 字符 hex 尾字符低 3 bit）
    expect(deserialize('sudoku1;easy;1;0;0;0')).toBeNull();
    const badTail = goodSegs.slice();
    badTail[3] = 'f' + goodSegs[3].slice(1);
    expect(deserialize(badTail.join(';'))).toBeNull();

    // values 段长度/字符非法
    const badLen = goodSegs.slice();
    badLen[4] = goodSegs[4].slice(0, 80);
    expect(deserialize(badLen.join(';'))).toBeNull();
    const badChar = goodSegs.slice();
    badChar[4] = 'a' + goodSegs[4].slice(1);
    expect(deserialize(badChar.join(';'))).toBeNull();

    // givens 格值为空
    const badGiven = goodSegs.slice();
    badGiven[3] = '8' + goodSegs[3].slice(1);
    badGiven[4] = '0' + goodSegs[4].slice(1);
    expect(deserialize(badGiven.join(';'))).toBeNull();

    // notes 重复条目 / 非法 mask
    const dupNotes = goodSegs.slice();
    dupNotes[5] = '0.1,0.2';
    expect(deserialize(dupNotes.join(';'))).toBeNull();
    const badMask = goodSegs.slice();
    badMask[5] = '0.zz';
    expect(deserialize(badMask.join(';'))).toBeNull();

    // seed 越界 / 非 string 输入
    const badSeed = goodSegs.slice();
    badSeed[2] = '4294967296';
    expect(deserialize(badSeed.join(';'))).toBeNull();
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize({} as unknown as string)).toBeNull();
  });

  it('手动构造的最小合法存档可解析', () => {
    const manual = 'sudoku1;easy;-;' + '0'.repeat(21) + ';' + '0'.repeat(81) + ';-';
    const parsed = deserialize(manual);
    expect(parsed).not.toBeNull();
    expect(parsed?.difficulty).toBe('easy');
    expect(parsed?.seed).toBeNull();
    expect(parsed?.values).toEqual(new Array<number>(81).fill(0));
  });
});
