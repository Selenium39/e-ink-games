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
  mountAll();

  // ── 水合竞争防御（与 sudoku 等各游戏入口同款，复制时勿删）──
  // GameShell 是 'use client' 组件且 defer bundle 可能先于 React 水合执行：
  // 刚挂上的 UI 会在水合重建 game-root 子树时被抹掉（打样实测复现）。
  // 兜底：观察 body 子树，发现游戏 UI 缺席（且壳层容器还在）即防抖重挂。
  // mount 幂等（§3.3.3），重挂 = 全新开局后的存档恢复，无副作用累积。
  // 老浏览器无 MutationObserver 时跳过防御——行为与无此防御一致（渐进增强）。
  // 标记类名按游戏改：本模板 UI 根为 .gtpl-board（render.ts 定义）。
  if (typeof MutationObserver !== "undefined" && typeof document.body !== "undefined") {
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const roots = document.querySelectorAll('#game-root[data-game="' + SLUG + '"]');
        for (let i = 0; i < roots.length; i++) {
          const el = roots[i] as HTMLElement;
          if (!el.querySelector(".gtpl-board")) mount(el);
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
