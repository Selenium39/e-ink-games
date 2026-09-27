/**
 * nonogram/logic 单测（契约 §5 + 任务书验收标准）。
 * 纯 Node 环境（vitest），无 DOM。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  cluesFor,
  lineSolve,
  cycleCell,
  setCell,
  lineStatus,
  isSolved,
  serialize,
  deserialize,
} from './logic';
import type { Clues, Difficulty, GameState } from './logic';
import { seedFromDate } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const SIZES: Record<Difficulty, number> = { easy: 5, medium: 10, hard: 15 };

/** 填充率宽容界：生成器目标 ~55%；easy 5×5 小盘方差大（19/25=0.76 正常） */
const DENSITY_LO = 0.35;
const DENSITY_HI = 0.8;

function expectSolvable(size: number, clues: Clues, solution: boolean[]): void {
  const board = lineSolve(size, clues);
  expect(board).not.toBeNull();
  let determined = 0;
  for (let i = 0; i < board!.length; i++) {
    expect(board![i]).not.toBe(-1); // line-solvable：纯行列推理可全解
    if (board![i] === 1) {
      expect(solution[i]).toBe(true); // 推理结果与题底一致
      determined++;
    } else {
      expect(solution[i]).toBe(false);
    }
  }
  expect(determined).toBe(solution.filter(Boolean).length);
}

/** 以 marks=solution 填充构造"已完成" state */
function solvedStateFrom(res: ReturnType<typeof newGame>): GameState {
  const marks = res.solution.map((v) => (v ? 1 : 0));
  return { ...res.state, marks: marks as GameState['marks'] };
}

// ---------------------------------------------------------------------------
// newGame：确定性 / 可解性不变量 / 密度
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('每难度 × 20 固定种子：尺寸正确、线索自洽、全部 line-solvable、填充率 ~55%', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const res = newGame({ difficulty, seed });
        const size = SIZES[difficulty];

        // 尺寸与形状
        expect(res.state.size).toBe(size);
        expect(res.solution.length).toBe(size * size);
        expect(res.state.marks.length).toBe(size * size);
        expect(res.clues.rows.length).toBe(size);
        expect(res.clues.cols.length).toBe(size);

        // 线索由题底计算而来（往返一致）
        expect(res.clues).toEqual(cluesFor(res.solution, size));

        // 可解性不变量：line solver 全盘可解且与题底一致
        expectSolvable(size, res.clues, res.solution);

        // 填充率 ~55%（宽容界，条纹兜底除外——兜底 50% 也在界内）
        const density = res.solution.filter(Boolean).length / (size * size);
        expect(density).toBeGreaterThanOrEqual(DENSITY_LO);
        expect(density).toBeLessThanOrEqual(DENSITY_HI);

        // 初始 state：全空标记 + seed 透传
        expect(res.state.marks.every((m) => m === 0)).toBe(true);
        expect(res.state.seed).toBe(seed);
        expect(isSolved(res.state)).toBe(false);
      }
    }
  });

  it('同 seed 同谜题（含重试路径的确定性）；不同 seed 产出不同题', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const a = newGame({ difficulty, seed: 42 });
      const b = newGame({ difficulty, seed: 42 });
      expect(a.solution).toEqual(b.solution);
      expect(a.clues).toEqual(b.clues);
      expect(a.state).toEqual(b.state);

      // 多次调用依然稳定（生成器无隐藏状态）
      const c = newGame({ difficulty, seed: 42 });
      expect(c.state).toEqual(a.state);
    }
    // 不同 seed 产出不同题（至少行提示序列不同）
    const x = newGame({ difficulty: 'hard', seed: 1 });
    const y = newGame({ difficulty: 'hard', seed: 2 });
    expect(x.clues).not.toEqual(y.clues);

    // 扫描一批 seed：同难度下不同 seed 的题两两不同（哈希对比抽查）
    const seen: string[] = [];
    for (let seed = 100; seed < 112; seed++) {
      const res = newGame({ difficulty: 'medium', seed });
      seen.push(JSON.stringify(res.clues));
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('seedFromDate 每日一题：同一天多设备同题，不同日期不同题', () => {
    const d1 = new Date(Date.UTC(2026, 8, 27)); // 2026-09-27
    const d1b = new Date(Date.UTC(2026, 8, 27, 23, 30)); // 同日晚些时候（UTC）
    const d2 = new Date(Date.UTC(2026, 8, 28));
    const a = newGame({ difficulty: 'medium', seed: seedFromDate(d1) });
    const b = newGame({ difficulty: 'medium', seed: seedFromDate(d1b) });
    const c = newGame({ difficulty: 'medium', seed: seedFromDate(d2) });
    expect(a.state).toEqual(b.state);
    expect(a.clues).not.toEqual(c.clues);
  });

  it('未传 seed → state.seed = null（随机组局），盘面仍合法可解', () => {
    const res = newGame({ difficulty: 'medium' });
    expect(res.state.seed).toBeNull();
    expectSolvable(res.state.size, res.clues, res.solution);
  });

  it('非法参数 throw（编程错误契约）', () => {
    expect(() => newGame({ difficulty: 'impossible' as Difficulty })).toThrow();
    expect(() => newGame(null as unknown as { difficulty: Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: -1 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 1.5 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 4294967296 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: '7' as unknown as number })).toThrow();
  });

  it('生成耗时：各难度单次 < 1000ms 预算（目标远低于此；真机按 ~30 倍预留）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const times: number[] = [];
      for (const seed of SEEDS) {
        const t0 = Date.now();
        newGame({ difficulty, seed });
        times.push(Date.now() - t0);
      }
      const max = Math.max.apply(null, times);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      // 供任务报告引用实测数据
      console.log('[perf] %s x%d seeds avg=%sms max=%sms all=%j', difficulty, times.length, avg.toFixed(1), max, times);
      expect(max).toBeLessThan(1000);
    }
  });
});

