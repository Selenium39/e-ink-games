/**
 * word-daily/logic 单测（任务书验收标准 3 的 7 类用例 + 词表完整性把关）。
 * 纯 Node 环境（vitest），无 DOM。
 */

import { describe, it, expect } from 'vitest';
import {
  ANSWERS,
  MAX_GUESSES,
  answerOf,
  deserialize,
  grade,
  isValidGuess,
  isoDay,
  keyStates,
  marksOf,
  newDailyGame,
  newPracticeGame,
  serialize,
  shareText,
  submitGuess,
  type GameState,
} from './logic';
import { seedFromDate } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** UTC 日期（月 0 基，与 Date.UTC 一致） */
function utc(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d, 12, 0, 0));
}

/** 与 answer 不同的 6 个表内错词（构造 lost 局用；answer 碰巧入列时由断言暴露） */
const WRONG_POOL = ['about', 'black', 'found', 'media', 'point', 'truck', 'vowel', 'noise'];

function wrongWordsFor(answer: string, n: number): string[] {
  const out = WRONG_POOL.filter((w) => w !== answer);
  if (out.length < n) throw new Error('test pool too small for answer ' + answer);
  return out.slice(0, n);
}

/** 跑到 lost 的完整状态（6 个错词） */
function playToLost(state: GameState): GameState {
  const words = wrongWordsFor(answerOf(state), MAX_GUESSES);
  let s = state;
  for (let i = 0; i < words.length; i++) s = submitGuess(s, words[i]);
  return s;
}

// ---------------------------------------------------------------------------
// 词表完整性（永久把关：形状 / 去重 / 字母序 / 两表分工）
// ---------------------------------------------------------------------------

