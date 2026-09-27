// storage 三级降级链单测（契约 §4.1）。
// node 测试环境无 localStorage / document：用 vi.stubGlobal 注入可控桩，
// 逐层构造可用 / 禁用 / 静默丢写 / 载荷超限等场景；vi.resetModules() 隔离内存层。
import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageModule = typeof import("./storage");

/** localStorage 桩：available=false 时整体缺席（typeof undefined），或抛错模拟隐私模式 */
class FakeLocalStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  keys(): string[] {
    return Array.from(this.map.keys());
  }
}

function installLocalStorage(opts?: { throwing?: boolean }): FakeLocalStorage {
  const fake = new FakeLocalStorage();
  if (opts?.throwing) {
    vi.stubGlobal(
      "localStorage",
      new Proxy(fake, {
        get(target, prop) {
          if (prop === "getItem" || prop === "setItem" || prop === "removeItem") {
            return () => {
              throw new Error("SecurityError: storage disabled");
            };
          }
          return Reflect.get(target, prop);
        },
      }),
    );
  } else {
    vi.stubGlobal("localStorage", fake);
  }
  return fake;
}

function removeLocalStorage(): void {
  vi.stubGlobal("localStorage", undefined);
}

/** document.cookie 桩：遵循 max-age=0 即删除；dropWrites=true 模拟静默丢写 */
function installCookies(opts?: { dropWrites?: boolean }): { dump: () => string } {
  let jar = "";
  const doc = {
    get cookie(): string {
      return jar;
    },
    set cookie(v: string) {
      if (opts?.dropWrites) return; // 静默丢弃
      const pair = v.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const isDelete = /max-age\s*=\s*0/.test(v);
      const rest = jar
        .split("; ")
        .filter((c) => c && c.slice(0, c.indexOf("=")) !== name);
      if (!isDelete) rest.push(name + "=" + value);
      jar = rest.join("; ");
    },
  };
  vi.stubGlobal("document", doc);
  return { dump: () => jar };
}

function removeDocument(): void {
  vi.stubGlobal("document", undefined);
}

async function importFresh(): Promise<StorageModule> {
  return (await import("./storage")) as StorageModule;
}

describe("storage 三级降级", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("localStorage 可用 → save 落 local，load 读回原数据", async () => {
    const storage = await importFresh();
    const fake = installLocalStorage();
    installCookies();

    expect(storage.save("tpl", "save1", { hp: 3, name: "ink" })).toBe("local");
    expect(storage.load<{ hp: number; name: string }>("tpl", "save1")).toEqual({
      hp: 3,
      name: "ink",
    });
    // 物理 key 命名约定：egames:{slug}:{key}
    expect(fake.keys()).toContain("egames:tpl:save1");
  });

  it("localStorage 抛错（隐私模式）→ 降级 cookie", async () => {
    const storage = await importFresh();
    installLocalStorage({ throwing: true });
    const cookies = installCookies();

    expect(storage.save("tpl", "stats", { wins: 1 })).toBe("cookie");
    // 物理 key 原样作 cookie name（冒号合法）；value 已 encodeURIComponent
    expect(cookies.dump()).toContain("egames:tpl:stats=");
    expect(storage.load<{ wins: number }>("tpl", "stats")).toEqual({ wins: 1 });
  });

  it("载荷超 cookie 3.5KB 上限 → 跳过 cookie 降级 memory", async () => {
    const storage = await importFresh();
    removeLocalStorage();
    installCookies();

    const big = { blob: "x".repeat(4000) }; // JSON 后 >3.5KB
    expect(storage.save("tpl", "save1", big)).toBe("memory");
    expect(storage.load<typeof big>("tpl", "save1")).toEqual(big);
  });

  it("local 与 cookie 双禁 → 降级 memory（进程内兜底）", async () => {
    const storage = await importFresh();
    removeLocalStorage();
    removeDocument();

    expect(storage.save("tpl", "save1", [1, 2, 3])).toBe("memory");
    expect(storage.load<number[]>("tpl", "save1")).toEqual([1, 2, 3]);
  });

  it("data 不可序列化（循环引用）→ save 返回 null 且不抛", async () => {
    const storage = await importFresh();
    installLocalStorage();

    const evil: Record<string, unknown> = {};
    evil.self = evil;
    expect(storage.save("tpl", "save1", evil)).toBeNull();
  });

  it("load：JSON 损坏 → null 且坏档被清除", async () => {
    const storage = await importFresh();
    const fake = installLocalStorage();
    installCookies();
    fake.setItem("egames:tpl:save1", "{not-json");

    expect(storage.load("tpl", "save1")).toBeNull();
    expect(fake.keys()).not.toContain("egames:tpl:save1"); // 坏档已清
  });

  it("load：schema 版本不匹配 → null 且旧档作废", async () => {
    const storage = await importFresh();
    const fake = installLocalStorage();
    installCookies();
    fake.setItem(
      "egames:tpl:save1",
      JSON.stringify({ v: 999, at: 0, data: { stale: true } }),
    );

    expect(storage.load("tpl", "save1")).toBeNull();
    expect(fake.keys()).not.toContain("egames:tpl:save1");
  });

  it("load：高层为空时按降级序读低层（local 禁 → cookie 存取）；无档 → null", async () => {
    const storage = await importFresh();
    removeLocalStorage();
    installCookies();
    // local 不可用：save 落 cookie，load 顺序探测后从 cookie 层读回
    expect(storage.save("tpl", "save1", { from: "cookie" })).toBe("cookie");
    expect(storage.load<{ from: string }>("tpl", "save1")).toEqual({ from: "cookie" });
    expect(storage.load("tpl", "missing")).toBeNull();
  });

  it("remove：三层全部移除；不存在视为成功", async () => {
    const storage = await importFresh();
    const fake = installLocalStorage();
    installCookies();

    storage.save("tpl", "save1", { a: 1 });
    expect(() => storage.remove("tpl", "save1")).not.toThrow();
    expect(fake.keys()).not.toContain("egames:tpl:save1");
    expect(storage.load("tpl", "save1")).toBeNull();

    expect(() => storage.remove("tpl", "never-existed")).not.toThrow();
  });
});

describe("storage.tier()", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("local 可用 → local", async () => {
    const storage = await importFresh();
    installLocalStorage();
    installCookies();
    expect(storage.tier()).toBe("local");
  });

  it("local 禁、cookie 可用 → cookie", async () => {
    const storage = await importFresh();
    removeLocalStorage();
    installCookies();
    expect(storage.tier()).toBe("cookie");
  });

  it("双禁 → null（游戏应隐藏「继续游戏」入口）", async () => {
    const storage = await importFresh();
    removeLocalStorage();
    removeDocument();
    expect(storage.tier()).toBeNull();
  });
});
