// ═══════════════════════════════════════════════════════════════════
// 复制我为新游戏：bundle 唯一入口（契约 §3，决策①）。
// 复制后全局替换 "_template" 为你的 slug 即可；挂载/检测/注册骨架无需改动。
// esbuild 参数（scripts/build-games.mjs）：bundle → IIFE → es2015 → minify，
// 产物 public/games/{slug}.js，经普通 <script defer> 加载（非 module，§3.1）。
// ═══════════════════════════════════════════════════════════════════
import { mount } from "./render";

const SLUG = "_template";
const FALLBACK = "This game needs a newer browser.";

function boot(): void {
  // ── 特性检测（契约 §3.2，三层增强第 3 层）──
  // 本游戏 render 依赖 epaper web components 能力面；检测失败时：
  // 写降级文案（优先壳层预置的本地化 data-fallback，决策③）并终止——
  // 不注册、不挂载、不抛未捕获错误（§10.10）。
  if (!(window.customElements && typeof window.customElements.define === "function")) {
    const root = document.getElementById("game-root");
    if (root) root.textContent = root.getAttribute("data-fallback") || FALLBACK;
    return;
  }

  // ── 全局注册（§3.3.1）──
  const registry = window.EGames || (window.EGames = {});
  registry[SLUG] = { mount };

  // ── 自挂载（§3.3.2）：defer 保证 DOM 已就绪；异常时序退回 DOMContentLoaded ──
  const roots = document.querySelectorAll('#game-root[data-game="' + SLUG + '"]');
  for (let i = 0; i < roots.length; i++) {
    mount(roots[i] as HTMLElement);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