// ---------------------------------------------------------------------------
// cluesFor：行列提示计算正确性
// ---------------------------------------------------------------------------

describe('cluesFor', () => {
  /** 手造 5×5 图案（'.' 空 '#' 填） */
  function pattern5(rows: string[]): boolean[] {
    expect(rows.length).toBe(5);
    const out: boolean[] = [];
    for (const row of rows) {
      expect(row.length).toBe(5);
      for (const ch of row) out.push(ch === '#');
    }
    return out;
  }

  it('经典图案：十字 + 全空行/列 + 长短段混合', () => {
    //   .#.#.   r0: c1、c3 填 → [1,1]
    //   ..#..   r1: [1]
    //   #####   r2: [5]
    //   ..#..   r3: [1]
    //   .#.#.   r4: [1,1]
    // 列：c0 仅 r2 → [1]；c1 = r0,r2,r4 → [1,1,1]；c2 = r1..r3 → [3]；
    //    c3 = r0,r2,r4 → [1,1,1]；c4 仅 r2 → [1]
    const pattern = pattern5(['.#.#.', '..#..', '#####', '..#..', '.#.#.']);
    const clues = cluesFor(pattern, 5);
    expect(clues.rows).toEqual([[1, 1], [1], [5], [1], [1, 1]]);
    expect(clues.cols).toEqual([[1], [1, 1, 1], [3], [1, 1, 1], [1]]);
  });

  it('全空图案 → 全部空线索；全满 → [size]', () => {
    const empty = cluesFor(new Array<boolean>(25).fill(false), 5);
    expect(empty.rows.every((c) => c.length === 0)).toBe(true);
    expect(empty.cols.every((c) => c.length === 0)).toBe(true);

    const full = cluesFor(new Array<boolean>(25).fill(true), 5);
    expect(full.rows.every((c) => c.length === 1 && c[0] === 5)).toBe(true);
  });

  it('10×10 与 15×15 的行/列独立正确性（逐线与暴力 run-length 对比）', () => {
    for (const size of [10, 15]) {
      const res = newGame({ difficulty: size === 10 ? 'medium' : 'hard', seed: 7 });
      // 行
      for (let r = 0; r < size; r++) {
        const expectRuns: number[] = [];
        let run = 0;
        for (let c = 0; c < size; c++) {
          if (res.solution[r * size + c]) run++;
          else if (run > 0) { expectRuns.push(run); run = 0; }
        }
        if (run > 0) expectRuns.push(run);
        expect(res.clues.rows[r]).toEqual(expectRuns);
      }
      // 列
      for (let c = 0; c < size; c++) {
        const expectRuns: number[] = [];
        let run = 0;
        for (let r = 0; r < size; r++) {
          if (res.solution[r * size + c]) run++;
          else if (run > 0) { expectRuns.push(run); run = 0; }
        }
        if (run > 0) expectRuns.push(run);
        expect(res.clues.cols[c]).toEqual(expectRuns);
      }
    }
  });

  it('非法输入 throw（长度不符 / size 越界）', () => {
    expect(() => cluesFor(new Array<boolean>(24).fill(true), 5)).toThrow();
    expect(() => cluesFor(new Array<boolean>(26).fill(true), 5)).toThrow();
    expect(() => cluesFor(new Array<boolean>(5).fill(true), 2)).toThrow();
    expect(() => cluesFor([], 0)).toThrow();
    expect(() => cluesFor([], 33)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// lineSolve：可解性判定核心
// ---------------------------------------------------------------------------

describe('lineSolve', () => {
  it('唯一解谜题：全盘确定且等于题底（批量 30 局）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (let seed = 200; seed < 210; seed++) {
        const res = newGame({ difficulty, seed });
        const board = lineSolve(res.state.size, res.clues);
        expect(board).not.toBeNull();
        for (let i = 0; i < board!.length; i++) {
          expect(board![i]).toBe(res.solution[i] ? 1 : 0);
        }
      }
    }
  });

  it('矛盾线索 → null（shape 合法但行列表述冲突）', () => {
    // 每行 [5] = 全填，但每列线索为空 = 全空——两条表述无共同解
    const clues: Clues = {
      rows: [[5], [5], [5], [5], [5]],
      cols: [[], [], [], [], []],
    };
    expect(lineSolve(5, clues)).toBeNull();
  });

  it('多解线索 → 存在未知格（不动点提前到达）', () => {
    // 全空线索 → 立即全确定（全空盘）；构造一个结构上多解的轻线索盘：
    // 单格 [1] 在 5×5：每行每列信息不足以确定位置
    const clues: Clues = {
      rows: [[1], [1], [1], [1], [1]],
      cols: [[1], [1], [1], [1], [1]],
    };
    const board = lineSolve(5, clues);
    expect(board).not.toBeNull();
    let unknowns = 0;
    for (let i = 0; i < 25; i++) if (board![i] === -1) unknowns++;
    expect(unknowns).toBeGreaterThan(0); // 非 line-solvable（存在 5! 排列）
  });

  it('形状非法 throw', () => {
    expect(() => lineSolve(5, { rows: [[], []], cols: [] } as unknown as Clues)).toThrow();
    expect(() => lineSolve(5, { rows: [], cols: [] } as unknown as Clues)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// cycleCell / setCell：格三态转移
// ---------------------------------------------------------------------------

describe('cycleCell', () => {
  it('三态循环 空(0)→填充(1)→排除(2)→空(0)；不可变（原 state 不变）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 3 });
    const s1 = cycleCell(state, 0, 0);
    expect(s1.marks[0]).toBe(1);
    expect(s1).not.toBe(state);
    expect(state.marks[0]).toBe(0); // 原 state 不变

    const s2 = cycleCell(s1, 0, 0);
    expect(s2.marks[0]).toBe(2);
    const s3 = cycleCell(s2, 0, 0);
    expect(s3.marks[0]).toBe(0);
    expect(state.marks[0]).toBe(0); // 整链走完原 state 仍未被改
  });

  it('clues/size/seed/difficulty 引用透传，仅 marks 变化', () => {
    const { state } = newGame({ difficulty: 'hard', seed: 4 });
    const next = cycleCell(state, 7, 9);
    expect(next.clues).toBe(state.clues);
    expect(next.size).toBe(state.size);
    expect(next.seed).toBe(state.seed);
    expect(next.marks[7 * 15 + 9]).toBe(1);
  });

  it('越界坐标 throw，不静默', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 5 });
    expect(() => cycleCell(state, -1, 0)).toThrow();
    expect(() => cycleCell(state, 0, 5)).toThrow();
    expect(() => cycleCell(state, 5, 0)).toThrow();
    expect(() => cycleCell(state, 0.5, 0)).toThrow();
    expect(() => cycleCell(null as unknown as GameState, 0, 0)).toThrow();
    expect(() => cycleCell({ marks: [] } as unknown as GameState, 0, 0)).toThrow();
  });
});

describe('setCell', () => {
  it('直接设置目标态；设为当前值返回原引用（no-op）', () => {
    const { state } = newGame({ difficulty: 'medium', seed: 6 });
    const s1 = setCell(state, 3, 4, 2);
    expect(s1.marks[3 * 10 + 4]).toBe(2);
    expect(setCell(s1, 3, 4, 2)).toBe(s1); // 幂等
    const s2 = setCell(s1, 3, 4, 0);
    expect(s2.marks[3 * 10 + 4]).toBe(0);
    expect(setCell(state, 0, 0, 0)).toBe(state); // 初始全 0，设 0 = no-op
  });

  it('非法 mark / 越界 throw', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 7 });
    expect(() => setCell(state, 0, 0, 3 as unknown as 0)).toThrow();
    expect(() => setCell(state, 0, 0, -1 as unknown as 0)).toThrow();
    expect(() => setCell(state, 0, 0, 1.5 as unknown as 0)).toThrow();
    expect(() => setCell(state, 0, 99, 1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// lineStatus / isSolved：完成判定（clues 满足性语义）
// ---------------------------------------------------------------------------

describe('isSolved / lineStatus', () => {
  it('完成局（marks=题底）→ isSolved true 且所有行列完成', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const res = newGame({ difficulty, seed: 8 });
      const done = solvedStateFrom(res);
      expect(isSolved(done)).toBe(true);
      const st = lineStatus(done);
      expect(st.rows.every(Boolean)).toBe(true);
      expect(st.cols.every(Boolean)).toBe(true);
    }
  });

  it('进行中盘面：部分行列完成、其余未完成', () => {
    const res = newGame({ difficulty: 'easy', seed: 9 });
    const size = 5;
    // 找一个非空线索行填满（空线索行天然"完成"，不作为断言对象）
    let target = -1;
    for (let r = 0; r < size && target === -1; r++) {
      if (res.clues.rows[r].length > 0) target = r;
    }
    expect(target).toBeGreaterThanOrEqual(0);
    const marks = new Array<number>(25).fill(0);
    for (let c = 0; c < size; c++) marks[target * size + c] = res.solution[target * size + c] ? 1 : 0;
    const state: GameState = { ...res.state, marks: marks as GameState['marks'] };
    const st = lineStatus(state);
    expect(st.rows[target]).toBe(true);
    // 其余非空线索行必未完成（只填了一行）
    for (let r = 0; r < size; r++) {
      if (r !== target && res.clues.rows[r].length > 0) expect(st.rows[r]).toBe(false);
    }
    // 列完成的唯一可能是整列恰好无填充且线索为空——只填 target 行时
    // 该行各列至少影响含线索的列；统一断言 isSolved false（整体未完成）
    expect(isSolved(state)).toBe(false);
  });

  it('经典规则：错误不即时提示——错填盘面 isSolved false；排除标记 × 不参与判定', () => {
    const res = newGame({ difficulty: 'easy', seed: 10 });
    // 全填错（把题底所有空格填上、填充格留空）→ 一定不 isSolved
    const wrong = new Array<number>(25).fill(0);
    for (let i = 0; i < 25; i++) wrong[i] = res.solution[i] ? 0 : 1;
    expect(isSolved({ ...res.state, marks: wrong as GameState['marks'] })).toBe(false);

    // 完成盘上把若干填充格换成排除标记 ×（填充集合仍满足全部提示？不——
    // 换成 × 会使该格退出填充集合，行 runs 变化 → 不完成。正确语义：
    // × 是"排除"标记，玩家用它排除空格；完成态 = 填充集合恰好满足提示。
    // 构造真实场景：题底空格全标 ×，填充格全填 → 完成（× 不影响判定）
    const done = solvedStateFrom(res);
    for (let i = 0; i < 25; i++) {
      if (!res.solution[i]) done.marks[i] = 2; // 空格标排除
    }
    expect(isSolved(done)).toBe(true); // × 标记不破坏完成判定
  });

  it('与题底不同但满足全部提示的盘面：唯一解下不存在（构造性验证）', () => {
    // 唯一解谜题的完成判定等价于「填充集合 = 题底」：对每局把一个填充格
    // 挪到同行另一空位，行 runs 大概率改变 → isSolved false（若 runs 恰好
    // 不变，列提示也会暴露）
    const res = newGame({ difficulty: 'easy', seed: 11 });
    const marks = solvedStateFrom(res).marks.slice();
    // 找一个填充格和一个空格（同行）
    outer:
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const idx = r * 5 + c;
        if (marks[idx] === 1) {
          for (let c2 = 0; c2 < 5; c2++) {
            const j = r * 5 + c2;
            if (marks[j] === 0 || marks[j] === 2) {
              marks[idx] = 0;
              marks[j] = 1;
              break outer;
            }
          }
        }
      }
    }
    expect(isSolved({ ...res.state, marks: marks as GameState['marks'] })).toBe(false);
  });

  it('非法 state throw（marks 长度/值域、size 不符）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 12 });
    expect(() => isSolved({ ...state, marks: new Array(24).fill(0) as never })).toThrow();
    const badVal = state.marks.slice();
    badVal[0] = 7 as unknown as 0;
    expect(() => isSolved({ ...state, marks: badVal as never })).toThrow();
    expect(() => isSolved({ ...state, size: 4 } as unknown as GameState)).toThrow();
    expect(() => isSolved({ ...state, difficulty: 'expert' as Difficulty })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('newGame 初始 state roundtrip 等值（各难度、seed 与 seed=null 两种）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const seeded = newGame({ difficulty, seed: 99 });
      expect(deserialize(serialize(seeded.state))).toEqual(seeded.state);
      const random = newGame({ difficulty });
      expect(random.state.seed).toBeNull();
      expect(deserialize(serialize(random.state))).toEqual(random.state);
    }
  });

  it('进行中盘面（三态混合）roundtrip 等值；紧凑且不含 solution 痕迹', () => {
    const res = newGame({ difficulty: 'hard', seed: 31 });
    const size = 15;
    const marks = res.state.marks.slice();
    // 依题底一半填充、一部分空格标 ×、其余留空
    for (let i = 0; i < size * size; i++) {
      if (i % 3 === 0 && res.solution[i]) marks[i] = 1;
      else if (i % 3 === 1 && !res.solution[i]) marks[i] = 2;
    }
    const state: GameState = { ...res.state, marks: marks as GameState['marks'] };
    const s = serialize(state);
    expect(deserialize(s)).toEqual(state);
    expect(s.indexOf('solution')).toBe(-1); // 不含题底（防翻答案，决策⑤）
    expect(s.length).toBeLessThan(700); // 紧凑（hard 15×15 全档 ~500 字符）
    expect(s.startsWith('nono1;hard;31;')).toBe(true);
  });

  it('空线索行以空串段编码、run>9 以 base36 编码（10-15 → a-f）', () => {
    // 全满 15×15：每行 [15] → base36 'f'
    const full = new Array<boolean>(225).fill(true);
    const clues = cluesFor(full, 15);
    const state: GameState = {
      difficulty: 'hard',
      seed: null,
      size: 15,
      clues,
      marks: new Array(225).fill(0) as GameState['marks'],
    };
    const s = serialize(state);
    const segs = s.split(';');
    expect(segs[3]).toBe('f.f.f.f.f.f.f.f.f.f.f.f.f.f.f');
    expect(deserialize(s)).toEqual(state);

    // 全空：线索为空串（run 0 不会出现；空线显示 '0' 是 render 层职责）
    const emptyClues = cluesFor(new Array<boolean>(25).fill(false), 5);
    const emptyState: GameState = {
      difficulty: 'easy',
      seed: null,
      size: 5,
      clues: emptyClues,
      marks: new Array(25).fill(0) as GameState['marks'],
    };
    const s2 = serialize(emptyState);
    const segs2 = s2.split(';');
    expect(segs2[3]).toBe('....');
    expect(deserialize(s2)).toBeNull(); // 全空线索谜题被拒绝（空图案无意义）
  });

  it('损坏/伪造存档一律 null，绝不抛', () => {
    const good = serialize(newGame({ difficulty: 'medium', seed: 51 }).state);
    const goodSegs = good.split(';');

    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize('nono1;medium')).toBeNull();
    expect(deserialize('nono2;' + goodSegs.slice(1).join(';'))).toBeNull();
    expect(deserialize(good.replace('medium', 'impossible'))).toBeNull();

    // 段数错（clues 缺一段）
    expect(deserialize(goodSegs.slice(0, 5).join(';'))).toBeNull();

    // seed 越界 / 非数字
    const badSeed = goodSegs.slice();
    badSeed[2] = '4294967296';
    expect(deserialize(badSeed.join(';'))).toBeNull();

    // clues 值越界（0 / 超 size）与结构破坏（线数不符）
    const badClue = goodSegs.slice();
    badClue[3] = '0.' + badClue[3].split('.').slice(1).join('.');
    expect(deserialize(badClue.join(';'))).toBeNull();
    const badLines = goodSegs.slice();
    badLines[3] = badLines[3].split('.').slice(1).join('.');
    expect(deserialize(badLines.join(';'))).toBeNull();

    // 段和+间隙超长（[6,6] 在 10 格线放不下）
    const over = goodSegs.slice();
    over[3] = '66.' + over[3].split('.').slice(1).join('.');
    expect(deserialize(over.join(';'))).toBeNull();

    // marks 长度/字符非法
    const badMarks = goodSegs.slice();
    badMarks[5] = badMarks[5].slice(0, 99);
    expect(deserialize(badMarks.join(';'))).toBeNull();
    const badChar = goodSegs.slice();
    badChar[5] = '3' + badChar[5].slice(1);
    expect(deserialize(badChar.join(';'))).toBeNull();

    // 非 string 输入
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize({} as unknown as string)).toBeNull();
    expect(deserialize(123 as unknown as string)).toBeNull();
  });

  it('serialize 对非法 state throw（编程错误）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 61 });
    expect(() => serialize({ ...state, marks: new Array(24).fill(0) as never })).toThrow();
    const badVal = state.marks.slice();
    badVal[3] = 5 as unknown as 0;
    expect(() => serialize({ ...state, marks: badVal as never })).toThrow();
    expect(() => serialize(null as unknown as GameState)).toThrow();
  });
});
