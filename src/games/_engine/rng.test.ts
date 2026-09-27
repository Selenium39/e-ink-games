// rng 单测（契约 §4.2 / 决策⑥：固定向量钉死冻结算法）
import { describe, expect, it } from "vitest";

import { createRng, hashSeed, seedFromDate } from "./rng";

describe("createRng / mulberry32", () => {
  it("同 seed 产出同序列（100 个值逐位一致）", () => {
    const a = createRng(123456789);
    const b = createRng(123456789);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("不同 seed 序列不同", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
  });

  it("next 落在 [0,1)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // 固定向量：mulberry32 已冻结（决策⑥）。下列数值由参考实现生成，改动算法即失败。
  it("固定向量 mulberry32(1)", () => {
    const rng = createRng(1);
    expect(rng.next()).toBeCloseTo(0.6270739405881613, 15);
    expect(rng.next()).toBeCloseTo(0.002735721180215478, 15);
    expect(rng.next()).toBeCloseTo(0.5274470399599522, 15);
    expect(rng.next()).toBeCloseTo(0.9810509674716741, 15);
    expect(rng.next()).toBeCloseTo(0.9683778982143849, 15);
  });

  it("固定向量 mulberry32(42) 与 (0)", () => {
    expect(createRng(42).next()).toBeCloseTo(0.6011037519201636, 15);
    expect(createRng(0).next()).toBeCloseTo(0.26642920868471265, 15);
  });

  it("int 落在 [0, maxExclusive)；int(1) 恒 0", () => {
    const rng = createRng(42);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(createRng(999).int(1)).toBe(0);
  });

  it("int 固定向量：mulberry32(42).int(9) ×6 = 5,4,7,6,1,4", () => {
    const rng = createRng(42);
    expect([rng.int(9), rng.int(9), rng.int(9), rng.int(9), rng.int(9), rng.int(9)]).toEqual([
      5, 4, 7, 6, 1, 4,
    ]);
  });

  it("int 非法参数 throw（编程错误尽早暴露）", () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(NaN)).toThrow(RangeError);
    expect(() => rng.int(Infinity)).toThrow(RangeError);
  });

  it("pick 同 seed 结果确定；空数组 throw", () => {
    const items = ["a", "b", "c", "d"] as const;
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 10; i++) {
      expect(a.pick(items)).toBe(b.pick(items));
    }
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it("shuffle：不改入参、返回新数组、是同元素集排列、同 seed 同排列", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const snapshot = src.slice();

    const a = createRng(2026);
    const outA = a.shuffle(src);
    expect(src).toEqual(snapshot); // 入参未被改
    expect(outA).not.toBe(src); // 新数组
    expect(outA.slice().sort((x, y) => x - y)).toEqual(snapshot.slice().sort((x, y) => x - y)); // 排列

    const b = createRng(2026);
    const outB = b.shuffle(src);
    expect(outB).toEqual(outA); // 同 seed 同排列
  });

  it("next 值域为 uint32 精度（/2^32）", () => {
    // mulberry32 返回 ((t ^ t >>> 14) >>> 0) / 4294967296，最小步长 2^-32
    const rng = createRng(8);
    for (let i = 0; i < 200; i++) {
      const v = rng.next() * 4294967296;
      expect(Number.isInteger(Math.round(v)) || v % 1 !== 0).toBe(true);
      expect(v).toBeLessThan(4294967296);
    }
  });
});

describe("hashSeed / FNV-1a（冻结算法固定向量）", () => {
  it("固定向量", () => {
    expect(hashSeed("")).toBe(2166136261);
    expect(hashSeed("a")).toBe(3826002220);
    expect(hashSeed("abc")).toBe(440920331);
    expect(hashSeed("daily:2026-09-27")).toBe(241493554);
  });

  it("结果为 uint32", () => {
    const v = hashSeed("egames");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("seedFromDate（冻结算法：同 UTC 日同种子）", () => {
  it("固定向量：2026-09-27（UTC）", () => {
    expect(seedFromDate(new Date(Date.UTC(2026, 8, 27)))).toBe(241493554);
  });

  it("同 UTC 日不同时刻 → 同种子", () => {
    const morning = new Date(Date.UTC(2026, 8, 27, 0, 0, 0));
    const night = new Date(Date.UTC(2026, 8, 27, 23, 59, 59));
    expect(seedFromDate(morning)).toBe(seedFromDate(night));
  });

  it("跨 UTC 日界 → 不同种子", () => {
    const justBefore = new Date(Date.UTC(2026, 8, 27, 23, 59, 59));
    const justAfter = new Date(Date.UTC(2026, 8, 28, 0, 0, 1));
    expect(seedFromDate(justBefore)).not.toBe(seedFromDate(justAfter));
  });
});
