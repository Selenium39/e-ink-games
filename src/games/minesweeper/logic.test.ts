/**
 * minesweeper/logic 单测（契约 §5 + 任务书验收标准 3）。
 * 纯 Node 环境（vitest），无 DOM。
 *
 * 覆盖：新局构造与雷数、首击安全不变量、零格连通展开、插旗/胜负判定、
 * serialize/deserialize 往返、非法输入 throw、chord 行为、同 seed 确定性。
 */

import { describe, it, expect } from 'vitest';
import {
  newGame,
  dig,
  toggleFlag,
  chord,
  cellNumber,
  mineCounter,
  isSolved,
  serialize,
  deserialize,
  neighborsOf,
  LAYOUTS,
  type Difficulty,
  type GameState,
} from './logic';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const SEEDS: number[] = [1, 7, 42, 99, 1234, 65535, 262144, 1048576, 2147483647, 4294967295];

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 手工构造 9×9 局（placed 局可自定义雷图；绕过 newGame 的延迟布雷） */
function manualState(mines: string[], mineCount = -1): GameState {
  // mines：每行 9 字符，'*'=雷 '.'=空
  expect(mines.length).toBe(9);
  const total = 81;
  const m = new Array<boolean>(total).fill(false);
  let n = 0;
  for (let r = 0; r < 9; r++) {
    expect(mines[r].length).toBe(9);
    for (let c = 0; c < 9; c++) {
      if (mines[r].charAt(c) === '*') {
        m[r * 9 + c] = true;
        n++;
      }
    }
  }
  const base = newGame({ difficulty: 'easy', seed: 1 });
  return {
    ...base,
    placed: true,
    mines: m,
    mineCount: mineCount >= 0 ? mineCount : n,
  };
}

/** 测试侧独立实现的邻格计算（与 logic 实现解耦，交叉验证用） */
function crossNeighbors(cols: number, rowsN: number, idx: number): number[] {
  const r = (idx / cols) | 0;
  const c = idx % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rowsN || nc < 0 || nc >= cols) continue;
      out.push(nr * cols + nc);
    }
  }
  return out;
}

/** 测试侧独立数邻雷 */
function crossNumber(s: GameState, idx: number): number {
  let n = 0;
  for (const nb of crossNeighbors(s.cols, s.rows, idx)) {
    if (s.mines[nb]) n++;
  }
  return n;
}

