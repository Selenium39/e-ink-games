// 游戏引擎本地化词表通道（2026-09 16 语言补齐）。
//
// 契约：bundle 是全语言共享的一份静态 IIFE（es2015，禁 ES2016+ API），
// per-locale 文案由页面 SSG 写入 #game-root 的 data-egames-words 属性
//（JSON.stringify 的 Record<string,string>，与 data-fallback 通道同构）。
// 引擎 mount 时读取并与内置英文词浅合并——任何环节失败都落回英文
//（等于本地化通道上线前的行为），防御式三层：
//   页面 SSG 已合并 {…EN_WORDS, …ui[loc]} → 本 helper 再 parse 一次（幂等）
//   → parse 失败返回 {} → render 侧 EN_WORDS 兜底。

/** 读取并解析 #game-root[data-egames-words]；缺属性/解析失败/非对象一律回 {}。 */
export function readWords(root: HTMLElement | null): Record<string, string> {
  if (!root) return {};
  const raw = root.getAttribute("data-egames-words");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const k in parsed as Record<string, unknown>) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** 浅合并：override 的键覆盖 base（手写 for-in 拷贝——esbuild target es2015
// 不补 API，不用 Object.assign，兼容最老的墨水屏浏览器）。 */
export function mergeWords(
  base: Record<string, string>,
  override: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in base) out[k] = base[k];
  for (const k in override) out[k] = override[k];
  return out;
}

/** 难度展示词：优先查词表（本地化），查无退回旧逻辑（首字母大写）。 */
export function diffLabel(words: Record<string, string>, d: string): string {
  return words[d] || d.charAt(0).toUpperCase() + d.slice(1);
}
