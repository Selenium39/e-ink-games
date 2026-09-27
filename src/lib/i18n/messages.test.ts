// messages 字典契约测试(2026-09 16 语言):
// 1. messages/ 目录下每份字典与 en.ts 深度键路径集合完全一致(缺失与多余都 fail)
//    ——类型层有 `const xx: Messages` 约束,本测试是运行时反射双保险
//    (fs 扫描,新增语言文件零维护)。
// 2. LOCALE_NAMES 覆盖 locales 全集;ENABLED_LOCALES ⊆ locales;RTL_LOCALES ⊆ locales。

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENABLED_LOCALES, locales, LOCALE_NAMES, RTL_LOCALES } from "./config";
import en from "./messages/en";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "messages");

/** 递归收集嵌套对象的全部叶子键点路径(a.b.c 形式) */
function keyPaths(node: unknown, prefix: string): string[] {
  if (node !== null && typeof node === "object") {
    const out: string[] = [];
    for (const k of Object.keys(node as Record<string, unknown>)) {
      out.push(...keyPaths((node as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
    }
    return out;
  }
  return [prefix];
}

const EN_PATHS = new Set(keyPaths(en, ""));

function dictionaryFiles(): string[] {
  return readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => f !== "en.ts" && f !== "index.ts");
}

describe("messages 字典键 parity", () => {
  it("messages/ 下存在至少一份非 en 字典", () => {
    expect(dictionaryFiles().length).toBeGreaterThanOrEqual(1);
  });

  for (const file of dictionaryFiles()) {
    it(`${file} 与 en.ts 键路径集合完全一致`, async () => {
      const dict = (await import(join(MESSAGES_DIR, file))).default;
      const paths = new Set(keyPaths(dict, ""));
      const missing = [...EN_PATHS].filter((p) => !paths.has(p));
      const extra = [...paths].filter((p) => !EN_PATHS.has(p));
      expect(
        { missing, extra },
        `${file}: missing=[${missing}] extra=[${extra}]`,
      ).toEqual({ missing: [], extra: [] });
    });
  }
});

describe("语言配置一致性", () => {
  it("LOCALE_NAMES 覆盖 locales 全集且无多余", () => {
    expect(Object.keys(LOCALE_NAMES).sort()).toEqual([...locales].sort());
  });

  it("ENABLED_LOCALES ⊆ locales 且无重复", () => {
    expect(new Set(ENABLED_LOCALES).size).toBe(ENABLED_LOCALES.length);
    for (const l of ENABLED_LOCALES) expect(locales).toContain(l);
  });

  it("RTL_LOCALES ⊆ locales", () => {
    for (const l of RTL_LOCALES) expect(locales).toContain(l as never);
  });
});
