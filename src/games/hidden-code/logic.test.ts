/**
 * hidden-code/logic 单测（契约 §5 + 任务书验收标准 3）。
 * 纯 Node 环境（vitest），无 DOM。
 *
 * 符号索引约定（与 render 的字符表对应）：A=0 B=1 C=2 D=3 E=4 F=5。
 */

import { describe, it, expect } from 'vitest';
import { createRng } from '../_engine/rng';
import {
  DIFFICULTY_SPECS,
  clearSlot,
  computeFeedback,
  deserialize,
  fillSymbol,
  isLost,
  isOver,
  isWon,
  newGame,
  serialize,
  submitGuess,
  type Difficulty,
  type GameState,
} from './logic';
import { createState } from '../_engine/state';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 用固定码构造最小合法 GameState（history 空、current 全空） */
function stateWithSolution(difficulty: Difficulty, solution: number[]): GameState {
  const spec = DIFFICULTY_SPECS[difficulty];
  expect(solution.length).toBe(spec.codeLength);
  const current: number[] = [];
  for (let i = 0; i < spec.codeLength; i++) current.push(-1);
  return { difficulty, seed: 1, solution, history: [], current };
}

/** 从头填满当前行（逐槽 fillSymbol，模拟玩家输入路径） */
function fillRow(state: GameState, syms: number[]): GameState {
  let s = state;
  for (let i = 0; i < syms.length; i++) {
    s = fillSymbol(s, i, syms[i]);
  }
  return s;
}

/** 提交一条猜测并返回新 state（须已填满，否则原样返回） */
function guessOnce(state: GameState, syms: number[]): GameState {
  return submitGuess(fillRow(state, syms));
}

/**
 * 暴力反馈实现（与被测实现独立的第二遍交叉验证）：
 * exact = 同位相等数；partial = 去掉 exact 后按符号多重集交集计数。
 */
function bruteFeedback(solution: number[], guess: number[]): { exact: number; partial: number } {
  let exact = 0;
  const pool: number[] = [];
  const tried: number[] = [];
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] === guess[i]) exact++;
    else {
      pool.push(solution[i]);
      tried.push(guess[i]);
    }
  }
  let partial = 0;
  const used = new Array<boolean>(tried.length).fill(false);
  for (const sym of pool) {
    for (let j = 0; j < tried.length; j++) {
      if (!used[j] && tried[j] === sym) {
        used[j] = true;
        partial++;
        break;
      }
    }
  }
  return { exact, partial };
}

// ---------------------------------------------------------------------------
// computeFeedback —— 经典计数语义（任务书钉死 case）
// ---------------------------------------------------------------------------

