/**
 * hangman/logic 单测（契约 §5 + 任务书验收标准）。
 * 纯 Node 环境（vitest），无 DOM。
 */

import { describe, it, expect } from 'vitest';
import { createRng } from '../_engine/rng';
import {
  MAX_WRONG,
  newGame,
  wordList,
  guessLetter,
  revealed,
  isRevealed,
  serialize,
  deserialize,
} from './logic';
import type { Difficulty, GameState } from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 各难度词长分段（任务规格：easy 4-6 / medium 6-8 / hard 9-12） */
const LEN_RANGE: Record<Difficulty, [number, number]> = {
  easy: [4, 6],
  medium: [6, 8],
  hard: [9, 12],
};

/** 词量区间（任务规格：每难度 100-200，总 400-600） */
const COUNT_RANGE: [number, number] = [100, 200];

const SEEDS: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 999, 123456, 2147483647, 4294967295, 0,
];

/** a-z 中不在 word 里的前 n 个字母（构造必错字母） */
function misses(word: string, n: number): string[] {
  const out: string[] = [];
  for (let code = 97; out.length < n && code <= 122; code++) {
    const ch = String.fromCharCode(code);
    if (word.indexOf(ch) === -1) out.push(ch);
  }
  if (out.length < n) throw new Error('test: word covers too many letters');
  return out;
}

/** 逐字母猜到终局；返回最终 state */
function playToEnd(base: GameState, letters: string[]): GameState {
  let s = base;
  for (const l of letters) s = guessLetter(s, l);
  return s;
}

// ---------------------------------------------------------------------------
// 词库不变量
// ---------------------------------------------------------------------------

describe('word bank', () => {
  it('每难度词量 100-200，总词量 400-600', () => {
    let total = 0;
    for (const difficulty of ALL_DIFFICULTIES) {
      const list = wordList(difficulty);
      expect(list.length).toBeGreaterThanOrEqual(COUNT_RANGE[0]);
      expect(list.length).toBeLessThanOrEqual(COUNT_RANGE[1]);
      total += list.length;
    }
    expect(total).toBeGreaterThanOrEqual(400);
    expect(total).toBeLessThanOrEqual(600);
  });

  it('全部为 3-12 字母纯小写字母词，且落在难度对应词长分段内', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const [lo, hi] = LEN_RANGE[difficulty];
      for (const entry of wordList(difficulty)) {
        expect(entry.word).toMatch(/^[a-z]+$/);
        expect(entry.word.length).toBeGreaterThanOrEqual(3);
        expect(entry.word.length).toBeLessThanOrEqual(12);
        expect(entry.word.length).toBeGreaterThanOrEqual(lo);
        expect(entry.word.length).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('每词均带非空类别标签', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const entry of wordList(difficulty)) {
        expect(typeof entry.category).toBe('string');
        expect(entry.category.length).toBeGreaterThan(0);
        expect(entry.category).toMatch(/^[a-z]+$/);
      }
    }
  });

  it('难度内无重复词，跨难度亦无重复（全局唯一）', () => {
    const globalSeen = new Set<string>();
    for (const difficulty of ALL_DIFFICULTIES) {
      const localSeen = new Set<string>();
      for (const entry of wordList(difficulty)) {
        expect(localSeen.has(entry.word)).toBe(false);
        expect(globalSeen.has(entry.word)).toBe(false);
        localSeen.add(entry.word);
        globalSeen.add(entry.word);
      }
    }
  });

  it('词库内容跨多次调用稳定（展平缓存不改语义）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      expect(wordList(difficulty)).toEqual(wordList(difficulty));
    }
  });
});

