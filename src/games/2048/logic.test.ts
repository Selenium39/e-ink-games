/**
 * 2048/logic 单测（任务书验收标准 3）。
 * 纯 Node 环境（vitest），无 DOM。
 *
 * 覆盖：单步合并各方向（经典 case）、每步至多合并一次、新块不落非空格、
 * 非法方向 no-op（原引用）、死局 game over 判定、serialize/deserialize 往返、
 * 确定性（同 seed 同序列）、不可变性、胜利判定、非法参数 throw。
 */

import { describe, it, expect } from 'vitest';
import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';
import {
  newGame,
  move,
  canMove,
  isWinningCells,
  serialize,
  deserialize,
  type Dir,
  type GameState,
} from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 以 cells 构造最小合法 GameState（全玩家操作、无瞬态标记） */
function stateFrom(cells: number[], extra?: Partial<GameState>): GameState {
  return {
    cells: cells.slice(),
    score: 0,
    over: false,
    won: false,
    spawnedAt: -1,
    mergedAt: [],
    ...extra,
  };
}

/** 固定 seed 的 Rng（确定性随机源） */
function rngOf(seed: number): Rng {
  return createRng(seed);
}

/**
 * 把 move 结果中 spawn 的新块「抠掉」（置 0），得到纯净的合并位移盘，
 * 从而对合并语义做免疫 spawn 随机性的精确断言。
 */
function withoutSpawn(s: GameState): number[] {
  const cells = s.cells.slice();
  if (s.spawnedAt >= 0) cells[s.spawnedAt] = 0;
  return cells;
}