describe('word lists', () => {
  it('ANSWERS：全部为 5 个 [a-z] 字母', () => {
    expect(ANSWERS.length).toBeGreaterThan(1000);
    expect(ANSWERS.length).toBeLessThanOrEqual(1500);
    for (const w of ANSWERS) expect(w).toMatch(/^[a-z]{5}$/);
  });

  it('ANSWERS 字母序严格递增（即无重复）', () => {
    for (let i = 1; i < ANSWERS.length; i++) {
      expect(ANSWERS[i] > ANSWERS[i - 1]).toBe(true);
    }
  });

  it('猜测字典宽于答案表：EXTRA 词可猜且不在 ANSWERS（抽查 + 全量无交集）', () => {
    for (const w of ['cards', 'reads', 'cycle', 'bored', 'years']) {
      expect(isValidGuess(w)).toBe(true);
      expect(ANSWERS.indexOf(w)).toBe(-1);
    }
    // 全量：每个 ANSWERS 词合法；isValidGuess 不多不少覆盖两表（用若干非词反证）
    for (const w of ANSWERS) expect(isValidGuess(w)).toBe(true);
    for (const w of ['aaaaa', 'zzzzz', 'qqqqq', 'jjjjj']) {
      expect(isValidGuess(w)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// newDailyGame：确定性（验收 3.1 / 3.2）
// ---------------------------------------------------------------------------

describe('newDailyGame', () => {
  it('同日期两次调用：同 seed、同答案、同 state（跨设备一致性基础）', () => {
    for (const d of [utc(2026, 8, 27), utc(2024, 0, 1), utc(2030, 11, 31)]) {
      const a = newDailyGame(d);
      const b = newDailyGame(d);
      expect(a.state).toEqual(b.state);
      expect(a.answer).toBe(b.answer);
      expect(a.answer).toMatch(/^[a-z]{5}$/);
    }
  });

  it('相邻日期 seed 不同；连续多日答案两两不同（每日新题核心卖点）', () => {
    const base = utc(2026, 8, 20);
    const answers: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      const res = newDailyGame(d);
      answers.push(res.answer);
      if (i > 0) {
        const prev = new Date(base.getTime() + (i - 1) * 86400000);
        expect(res.state.seed).not.toBe(seedFromDate(prev));
      }
    }
    for (let i = 1; i < answers.length; i++) {
      expect(answers[i]).not.toBe(answers[i - 1]); // 相邻两天必不同词
    }
  });

  it('day 字段 = UTC 日期 YYYY-MM-DD；mode=daily、初始 playing、0 guesses', () => {
    const res = newDailyGame(utc(2026, 8, 27));
    expect(res.state.day).toBe('2026-09-27');
    expect(res.state.mode).toBe('daily');
    expect(res.state.status).toBe('playing');
    expect(res.state.guesses).toEqual([]);
    expect(res.state.seed).toBe(seedFromDate(utc(2026, 8, 27)));
  });

  it('UTC 口径：本地时区无关（23:30 UTC 与次日 00:30 UTC 是两天）', () => {
    expect(newDailyGame(new Date('2026-09-27T23:30:00Z')).state.day).toBe('2026-09-27');
    expect(newDailyGame(new Date('2026-09-28T00:30:00Z')).state.day).toBe('2026-09-28');
    expect(isoDay(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-27');
  });

  it('非法 Date throw', () => {
    expect(() => newDailyGame(new Date('not-a-date'))).toThrow();
    expect(() => newDailyGame(null as unknown as Date)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// newPracticeGame
// ---------------------------------------------------------------------------

describe('newPracticeGame', () => {
  it('同 seed 确定性：同答案、同 state；day=null、mode=practice', () => {
    const a = newPracticeGame(424242);
    const b = newPracticeGame(424242);
    expect(a.state).toEqual(b.state);
    expect(a.answer).toBe(b.answer);
    expect(a.state.mode).toBe('practice');
    expect(a.state.day).toBeNull();
    expect(answerOf(a.state)).toBe(a.answer);
  });

  it('无 seed 可用且产出合法词（随机练习）', () => {
    const a = newPracticeGame();
    expect(a.answer).toMatch(/^[a-z]{5}$/);
    expect(ANSWERS.indexOf(a.answer)).toBeGreaterThanOrEqual(0);
  });

  it('seed 非法 throw（uint32 边界）', () => {
    expect(() => newPracticeGame(-1)).toThrow();
    expect(() => newPracticeGame(0.5)).toThrow();
    expect(() => newPracticeGame(4294967296)).toThrow();
    expect(() => newPracticeGame('7' as unknown as number)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// grade：重复字母精确计数 + 位置匹配优先（验收 3.3）
// ---------------------------------------------------------------------------

describe('grade', () => {
  it('全对 / 全错 / 单命中', () => {
    expect(grade('crane', 'crane')).toEqual([2, 2, 2, 2, 2]);
    expect(grade('proxy', 'crane')).toEqual([0, 2, 0, 0, 0]);
    expect(grade('solid', 'crane')).toEqual([0, 0, 0, 0, 0]);
  });

  it('重复字母（猜测侧）不多记：answer 单 e，guess 双 e 只 present 一个', () => {
    // beefy vs haste：answer 含一个 e（pos4 非匹配位）；guess 的 e×2 只有 1 个 present
    expect(grade('beefy', 'haste')).toEqual([0, 1, 0, 0, 0]);
    // speed vs stone：pos0 s 为 correct，answer 剩单 e → guess 双 e 只 1 个 present
    expect(grade('speed', 'stone')).toEqual([2, 0, 1, 0, 0]);
  });

  it('重复字母（eerie 类）：先消耗 correct，再按剩余计数记 present', () => {
    // eerie vs tenet：pos1 e=correct；answer 剩余 e×1 → guess pos0 的 e present，pos3/4 不沾
    expect(grade('eerie', 'tenet')).toEqual([1, 2, 0, 0, 0]);
    // tenet vs eerie：answer 侧 e×3（pos1 为 correct）——answer 剩 e×2 → guess pos3 e present
    expect(grade('tenet', 'eerie')).toEqual([0, 2, 0, 1, 0]);
  });

  it('correct 优先消耗 answer 字母：dress vs speed（answer 双 e，guess 单 e）', () => {
    // answer speed：pos2 e 为 correct；answer 剩 e×1 → guess pos0 d present?（d 在 answer 内）
    expect(grade('dress', 'speed')).toEqual([1, 0, 2, 1, 0]);
  });

  it('双重复字母混合：babes vs abbey', () => {
    expect(grade('babes', 'abbey')).toEqual([1, 1, 2, 2, 0]);
  });

  it('guess/answer 非法形状 throw（非 5 字母 / 大写 / 数字）', () => {
    expect(() => grade('abc', 'crane')).toThrow();
    expect(() => grade('abcdef', 'crane')).toThrow();
    expect(() => grade('Crane', 'crane')).toThrow();
    expect(() => grade('cran3', 'crane')).toThrow();
    expect(() => grade('crane', 'CRANE')).toThrow();
    expect(() => grade(null as unknown as string, 'crane')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isValidGuess（验收 3.4）
// ---------------------------------------------------------------------------

describe('isValidGuess', () => {
  it('表内词合法（答案词与 EXTRA 词）', () => {
    expect(isValidGuess('crane')).toBe(true);
    expect(isValidGuess('sugar')).toBe(true);
    expect(isValidGuess('cards')).toBe(true); // EXTRA
  });

  it('非法输入：长度错 / 不在词表 / 大写 / 非 string', () => {
    expect(isValidGuess('abc')).toBe(false);
    expect(isValidGuess('abcdef')).toBe(false);
    expect(isValidGuess('')).toBe(false);
    expect(isValidGuess('qqqqq')).toBe(false); // 合法形状但不在词表
    expect(isValidGuess('CRANE')).toBe(false);
    expect(isValidGuess('cran ')).toBe(false);
    expect(isValidGuess(12345 as unknown as string)).toBe(false);
    expect(isValidGuess(null as unknown as string)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// submitGuess：状态转移与胜负判定（验收 3.5 / 3.7）
// ---------------------------------------------------------------------------

describe('submitGuess', () => {
  it('合法提交：guesses 追加、不可变（原 state 不变）、playing 保持', () => {
    const { state } = newPracticeGame(777);
    const next = submitGuess(state, 'crane');
    expect(next).not.toBe(state);
    expect(next.guesses).toEqual(['crane']);
    expect(state.guesses).toEqual([]); // 不可变
    expect(next.status).toBe('playing');
    expect(next.seed).toBe(state.seed);
    expect(next.mode).toBe(state.mode);
  });

  it('第 n 次命中 → won（含第 6 次绝杀）', () => {
    const { state, answer } = newPracticeGame(1001);
    let s = submitGuess(state, 'crane');
    if (s.status === 'playing') {
      expect(s.guesses).toEqual(['crane']);
      s = submitGuess(s, answer);
      expect(s.status).toBe('won');
      expect(s.guesses).toEqual(['crane', answer]);
    } else {
      expect(s.status).toBe('won'); // crane 恰为答案
    }
    // 第 6 次绝杀
    const p2 = newPracticeGame(1002);
    const wrongs = wrongWordsFor(p2.answer, 5);
    let s2 = p2.state;
    for (const w of wrongs) s2 = submitGuess(s2, w);
    expect(s2.status).toBe('playing');
    s2 = submitGuess(s2, p2.answer);
    expect(s2.status).toBe('won');
    expect(s2.guesses.length).toBe(6);
  });

  it('6 次用尽未中 → lost（胜负判定）', () => {
    const { state } = newPracticeGame(2002);
    const s = playToLost(state);
    expect(s.status).toBe('lost');
    expect(s.guesses.length).toBe(6);
    expect(serialize(s)).toContain('l');
  });

  it('已终局提交为 no-op（返回原引用）；非法词 throw（编程错误契约）', () => {
    const won = submitGuess(newPracticeGame(3003).state, newPracticeGame(3003).answer);
    expect(won.status).toBe('won');
    expect(submitGuess(won, 'crane')).toBe(won); // no-op 原引用

    const lost = playToLost(newPracticeGame(3004).state);
    expect(submitGuess(lost, 'crane')).toBe(lost);

    const { state } = newPracticeGame(3005);
    expect(() => submitGuess(state, 'zzzzz')).toThrow(); // 不在词表
    expect(() => submitGuess(state, 'abc')).toThrow(); // 形状非法
  });

  it('daily 局同样驱动（mode/day 透传）', () => {
    const { state, answer } = newDailyGame(utc(2026, 8, 27));
    const s = submitGuess(state, answer);
    expect(s.status).toBe('won');
    expect(s.mode).toBe('daily');
    expect(s.day).toBe('2026-09-27');
  });
});

// ---------------------------------------------------------------------------
// keyStates / marksOf
// ---------------------------------------------------------------------------

describe('keyStates', () => {
  it('三态历史：每字母取全部猜测中的最高 mark（不降级语义，公式对照）', () => {
    const { state } = newPracticeGame(4004);
    const answer = answerOf(state);
    let s = state;
    for (const w of wrongWordsFor(answer, 6)) s = submitGuess(s, w);
    const ks = keyStates(s);
    for (let code = 97; code < 123; code++) {
      const ch = String.fromCharCode(code);
      let best: number | undefined;
      for (const g of s.guesses) {
        const marks = grade(g, answer);
        for (let i = 0; i < 5; i++) {
          if (g.charAt(i) === ch && (best === undefined || marks[i] > best)) best = marks[i];
        }
      }
      if (best === undefined) expect(ks[ch]).toBeUndefined();
      else expect(ks[ch]).toBe(best);
    }
  });

  it('correct 优先实例：先 miss 后 correct 的字母最终为 2', () => {
    // answer = 'crane'（seed 固定出 crane 不可行——改为受控 state 手工构造路径）：
    // 直接用公式化验证：answer 含字母 c，猜 'basic'（c 位置错→present/absent），再猜 'crane'
    const { state } = newPracticeGame(5005);
    const answer = answerOf(state);
    if (answer === 'basic' || answer === 'crane') {
      // 极小概率撞词：本 seed 下跳过（该 case 由下面 marksOf 覆盖公式验证）
      expect(true).toBe(true);
      return;
    }
    let s = submitGuess(state, 'basic');
    s = submitGuess(s, 'crane');
    const ks = keyStates(s);
    // 'basic' 中 c 位于 pos4：answer 若含 c 且不在 pos4 → present；'crane' 中 c 在 pos0
    // 若 answer[0] === 'c' 则 ks.c === 2（correct 吸收一切）；否则 c 无 correct
    if (answer.charAt(0) === 'c') expect(ks.c).toBe(2);
    else expect(ks.c).not.toBe(2);
  });

  it('marksOf 与 grade 逐行一致', () => {
    const { state } = newPracticeGame(6006);
    const answer = answerOf(state);
    const s = playToLost(state);
    const marks = marksOf(s);
    expect(marks.length).toBe(6);
    for (let i = 0; i < 6; i++) expect(marks[i]).toEqual(grade(s.guesses[i], answer));
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize 往返（验收 3.6）
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('daily 进行中 roundtrip 等值', () => {
    const { state } = newDailyGame(utc(2026, 8, 27));
    let s = submitGuess(state, 'crane');
    if (s.status !== 'playing') s = submitGuess(newDailyGame(utc(2026, 8, 27)).state, 'point');
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });

  it('daily won / practice lost roundtrip 等值（含终局状态）', () => {
    const won = submitGuess(newDailyGame(utc(2026, 8, 27)).state, newDailyGame(utc(2026, 8, 27)).answer);
    expect(won.status).toBe('won');
    expect(deserialize(serialize(won))).toEqual(won);

    const lost = playToLost(newPracticeGame(7007).state);
    expect(lost.status).toBe('lost');
    expect(deserialize(serialize(lost))).toEqual(lost);
  });

  it('存档不含答案文本（决策⑤ 防翻档作弊）', () => {
    const { state, answer } = newDailyGame(utc(2026, 8, 27));
    const s = playToLost(state);
    const str = serialize(s);
    expect(str.indexOf(answer)).toBe(-1);
    expect(str.startsWith('wd1;d;2026-09-27;')).toBe(true);
    expect(str.length).toBeLessThan(120);
  });

  it('损坏 / 伪造存档一律 null，绝不抛', () => {
    expect(deserialize('')).toBeNull();
    expect(deserialize('garbage')).toBeNull();
    expect(deserialize(null as unknown as string)).toBeNull();
    expect(deserialize(42 as unknown as string)).toBeNull();
    expect(deserialize('wd1;d;2026-09-27;123;p')).toBeNull(); // 5 段（缺 guesses 段）
    expect(deserialize('wd2;d;2026-09-27;123;p;crane')).toBeNull(); // 版本头错
    expect(deserialize('wd1;x;2026-09-27;123;p;crane')).toBeNull(); // mode 非法
    expect(deserialize('wd1;d;-;123;p;crane')).toBeNull(); // daily 缺 day
    expect(deserialize('wd1;p;2026-09-27;123;p;crane')).toBeNull(); // practice 带 day
    expect(deserialize('wd1;d;2026-9-27;123;p;crane')).toBeNull(); // day 格式
    expect(deserialize('wd1;d;2026-13-27;123;p;crane')).toBeNull(); // 月越界
    expect(deserialize('wd1;d;2026-09-99;123;p;crane')).toBeNull(); // 日越界
    expect(deserialize('wd1;d;2026-09-27;-1;p;crane')).toBeNull(); // seed 非法
    expect(deserialize('wd1;d;2026-09-27;4294967296;p;crane')).toBeNull(); // seed 越界
    expect(deserialize('wd1;d;2026-09-27;123;x;crane')).toBeNull(); // status 非法
    expect(deserialize('wd1;d;2026-09-27;123;p;zzzzz')).toBeNull(); // 非字典词
    expect(deserialize('wd1;d;2026-09-27;123;p;crane,crane')).toBeNull(); // 重复猜测
    // 空猜测的 playing 档合法（刚开局的每日局）
    const fresh = deserialize('wd1;d;2026-09-27;123;p;');
    expect(fresh).not.toBeNull();
    expect(fresh?.guesses).toEqual([]);
  });

  it('终局自洽校验：伪造 won/lost/playing 状态被拒', () => {
    const { state, answer } = newDailyGame(utc(2026, 8, 27));
    const wrong = wrongWordsFor(answer, 1)[0];
    // 伪造 won：末猜 ≠ 答案
    expect(deserialize('wd1;d;2026-09-27;' + state.seed + ';w;' + wrong)).toBeNull();
    // 伪造 lost：只有 5 猜
    let five = '';
    for (const w of wrongWordsFor(answer, 5)) five += (five ? ',' : '') + w;
    expect(deserialize('wd1;d;2026-09-27;' + state.seed + ';l;' + five)).toBeNull();
    // 伪造 playing：末猜 = 答案（命中即应 won）
    expect(deserialize('wd1;d;2026-09-27;' + state.seed + ';p;' + answer)).toBeNull();
    // 伪造 playing：6 猜未终局
    let six = '';
    for (const w of wrongWordsFor(answer, 6)) six += (six ? ',' : '') + w;
    expect(deserialize('wd1;d;2026-09-27;' + state.seed + ';p;' + six)).toBeNull();
    // 真实 won 档可解析
    const won = submitGuess(state, answer);
    expect(deserialize(serialize(won))).toEqual(won);
  });

  it('answerOf 与 deserialize 恢复后的再提交一致（存档恢复可继续玩）', () => {
    const { state, answer } = newPracticeGame(8008);
    let s = submitGuess(state, wrongWordsFor(answer, 1)[0]);
    const restored = deserialize(serialize(s)) as GameState;
    expect(restored).not.toBeNull();
    expect(answerOf(restored)).toBe(answer);
    const again = submitGuess(restored, answer);
    expect(again.status).toBe('won');
  });
});

// ---------------------------------------------------------------------------
// shareText
// ---------------------------------------------------------------------------

describe('shareText', () => {
  it('won：题号 + n/6 + n 行网格，字符 ∈ ■▣□', () => {
    const { state, answer } = newDailyGame(utc(2026, 8, 27));
    let s = submitGuess(state, 'crane');
    if (s.status !== 'playing') s = submitGuess(state, 'about');
    if (s.status !== 'playing') s = submitGuess(state, 'media');
    s = submitGuess(s, answer);
    expect(s.status).toBe('won');
    const text = shareText(s);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Word Daily #2026-09-27 ' + s.guesses.length + '/6');
    expect(lines[1]).toBe('');
    expect(lines.length).toBe(2 + s.guesses.length + 1 - 1); // 头 + 空行 + n 行
    for (let i = 2; i < lines.length; i++) {
      expect(lines[i].length).toBe(5);
      for (const ch of lines[i]) expect('■▣□'.indexOf(ch)).toBeGreaterThanOrEqual(0);
    }
  });

  it('lost：X/6；practice 局无题号', () => {
    const s = playToLost(newDailyGame(utc(2026, 8, 27)).state);
    const text = shareText(s);
    expect(text.split('\n')[0]).toBe('Word Daily #2026-09-27 X/6');
    expect(text.split('\n').length).toBe(2 + 6 + 1 - 1 + 0); // 头+空行+6 行

    const p = playToLost(newPracticeGame(9009).state);
    expect(shareText(p).split('\n')[0]).toBe('Word Daily (practice) X/6');
  });

  it('playing 调用 throw（仅终局可分享）', () => {
    const { state } = newPracticeGame(9010);
    expect(() => shareText(state)).toThrow();
  });
});
