/**
 * _engine/rng — 可种子化随机源（契约 §4.2）。
 *
 * 注意：本文件原属框架任务范围，落地时 `src/games/_engine/` 整体缺失，
 * 由 sudoku/logic 任务按本契约签名先行创建，使 logic.ts 可运行。
 * 算法冻结：mulberry32 + FNV-1a，改动将破坏「同 seed / 同一天全设备同一谜题」。
 * 零 DOM、零依赖；ES2015 语法与 API。
 */

export type Seed = number; // uint32

export interface Rng {
  /** [0,1)，32bit 精度 */
  next(): number;
  /** [0, maxExclusive)；floor(next()*max)，max ≤ 1e6 偏差可忽略 */
  int(maxExclusive: number): number;
  /** 均匀取一个元素；items 为空属编程错误，throw */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates，返回新数组，不改入参 */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32。同 seed 产出同序列（跨设备、跨版本一致——每日挑战的正确性基础） */
export function createRng(seed: Seed): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number): number => {
      if (typeof maxExclusive !== 'number' || !isFinite(maxExclusive) || maxExclusive < 1) {
        throw new RangeError('rng.int: maxExclusive must be a finite number >= 1');
      }
      return Math.floor(next() * maxExclusive);
    },
    pick: <T>(items: readonly T[]): T => {
      if (!items || items.length === 0) throw new RangeError('rng.pick: empty items');
      return items[Math.floor(next() * items.length)];
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

/** FNV-1a 32bit（冻结算法，逐字符对照契约公式） */
export function hashSeed(s: string): Seed {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** 冻结算法：UTC 日期 → "YYYY-MM-DD" → 'daily:'+iso → FNV-1a 32bit */
export function seedFromDate(d: Date): Seed {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const mm = m < 10 ? '0' + m : '' + m;
  const dd = day < 10 ? '0' + day : '' + day;
  return hashSeed('daily:' + y + '-' + mm + '-' + dd);
}