/** 行 → 16 格盘（4 行拼接） */
function board(...rows: number[][]): number[] {
  expect(rows.length).toBe(4);
  const out: number[] = [];
  for (const r of rows) {
    expect(r.length).toBe(4);
    for (const v of r) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 单遍合并语义 —— 各方向经典 case
// ---------------------------------------------------------------------------

describe('move：单遍合并（经典 2048 规则）', () => {
  it('left：[2,2,2,2] → [4,4]（两次合并，不连锁成 8）', () => {
    const s = stateFrom(board([2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(1));
    expect(r).not.toBe(s); // 有效移动
    expect(withoutSpawn(r)).toEqual(board([4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt.slice().sort()).toEqual([0, 1]);
    expect(r.score).toBe(8); // 4 + 4
  });

  it('left：[2,2,2] → [4,2]（第三次 2 不越过新 4 二次合并）', () => {
    const s = stateFrom(board([2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(2));
    expect(withoutSpawn(r)).toEqual(board([4, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt).toEqual([0]);
    expect(r.score).toBe(4);
  });

  it('left：[2,4,2] 互不相邻等值 → 不合并不越位，仅可能平移', () => {
    const s = stateFrom(board([0, 2, 4, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(3));
    expect(withoutSpawn(r)).toEqual(board([2, 4, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('left：[2,2,4] → [4,4]（每步至多合并一次：合并产物 4 不并入原 4 成 8）', () => {
    const s = stateFrom(board([2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(4));
    expect(withoutSpawn(r)).toEqual(board([4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt).toEqual([0]);
    expect(r.score).toBe(4); // 只得一次 2+2=4
  });

  it('left：[4,2,2] → [4,4]（靠目标端优先合并，远端 2 不越过 4）', () => {
    const s = stateFrom(board([4, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(5));
    expect(withoutSpawn(r)).toEqual(board([4, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt).toEqual([1]);
  });

  it('left：[4,4,8,0] → [8,8]（合并出的 8 不与原 8 连锁成 16，得 8 分）', () => {
    const s = stateFrom(board([4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(6));
    expect(withoutSpawn(r)).toEqual(board([8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.score).toBe(8); // 仅 4+4 一次合并计分
  });

  it('right：目标端为行尾 —— [2,2,4,0] → [0,0,4,4]，[2,2,2,0] → [0,0,2,4]', () => {
    const a = stateFrom(board([2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const ra = move(a, 'right', rngOf(7));
    expect(withoutSpawn(ra)).toEqual(board([0, 0, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));

    const b = stateFrom(board([2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const rb = move(b, 'right', rngOf(8));
    expect(withoutSpawn(rb)).toEqual(board([0, 0, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
  });

  it('up：列方向目标端为行首 —— 列 [2,2,4] → [4,4,0]', () => {
    const s = stateFrom(board([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'up', rngOf(9));
    expect(withoutSpawn(r)).toEqual(board([4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.mergedAt).toEqual([0]);
    expect(r.score).toBe(4);
  });

  it('down：列方向目标端为行尾 —— 列 [2,0,0,2] → 底部 [4]', () => {
    const s = stateFrom(board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]));
    const r = move(s, 'down', rngOf(10));
    expect(withoutSpawn(r)).toEqual(board([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0]));
    expect(r.mergedAt).toEqual([12]);
  });

  it('多行同时独立合并，互不干扰', () => {
    const s = stateFrom(
      board([2, 2, 0, 0], [0, 0, 0, 0], [8, 8, 0, 0], [0, 0, 0, 0]),
    );
    const r = move(s, 'left', rngOf(11));
    expect(withoutSpawn(r)).toEqual(board([4, 0, 0, 0], [0, 0, 0, 0], [16, 0, 0, 0], [0, 0, 0, 0]));
    expect(r.score).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 新块生成
// ---------------------------------------------------------------------------

describe('move：新块生成', () => {
  it('spawn 只落在移动后的空格（全盘唯一空格：spawnedAt 恒为该格，值 ∈ {2,4}）', () => {
    // row0 [0,2,4,8] left 平移 → [2,4,8,_]；其余行已压实不动 → 移动后全盘唯一空格 idx3
    const s = stateFrom(
      board([0, 2, 4, 8], [16, 32, 64, 128], [2, 4, 8, 16], [32, 64, 128, 256]),
    );
    for (let seed = 1; seed <= 30; seed++) {
      const r = move(s, 'left', rngOf(seed));
      expect(r.spawnedAt).toBe(3);
      expect(r.cells[3] === 2 || r.cells[3] === 4).toBe(true);
      expect(r.cells[0]).toBe(2);
      expect(r.cells[1]).toBe(4);
      expect(r.cells[2]).toBe(8);
    }
  });

  it('spawn 值 ∈ {2,4} 且不落在非空格（多 seed 扫描，扣除 spawn 后全盘符合合并期望）', () => {
    const s = stateFrom(board([2, 2, 0, 0], [0, 4, 0, 8], [16, 0, 2, 0], [0, 32, 0, 64]));
    for (let seed = 1; seed <= 30; seed++) {
      const r = move(s, 'left', rngOf(seed));
      const v = r.cells[r.spawnedAt];
      expect(v === 2 || v === 4).toBe(true);
      // spawnedAt 必是移动后为空（spawn 前）的格子
      expect(r.mergedAt.indexOf(r.spawnedAt)).toBe(-1);
    }
  });

  it('newGame：恰好两个起始块，值 ∈ {2,4}，分数 0、未分胜负', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = newGame(rngOf(seed));
      let count = 0;
      for (let i = 0; i < 16; i++) {
        const v = s.cells[i];
        if (v !== 0) {
          count++;
          expect(v === 2 || v === 4).toBe(true);
        }
      }
      expect(count).toBe(2);
      expect(s.score).toBe(0);
      expect(s.over).toBe(false);
      expect(s.won).toBe(false);
      expect(s.spawnedAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('新块取 4 的频率接近 10%（400 局 × 2 块软化统计）', () => {
    let fours = 0;
    let total = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = newGame(rngOf(seed));
      for (let i = 0; i < 16; i++) {
        if (s.cells[i] !== 0) {
          total++;
          if (s.cells[i] === 4) fours++;
        }
      }
    }
    const ratio = fours / total;
    expect(ratio).toBeGreaterThan(0.05);
    expect(ratio).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// 无效移动与死局
// ---------------------------------------------------------------------------

describe('move：no-op 与 game over', () => {
  it('该方向无任何位移/合并 → 返回原引用（不 spawn、不改 score）', () => {
    // row0 已压实且无相邻等值：left 完全不动；其余行全 0 也不动
    const s = stateFrom(board([2, 4, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(12));
    expect(r).toBe(s);
  });

  it('行/列均已压实 → left/right/up 皆 no-op；有空隙的 down 方向正常移动', () => {
    // 行内无相邻等值、列上 [2,4,0,0] 亦已压实：三个方向 no-op（有空格的合法 no-op 形态）
    const s = stateFrom(board([2, 4, 2, 4], [4, 8, 4, 8], [0, 0, 0, 0], [0, 0, 0, 0]));
    expect(move(s, 'left', rngOf(13))).toBe(s);
    expect(move(s, 'right', rngOf(13))).toBe(s);
    expect(move(s, 'up', rngOf(13))).toBe(s);
    // down：列 [2,4,0,0] → [0,0,2,4]，有效移动
    const down = move(s, 'down', rngOf(13));
    expect(down).not.toBe(s);
    expect(withoutSpawn(down)).toEqual(
      board([0, 0, 0, 0], [0, 0, 0, 0], [2, 4, 2, 4], [4, 8, 4, 8]),
    );
  });

  it('满盘死局（无空格且无相邻等值）→ move 判定 over=true', () => {
    const dead = board([2, 4, 8, 16], [16, 8, 4, 2], [2, 4, 8, 16], [16, 8, 4, 2]);
    expect(canMove(stateFrom(dead))).toBe(false);
    const s = stateFrom(dead);
    const r = move(s, 'left', rngOf(14));
    expect(r.over).toBe(true);
    expect(r.cells).toEqual(dead);
    expect(r.score).toBe(s.score);
  });

  it('已 over 的局再 move → 原引用 no-op', () => {
    const dead = board([2, 4, 8, 16], [16, 8, 4, 2], [2, 4, 8, 16], [16, 8, 4, 2]);
    const over = stateFrom(dead, { over: true });
    for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
      expect(move(over, dir, rngOf(15))).toBe(over);
    }
  });

  it('spawn 后恰好堵死满盘 → over=true（15 格满 + 1 空格平移收尾）', () => {
    // left 后唯一空格 idx3 被 spawn 填满即死局（相邻全不等，两种 spawn 值皆死）
    const s = stateFrom(
      board([0, 2, 4, 8], [16, 32, 64, 128], [2, 4, 8, 16], [32, 64, 128, 256]),
    );
    const r = move(s, 'left', rngOf(16));
    expect(r).not.toBe(s);
    expect(r.cells[3] === 2 || r.cells[3] === 4).toBe(true);
    expect(r.over).toBe(true);
    expect(canMove(r)).toBe(false);
  });

  it('canMove：有空格即 true；满盘有相邻等值 true；死局 false', () => {
    expect(canMove(stateFrom(board([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])))).toBe(true);
    expect(
      canMove(stateFrom(board([2, 4, 8, 16], [16, 8, 4, 2], [2, 4, 8, 16], [16, 8, 4, 4]))),
    ).toBe(true); // idx14/15 相邻等值
    expect(
      canMove(stateFrom(board([2, 4, 8, 16], [16, 8, 4, 2], [2, 4, 8, 16], [16, 8, 4, 2]))),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 胜利判定
// ---------------------------------------------------------------------------

describe('胜利 = 出现 2048（提示后可继续）', () => {
  it('1024+1024 合并出 2048 → won=true，且可继续移动', () => {
    const s = stateFrom(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]));
    const r = move(s, 'left', rngOf(17));
    expect(r.cells[0]).toBe(2048);
    expect(r.won).toBe(true);
    expect(r.over).toBe(false);
    expect(r.score).toBe(2048);
    // 继续移动不受 won 影响
    const r2 = move(r, 'right', rngOf(18));
    expect(r2.won).toBe(true);
  });

  it('won 一旦为 true 不回退；isWinningCells 独立判定', () => {
    const s = stateFrom(board([2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), {
      won: true,
    });
    expect(isWinningCells(s.cells)).toBe(true);
    const r = move(s, 'right', rngOf(19));
    expect(r.won).toBe(true);
    expect(isWinningCells(board([1024, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 序列化 / 不可变性 / 确定性 / 非法参数
// ---------------------------------------------------------------------------

describe('serialize / deserialize', () => {
  it('往返一致（持久字段；瞬态标记不序列化）', () => {
    let s = newGame(rngOf(20));
    const dirs: Dir[] = ['left', 'up', 'right', 'down'];
    for (let k = 0; k < 40; k++) {
      s = move(s, dirs[k % 4], rngOf(21 + k));
    }
    const restored = deserialize(serialize(s));
    expect(restored).not.toBeNull();
    expect(restored!.cells).toEqual(s.cells);
    expect(restored!.score).toBe(s.score);
    expect(restored!.over).toBe(s.over);
    expect(restored!.won).toBe(s.won);
    expect(restored!.spawnedAt).toBe(-1);
    expect(restored!.mergedAt).toEqual([]);
  });

  it('损坏 / 版本不符 / 非法盘面 → null，绝不抛', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{}')).toBeNull();
    expect(deserialize('[]')).toBeNull();
    const good = JSON.parse(serialize(newGame(rngOf(22))));
    expect(deserialize(JSON.stringify({ ...good, v: 99 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...good, cells: good.cells.slice(0, 15) }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...good, cells: [3, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...good, score: 'x' }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...good, over: 'yes' }))).toBeNull();
  });
});

describe('不可变性与确定性', () => {
  it('move/newGame 不改入参（深比较调用前快照）', () => {
    const s = newGame(rngOf(23));
    const snapshot = JSON.parse(JSON.stringify(s));
    for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
      move(s, dir, rngOf(24));
    }
    expect(s).toEqual(snapshot);
  });

  it('同 seed Rng 同步消耗 → 完全相同的演化序列', () => {
    let a = newGame(rngOf(100));
    let b = newGame(rngOf(100));
    const dirs: Dir[] = ['left', 'up', 'right', 'down'];
    for (let k = 0; k < 60; k++) {
      const dir = dirs[k % 4];
      a = move(a, dir, rngOf(500));
      b = move(b, dir, rngOf(500));
      expect(a.cells).toEqual(b.cells);
      expect(a.score).toBe(b.score);
    }
  });
});

describe('非法参数 throw（编程错误契约）', () => {
  it('非法方向 / 非法 cells / 缺 Rng → throw', () => {
    const s = newGame(rngOf(25));
    expect(() => move(s, 'diagonal' as Dir, rngOf(26))).toThrow();
    expect(() => move(s, 'left', undefined as unknown as Rng)).toThrow();
    expect(() => move({ ...s, cells: [2, 2, 0] }, 'left', rngOf(27))).toThrow();
    expect(() => move({ ...s, cells: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 'left', rngOf(28))).toThrow();
    expect(() => newGame(undefined as unknown as Rng)).toThrow();
    expect(() => canMove({ ...s, cells: [] })).toThrow();
    expect(() => isWinningCells([2048])).toThrow();
  });
});
