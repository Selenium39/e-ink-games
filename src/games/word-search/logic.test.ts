/**
 * word-search/logic 单测（任务书验收标准 3）。
 * 纯 Node 环境（vitest），无 DOM。
 *
 * 覆盖：网格生成不变量（词按声称位置存在、无覆盖冲突、剩余格为字母）、
 * 同 rng 序列确定性、选词判定（8 方向共线 + 长度匹配、非共线拒绝、
 * 已找到词重复判定 no-op）、胜负判定、serialize/deserialize 往返、非法输入 throw。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  trySelect,
  isSolved,
  serialize,
  deserialize,
  readSegment,
  listThemes,
  themeWordsOf,
} from './logic';
import type { Difficulty, GameState, NewGameResult, Placement } from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 任务规格：easy 10×10 藏 6 / medium 12×12 藏 8 / hard 14×14 藏 10 */
const EXPECT: Record<Difficulty, { size: number; count: number }> = {
  easy: { size: 10, count: 6 },
  medium: { size: 12, count: 8 },
  hard: { size: 14, count: 10 },
};

/** placement 终点坐标 */
function endOf(p: Placement): { r: number; c: number } {
  return { r: p.row + p.dr * (p.word.length - 1), c: p.col + p.dc * (p.word.length - 1) };
}

/** 串（或其反向）是否是 state 词单中的词 */
function isWordInList(s: GameState, seg: string): boolean {
  let rev = '';
  for (let i = seg.length - 1; i >= 0; i--) rev += seg.charAt(i);
  return s.words.indexOf(seg) !== -1 || s.words.indexOf(rev) !== -1;
}

/**
 * 核心不变量断言：对一局 newGame 产物做全量校验。
 * ——词按声称位置存在（含「无覆盖冲突」：共享格必同字母，否则重放必失败）
 */
function expectValidPuzzle(res: NewGameResult, difficulty: Difficulty): void {
  const { size, count } = EXPECT[difficulty];
  const s = res.state;

  // 形状与难度参数
  expect(s.size).toBe(size);
  expect(s.theme).toBe(res.theme);
  expect(listThemes().indexOf(s.theme)).toBeGreaterThanOrEqual(0);
  expect(s.words.length).toBe(count);
  expect(res.placements.length).toBe(count);
  expect(s.difficulty).toBe(difficulty);

  // 词全部来自所选主题词单
  const pool = themeWordsOf(s.theme);
  expect(pool).not.toBeNull();
  for (const w of s.words) {
    expect((pool as string[]).indexOf(w)).toBeGreaterThanOrEqual(0);
    expect(w.length).toBeGreaterThanOrEqual(3);
    expect(w.length).toBeLessThanOrEqual(10);
    expect(/^[A-Z]+$/.test(w)).toBe(true);
  }

  // placements 与 words 一一对应（同序）
  for (let i = 0; i < count; i++) {
    expect(res.placements[i].word).toBe(s.words[i]);
  }

  // 每词按声称位置可从网格读出（越界/错位即 readSegment throw 或串不等）
  for (const p of res.placements) {
    expect(readSegment(s, p.row, p.col, p.dr, p.dc, p.word.length)).toBe(p.word);
    const end = endOf(p);
    expect(end.r).toBeGreaterThanOrEqual(0);
    expect(end.r).toBeLessThan(size);
    expect(end.c).toBeGreaterThanOrEqual(0);
    expect(end.c).toBeLessThan(size);
  }

  // 无覆盖冲突：重放全部放置，共享格字母必须一致
  const rebuild = new Array<string>(size * size).fill('');
  for (const p of res.placements) {
    for (let k = 0; k < p.word.length; k++) {
      const idx = (p.row + p.dr * k) * size + (p.col + p.dc * k);
      const ch = p.word.charAt(k);
      if (rebuild[idx] === '') rebuild[idx] = ch;
      else expect(rebuild[idx]).toBe(ch); // 覆盖冲突 = 失败
    }
  }

  // 剩余格为字母：全部格均为单个 A-Z（charCode 65-90）
  expect(s.grid.length).toBe(size * size);
  for (let i = 0; i < s.grid.length; i++) {
    const code = s.grid[i].charCodeAt(0);
    expect(code).toBeGreaterThanOrEqual(65);
    expect(code).toBeLessThanOrEqual(90);
  }

  // 初始进度
  expect(s.found.length).toBe(count);
  expect(s.found.every((f) => f === false)).toBe(true);
  expect(s.foundCells.length).toBe(size * size);
  expect(s.foundCells.every((f) => f === false)).toBe(true);
  expect(isSolved(s)).toBe(false);
}

