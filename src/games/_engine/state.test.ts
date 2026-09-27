// state 状态机单测（契约 §4.4：undo 栈、serialize roundtrip、onChange 订阅）
import { describe, expect, it } from "vitest";

import { createState, STATE_SCHEMA_VERSION, UNDO_LIMIT_DEFAULT } from "./state";

interface S {
  n: number;
  label: string;
}

const mk = (n: number, label = "x"): S => ({ n, label });

describe("createState 基础", () => {
  it("get 返回初始状态，引用稳定直到变更", () => {
    const initial = mk(1);
    const sm = createState<S>(initial);
    expect(sm.get()).toBe(initial);
  });

  it("commit：旧状态入 undo 栈，current 替换", () => {
    const sm = createState<S>(mk(1));
    const next = mk(2);
    sm.commit(next);
    expect(sm.get()).toBe(next);
    expect(sm.undoDepth()).toBe(1);
    expect(sm.canUndo()).toBe(true);
  });

  it("undo：逐步回退并返回回退后的状态；栈空返回 null 不抛错", () => {
    const s1 = mk(1);
    const s2 = mk(2);
    const s3 = mk(3);
    const sm = createState<S>(s1);
    sm.commit(s2);
    sm.commit(s3);

    expect(sm.undo()).toBe(s2);
    expect(sm.undo()).toBe(s1);
    expect(sm.canUndo()).toBe(false);
    expect(sm.undo()).toBeNull(); // 栈空
    expect(sm.get()).toBe(s1);
  });

  it("replace：不入 undo 栈（undo 跳过被替换的值）", () => {
    const sm = createState<S>(mk(1));
    sm.commit(mk(2));
    const replaced = mk(99);
    sm.replace(replaced);

    expect(sm.get()).toBe(replaced);
    expect(sm.undoDepth()).toBe(1); // replace 未入栈
    expect(sm.undo()).toEqual(mk(1)); // 直接回到 commit(2) 之前的初始态
  });

  it("栈满丢最旧（默认上限 UNDO_LIMIT_DEFAULT=100）", () => {
    expect(UNDO_LIMIT_DEFAULT).toBe(100);
    const sm = createState<S>(mk(0));
    for (let i = 1; i <= 150; i++) sm.commit(mk(i));

    expect(sm.undoDepth()).toBe(100);
    // 栈内存活的是 50..149：initial(0) 与 1..49 已被 shift 丢弃
    expect(sm.undo()).toEqual(mk(149));
    for (let i = 148; i >= 51; i--) expect(sm.undo()).toEqual(mk(i));
    expect(sm.undo()).toEqual(mk(50)); // 栈底：最后存活的最旧状态
    expect(sm.undo()).toBeNull();
  });

  it("自定义 undoLimit 生效", () => {
    const sm = createState<S>(mk(0), { undoLimit: 2 });
    sm.commit(mk(1));
    sm.commit(mk(2));
    sm.commit(mk(3));

    expect(sm.undoDepth()).toBe(2);
    expect(sm.undo()).toEqual(mk(2));
    expect(sm.undo()).toEqual(mk(1));
    expect(sm.undo()).toBeNull();
  });
});

describe("serialize / deserialize", () => {
  it("serialize 结构含 v 与 current（契约决策⑤：不含 undo 栈）", () => {
    const sm = createState<S>(mk(1));
    sm.commit(mk(2));
    const data = sm.serialize();
    expect(data.v).toBe(STATE_SCHEMA_VERSION);
    expect(data.current).toEqual(mk(2));
    expect(Object.keys(data).sort()).toEqual(["current", "v"]);
  });

  it("serialize roundtrip：新实例 deserialize 后状态一致", () => {
    const a = createState<S>(mk(1));
    a.commit(mk(2));
    a.commit(mk(3, "three"));

    const b = createState<S>(mk(0, "fresh"));
    expect(b.deserialize(a.serialize())).toBe(true);
    expect(b.get()).toEqual(mk(3, "three"));
    // 进程内 roundtrip 为引用赋值（deserialize 无深拷贝契约）；不可变风格下两实例后续互不影响
    b.commit(mk(4, "after"));
    expect(a.get()).toEqual(mk(3, "three"));
  });

  it("deserialize：v 不匹配 → false 且状态不变", () => {
    const sm = createState<S>(mk(1));
    const bad = { v: 999, current: mk(9) };
    expect(sm.deserialize(bad)).toBe(false);
    expect(sm.get()).toEqual(mk(1));
  });

  it("deserialize：结构非法（null / 数组 / 缺 current / current 为 undefined）→ false 且状态不变", () => {
    const sm = createState<S>(mk(1));
    expect(sm.deserialize(null as unknown as { v: number; current: S })).toBe(false);
    expect(sm.deserialize([1] as unknown as { v: number; current: S })).toBe(false);
    expect(sm.deserialize({ v: 1 } as unknown as { v: number; current: S })).toBe(false);
    expect(
      sm.deserialize({ v: 1, current: undefined } as unknown as { v: number; current: S }),
    ).toBe(false);
    expect(sm.get()).toEqual(mk(1));
  });

  it("JSON roundtrip：serialize → JSON 字符串 → parse → deserialize", () => {
    const a = createState<S>(mk(1));
    a.commit(mk(2, "persisted"));
    const raw = JSON.stringify(a.serialize());

    const b = createState<S>(mk(0));
    expect(b.deserialize(JSON.parse(raw))).toBe(true);
    expect(b.get()).toEqual(mk(2, "persisted"));
  });
});

describe("onChange", () => {
  it("commit / replace / undo 均触发，收到最新状态", () => {
    const sm = createState<S>(mk(1));
    const seen: S[] = [];
    sm.onChange((s) => seen.push(s));

    sm.commit(mk(2));
    sm.replace(mk(3));
    sm.undo(); // replace 未入栈，回退到 commit(2) 压入的初始态

    expect(seen).toEqual([mk(2), mk(3), mk(1)]);
  });

  it("返回 off 函数；off 后不再触发", () => {
    const sm = createState<S>(mk(1));
    let count = 0;
    const off = sm.onChange(() => count++);
    sm.commit(mk(2));
    off();
    sm.commit(mk(3));
    expect(count).toBe(1);
  });

  it("订阅者抛错被吞掉，不阻断其他订阅者与状态更新", () => {
    const sm = createState<S>(mk(1));
    let afterCalled = false;
    sm.onChange(() => {
      throw new Error("render boom");
    });
    sm.onChange(() => {
      afterCalled = true;
    });

    expect(() => sm.commit(mk(2))).not.toThrow();
    expect(afterCalled).toBe(true);
    expect(sm.get()).toEqual(mk(2));
  });
});
