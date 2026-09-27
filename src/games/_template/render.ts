// 复制我为新游戏：渲染层（契约 §6）。
// 职责：DOM patch、最小脏区更新、交互绑定。只 import ./logic 与 _engine/*，
// 禁止 import react / next / innerHTML 全量重绘（§10.4）。
import { CELL_COUNT, click, newGame, TARGET, type TemplateState } from "./logic";
import { createState } from "../_engine/state";
import { load, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致（复制模板后全局替换 "_template"） */
const SLUG = "_template";

// 私有 CSS（契约决策④）：运行时一次性注入，不出 css 文件、少一个请求。
// 硬约束（§10.2/§10.5）：无 animation/transition/hover；1-bit 状态
// （完成=黑底白字反转）；颜色只用 --ink-* token（带字面量回退）。
const CSS = [
  ".gtpl-status{font-weight:700;padding:.5rem 0;border-bottom:3px solid var(--ink-fg,#000);margin-bottom:.75rem}",
  ".gtpl-board{display:flex;flex-direction:column;gap:.5rem}",
  ".gtpl-cell{min-height:44px;padding:.75rem;font:inherit;font-size:1.25rem;text-align:left;",
  "border:1px solid var(--ink-fg,#000);background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer}",
  ".gtpl-cell.is-done{background:var(--ink-bg-inverted,#000);color:var(--ink-fg-inverted,#fff)}",
  ".gtpl-tools{display:flex;justify-content:space-between;align-items:center;margin-top:.75rem}",
  ".gtpl-undo{min-height:44px;padding:.5rem 1rem;font:inherit;border:3px solid var(--ink-fg,#000);",
  "background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer}",
  ".gtpl-undo[disabled]{border-style:dashed;cursor:default}",
  ".gtpl-hint{font-size:.875rem}",
].join("");

function injectCss(): void {
  if (document.getElementById("game-" + SLUG + "-css")) return;
  const style = document.createElement("style");
  style.id = "game-" + SLUG + "-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * 挂载入口（由 index.ts 注册到 window.EGames 后调用）。
 * 必须幂等（契约 §3.3.3）：root.dataset.mounted === '1' 时先清理再重建。
 */
export function mount(root: HTMLElement): void {
  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧棋盘（保留 noscript/降级段落之外的一切）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位段落

  injectCss();

  // 状态机 + 存档恢复（契约 §4.1 key 约定：save1 = 主存档槽）
  const machine = createState<TemplateState>(newGame());
  const saved = load<TemplateState>(SLUG, "save1");
  if (saved && typeof saved === "object" && Array.isArray(saved.counts)) {
    machine.replace(saved);
  }

  // ── 一次性建 DOM（交互 DOM 由 render 全权创建与持有，§6）──
  const status = document.createElement("div");
  status.className = "gtpl-status";

  const board = document.createElement("div");
  board.className = "gtpl-board";
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "gtpl-cell";
    cell.setAttribute("data-idx", String(i));
    board.appendChild(cell);
    cells.push(cell);
  }

  const tools = document.createElement("div");
  tools.className = "gtpl-tools";
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "gtpl-undo";
  undoBtn.textContent = "Undo";
  const hint = document.createElement("span");
  hint.className = "gtpl-hint";
  tools.appendChild(undoBtn);
  tools.appendChild(hint);

  root.appendChild(status);
  root.appendChild(board);
  root.appendChild(tools);

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  function patch(s: TemplateState): void {
    for (let i = 0; i < cells.length; i++) {
      const text = String(s.counts[i]) + " / " + TARGET;
      if (cells[i].textContent !== text) cells[i].textContent = text; // 仅变更格落盘（EPDC 局部刷新）
      cells[i].classList.toggle("is-done", s.counts[i] >= TARGET);
    }
    const statusText = s.done ? "Done! All cells lit." : "Click cells to count up.";
    if (status.textContent !== statusText) status.textContent = statusText;
    undoBtn.disabled = !machine.canUndo();
    hint.textContent = "Progress is saved automatically.";
  }

  // ── 交互（§6：click + keydown 按需绑定；禁 Pointer Events）──
  board.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr === null) return;
    // 「这步是否合法」的判断全部走 logic（§5.3），render 不自写规则
    machine.commit(click(machine.get(), parseInt(idxStr, 10)));
  });

  undoBtn.addEventListener("click", () => {
    machine.undo();
  });

  machine.onChange(patch);

  // 存档（§5.2 存档组装由 index/render 负责）：每次变更落 save1
  machine.onChange((s) => {
    save(SLUG, "save1", s);
  });

  patch(machine.get());
}