// ---------------------------------------------------------------------------
// newGame：网格生成不变量
// ---------------------------------------------------------------------------

describe('newGame 生成不变量', () => {
  it('每难度 × 20 固定种子：形状、词单来源、位置正确、无覆盖冲突、剩余格为字母', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS) {
        expectValidPuzzle(newGame({ difficulty, seed }), difficulty);
      }
    }
  });

  it('词以 8 方向放置（抽样扫描应见多方向使用）', () => {
    const dirSeen = new Set<string>();
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 10)) {
        const res = newGame({ difficulty, seed });
        for (const p of res.placements) dirSeen.add(p.dr + ',' + p.dc);
      }
    }
    // 20+ 局 × 6-10 词，8 方向应全部出现过（生成器按 rng.int(8) 均匀选向）
    expect(dirSeen.size).toBe(8);
  });

  it('存在交叉共享字母的局（抽查存在性，佐证共享规则被行使）', () => {
    let shared = 0;
    for (const seed of SEEDS) {
      const res = newGame({ difficulty: 'hard', seed });
      const size = res.state.size;
      const rebuild = new Array<string>(size * size).fill('');
      for (const p of res.placements) {
        for (let k = 0; k < p.word.length; k++) {
          const idx = (p.row + p.dr * k) * size + (p.col + p.dc * k);
          if (rebuild[idx] !== '') shared++; // 共享格
          rebuild[idx] = p.word.charAt(k);
        }
      }
    }
    // 20 届 hard（14×14 藏 10 词）共享格总数应显著 > 0
    expect(shared).toBeGreaterThan(0);
  });

  it('未传 seed → state.seed = null（随机组局），盘面不变量仍成立', () => {
    const res = newGame({ difficulty: 'medium' });
    expect(res.state.seed).toBeNull();
    expectValidPuzzle(res, 'medium');
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
// 确定性（同 rng 序列同题）
// ---------------------------------------------------------------------------

describe('确定性', () => {
  it('同 seed 同盘面（state/placements/theme 全等）；不同 seed 盘面不同', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const a = newGame({ difficulty, seed: 42 });
      const b = newGame({ difficulty, seed: 42 });
      expect(a.state).toEqual(b.state);
      expect(a.placements).toEqual(b.placements);
      expect(a.theme).toBe(b.theme);

      const c = newGame({ difficulty, seed: 43 });
      expect(c.state.grid).not.toEqual(a.state.grid);
    }
  });

  it('生成耗时：hard × 20 seeds 单次 < 1000ms', () => {
    const times: number[] = [];
    for (const seed of SEEDS) {
      const t0 = Date.now();
      newGame({ difficulty: 'hard', seed });
      times.push(Date.now() - t0);
    }
    const max = Math.max.apply(null, times);
    const avg = times.reduce((x, y) => x + y, 0) / times.length;
    console.log('[perf] hard x20 seeds avg=%sms max=%sms', avg.toFixed(1), max);
    expect(max).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// 选词判定
// ---------------------------------------------------------------------------

describe('trySelect', () => {
  it('8 方向：每个 placement 以首尾两点判定均命中（正向端点与反向端点皆可）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 5)) {
        const res = newGame({ difficulty, seed });
        const s = res.state;
        let cur = s;
        for (const p of res.placements) {
          const end = endOf(p);
          // 正向（词首 → 词尾）
          const hit1 = trySelect(cur, p.row, p.col, end.r, end.c);
          expect(hit1).not.toBe(cur);
          expect(hit1.found[s.words.indexOf(p.word)]).toBe(true);
          cur = hit1;
        }
        // 全部正向命中后已胜
        expect(isSolved(cur)).toBe(true);

        // 独立局验证「反向端点」命中：逐词用 尾→首 判定
        const res2 = newGame({ difficulty, seed });
        let cur2 = res2.state;
        for (const p of res2.placements) {
          const end = endOf(p);
          const hit = trySelect(cur2, end.r, end.c, p.row, p.col);
          expect(hit).not.toBe(cur2);
          cur2 = hit;
        }
        expect(isSolved(cur2)).toBe(true);
      }
    }
  });

  it('foundCells 覆盖线段全部格', () => {
    const res = newGame({ difficulty: 'easy', seed: 7 });
    const p = res.placements[0];
    const end = endOf(p);
    const next = trySelect(res.state, p.row, p.col, end.r, end.c);
    for (let k = 0; k < p.word.length; k++) {
      const idx = (p.row + p.dr * k) * res.state.size + (p.col + p.dc * k);
      expect(next.foundCells[idx]).toBe(true);
    }
  });

  it('非共线两点拒绝（返回原引用）', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 3 });
    expect(trySelect(state, 0, 0, 1, 2)).toBe(state); // dr=1, dc=2
    expect(trySelect(state, 5, 5, 3, 6)).toBe(state); // dr=-2, dc=1
    expect(trySelect(state, 2, 2, 2, 2)).toBe(state); // 同格
  });

  it('共线 + 长度匹配但串不匹配 → no-op', () => {
    const { state } = newGame({ difficulty: 'medium', seed: 11 });
    let checked = 0;
    // 扫描水平线段：长度与某词等长、内容却不拼出任何词 → 必须拒绝
    for (let len = 3; len <= 10 && checked < 3; len++) {
      const hasWordOfLen = state.words.some((w) => w.length === len);
      if (!hasWordOfLen) continue;
      for (let r = 0; r < state.size && checked < 3; r++) {
        for (let c = 0; c + len - 1 < state.size && checked < 3; c++) {
          const seg = readSegment(state, r, c, 0, 1, len);
          if (!isWordInList(state, seg)) {
            expect(trySelect(state, r, c, r, c + len - 1)).toBe(state);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('已找到的词重复判定 no-op（返回原引用）', () => {
    const res = newGame({ difficulty: 'hard', seed: 5 });
    const p = res.placements[0];
    const end = endOf(p);
    const hit = trySelect(res.state, p.row, p.col, end.r, end.c);
    expect(hit).not.toBe(res.state);
    // 同两点再次判定：no-op
    expect(trySelect(hit, p.row, p.col, end.r, end.c)).toBe(hit);
    // 反向两点再次判定：同样 no-op（词已找到）
    expect(trySelect(hit, end.r, end.c, p.row, p.col)).toBe(hit);
  });

  it('命中后其余状态字段不变（不可变转移）', () => {
    const res = newGame({ difficulty: 'easy', seed: 13 });
    const before = serialize(res.state);
    const p = res.placements[1];
    const end = endOf(p);
    const next = trySelect(res.state, p.row, p.col, end.r, end.c);
    expect(next.grid).toBe(res.state.grid); // 未动的数组保持同一引用
    expect(next.words).toBe(res.state.words);
    expect(next.size).toBe(res.state.size);
    expect(next.theme).toBe(res.state.theme);
    expect(serialize(res.state)).toBe(before); // 原 state 未被改写
  });

  it('非法坐标/非法 state throw，不静默', () => {
    const { state } = newGame({ difficulty: 'easy', seed: 17 });
    expect(() => trySelect(state, -1, 0, 0, 0)).toThrow();
    expect(() => trySelect(state, 0, 0, state.size, 0)).toThrow();
    expect(() => trySelect(state, 0.5, 0, 1, 0)).toThrow();
    expect(() => trySelect(null as unknown as GameState, 0, 0, 1, 1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 胜负判定
// ---------------------------------------------------------------------------

describe('isSolved', () => {
  it('初始 false；逐词全部找到后 true', () => {
    const res = newGame({ difficulty: 'hard', seed: 19 });
    let cur = res.state;
    expect(isSolved(cur)).toBe(false);
    for (const p of res.placements) {
      const end = endOf(p);
      cur = trySelect(cur, p.row, p.col, end.r, end.c);
    }
    expect(isSolved(cur)).toBe(true);
    expect(cur.found.every((f) => f === true)).toBe(true);
  });

  it('差一词不算胜', () => {
    const res = newGame({ difficulty: 'easy', seed: 21 });
    let cur = res.state;
    for (let i = 0; i < res.placements.length - 1; i++) {
      const p = res.placements[i];
      const end = endOf(p);
      cur = trySelect(cur, p.row, p.col, end.r, end.c);
    }
    expect(isSolved(cur)).toBe(false);
  });

  it('非法 state throw', () => {
    expect(() => isSolved(undefined as unknown as GameState)).toThrow();
    expect(() => isSolved({ size: 10 } as unknown as GameState)).toThrow();
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

  it('进行中盘面（部分词已找到）roundtrip 等值', () => {
    const res = newGame({ difficulty: 'medium', seed: 31 });
    let cur = res.state;
    for (let i = 0; i < 3; i++) {
      const p = res.placements[i];
      const end = endOf(p);
      cur = trySelect(cur, p.row, p.col, end.r, end.c);
    }
    expect(cur.found.filter(Boolean).length).toBe(3);
    expect(deserialize(serialize(cur))).toEqual(cur);
  });

  it('serialize 紧凑且不含 placements 痕迹（防翻档，决策⑤）', () => {
    const { state } = newGame({ difficulty: 'hard', seed: 41 });
    const s = serialize(state);
    expect(s.length).toBeLessThan(500);
    expect(s.startsWith('ws1;hard;41;14;')).toBe(true);
    // placements（词的位置/方向）不在存档：仅词面与网格字母，无 row/col/dir 结构
    const segs = s.split(';');
    expect(segs.length).toBe(9);
    expect(/^(?:[A-Z]+,)*[A-Z]+$/.test(segs[6])).toBe(true);
    expect(/^[01]+$/.test(segs[7])).toBe(true);
    expect(/^[0-9a-f]+$/.test(segs[8])).toBe(true);
  });

  it('损坏/伪造存档一律 null，绝不抛', () => {
    const good = serialize(newGame({ difficulty: 'easy', seed: 51 }).state);
    const segs = good.split(';');

    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize('ws1;easy')).toBeNull();
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize({} as unknown as string)).toBeNull();

    // 头版本 / 段数错
    expect(deserialize('ws2' + good.slice(3))).toBeNull();
    expect(deserialize(segs.slice(0, 8).join(';'))).toBeNull();

    // 难度词表
    const badDiff = segs.slice();
    badDiff[1] = 'impossible';
    expect(deserialize(badDiff.join(';'))).toBeNull();

    // seed 越界 / 非数字
    const badSeed = segs.slice();
    badSeed[2] = '4294967296';
    expect(deserialize(badSeed.join(';'))).toBeNull();
    const badSeed2 = segs.slice();
    badSeed2[2] = 'abc';
    expect(deserialize(badSeed2.join(';'))).toBeNull();

    // size 与难度不匹配
    const badSize = segs.slice();
    badSize[3] = '14';
    expect(deserialize(badSize.join(';'))).toBeNull();

    // 主题不在名单
    const badTheme = segs.slice();
    badTheme[4] = 'Nope';
    expect(deserialize(badTheme.join(';'))).toBeNull();

    // grid 长度错 / 非大写字母
    const badGridLen = segs.slice();
    badGridLen[5] = badGridLen[5].slice(0, -1);
    expect(deserialize(badGridLen.join(';'))).toBeNull();
    const badGridChar = segs.slice();
    badGridChar[5] = 'a' + badGridChar[5].slice(1);
    expect(deserialize(badGridChar.join(';'))).toBeNull();

    // words 空 / 小写 / 重复 / 超上限
    const emptyWords = segs.slice();
    emptyWords[6] = '';
    expect(deserialize(emptyWords.join(';'))).toBeNull();
    const lowerWord = segs.slice();
    lowerWord[6] = lowerWord[6].toLowerCase();
    expect(deserialize(lowerWord.join(';'))).toBeNull();
    const dupWords = segs.slice();
    dupWords[6] = 'CAT,CAT,DOG,BEE,FOX,OWL';
    dupWords[7] = '000000';
    expect(deserialize(dupWords.join(';'))).toBeNull();
    const tooMany = segs.slice();
    tooMany[6] = 'CAT,DOG,BEE,FOX,OWL,COW,PIG,RAT,BAT,EMU,YAK';
    tooMany[7] = '00000000000';
    expect(deserialize(tooMany.join(';'))).toBeNull();

    // found 长度错 / 非法字符
    const badFoundLen = segs.slice();
    badFoundLen[7] = badFoundLen[7].slice(0, -1);
    expect(deserialize(badFoundLen.join(';'))).toBeNull();
    const badFoundChar = segs.slice();
    badFoundChar[7] = '0' + badFoundChar[7].slice(1).slice(0, -1) + '2';
    expect(deserialize(badFoundChar.join(';'))).toBeNull();

    // foundCellsHex 长度错 / 非法字符
    const badHexLen = segs.slice();
    badHexLen[8] = badHexLen[8].slice(0, -1);
    expect(deserialize(badHexLen.join(';'))).toBeNull();
    const badHexChar = segs.slice();
    badHexChar[8] = 'g' + badHexChar[8].slice(1);
    expect(deserialize(badHexChar.join(';'))).toBeNull();
  });

  it('手工构造的最小合法存档可解析（roundtrip 再回写等值）', () => {
    const manual =
      'ws1;easy;-;10;Animals;' + 'A'.repeat(100) + ';CAT,DOG,BEE,FOX,OWL,COW;000000;' + '0'.repeat(25);
    const parsed = deserialize(manual);
    expect(parsed).not.toBeNull();
    expect(parsed?.difficulty).toBe('easy');
    expect(parsed?.seed).toBeNull();
    expect(parsed?.theme).toBe('Animals');
    expect(parsed?.words).toEqual(['CAT', 'DOG', 'BEE', 'FOX', 'OWL', 'COW']);
    expect(parsed?.grid.length).toBe(100);
    expect(serialize(parsed as GameState)).toBe(manual);
  });
});

// ---------------------------------------------------------------------------
// readSegment（测试/渲染辅助自身的契约）
// ---------------------------------------------------------------------------

describe('readSegment', () => {
  it('按方向读串；非法方向/越界/坏长度 throw', () => {
    const res = newGame({ difficulty: 'easy', seed: 61 });
    const s = res.state;
    const p = res.placements[0];
    expect(readSegment(s, p.row, p.col, p.dr, p.dc, p.word.length)).toBe(p.word);
    // 读出长度可短于词（线段前缀）
    expect(readSegment(s, p.row, p.col, p.dr, p.dc, 1)).toBe(p.word.charAt(0));
    expect(() => readSegment(s, 0, 0, 2, 1, 3)).toThrow(); // 非 8 方向
    expect(() => readSegment(s, 0, 0, 0, 1, 0)).toThrow(); // 坏长度
    expect(() => readSegment(s, 0, 0, 0, 1, 11)).toThrow(); // 终点越界（10 列）
    expect(() => readSegment(s, -1, 0, 0, 1, 3)).toThrow(); // 起点越界
  });
});