// ---------------------------------------------------------------------------
// newGame：随机性走 rng
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('同 seed + 同难度 → 同词同类别（确定性）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const a = newGame({ difficulty, seed });
        const b = newGame({ difficulty, seed });
        expect(a.word).toBe(b.word);
        expect(a.category).toBe(b.category);
        expect(a.state).toEqual(b.state);
      }
    }
  });

  it('抽词走 _engine/rng：与 createRng(seed).int 手动对照一致', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const list = wordList(difficulty);
      for (const seed of SEEDS) {
        const expected = list[createRng(seed).int(list.length)];
        const res = newGame({ difficulty, seed });
        expect(res.word).toBe(expected.word);
        expect(res.category).toBe(expected.category);
      }
    }
  });

  it('不同 seed 产出多样化词（100+ 词池，50 个 seed 至少 20 个不同词）', () => {
    const words = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      words.add(newGame({ difficulty: 'easy', seed }).word);
    }
    expect(words.size).toBeGreaterThanOrEqual(20);
  });

  it('初始 state 形状正确：playing / 0 错 / 空 guessed / word 在词库内', () => {
    const res = newGame({ difficulty: 'hard', seed: 7 });
    expect(res.state.status).toBe('playing');
    expect(res.state.wrongCount).toBe(0);
    expect(res.state.guessed).toBe('');
    expect(res.state.seed).toBe(7);
    expect(res.state.word).toBe(res.word);
    expect(res.state.category).toBe(res.category);
    const pool = wordList('hard').filter((e) => e.word === res.word);
    expect(pool.length).toBe(1);
    expect(pool[0].category).toBe(res.category);
  });

  it('非法难度 / 非法 seed → throw', () => {
    expect(() => newGame({ difficulty: 'expert' as Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: -1 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 1.5 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 0x100000000 })).toThrow();
    expect(() => newGame(null as unknown as { difficulty: Difficulty })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 猜字母状态转移
// ---------------------------------------------------------------------------

describe('guessLetter', () => {
  it('命中：揭示该字母在词中的全部位置', () => {
    // 找一个含重复字母的词，验证「全部同字母位置」揭示
    const res = newGame({ difficulty: 'easy', seed: 0 });
    const word = res.word;
    const dup = word.charAt(0); // 用首字母：至少位置 0 必揭示
    const next = guessLetter(res.state, dup);
    const mask = revealed(next.word, next.guessed);
    for (let i = 0; i < word.length; i++) {
      if (word.charAt(i) === dup) expect(mask[i]).toBe(true);
    }
    expect(next.wrongCount).toBe(0);
    expect(next.status).toBe('playing');
  });

  it('重复猜同一字母：no-op 且返回原引用', () => {
    const res = newGame({ difficulty: 'medium', seed: 3 });
    const once = guessLetter(res.state, res.word.charAt(0));
    const twice = guessLetter(once, res.word.charAt(0));
    expect(twice).toBe(once); // 原引用（不可变 no-op 契约）
    expect(twice.guessed.length).toBe(1);
  });

  it('未命中：wrongCount +1，guessed 追加', () => {
    const res = newGame({ difficulty: 'easy', seed: 1 });
    const miss = misses(res.word, 1)[0];
    const next = guessLetter(res.state, miss);
    expect(next).not.toBe(res.state);
    expect(next.wrongCount).toBe(1);
    expect(next.guessed).toBe(miss);
    expect(next.status).toBe('playing');
    expect(res.state.wrongCount).toBe(0); // 入参未被改写（不可变）
  });

  it('非法字母（多字符/大写/数字/空）→ throw', () => {
    const res = newGame({ difficulty: 'easy', seed: 2 });
    expect(() => guessLetter(res.state, 'ab')).toThrow();
    expect(() => guessLetter(res.state, 'A')).toThrow();
    expect(() => guessLetter(res.state, '5')).toThrow();
    expect(() => guessLetter(res.state, '')).toThrow();
    expect(() => guessLetter(res.state, undefined as unknown as string)).toThrow();
  });

  it('终局后再猜：no-op 且返回原引用', () => {
    const res = newGame({ difficulty: 'easy', seed: 4 });
    const lost = playToEnd(res.state, misses(res.word, MAX_WRONG));
    expect(lost.status).toBe('lost');
    const after = guessLetter(lost, res.word.charAt(0));
    expect(after).toBe(lost);
  });
});

// ---------------------------------------------------------------------------
// 胜负判定
// ---------------------------------------------------------------------------

describe('win / lose', () => {
  it(`累计 ${MAX_WRONG} 个未命中 → lost（经典 6 错判负）`, () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const res = newGame({ difficulty, seed: 11 });
      // 猜 5 个必错字母：未终局
      const mid = playToEnd(res.state, misses(res.word, MAX_WRONG - 1));
      expect(mid.status).toBe('playing');
      expect(mid.wrongCount).toBe(MAX_WRONG - 1);
      // 第 6 错：判负
      const lost = guessLetter(mid, misses(res.word, MAX_WRONG)[MAX_WRONG - 1]);
      expect(lost.status).toBe('lost');
      expect(lost.wrongCount).toBe(MAX_WRONG);
      expect(isRevealed(lost.word, lost.guessed)).toBe(false);
    }
  });

  it('猜出词中全部不同字母 → won（无论错几步）', () => {
    const res = newGame({ difficulty: 'easy', seed: 5 });
    // 先故意错 2 步，再补齐所有字母
    const letters = misses(res.word, 2);
    const unique = new Set<string>();
    for (let i = 0; i < res.word.length; i++) unique.add(res.word.charAt(i));
    for (const ch of Array.from(unique)) letters.push(ch);
    const won = playToEnd(res.state, letters);
    expect(won.status).toBe('won');
    expect(won.wrongCount).toBe(2); // 胜局可带错误
    expect(isRevealed(won.word, won.guessed)).toBe(true);
  });

  it('won 状态下 wrongCount 必 < MAX_WRONG（不变量）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const res = newGame({ difficulty, seed: 13 });
      const unique: string[] = [];
      for (let i = 0; i < res.word.length; i++) {
        const ch = res.word.charAt(i);
        if (unique.indexOf(ch) === -1) unique.push(ch);
      }
      const won = playToEnd(res.state, unique);
      expect(won.status).toBe('won');
      expect(won.wrongCount).toBeLessThan(MAX_WRONG);
    }
  });

  it('revealed/isRevealed 基本行为', () => {
    expect(revealed('cat', '')).toEqual([false, false, false]);
    expect(revealed('cat', 'ct')).toEqual([true, false, true]);
    expect(isRevealed('cat', 'act')).toBe(true);
    expect(isRevealed('cat', 'ac')).toBe(false);
    expect(() => revealed('Cat', '')).toThrow(); // 非小写词属编程错误
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize 往返
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  const cases: Array<{ name: string; make: () => GameState }> = [
    { name: '全新局（空 guessed）', make: () => newGame({ difficulty: 'easy', seed: 42 }).state },
    {
      name: '进行中（部分猜过）',
      make: () => {
        const res = newGame({ difficulty: 'medium', seed: 7 });
        return playToEnd(res.state, [res.word.charAt(0), ...misses(res.word, 2)]);
      },
    },
    {
      name: '胜局',
      make: () => {
        const res = newGame({ difficulty: 'hard', seed: 9 });
        const unique: string[] = [];
        for (let i = 0; i < res.word.length; i++) {
          const ch = res.word.charAt(i);
          if (unique.indexOf(ch) === -1) unique.push(ch);
        }
        return playToEnd(res.state, unique);
      },
    },
    {
      name: '败局',
      make: () => {
        const res = newGame({ difficulty: 'easy', seed: 12 });
        return playToEnd(res.state, misses(res.word, MAX_WRONG));
      },
    },
    {
      name: 'seed 边界 0 与 uint32 上限',
      make: () => newGame({ difficulty: 'easy', seed: 4294967295 }).state,
    },
  ];

  it('deserialize(serialize(s)) 深等于原 state（word/category 由 seed 重生成还原）', () => {
    for (const c of cases) {
      const s = c.make();
      const back = deserialize(serialize(s));
      expect(back).not.toBeNull();
      expect(back).toEqual(s);
    }
    // seed 0 单独补一例（cases 覆盖 42/7/9/12/2294967295）
    const zero = newGame({ difficulty: 'medium', seed: 0 }).state;
    expect(deserialize(serialize(zero))).toEqual(zero);
  });

  it('serialize 串格式：hangman1 六段，空 guessed 记为 "-"', () => {
    const s = newGame({ difficulty: 'easy', seed: 42 }).state;
    const segs = serialize(s).split(';');
    expect(segs.length).toBe(6);
    expect(segs[0]).toBe('hangman1');
    expect(segs[1]).toBe('easy');
    expect(segs[2]).toBe('42');
    expect(segs[3]).toBe('-');
    expect(segs[4]).toBe('0');
    expect(segs[5]).toBe('playing');
  });

  it('往返幂等：serialize(deserialize(serialize(s))) === serialize(s)', () => {
    const res = newGame({ difficulty: 'hard', seed: 77 });
    const s = playToEnd(res.state, misses(res.word, 3));
    const once = serialize(s);
    expect(serialize(deserialize(once) as GameState)).toBe(once);
  });

  it('篡改/损坏存档 → null（绝不抛）', () => {
    const res = newGame({ difficulty: 'easy', seed: 42 });
    const s = playToEnd(res.state, misses(res.word, 2)); // wrong=2，guessed 含 2 个未命中
    const good = serialize(s);

    // 段结构 / 前缀 / 词表 / 数字格式
    expect(deserialize('')).toBeNull();
    expect(deserialize('hangman1;easy')).toBeNull();
    expect(deserialize(good.replace('hangman1', 'hangman2'))).toBeNull();
    expect(deserialize(good.replace('easy', 'expert'))).toBeNull();
    expect(deserialize(good.replace(';42;', ';-1;'))).toBeNull();
    expect(deserialize(good.replace(';42;', ';4294967296;'))).toBeNull();
    expect(deserialize(good.replace(';playing', ';over'))).toBeNull();

    // 非法 guessed：大写 / 数字 / 重复字母
    const base = 'hangman1;easy;42;';
    expect(deserialize(base + 'A;0;playing')).toBeNull();
    expect(deserialize(base + 'a3;0;playing')).toBeNull();
    expect(deserialize(base + 'aa;0;playing')).toBeNull();

    // 盘面不一致（篡改 wrongCount / status）
    expect(deserialize(good.replace(/;2;playing$/, ';3;playing'))).toBeNull();
    expect(deserialize(good.replace(/;2;playing$/, ';1;playing'))).toBeNull();
    expect(deserialize(good.replace(/;playing$/, ';won'))).toBeNull();
    expect(deserialize(good.replace(/;2;playing$/, ';0;lost'))).toBeNull();

    // 非字符串输入
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize(undefined as unknown as string)).toBeNull();
    expect(deserialize(123 as unknown as string)).toBeNull();
  });

  it('serialize 非法 state → throw（编程错误）', () => {
    const s = newGame({ difficulty: 'easy', seed: 1 }).state;
    expect(() => serialize({ ...s, wrongCount: 5 })).toThrow(); // 与 guessed 不一致
    expect(() => serialize({ ...s, guessed: 'aA' })).toThrow(); // 含大写
    expect(() => serialize({ ...s, status: 'over' as GameState['status'] })).toThrow();
    expect(() => serialize(null as unknown as GameState)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 状态不变量（assertStateShape 的开发期防线）
// ---------------------------------------------------------------------------

describe('state invariants', () => {
  it('随机长链对局后 state 恒满足不变量（serialize 可复 Serialize）', () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      const res = newGame({ difficulty, seed: 2026 });
      let s = res.state;
      // a-z 乱序全猜一遍（必达终局：won 或 lost）
      const order = createRng(99).shuffle('abcdefghijklmnopqrstuvwxyz'.split(''));
      for (const ch of order) s = guessLetter(s, ch);
      expect(s.status === 'won' || s.status === 'lost').toBe(true);
      expect(() => serialize(s)).not.toThrow();
      expect(deserialize(serialize(s))).toEqual(s);
    }
  });
});
