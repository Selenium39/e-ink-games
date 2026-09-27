// ═══════════════════════════════════════════════════════════════════
// tic-tac-toe — bundle 唯一入口（契约 §3，决策①）。
// esbuild 参数（scripts/build-games.mjs）：bundle → IIFE → es2015 → minify，
// 产物 public/games/tic-tac-toe.js，经普通 <script defer> 加载（非 module，§3.1）。
// 挂载/检测/注册骨架与 _template/sudoku 一致：替换 SLUG 与 mount 实现即可。
// ═══════════════════════════════════════════════════════════════════
import { mount } from "./render";
import type { MountOpts } from "../_engine/global";

const SLUG = "tic-tac-toe";
const FALLBACK = "This game needs a newer browser.";

function boot(): void {
  // ── 特性检测（契约 §3.2，三层增强第 3 层）──
  // 检测失败时：写降级文案（优先壳层预置的本地化 data-fallback，决策③）并终止——
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
  mountAll();

  // ── 水合竞争防御（sudoku 打样实测发现的框架时序问题，沿同款兜底）──
  // GameShell 是 'use client' 组件且 defer bundle 先于 React 水合执行：
  // 本 bundle 刚挂上的 UI 会在水合重建 game-root 子树时被抹掉（实测复现）。
  // 兜底：观察 body 子树，发现游戏盘面缺席（且壳层容器还在）即防抖重挂。
  // mount 幂等（§3.3.3），重挂 = 全新开局后的存档恢复，无副作用累积。
  // 老浏览器无 MutationObserver 时跳过防御（渐进增强）。
  if (typeof MutationObserver !== "undefined" && typeof document.body !== "undefined") {
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const roots = document.querySelectorAll('#game-root[data-game="' + SLUG + '"]');
        for (let i = 0; i < roots.length; i++) {
          const el = roots[i] as HTMLElement;
          if (!el.querySelector(".ttt-board")) mount(el);
        }
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function mountAll(): void {
  const roots = document.querySelectorAll('#game-root[data-game="' + SLUG + '"]');
  for (let i = 0; i < roots.length; i++) {
    mount(roots[i] as HTMLElement);
  }
}

// MountOpts（每日种子等）经 mount opts 透传（契约 §3.3.5；本游戏 seeded=false 不消费）。
export type { MountOpts };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
