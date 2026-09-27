// 词表通道单元测试：三态解析 + 合并优先级（纯 Node，无 DOM——
// readWords 的 DOM 侧用最小 stub 对象模拟 getAttribute）。

import { describe, expect, it } from "vitest";
import { mergeWords, readWords } from "./i18n";

function fakeRoot(attr: string | null): HTMLElement {
  // 最小 stub：只实现 readWords 依赖的 getAttribute
  return { getAttribute: (_: string) => attr } as unknown as HTMLElement;
}

describe("readWords", () => {
  it("合法 JSON 属性 → 解析出全部字符串键", () => {
    const root = fakeRoot(JSON.stringify({ undo: "撤销", newGame: "新游戏" }));
    expect(readWords(root)).toEqual({ undo: "撤销", newGame: "新游戏" });
  });

  it("缺属性 → {}", () => {
    expect(readWords(fakeRoot(null))).toEqual({});
  });

  it("非法 JSON → {}（英文兜底由调用方合并）", () => {
    expect(readWords(fakeRoot("{oops"))).toEqual({});
  });

  it("非对象 JSON（数组/数字/字符串/null）→ {}", () => {
    expect(readWords(fakeRoot("[1,2]"))).toEqual({});
    expect(readWords(fakeRoot("42"))).toEqual({});
    expect(readWords(fakeRoot('"x"'))).toEqual({});
    expect(readRootNullSafe()).toEqual({});
  });

  it("对象里的非字符串值被剔除", () => {
    const root = fakeRoot(JSON.stringify({ ok: "好", bad: 1, also: null }));
    expect(readWords(root)).toEqual({ ok: "好" });
  });

  it("root 为 null → {}", () => {
    expect(readWords(null)).toEqual({});
  });
});

describe("mergeWords", () => {
  it("override 覆盖 base 同名键，base 其余保留", () => {
    expect(mergeWords({ a: "1", b: "2" }, { b: "B", c: "C" })).toEqual({
      a: "1",
      b: "B",
      c: "C",
    });
  });

  it("空 override → base 原样", () => {
    expect(mergeWords({ a: "1" }, {})).toEqual({ a: "1" });
  });

  it("不共享引用：改返回值不影响入参", () => {
    const base = { a: "1" };
    const merged = mergeWords(base, {});
    merged.a = "x";
    expect(base.a).toBe("1");
  });
});

function readRootNullSafe(): Record<string, string> {
  // JSON.parse("null") 合法但非对象——走 null 分支
  return readWords(fakeRoot("null"));
}
