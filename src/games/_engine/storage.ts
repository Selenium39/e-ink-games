// 三级降级存档（契约 §4.1）：localStorage → cookie → 内存。
// 任何异常（隐私模式、配额满、禁 cookie）静默降级，绝不抛错。
// §10.6：游戏禁止裸用 localStorage / document.cookie，一律走本模块。

export type StorageTier = "local" | "cookie" | "memory";

/** 存档格式版本：破坏性变更时 +1，旧档在 load 时自动作废（契约 §4.1） */
export const SCHEMA_VERSION = 1;

/** 站点命名空间前缀；物理 key = `${NAMESPACE}:${slug}:${key}`（cookie 同名） */
export const NAMESPACE = "egames";

/** cookie 层单条有效载荷上限：4KB cookie 上限留余量（契约 §4.1），超限视为该层失败并继续降级 */
const COOKIE_PAYLOAD_LIMIT = 3.5 * 1024;

/** 实际落盘记录结构（对调用方透明，load 时自动解包） */
export interface StorageRecord<T> {
  v: number;
  at: number;
  data: T;
}

// 内存层：模块级字典，进程内存活（刷新即丢——这是它只能作最后兜底的原因）。
// 用普通对象而非 Map/Set：让 _engine 自身远离任何 ES2015+ 内建 API 依赖面（§10.8 保守化）。
const memoryStore: Record<string, string> = Object.create(null);

function keyOf(slug: string, key: string): string {
  return NAMESPACE + ":" + slug + ":" + key;
}

// ── localStorage 层（typeof 守卫：测试环境 / 极老浏览器无此对象时不抛 ReferenceError）──

function localAvailable(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probe = NAMESPACE + ":__probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function localGet(k: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function localSet(k: string, v: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

function localDel(k: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(k);
  } catch {
    /* 静默 */
  }
}

// ── cookie 层 ──

function cookieAvailable(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const probe = NAMESPACE + "__probe__";
    document.cookie = probe + "=1;path=/;max-age=60";
    const ok = document.cookie.indexOf(probe + "=") !== -1;
    document.cookie = probe + "=;path=/;max-age=0";
    return ok;
  } catch {
    return false;
  }
}

function cookieGet(k: string): string | null {
  try {
    if (typeof document === "undefined") return null;
    const parts = document.cookie.split(";");
    for (let i = 0; i < parts.length; i++) {
      const eq = parts[i].indexOf("=");
      if (eq === -1) continue;
      if (parts[i].slice(0, eq).replace(/^\s+/, "") === k) {
        return decodeURIComponent(parts[i].slice(eq + 1));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function cookieSet(k: string, v: string): boolean {
  try {
    if (typeof document === "undefined") return false;
    document.cookie = k + "=" + encodeURIComponent(v) + ";path=/;max-age=31536000";
    // 写后读回验证：部分环境对写 cookie 静默丢弃而不抛错
    return cookieGet(k) === v;
  } catch {
    return false;
  }
}

function cookieDel(k: string): void {
  try {
    if (typeof document !== "undefined") {
      document.cookie = k + "=;path=/;max-age=0";
    }
  } catch {
    /* 静默 */
  }
}

// ── 公共 API（契约 §4.1 签名）──

/**
 * 依次尝试 localStorage → cookie → 内存；返回实际达成层级，全部失败返回 null。
 * 全部失败的现实路径只有一种：data 本身不可 JSON 序列化（循环引用等）。
 * cookie 层单条有效载荷 >3.5KB 时视为失败，继续降级。
 */
export function save<T>(slug: string, key: string, data: T): StorageTier | null {
  const record: StorageRecord<T> = { v: SCHEMA_VERSION, at: Date.now(), data };
  let payload: string;
  try {
    payload = JSON.stringify(record);
  } catch {
    return null; // 不可序列化：三层都救不了
  }
  const k = keyOf(slug, key);
  if (localAvailable() && localSet(k, payload)) return "local";
  if (cookieAvailable() && payload.length <= COOKIE_PAYLOAD_LIMIT && cookieSet(k, payload)) {
    return "cookie";
  }
  memoryStore[k] = payload;
  return "memory";
}

/** 按 local→cookie→memory 顺序读；无档 / v 不匹配 SCHEMA_VERSION / JSON 损坏 → null（并清掉该层坏档） */
export function load<T>(slug: string, key: string): T | null {
  const k = keyOf(slug, key);
  const readers: Array<() => string | null> = [
    () => localGet(k),
    () => cookieGet(k),
    () => (Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null),
  ];

  for (let tierIndex = 0; tierIndex < readers.length; tierIndex++) {
    const raw = readers[tierIndex]();
    if (raw === null || raw === undefined) continue;

    let record: StorageRecord<T> | null = null;
    try {
      record = JSON.parse(raw) as StorageRecord<T>;
    } catch {
      record = null;
    }
    const valid =
      record !== null &&
      typeof record === "object" &&
      record.v === SCHEMA_VERSION &&
      "data" in record;
    if (!valid) {
      // 坏档清除，继续向低层找
      if (tierIndex === 0) localDel(k);
      else if (tierIndex === 1) cookieDel(k);
      else delete memoryStore[k];
      continue;
    }
    return (record as StorageRecord<T>).data;
  }
  return null;
}

/** 三层全部移除；不存在视为成功 */
export function remove(slug: string, key: string): void {
  const k = keyOf(slug, key);
  localDel(k);
  cookieDel(k);
  delete memoryStore[k];
}

/**
 * 当前最高可用层级；null = 无持久化能力（local 与 cookie 双禁，极端隐私模式），
 * 此时游戏应隐藏「继续游戏」入口。
 *
 * 裁决（对契约 §4.1 注释的落实）：内存层虽恒可写，但刷新即丢，
 * 不构成「继续游戏」的依据，故 tier() 只探测 local / cookie 两个持久层。
 * save() 仍会写入内存层作进程内兜底。
 */
export function tier(): StorageTier | null {
  if (localAvailable()) return "local";
  if (cookieAvailable()) return "cookie";
  return null;
}