/** 连通不变量：每个已展开格要么自身 0 邻雷，要么存在一个已展开的 0 邻雷邻格（起点除外不适用——所有展开都源自 flood） */
function expectFloodInvariant(s: GameState): void {
  expect(s.placed).toBe(true);
  for (let i = 0; i < s.mines.length; i++) {
    if (!s.revealed[i]) continue;
    expect(s.mines[i]).toBe(false); // 非终局局不可能展开雷
    if (crossNumber(s, i) !== 0) {
      // 非零格被展开 ⇒ 必有已展开的零邻格把它带出来
      const ok = crossNeighbors(s.cols, s.rows, i).some(
        (nb) => s.revealed[nb] && crossNumber(s, nb) === 0,
      );
      expect(ok).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// newGame：构造与雷数
// ---------------------------------------------------------------------------

describe('newGame', () => {
  it('三难度：布局/雷数与 LAYOUTS 一致，初始盘面全隐藏未布雷', () => {
    for (const d of ALL_DIFFICULTIES) {
      const L = LAYOUTS[d];
      const s = newGame({ difficulty: d });
      const total = L.rows * L.cols;
      expect(s.difficulty).toBe(d);
      expect(s.rows).toBe(L.rows);
      expect(s.cols).toBe(L.cols);
      expect(s.mineCount).toBe(L.mines);
      expect(s.placed).toBe(false);
      expect(s.mines.length).toBe(total);
      expect(s.revealed.length).toBe(total);
      expect(s.flags.length).toBe(total);
      expect(s.mines.every((x) => x === false)).toBe(true);
      expect(s.revealed.every((x) => x === false)).toBe(true);
      expect(s.flags.every((x) => x === false)).toBe(true);
      expect(s.status).toBe('playing');
      expect(s.exploded).toBe(-1);
      expect(s.seed).toBe(null);
      expect(isSolved(s)).toBe(false);
    }
  });

  it('任务规格布局：easy 9×9/10、medium 11×11/24、hard 13×13/40', () => {
    expect(LAYOUTS.easy).toEqual({ rows: 9, cols: 9, mines: 10 });
    expect(LAYOUTS.medium).toEqual({ rows: 11, cols: 11, mines: 24 });
    expect(LAYOUTS.hard).toEqual({ rows: 13, cols: 13, mines: 40 });
  });

  it('seed 注入与保留', () => {
    expect(newGame({ difficulty: 'easy', seed: 42 }).seed).toBe(42);
    expect(newGame({ difficulty: 'easy', seed: 0 }).seed).toBe(0);
    expect(newGame({ difficulty: 'easy', seed: 0xffffffff }).seed).toBe(0xffffffff);
  });

  it('非法输入 throw：opts 非对象 / 非法难度 / seed 越界或非整数', () => {
    expect(() => newGame(null as unknown as { difficulty: Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'expert' } as unknown as { difficulty: Difficulty })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: -1 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 1.5 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: 0x100000000 })).toThrow();
    expect(() => newGame({ difficulty: 'easy', seed: Number.NaN })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 首击安全不变量
// ---------------------------------------------------------------------------

describe('首击安全', () => {
  const spots: Array<[number, number]> = [
    [0, 0], [0, 8], [8, 0], [8, 8],           // 角
    [0, 4], [4, 0], [4, 8], [8, 4],           // 边
    [4, 4], [1, 1],                            // 心部
  ];

  it('任意难度 × 多 seed × 多首击位：首击格与 8 邻格永不为雷，且必展开、不输', () => {
    for (const d of ALL_DIFFICULTIES) {
      const L = LAYOUTS[d];
      for (const seed of SEEDS.slice(0, 4)) {
        for (const [r, c] of spots) {
          const s0 = newGame({ difficulty: d, seed });
          const s1 = dig(s0, r, c);
          expect(s1.placed).toBe(true);
          expect(s1.status).toBe('playing'); // 首击必不输
          const idx = r * L.cols + c;
          expect(s1.revealed[idx]).toBe(true);
          expect(s1.mines[idx]).toBe(false);
          for (const nb of crossNeighbors(L.cols, L.rows, idx)) {
            expect(s1.mines[nb]).toBe(false);
          }
          // 布雷后雷数恰为规格值
          let mineN = 0;
          for (let i = 0; i < s1.mines.length; i++) {
            if (s1.mines[i]) mineN++;
          }
          expect(mineN).toBe(L.mines);
        }
      }
    }
  });

  it('同 seed + 同首击位置 → 同一盘（确定性）', () => {
    for (const seed of [3, 77, 999]) {
      const a = dig(newGame({ difficulty: 'medium', seed }), 5, 5);
      const b = dig(newGame({ difficulty: 'medium', seed }), 5, 5);
      expect(a.mines).toEqual(b.mines);
      expect(a.revealed).toEqual(b.revealed);
    }
  });

  it('不同 seed → 盘面（几乎）必不同', () => {
    const a = dig(newGame({ difficulty: 'easy', seed: 1 }), 4, 4);
    const b = dig(newGame({ difficulty: 'easy', seed: 2 }), 4, 4);
    expect(a.mines).not.toEqual(b.mines);
  });

  it('placed 前重复首击位次序无关：同局第二次 dig 已展开 no-op（原引用）', () => {
    const s0 = newGame({ difficulty: 'easy', seed: 9 });
    const s1 = dig(s0, 3, 3);
    expect(dig(s1, 3, 3)).toBe(s1);
  });
});

// ---------------------------------------------------------------------------
// 零格连通展开
// ---------------------------------------------------------------------------

describe('零格连通展开', () => {
  it('空盘（0 雷）一击全开 + won', () => {
    const s = manualState([
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ], 0);
    const s1 = dig(s, 4, 4);
    expect(s1.revealed.every((x) => x === true)).toBe(true);
    expect(s1.status).toBe('won');
    expect(isSolved(s1)).toBe(true);
  });

  it('flood 止于数字边界：雷墙围出的零区恰连通展开', () => {
    // 雷墙：第 0 行全雷 + 第 8 行全雷（18 雷）；dig(4,4) 展开中间 7 行全部零区，
    // 非雷格恰好全开 → won 且 18 面旗自动补齐
    const rows: string[] = [];
    for (let r = 0; r < 9; r++) {
      rows.push(r === 0 || r === 8 ? '*********' : '.........');
    }
    const s = manualState(rows);
    const s1 = dig(s, 4, 4);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const open = r >= 1 && r <= 7;
        expect(s1.revealed[r * 9 + c]).toBe(open);
      }
    }
    expect(s1.status).toBe('won');
    expect(s1.flags.filter(Boolean).length).toBe(18);
  });

  it('flood 不越过旗格（旗保护）', () => {
    // 全空盘，唯一零区被一面旗墙截断：dig 左侧后旗右侧格不可被 flood 打开
    const s0 = manualState([
      '.........',
      '.........',
      '.........',
      '.........',
      '....*....', // 第 4 行第 4 列一雷 → 拆零区为上下两半？1 雗只挡 3x3
      '.........',
      '.........',
      '.........',
      '.........',
    ]);
    // 上半区 flag 墙（第 1 行全插旗）
    let s = s0;
    for (let c = 0; c < 9; c++) {
      s = toggleFlag(s, 1, c);
    }
    const s1 = dig(s, 0, 4); // 上角落零格（角格邻 2 格 = 旗+空 → 数字>0? 角(0,4) 邻 (0,3)(0,5)(1,3..5)；(1,*) 是旗）
    // 旗行未展开
    for (let c = 0; c < 9; c++) {
      expect(s1.revealed[9 + c]).toBe(false); // 旗格保护
    }
    expect(s1.revealed[4]).toBe(true); // 起点已展开
  });

  it('自动局（多 seed）：连通不变量 + 展开格数字与独立计算一致', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      for (const d of ALL_DIFFICULTIES) {
        const s0 = newGame({ difficulty: d, seed });
        const s1 = dig(s0, 2, 2);
        expectFloodInvariant(s1);
        for (let i = 0; i < s1.mines.length; i++) {
          if (s1.revealed[i]) {
            expect(cellNumber(s1, (i / s1.cols) | 0, i % s1.cols)).toBe(crossNumber(s1, i));
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 插旗
// ---------------------------------------------------------------------------

describe('插旗', () => {
  it('翻转/取消、mineCounter 随动（可为负）', () => {
    const s0 = newGame({ difficulty: 'easy' });
    expect(mineCounter(s0)).toBe(10);
    const s1 = toggleFlag(s0, 0, 0);
    expect(s1.flags[0]).toBe(true);
    expect(mineCounter(s1)).toBe(9);
    const s2 = toggleFlag(s1, 0, 0);
    expect(s2.flags[0]).toBe(false);
    expect(mineCounter(s2)).toBe(10);
    let over = s1;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (r * 9 + c === 0) continue;
        over = toggleFlag(over, r, c);
      }
    }
    expect(mineCounter(over)).toBe(10 - 81);
  });

  it('已展开格 no-op（原引用）；结束后 no-op；placed 前可预插旗', () => {
    const s0 = manualState(['.........', '.........', '.........', '.........',
      '...*.....', '.........', '.........', '.........', '.........']);
    const s1 = dig(s0, 8, 8); // 展开右下角大片
    const open = s1.revealed.findIndex((x) => x);
    expect(open).toBeGreaterThanOrEqual(0);
    expect(toggleFlag(s1, (open / s1.cols) | 0, open % s1.cols)).toBe(s1);
    // placed 前预插旗合法
    const fresh = newGame({ difficulty: 'easy' });
    expect(toggleFlag(fresh, 4, 4).flags[40]).toBe(true);
    // 踩雷终局后一切旗操作 no-op（雷在 (4,3)）
    const boomed = dig(s0, 4, 3);
    expect(boomed.status).toBe('lost');
    expect(toggleFlag(boomed, 0, 0)).toBe(boomed);
  });

  it('旗保护：dig 旗格 no-op（即使下面是雷）', () => {
    const s0 = manualState(['.........', '.........', '.........', '.........',
      '...*.....', '.........', '.........', '.........', '.........']);
    const flagged = toggleFlag(s0, 4, 4); // 给雷插旗
    expect(dig(flagged, 4, 4)).toBe(flagged);
  });
});

// ---------------------------------------------------------------------------
// 胜负判定
// ---------------------------------------------------------------------------

describe('胜负判定', () => {
  const oneMine = () =>
    manualState(['.........', '.........', '.........', '.........',
      '*........', '.........', '.........', '.........', '.........']);

  it('踩雷 → lost：爆格记录、全部雷揭示、exploded 即雷格', () => {
    const s = dig(oneMine(), 4, 0);
    expect(s.status).toBe('lost');
    expect(s.exploded).toBe(36);
    expect(s.mines[36]).toBe(true);
    expect(s.revealed[36]).toBe(true);
    // 全部雷已揭示（本局单雷）
    for (let i = 0; i < 81; i++) {
      if (s.mines[i]) expect(s.revealed[i]).toBe(true);
    }
    expect(isSolved(s)).toBe(false);
  });

  it('挖开全部非雷格 → won：自动补旗全部雷、mineCounter 归零', () => {
    const s = dig(oneMine(), 8, 8); // 8,8 不邻 (4,0)，且零区全开
    // 单雷 9x9：dig(8,8) 应 flood 开全部 80 非雷格
    expect(s.status).toBe('won');
    expect(isSolved(s)).toBe(true);
    expect(s.flags[36]).toBe(true); // 雷自动补旗
    expect(mineCounter(s)).toBe(0);
    expect(s.exploded).toBe(-1);
  });

  it('won/lost 后一切输入 no-op（原引用）', () => {
    const won = dig(oneMine(), 8, 8);
    expect(dig(won, 0, 0)).toBe(won);
    expect(toggleFlag(won, 0, 0)).toBe(won);
    expect(chord(won, 0, 0)).toBe(won);
    const lost = dig(oneMine(), 4, 0);
    expect(dig(lost, 0, 0)).toBe(lost);
    expect(chord(lost, 0, 0)).toBe(lost);
  });
});

// ---------------------------------------------------------------------------
// chord
// ---------------------------------------------------------------------------

describe('chord', () => {
  // 单雷 (0,0)：dig(0,1) 只展开数字 1 的它自己（非零不 flood），邻格 (1,0)(1,1)(1,2)(0,2) 未展开
  const singleMine = () =>
    manualState(['*........', '.........', '.........', '.........',
      '.........', '.........', '.........', '.........', '.........']);

  it('旗数=数字 → 点开其余邻格（连带零区 flood → won）', () => {
    let s = dig(singleMine(), 0, 1);
    expect(s.revealed[1]).toBe(true);
    expect(s.revealed[9]).toBe(false); // (1,0) 未展开
    expect(cellNumber(s, 0, 1)).toBe(1);
    s = toggleFlag(s, 0, 0); // 旗数 1 = 数字 1
    const after = chord(s, 0, 1);
    expect(after).not.toBe(s); // 发生转移
    expect(after.revealed[9]).toBe(true);
    expect(after.revealed[2]).toBe(true);
    // chord 带出 (1,1) 零区 flood → 全部非雷格展开 → won
    expect(after.status).toBe('won');
  });

  it('旗数不符 → no-op（原引用）', () => {
    const s = dig(singleMine(), 0, 1); // 无旗：0 ≠ 1
    expect(chord(s, 0, 1)).toBe(s);
  });

  it('chord 踩雷 → lost（旗插错位置）', () => {
    // 雷在 (0,0) 与 (2,0)；(1,1) 数字 2。两旗都插在非雷格 (0,1)(1,0) →
    // 旗数 2 = 数字 2，chord 点开 (2,0) 是雷 → lost
    const board = manualState(['*........', '.........', '*........', '.........',
      '.........', '.........', '.........', '.........', '.........']);
    let s = dig(board, 1, 1);
    expect(cellNumber(s, 1, 1)).toBe(2);
    expect(s.revealed[10]).toBe(true);
    s = toggleFlag(s, 0, 1);
    s = toggleFlag(s, 1, 0);
    const boomed = chord(s, 1, 1);
    expect(boomed.status).toBe('lost');
    // targets 中第一颗未插旗的雷是 (0,0)（两旗都插在非雷格）
    expect(boomed.exploded).toBe(0);
    expect(boomed.mines[boomed.exploded]).toBe(true);
  });

  it('未展开格 / 零格 / placed 前 chord 均 no-op', () => {
    const fresh = newGame({ difficulty: 'easy' });
    expect(chord(fresh, 4, 4)).toBe(fresh); // placed 前
    // 双雷墙（第 3/5 行）夹出孤立零带：dig(4,4) 只开第 4 行，仍 playing
    const rows: string[] = [];
    for (let r = 0; r < 9; r++) {
      rows.push(r === 3 || r === 5 ? '*********' : '.........');
    }
    const s = dig(manualState(rows), 4, 4);
    expect(s.status).toBe('playing');
    expect(chord(s, 4, 4)).toBe(s); // 零格（数字 0）no-op
    expect(chord(s, 4, 0)).toBe(s); // 仍是零格 no-op
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('serialize/deserialize', () => {
  it('初始局往返', () => {
    const s = newGame({ difficulty: 'medium', seed: 77 });
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('中盘局往返（seed 局：dig+flag 交错）', () => {
    for (const seed of [5, 100, 8888]) {
      let s = dig(newGame({ difficulty: 'hard', seed }), 6, 6);
      s = toggleFlag(s, 0, 0);
      s = toggleFlag(s, 12, 12);
      s = toggleFlag(s, 0, 0);
      const back = deserialize(serialize(s));
      expect(back).toEqual(s);
      expect(back === null ? false : back.seed).toBe(seed);
    }
  });

  it('随机局（seed=null）往返；won/lost 局往返', () => {
    // 真实 easy 雷数（10）的手工局：第 0 行 9 雷 + (1,0) 1 雷，保证与 LAYOUTS 一致可往返
    const ten = manualState([
      '*********',
      '*........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ]);
    expect(ten.mineCount).toBe(10);
    const won = dig(ten, 8, 8); // 中部零区全开 + 贴零数字格 → 非雷 71 格全开
    expect(won.status).toBe('won');
    const lost = dig(ten, 0, 4);
    expect(lost.status).toBe('lost');
    expect(deserialize(serialize(won))).toEqual(won);
    expect(deserialize(serialize(lost))).toEqual(lost);
    const randomMid = toggleFlag(dig(newGame({ difficulty: 'easy' }), 3, 3), 0, 8);
    expect(deserialize(serialize(randomMid))).toEqual(randomMid);
  });

  it('非法/损坏输入 → null（绝不抛）', () => {
    const easy = serialize(newGame({ difficulty: 'easy' }));
    const bad: string[] = [
      '',
      'garbage',
      'ms1',
      easy.replace('ms1', 'ms2'),               // 版本错
      easy.replace(';easy;', ';expert;'),       // 难度词表
      easy.replace(';9x9;', ';8x9;'),           // 布局不符
      easy.replace(/;p;/, ';x;/'),              // status 字符
      easy.replace(/;-1;/, ';999999;'),         // exploded 越界
      serialize(newGame({ difficulty: 'easy', seed: 5 })).replace(';5;', ';-3;'), // seed 负
      easy.slice(0, -1),                        // 截断（hex 缺一字符）
    ];
    for (const raw of bad) {
      expect(deserialize(raw)).toBe(null);
    }
    // hex 非法字符
    const parts = easy.split(';');
    parts[7] = parts[7].slice(0, -1) + 'g';
    expect(deserialize(parts.join(';'))).toBe(null);
    // 尾 padding bit 非 0：easy 81 bit、尾 3 bit padding；把雷图末 hex 从 0 改 1
    const placed = serialize(dig(newGame({ difficulty: 'easy', seed: 3 }), 4, 4)).split(';');
    if (placed[7].charAt(placed[7].length - 1) === '0') {
      placed[7] = placed[7].slice(0, -1) + '1';
      expect(deserialize(placed.join(';'))).toBe(null);
    }
    // 雷数与 mineCount 不符：抹掉雷图中最后一个非零 nibble（10→<10）
    const sp = serialize(dig(newGame({ difficulty: 'easy', seed: 3 }), 4, 4)).split(';');
    let removed = false;
    for (let k = sp[7].length - 1; k >= 0 && !removed; k--) {
      if (sp[7].charAt(k) !== '0') {
        sp[7] = sp[7].slice(0, k) + '0' + sp[7].slice(k + 1);
        removed = true;
      }
    }
    expect(removed).toBe(true);
    expect(deserialize(sp.join(';'))).toBe(null);
    // 非字符串
    expect(deserialize(null as unknown as string)).toBe(null);
    expect(deserialize(123 as unknown as string)).toBe(null);
  });

  it('status 与内容矛盾 → null', () => {
    const base = dig(newGame({ difficulty: 'easy', seed: 3 }), 4, 4);
    // playing 但 exploded 非 -1
    const p = serialize(base).split(';');
    p[6] = '40';
    expect(deserialize(p.join(';'))).toBe(null);
    // 强标 won 但非雷未全展开
    const w = serialize(base).split(';');
    w[5] = 'w';
    expect(deserialize(w.join(';'))).toBe(null);
    // 强标 lost 但 exploded=-1
    const l = serialize(base).split(';');
    l[5] = 'l';
    expect(deserialize(l.join(';'))).toBe(null);
    // 旗格与已展开格重叠：找一个已展开 idx，把 flags 位图对应 bit 置 1
    const q = serialize(base).split(';');
    const idx = base.revealed.findIndex((x) => x);
    const nibIdx = idx >> 2;
    const hexChar = parseInt(q[9].charAt(nibIdx), 16);
    q[9] = q[9].slice(0, nibIdx) + '0123456789abcdef'.charAt(hexChar | (1 << (3 - (idx & 3)))) + q[9].slice(nibIdx + 1);
    expect(deserialize(q.join(';'))).toBe(null);
  });

  it('placed 前雷图必须为空', () => {
    const fresh = serialize(newGame({ difficulty: 'easy' }));
    const p = fresh.split(';');
    p[4] = '1'; // 伪称已布雷但雷图全 0 → 雷数 0 ≠ 10
    expect(deserialize(p.join(';'))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 非法输入 throw
// ---------------------------------------------------------------------------

describe('非法输入 throw', () => {
  it('dig/toggleFlag/chord/cellNumber/neighborsOf 越界与非整数', () => {
    const s = newGame({ difficulty: 'easy' });
    expect(() => dig(s, -1, 0)).toThrow();
    expect(() => dig(s, 0, -1)).toThrow();
    expect(() => dig(s, 9, 0)).toThrow();
    expect(() => dig(s, 0, 9)).toThrow();
    expect(() => dig(s, 1.5, 0)).toThrow();
    expect(() => toggleFlag(s, 99, 99)).toThrow();
    expect(() => chord(s, 0, 9)).toThrow();
    expect(() => cellNumber(s, -1, 4)).toThrow();
    expect(() => neighborsOf(s, -1)).toThrow();
    expect(() => neighborsOf(s, 81)).toThrow();
    // 状态对象非法
    expect(() => dig({} as GameState, 0, 0)).toThrow();
    expect(() => dig(null as unknown as GameState, 0, 0)).toThrow();
  });

  it('serialize 对损坏状态 throw（编程错误）', () => {
    const s = newGame({ difficulty: 'easy' });
    const broken = { ...s, mines: [false, false] } as unknown as GameState;
    expect(() => serialize(broken)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// neighborsOf 交叉验证
// ---------------------------------------------------------------------------

describe('neighborsOf', () => {
  it('与独立实现一致（角/边/心 × 三布局）', () => {
    for (const d of ALL_DIFFICULTIES) {
      const s = newGame({ difficulty: d });
      const L = LAYOUTS[d];
      for (const [r, c] of [[0, 0], [0, L.cols - 1], [L.rows - 1, 0], [L.rows - 1, L.cols - 1], [0, 2], [3, 0], [5, 5]]) {
        const idx = r * L.cols + c;
        expect(neighborsOf(s, idx).sort((a, b) => a - b)).toEqual(
          crossNeighbors(L.cols, L.rows, idx).sort((a, b) => a - b),
        );
      }
    }
  });
});
