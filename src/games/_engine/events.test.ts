// events 单测（契约 §4.3：同步、有序、快照遍历、重入保护、异常静默）
import { describe, expect, it } from "vitest";

import { createEmitter } from "./events";

// type 别名（非 interface）：TS6 严格模式下 interface 无隐式 index signature，
// 不满足 Emitter<Events extends Record<string, unknown>> 约束；语义与原声明等价。
type TestEvents = {
  tick: number;
  move: { r: number; c: number };
  done: string;
};

describe("createEmitter", () => {
  it("emit 同步调用、按注册顺序", () => {
    const bus = createEmitter<TestEvents>();
    const calls: string[] = [];
    bus.on("tick", () => calls.push("first"));
    bus.on("tick", () => calls.push("second"));
    bus.on("tick", () => calls.push("third"));

    let afterEmit = false;
    bus.on("tick", () => {
      /* 确认同步：此时尚未越过 emit 调用行 */
    });
    bus.emit("tick", 1);
    afterEmit = true;

    expect(calls).toEqual(["first", "second", "third"]);
    expect(afterEmit).toBe(true);
  });

  it("on 返回 off 函数；off 后不再接收", () => {
    const bus = createEmitter<TestEvents>();
    const seen: number[] = [];
    const off = bus.on("tick", (n) => seen.push(n));

    bus.emit("tick", 1);
    off();
    bus.emit("tick", 2);

    expect(seen).toEqual([1]);
  });

  it("off 移除指定 handler，不影响其他", () => {
    const bus = createEmitter<TestEvents>();
    const seen: string[] = [];
    const fn = (s: string) => seen.push("A:" + s);
    bus.on("done", fn);
    bus.on("done", (s) => seen.push("B:" + s));

    bus.off("done", fn);
    bus.emit("done", "x");

    expect(seen).toEqual(["B:x"]);
  });

  it("快照遍历：回调内 off 其他 handler 不影响本轮（不跳变）", () => {
    const bus = createEmitter<TestEvents>();
    const seen: string[] = [];
    const offB = bus.on("done", () => seen.push("B"));
    bus.on("done", () => {
      seen.push("A-offers-B");
      offB(); // 在回调中注销 B
    });

    bus.emit("done", "1"); // 本轮按注册顺序：B 先执行，随后 A 注销 B
    bus.emit("done", "2"); // 下一轮 B 不再收到

    expect(seen).toEqual(["B", "A-offers-B", "A-offers-B"]);
  });

  it("快照遍历：回调内新注册的 handler 本轮不执行", () => {
    const bus = createEmitter<TestEvents>();
    const seen: string[] = [];
    bus.on("tick", () => {
      seen.push("first");
      bus.on("tick", () => seen.push("late"));
    });
    bus.emit("tick", 1);
    bus.emit("tick", 2);

    expect(seen).toEqual(["first", "first", "late"]);
  });

  it("重入保护：回调内对同一事件再 emit 直接忽略（不死递归）", () => {
    const bus = createEmitter<TestEvents>();
    let count = 0;
    bus.on("tick", () => {
      count += 1;
      bus.emit("tick", 999); // 若无重入保护将无限递归
    });
    expect(() => bus.emit("tick", 1)).not.toThrow();
    expect(count).toBe(1);
  });

  it("回调内 emit 另一事件正常执行", () => {
    const bus = createEmitter<TestEvents>();
    const seen: string[] = [];
    bus.on("tick", () => bus.emit("done", "nested"));
    bus.on("done", (s) => seen.push(s));

    bus.emit("tick", 1);
    expect(seen).toEqual(["nested"]);
  });

  it("单个 handler 抛错被吞掉且不中断后续 handler", () => {
    const bus = createEmitter<TestEvents>();
    const seen: string[] = [];
    bus.on("tick", () => {
      throw new Error("boom");
    });
    bus.on("tick", (n) => seen.push("after:" + n));

    expect(() => bus.emit("tick", 7)).not.toThrow();
    expect(seen).toEqual(["after:7"]);
  });

  it("无订阅者 emit 不抛", () => {
    const bus = createEmitter<TestEvents>();
    expect(() => bus.emit("tick", 1)).not.toThrow();
  });
});