describe('computeFeedback', () => {
  it('钉死 case：码 [A,A,B,B] 猜 [A,B,B,A] → exact 2 / partial 2（位置匹配先消耗）', () => {
    // 位 0 (A=A) 与位 2 (B=B) exact；剩余 solution [A,B] vs guess [B,A] → partial 2
    expect(computeFeedback([0, 0, 1, 1], [0, 1, 1, 0])).toEqual({ exact: 2, partial: 2 });
  });

  it('基础：全对 / 全错 / 全位置错', () => {
    expect(computeFeedback([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, partial: 0 });
    expect(computeFeedback([0, 1, 2, 3], [4, 4, 4, 4])).toEqual({ exact: 0, partial: 0 });
    expect(computeFeedback([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ exact: 0, partial: 4 });
    expect(computeFeedback([0, 0, 1, 1], [1, 1, 0, 0])).toEqual({ exact: 0, partial: 4 });
  });

  it('重复符号计数坑：exact 额度先消耗，剩余才算 partial', () => {
    // 码 [A,A,A,B] 猜 [A,C,C,C]：位 0 exact；码剩 [A,A,B]，猜剩 [C,C,C] → partial 0
    expect(computeFeedback([0, 0, 0, 1], [0, 2, 2, 2])).toEqual({ exact: 1, partial: 0 });
    // 码 [A,B,A,B] 猜 [A,C,C,C]：exact 1；码剩 [B,A,B] 猜剩 [C,C,C] → partial 0
    expect(computeFeedback([0, 1, 0, 1], [0, 2, 2, 2])).toEqual({ exact: 1, partial: 0 });
    // 码 [A,A,B,B] 猜 [A,A,1?,..] 同位同符 3 个：第 4 位 C 不在码中
    expect(computeFeedback([0, 0, 1, 1], [0, 0, 1, 2])).toEqual({ exact: 3, partial: 0 });
    // 码 [A,B,C,D] 猜 [A,B,B,B]：exact 2（A,B）；码剩 [C,D]，猜剩 [B,B] → partial 0
    expect(computeFeedback([0, 1, 2, 3], [0, 1, 1, 1])).toEqual({ exact: 2, partial: 0 });
    // 码 [A,A,B,C] 猜 [A,B,A,D]：exact 1；码剩 [A,B,C]，猜剩 [B,A,D] → partial 2
    expect(computeFeedback([0, 0, 1, 2], [0, 1, 0, 3])).toEqual({ exact: 1, partial: 2 });
  });

  it('hard 5 位码', () => {
    expect(computeFeedback([0, 1, 2, 3, 4], [4, 3, 2, 1, 0])).toEqual({ exact: 1, partial: 4 });
    expect(computeFeedback([0, 0, 0, 0, 1], [0, 0, 0, 1, 1])).toEqual({ exact: 4, partial: 0 });
    // 位 3 (0 vs 1) 不匹配：码剩 [0]，猜剩 [1] → partial 0
  });

  it('与独立暴力实现交叉验证（rng 生成 600 组，含重复符号域 2/5/6）', () => {
    const rng = createRng(20260927);
    for (let round = 0; round < 3; round++) {
      const domain = [2, 5, 6][round];
      for (let t = 0; t < 200; t++) {
        const len = 4 + (t % 2); // 4 与 5 交替
        const solution: number[] = [];
        const guess: number[] = [];
        for (let i = 0; i < len; i++) {
          solution.push(rng.int(domain));
          guess.push(rng.int(domain));
        }
        expect(computeFeedback(solution, guess)).toEqual(bruteFeedback(solution, guess));
      }
    }
  });

  it('非法输入 throw（长度不匹配 / 符号越界 / 非数组）', () => {
    expect(() => computeFeedback([0, 1, 2], [0, 1, 2, 3])).toThrow();
    expect(() => computeFeedback([0, 1, 2, 3], [0, 1, 2])).toThrow();
    expect(() => computeFeedback([0, 1, 2, 6], [0, 1, 2, 3])).toThrow(); // 符号域上限 6（0-5）
    expect(() => computeFeedback([0, 1, 2, 3], [0, 1, 2, -1])).toThrow();
    expect(() => computeFeedback([0, 1, 2, 3], [0, 1, 2, 1.5])).toThrow();
    expect(() => computeFeedback([0, 1, 2, 3], [0, 1, 2, '3' as unknown as number])).toThrow();
    expect(() => computeFeedback(null as unknown as number[], [0, 1, 2, 3])).toThrow();
    expect(() => computeFeedback([], [])).toThrow(); // 空码属编程错误
    expect(() => computeFeedback(new Array(9).fill(0), new Array(9).fill(0))).toThrow(); // 超上界
  });
});

// ---------------------------------------------------------------------------
// newGame —— 生成器（长度/符号域/轮数；随机只走 rng）
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('难度参数钉死：easy 4位/5符号/10轮、medium 4位/6符号/8轮、hard 5位/6符号/10轮', () => {
    expect(DIFFICULTY_SPECS.easy).toEqual({ codeLength: 4, symbolCount: 5, maxRounds: 10 });
    expect(DIFFICULTY_SPECS.medium).toEqual({ codeLength: 4, symbolCount: 6, maxRounds: 8 });
    expect(DIFFICULTY_SPECS.hard).toEqual({ codeLength: 5, symbolCount: 6, maxRounds: 10 });
  });

  it('每难度 × 20 种子：solution 长度与符号域正确、state 初始形状正确', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const spec = DIFFICULTY_SPECS[difficulty];
      for (const seed of SEEDS) {
        const { solution, state } = newGame({ difficulty, seed });
        expect(solution.length).toBe(spec.codeLength);
        for (let i = 0; i < solution.length; i++) {
          expect(solution[i]).toBeGreaterThanOrEqual(0);
          expect(solution[i]).toBeLessThan(spec.symbolCount);
        }
        expect(state.difficulty).toBe(difficulty);
        expect(state.seed).toBe(seed);
        expect(state.solution).toEqual(solution);
        expect(state.history).toEqual([]);
        expect(state.current.length).toBe(spec.codeLength);
        for (let i = 0; i < spec.codeLength; i++) expect(state.current[i]).toBe(-1);
        expect(isWon(state)).toBe(false);
        expect(isLost(state)).toBe(false);
      }
    }
  });

  it('随机只来自注入的 rng：手动重放 createRng(seed).int(symbolCount) 序列与生成码一致', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const spec = DIFFICULTY_SPECS[difficulty];
      for (const seed of [7, 42, 4294967295]) {
        const { solution } = newGame({ difficulty, seed });
        const rng = createRng(seed);
        for (let i = 0; i < spec.codeLength; i++) {
          expect(solution[i]).toBe(rng.int(spec.symbolCount));
        }
      }
    }
  });

  it('同 seed 同码（存档恢复重建 solution 的正确性基础）；不同 seed 产出不同码（抽样）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const a = newGame({ difficulty, seed: 42 });
      const b = newGame({ difficulty, seed: 42 });
      expect(a.solution).toEqual(b.solution);
      expect(a.state).toEqual(b.state);
    }
    // easy 域 5^4=625 种码，20 个固定种子两两不同的概率极高；只抽验相邻对防脆弱
    for (const difficulty of ALL_DIFFICULTIES) {
      const x = newGame({ difficulty, seed: 1 }).solution;
      const y = newGame({ difficulty, seed: 2 }).solution;
      expect(x).not.toEqual(y);
    }
  });

  it('不传 seed：state.seed 记录实际种子（uint32），serialize/deserialize 可恢复', () => {
    const { state } = newGame({ difficulty: 'medium' });
    expect(state.seed).toBeGreaterThanOrEqual(0);
    expect(state.seed).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(state.seed)).toBe(true);
    expect(deserialize(serialize(state))).toEqual(state);
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
// fillSymbol / clearSlot —— 当前行输入
// ---------------------------------------------------------------------------

describe('fillSymbol / clearSlot', () => {
  it('填入与清除：写入正确、不可变（原 state 不变）', () => {
    const base = stateWithSolution('easy', [0, 1, 2, 3]);
    const filled = fillSymbol(base, 0, 4);
    expect(filled).not.toBe(base);
    expect(filled.current[0]).toBe(4);
    expect(base.current[0]).toBe(-1); // 不可变
    const cleared = clearSlot(filled, 0);
    expect(cleared.current[0]).toBe(-1);
    expect(filled.current[0]).toBe(4); // 不可变
  });

  it('no-op 返回原引用：同符号重填 / 清空槽 / 越难度符号域 throw', () => {
    const base = stateWithSolution('easy', [0, 1, 2, 3]); // symbolCount=5
    const filled = fillSymbol(base, 1, 3);
    expect(fillSymbol(filled, 1, 3)).toBe(filled); // 同符号重填
    expect(clearSlot(filled, 2)).toBe(filled); // 空槽清除
    expect(() => fillSymbol(base, 0, 5)).toThrow(); // 5 超出 easy 域（0-4）
    expect(() => fillSymbol(base, 0, 5 - 1)).not.toThrow(); // 4 在域内
    expect(() => fillSymbol(base, 4, 0)).toThrow(); // slot 越界（codeLength=4）
    expect(() => fillSymbol(base, -1, 0)).toThrow();
    expect(() => fillSymbol(base, 0, -1)).toThrow();
    expect(() => fillSymbol(base, 1.5, 0)).toThrow();
    expect(() => clearSlot(base, 4)).toThrow();
    // hard 域 6：slot 4 合法
    const hard = stateWithSolution('hard', [0, 1, 2, 3, 4]);
    expect(() => fillSymbol(hard, 4, 5)).not.toThrow();
  });

  it('终局后输入一律 no-op（原引用）', () => {
    let s = stateWithSolution('easy', [0, 1, 2, 3]);
    s = guessOnce(s, [0, 1, 2, 3]); // 猜中 → won
    expect(isWon(s)).toBe(true);
    expect(fillSymbol(s, 0, 4)).toBe(s);
    expect(clearSlot(s, 0)).toBe(s);
    expect(submitGuess(s)).toBe(s);
  });

  it('非法 state throw（形状/长度/域校验）', () => {
    expect(() => fillSymbol(null as unknown as GameState, 0, 0)).toThrow();
    expect(() => fillSymbol({ difficulty: 'easy' } as unknown as GameState, 0, 0)).toThrow();
    const badSolution = stateWithSolution('easy', [0, 1, 2, 5]); // easy 域外符号
    expect(() => fillSymbol(badSolution, 0, 0)).toThrow();
    const badSeed = { ...stateWithSolution('easy', [0, 1, 2, 3]), seed: -2 } as GameState;
    expect(() => fillSymbol(badSeed, 0, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// submitGuess —— 猜测提交状态转移
// ---------------------------------------------------------------------------

describe('submitGuess', () => {
  it('未填满 no-op（原引用）：全空 / 部分填充', () => {
    const base = stateWithSolution('medium', [0, 1, 2, 3]);
    expect(submitGuess(base)).toBe(base);
    const partial = fillRow(base, [5, 4]);
    expect(submitGuess(partial)).toBe(partial);
  });

  it('填满提交：history 追加正确反馈、current 清空、原 state 不变', () => {
    const base = stateWithSolution('easy', [0, 0, 1, 1]);
    const submitted = guessOnce(base, [0, 1, 1, 0]);
    expect(submitted).not.toBe(base);
    expect(submitted.history.length).toBe(1);
    expect(submitted.history[0].guess).toEqual([0, 1, 1, 0]);
    expect(submitted.history[0].exact).toBe(2); // 钉死 case 的反馈在线上路径同样成立
    expect(submitted.history[0].partial).toBe(2);
    for (let i = 0; i < 4; i++) expect(submitted.current[i]).toBe(-1);
    expect(base.history).toEqual([]); // 不可变
  });

  it('历史行锁定：提交后 history 条目不随后续输入变化', () => {
    let s = stateWithSolution('easy', [0, 1, 2, 3]);
    s = guessOnce(s, [0, 1, 4, 4]);
    const firstEntry = s.history[0];
    s = fillRow(s, [3, 3, 3, 3]);
    expect(s.history[0]).toBe(firstEntry); // 同一引用，未被触碰
    expect(s.history[0].guess).toEqual([0, 1, 4, 4]);
    const s2 = submitGuess(s);
    expect(s2.history.length).toBe(2);
    expect(s2.history[0]).toBe(firstEntry);
    expect(firstEntry.guess).toEqual([0, 1, 4, 4]); // 旧条目内容不变
  });

  it('连续提交多条：反馈逐条对照 computeFeedback', () => {
    let s = stateWithSolution('hard', [5, 5, 0, 0, 2]);
    const guesses = [
      [0, 1, 2, 3, 4],
      [5, 5, 5, 5, 5],
      [2, 0, 5, 0, 5],
    ];
    for (const g of guesses) {
      s = guessOnce(s, g);
      const fb = computeFeedback([5, 5, 0, 0, 2], g);
      const last = s.history[s.history.length - 1];
      expect(last.exact).toBe(fb.exact);
      expect(last.partial).toBe(fb.partial);
    }
    expect(s.history.length).toBe(3);
  });

  it('easy 域外符号的猜测经 fillSymbol 不可达（render 层不生成，logic 层 submit 自身防御）', () => {
    // 直接构造非法 current（sym=5 在 easy 域外）——submitGuess 经 assertStateShape throw
    const bad = stateWithSolution('easy', [0, 1, 2, 3]);
    expect(() => submitGuess({ ...bad, current: [5, 5, 5, 5] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 撤销当前行（render 层语义的 logic 侧钉死：undo 栈只含未提交输入）
// ---------------------------------------------------------------------------

describe('撤销当前行', () => {
  it('machine.undo 逐格退当前行输入；提交后重建 machine → canUndo false（历史行不可撤）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 61 });
    let machine = createState<GameState>(state);

    // render 层每次输入 commit 一次（inputSymbol → commitIfChanged）→ undo 粒度 = 单格
    const inputs = [0, 1, 2, 3];
    for (let i = 0; i < inputs.length; i++) {
      machine.commit(fillSymbol(machine.get(), i, inputs[i]));
    }
    expect(machine.get().current).toEqual([0, 1, 2, 3]);
    machine.undo();
    expect(machine.get().current).toEqual([0, 1, 2, -1]);
    machine.undo();
    expect(machine.get().current).toEqual([0, 1, -1, -1]);

    // 填满并提交：render 层此刻以提交态重建 machine（undo 栈清零）
    machine.commit(fillRow(machine.get(), [0, 1, 2, 3]));
    const submitted = submitGuess(machine.get());
    expect(submitted).not.toBe(machine.get());
    machine = createState<GameState>(submitted); // 重建：历史行锁定
    expect(machine.canUndo()).toBe(false);
    expect(machine.undo()).toBeNull();
    expect(machine.get().history.length).toBe(1); // 提交结果不受 undo 影响
  });

  it('clearSlot 链可将当前行清回全空（撤销路径的 logic 载体）', () => {
    let s = stateWithSolution('medium', [0, 1, 2, 3]);
    s = fillRow(s, [5, 4, 3, 2]);
    for (let i = 3; i >= 0; i--) s = clearSlot(s, i);
    expect(s.current).toEqual([-1, -1, -1, -1]);
    expect(s.history).toEqual([]);
  });

  it('no-op 输入不入 undo 栈（commitIfChanged 语义）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 62 });
    const machine = createState<GameState>(state);
    machine.commit(fillSymbol(machine.get(), 0, 2));
    expect(machine.canUndo()).toBe(true);
    const same = fillSymbol(machine.get(), 0, 2); // 同符号重填 → 原引用
    expect(same).toBe(machine.get());
    expect(machine.undoDepth()).toBe(1); // 未额外入栈
  });
});

// ---------------------------------------------------------------------------
// 胜负判定
// ---------------------------------------------------------------------------

describe('isWon / isLost / isOver', () => {
  it('破译：最后一条 exact = codeLength → won', () => {
    let s = stateWithSolution('easy', [0, 1, 2, 3]);
    s = guessOnce(s, [0, 1, 4, 4]); // 未中
    expect(isWon(s)).toBe(false);
    expect(isOver(s)).toBe(false);
    s = guessOnce(s, [0, 1, 2, 3]); // 猜中
    expect(isWon(s)).toBe(true);
    expect(isLost(s)).toBe(false);
    expect(isOver(s)).toBe(true);
  });

  it('轮次耗尽未破译 → lost；最后一轮恰好破译 → won（非 lost）', () => {
    // medium：maxRounds 8
    let s = stateWithSolution('medium', [5, 5, 5, 5]);
    for (let r = 0; r < 7; r++) {
      s = guessOnce(s, [0, 0, 0, 0]);
    }
    expect(isOver(s)).toBe(false); // 7/8 轮用尽但还有机会
    expect(isLost(s)).toBe(false);
    s = guessOnce(s, [0, 0, 0, 0]); // 第 8 轮仍未中
    expect(isLost(s)).toBe(true);
    expect(isWon(s)).toBe(false);
    expect(isOver(s)).toBe(true);

    // 重来：第 8 轮恰好猜中
    let w = stateWithSolution('medium', [5, 5, 5, 5]);
    for (let r = 0; r < 7; r++) {
      w = guessOnce(w, [0, 0, 0, 0]);
    }
    w = guessOnce(w, [5, 5, 5, 5]);
    expect(isWon(w)).toBe(true);
    expect(isLost(w)).toBe(false); // 胜负互斥：最后一击优先于轮次耗尽
    expect(isOver(w)).toBe(true);
  });

  it('空历史 / 进行中：全 false', () => {
    const base = stateWithSolution('hard', [0, 1, 2, 3, 4]);
    expect(isWon(base)).toBe(false);
    expect(isLost(base)).toBe(false);
    expect(isOver(base)).toBe(false);
    const mid = guessOnce(base, [0, 1, 2, 3, 4]);
    // hard 猜中即 won——换一个不中的
    const mid2 = guessOnce(base, [1, 1, 1, 1, 1]);
    expect(isOver(mid)).toBe(true);
    expect(isOver(mid2)).toBe(false);
  });

  it('非法 state throw', () => {
    expect(() => isWon(undefined as unknown as GameState)).toThrow();
    expect(() => isLost({ difficulty: 'easy' } as unknown as GameState)).toThrow();
    const badHistory = stateWithSolution('easy', [0, 1, 2, 3]);
    expect(() => isWon({ ...badHistory, history: null as unknown as GameState['history'] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('初始 / 进行中 / 终局（won 与 lost）roundtrip 等值（含 solution 经 seed 重建）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const { state } = newGame({ difficulty, seed: 99 });
      expect(deserialize(serialize(state))).toEqual(state); // 初始

      // 进行中：2 条历史 + 当前行部分填充
      const spec = DIFFICULTY_SPECS[difficulty];
      let mid = state;
      mid = submitGuess(fillRow(mid, [0, 0, 0, 0, 0].slice(0, spec.codeLength)));
      mid = submitGuess(fillRow(mid, [1, 1, 1, 1, 1].slice(0, spec.codeLength)));
      mid = fillSymbol(mid, 0, 2);
      mid = fillSymbol(mid, 2, 4);
      expect(mid.history.length).toBe(2);
      expect(deserialize(serialize(mid))).toEqual(mid);

      // 终局 won：以 solution 本身作为最后一击
      let won = mid;
      won = clearSlot(won, 0);
      won = clearSlot(won, 2);
      won = submitGuess(fillRow(won, won.solution.slice()));
      expect(isWon(won)).toBe(true);
      expect(deserialize(serialize(won))).toEqual(won);
    }

    // 终局 lost：easy 用 10 轮全错的局（固定猜测 [4,4,4,4]，撞码则顺延换 seed）
    let lostSeed = 5;
    let lost = newGame({ difficulty: 'easy', seed: lostSeed }).state;
    while (lost.solution.join(',') === '4,4,4,4') {
      lostSeed++;
      lost = newGame({ difficulty: 'easy', seed: lostSeed }).state;
    }
    const wrong = [4, 4, 4, 4];
    for (let r = 0; r < DIFFICULTY_SPECS.easy.maxRounds; r++) {
      lost = guessOnce(lost, wrong);
    }
    expect(isLost(lost)).toBe(true);
    expect(deserialize(serialize(lost))).toEqual(lost);
  });

  it('serialize 输出紧凑、格式钉死、不含 solution 痕迹（决策⑤）', () => {
    const { state } = newGame({ difficulty: 'medium', seed: 41 });
    let s = submitGuess(fillRow(state, [0, 1, 2, 3]));
    s = fillSymbol(s, 0, 5);
    const str = serialize(s);
    const segs = str.split(';');
    expect(segs.length).toBe(5);
    expect(segs[0]).toBe('hc1');
    expect(segs[1]).toBe('medium');
    expect(segs[2]).toBe('41');
    expect(segs[3]).toBe('0123');
    expect(segs[4]).toBe('5...');
    expect(str.indexOf('solution')).toBe(-1);
    expect(str.length).toBeLessThan(120);
    // solution 数字串本身不出现（0123 是猜测，非答案；答案在码里由 seed 重建）
    const solStr = state.solution.join('');
    expect(str.indexOf(solStr)).toBe(-1);
  });

  it('同 state serialize 输出确定；进行中的局不含 exact/partial 字段（反馈由重算得出）', () => {
    const { state } = newGame({ difficulty: 'hard', seed: 77 });
    const s = guessOnce(state, [0, 1, 2, 3, 4]);
    expect(serialize(s)).toBe(serialize(s));
    expect(serialize(s).indexOf('exact')).toBe(-1);
    expect(serialize(s).indexOf('partial')).toBe(-1);
  });

  it('损坏/伪造存档一律 null，绝不抛', () => {
    const good = serialize(newGame({ difficulty: 'easy', seed: 51 }).state);
    const goodSegs = good.split(';'); // hc1;easy;51;-;....

    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize('hc1')).toBeNull();
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize({} as unknown as string)).toBeNull();

    // 段数错 / 头错 / 难度错 / seed 非数字或越界
    expect(deserialize('hc1;easy;51;-')).toBeNull();
    expect(deserialize('hc2;easy;51;-;....')).toBeNull();
    expect(deserialize('hc1;expert;51;-;....')).toBeNull();
    expect(deserialize('hc1;easy;x;-;....')).toBeNull();
    expect(deserialize('hc1;easy;4294967296;-;....')).toBeNull();
    expect(deserialize('hc1;easy;-1;-;....')).toBeNull();

    // 历史条目：长度错 / 符号越域（easy 域 0-4，'5' 非法）/ 条目数超上限
    expect(deserialize('hc1;easy;51;012;....')).toBeNull();
    expect(deserialize('hc1;easy;51;01235;....')).toBeNull();
    expect(deserialize('hc1;medium;51;55555,4444,3333;....')).toBeNull(); // 长度按 medium=4 校验
    const overflowStr: string[] = [];
    for (let i = 0; i < 11; i++) overflowStr.push('0123');
    expect(deserialize('hc1;easy;51;' + overflowStr.join(',') + ';....')).toBeNull();

    // 当前行：长度错 / 非法字符
    expect(deserialize('hc1;easy;51;-;...')).toBeNull();
    expect(deserialize('hc1;easy;51;-;....x')).toBeNull();
    expect(deserialize('hc1;easy;51;-;...5')).toBeNull(); // 5 超 easy 域

    // 篡改 seed → solution 变化 → 历史反馈重算后胜局语义仍需自洽；
    // 胜局后不得再有条目 / 胜局后 current 必须为空（防伪造）
    const { state } = newGame({ difficulty: 'easy', seed: 51 });
    const win = state.solution.slice();
    const winStr = win.join('');
    expect(deserialize('hc1;easy;51;' + winStr + ',0123;....')).toBeNull(); // 胜后再猜
    expect(deserialize('hc1;easy;51;' + winStr + ';12..')).toBeNull(); // 胜后有未提交输入
    // 胜局条目必须在最后一条（此处只有它自己 → 合法）
    const wonRaw = deserialize('hc1;easy;51;' + winStr + ';....');
    expect(wonRaw).not.toBeNull();
    expect(isWon(wonRaw as GameState)).toBe(true);
  });

  it('伪造反馈不可达：存档不含 exact/partial，deserialize 重算（篡改历史重算后果自担）', () => {
    // 历史条目本身可被篡改（存档不含反馈），但恢复后的 exact/partial 一定等于
    // 按 seed 重建的 solution 的真实反馈——玩家改档只能改「猜过什么」，改不了「对错」
    const { state } = newGame({ difficulty: 'easy', seed: 88 });
    const raw = 'hc1;easy;88;0123;....';
    const parsed = deserialize(raw);
    expect(parsed).not.toBeNull();
    const fb = computeFeedback(state.solution, [0, 1, 2, 3]);
    expect((parsed as GameState).history[0].exact).toBe(fb.exact);
    expect((parsed as GameState).history[0].partial).toBe(fb.partial);
  });

  it('手动构造的最小合法存档可解析', () => {
    const parsed = deserialize('hc1;hard;0;-;.....');
    expect(parsed).not.toBeNull();
    expect(parsed?.difficulty).toBe('hard');
    expect(parsed?.history).toEqual([]);
    expect(parsed?.current).toEqual([-1, -1, -1, -1, -1]);
    expect(parsed?.solution).toEqual(newGame({ difficulty: 'hard', seed: 0 }).solution);
  });

  it('serialize 非法 state throw（编程错误契约）', () => {
    expect(() => serialize(null as unknown as GameState)).toThrow();
    const bad = stateWithSolution('easy', [0, 1, 2, 3]);
    expect(() => serialize({ ...bad, current: [9, 9, 9, 9] })).toThrow(); // 域外符号
    expect(() => serialize({ ...bad, difficulty: 'nope' as Difficulty })).toThrow();
  });
});
