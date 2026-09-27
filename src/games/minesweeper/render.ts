/**
 * minesweeper/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切"是否踩雷/是否胜利/剩余雷数"的判断只调 logic.ts 导出函数；
 * 本文件仅持有纯 UI 状态（选中格、Dig/Flag 模式、计时）并做最小脏区 patch。
 *
 * 组件选型说明（沿用 sudoku 打样裁决）：实测 @marcomattes/epaper-components@2.0.0
 * 任何组件入口都会经共享 chunk 引入含 ES2021 `.replaceAll(` 等黑名单 API 的
 * core 代码，与 build-games.mjs 的 §10.8 断言结构性冲突，故本游戏 UI 全部自绘
 * vanilla DOM（视觉严格遵循 epaper 印刷美学：--ink-* token、3px 粗线、1-bit
 * 反转、无动画无 hover）。
 *
 * 本地化通道缺口（同 sudoku 打样裁决）：游戏 bundle 为全语言共享静态 IIFE，
 * 游戏内固定英文短词（扫雷社区通用），导流 CTA 走 DOM 通道
 * （页面模板 promo 位 <a data-egames-cta>，mount 时读取覆盖）。
 */
import {
  cellNumber,
  chord,
  deserialize,
  dig,
  mineCounter,
  newGame,
  serialize,
  toggleFlag,
  type Difficulty,
  type GameState,
} from "./logic";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "minesweeper";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** 存档载荷（契约 §5.2 形状：{ s: logic 序列化串, sec: render 计时 }） */
interface SavePayload {
  s: string;
  sec: number;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内固定英文短词（本地化通道缺口，见文件头说明） */
const WORDS = {
  confirm: "Start a new game? Current progress will be lost.",
  ok: "OK",
  cancel: "Cancel",
  dig: "Dig",
  flag: "Flag",
  newGame: "New Game",
  cleared: "Cleared!",
  boom: "Boom!",
  minesLabel: "MINES",
  timeLabel: "TIME",
  progressSaved: "Progress is saved automatically.",
};

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover（§10.2）。
// 1-bit 状态（§10.5）：未挖格=中央小圆点、选中=inset 3px 粗框、旗/雷=内联 SVG 图标、
// 踩中雷与错误旗=黑底白字反转（雷白图标 / CSS 白色对角线 X）；颜色只用 --ink-* token。
// 格子固定 44×44 CSS px（触控目标 §10.7）；hard 13×13=584px 超出窄视口时外层横向滚动。
// min 后 ≤2KB（§3.4）：按钮基础样式合并 .ms-wrap button，图标仅保留旗(黑)/雷(白)两枚。
const ICON_FLAG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M5 3h8l-2.5 2.5L13 8H5z' fill='%23000'/%3E%3C/svg%3E\")";
const ICON_MINE_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 2v12M2 8h12' stroke='%23fff' stroke-width='1.5'/%3E%3Ccircle cx='8' cy='8' r='3.5' fill='%23fff'/%3E%3C/svg%3E\")";

const CSS = [
  ".ms-wrap{max-width:37.5rem;margin:0 auto}",
  ".ms-wrap button{font:inherit;font-size:.875rem;min-height:44px;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none}",
  ".ms-seg,.ms-modes{display:grid;gap:1px;background:var(--ink-fg,#000);border:1px solid var(--ink-fg,#000)}",
  ".ms-seg{grid-template-columns:repeat(3,1fr);margin:0 0 .75rem}",
  ".ms-modes{grid-template-columns:repeat(2,1fr);margin-top:.75rem}",
  ".ms-btn{padding:.25rem .5rem}",
  ".ms-btn.is-on{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700}",
  ".ms-status{display:flex;justify-content:space-between;gap:1rem;font-family:var(--ink-mono,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);padding:.125rem 0 .375rem;margin-bottom:.75rem}",
  ".ms-scroll{overflow-x:auto}",
  ".ms-board{display:grid;grid-template-columns:repeat(var(--ms-cols,9),44px);gap:1px;background:var(--ink-fg,#000);border:3px solid var(--ink-fg,#000);width:fit-content;margin:0 auto}",
  ".ms-cell{box-sizing:border-box;position:relative;width:44px;min-height:44px;padding:0;font-family:var(--ink-mono,monospace);font-size:1.25rem;line-height:44px;font-weight:700}",
  ".ms-cell.is-unknown::before{content:'';position:absolute;left:45%;top:45%;width:10%;height:10%;background:var(--ink-fg,#000)}",
  ".ms-cell.is-flag{background:var(--ink-bg,#fff) " + ICON_FLAG + " center/55% no-repeat}",
  ".ms-cell.is-sel{box-shadow:inset 0 0 0 3px var(--ink-fg,#000)}",
  ".ms-cell.is-mine{background:var(--ink-fg,#000) " + ICON_MINE_LIGHT + " center/55% no-repeat}",
  ".ms-cell.is-boom{box-shadow:inset 0 0 0 3px var(--ink-bg,#fff)}",
  ".ms-cell.is-wrong{background:var(--ink-fg,#000)}",
  ".ms-cell.is-wrong::before,.ms-cell.is-wrong::after{content:'';position:absolute;left:14%;top:46%;width:72%;height:9%;background:var(--ink-bg,#fff);transform:rotate(45deg)}",
  ".ms-cell.is-wrong::after{transform:rotate(-45deg)}",
  ".ms-cell.is-sel.is-mine,.ms-cell.is-sel.is-wrong{box-shadow:inset 0 0 0 3px var(--ink-bg,#fff)}",
  ".ms-new{display:block;width:100%;min-height:48px;margin-top:.75rem;border:1px solid var(--ink-fg,#000)}",
  ".ms-confirm{display:none;border:3px solid var(--ink-fg,#000);padding:.75rem;margin-top:.75rem}",
  ".ms-confirm.is-open{display:block}",
  ".ms-confirm p{margin:0;font-size:.875rem;color:var(--site-prose-fg,#333)}",
  ".ms-confirm__row{display:flex;gap:.75rem;margin-top:.625rem}",
  ".ms-confirm__row button{flex:1;border:1px solid var(--ink-fg,#000)}",
  ".ms-result{display:none;border:3px solid var(--ink-fg,#000);margin-top:.75rem}",
  ".ms-result.is-open{display:block}",
  ".ms-result__title{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700;padding:.5rem .75rem;font-size:1.125rem}",
  ".ms-result__stats{padding:.5rem .75rem;margin:0;font-family:var(--ink-mono,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);color:var(--site-prose-fg,#333)}",
  ".ms-result__cta{display:block;padding:.625rem .75rem;color:var(--ink-fg,#000)}",
  ".ms-hint{margin:.625rem 0 0;font-size:.75rem;color:var(--site-prose-fg,#333)}",
].join("");

function injectCss(): void {
  if (document.getElementById("game-" + SLUG + "-css")) return;
  const style = document.createElement("style");
  style.id = "game-" + SLUG + "-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

/** 秒 → mm:ss（≥1h 为 h:mm:ss） */
function fmtTime(total: number): string {
  const h = (total / 3600) | 0;
  const m = ((total % 3600) / 60) | 0;
  const s = total % 60;
  return h > 0 ? h + ":" + pad2(m) + ":" + pad2(s) : pad2(m) + ":" + pad2(s);
}

// 模块级可清理资源：幂等重挂载（契约 §3.3.3）时先释放上一份。
let activeTimer: ReturnType<typeof setInterval> | null = null;
let activeVisHandler: (() => void) | null = null;
let activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

function teardownPrevious(): void {
  if (activeTimer !== null) {
    clearInterval(activeTimer);
    activeTimer = null;
  }
  if (activeVisHandler !== null) {
    document.removeEventListener("visibilitychange", activeVisHandler);
    activeVisHandler = null;
  }
  if (activeKeyHandler !== null) {
    document.removeEventListener("keydown", activeKeyHandler);
    activeKeyHandler = null;
  }
}

/**
 * 挂载入口（index.ts 注册到 window.EGames 后调用；幂等，契约 §3.3.3）。
 * opts.seed 预留（本游戏 seeded=false，页面路径不传；单测/未来入口可注入）。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落

  injectCss();

  // ── 状态：先恢复存档（key：save1），无档才生成新局 ──
  let difficulty: Difficulty = "easy";
  let seconds = 0;
  let finished = false;
  let selected = -1;
  let flagMode = false;
  let pendingDiff: Difficulty | null = null;

  const saved = load<SavePayload>(SLUG, "save1");
  let restored: GameState | null = null;
  let savedSec = 0;
  if (saved && typeof saved.s === "string" && typeof saved.sec === "number") {
    const parsed = deserialize(saved.s);
    if (parsed) {
      restored = parsed;
      savedSec = saved.sec;
    }
  }
  let machine: ReturnType<typeof createState<GameState>>;
  if (restored) {
    // 载入存档用 replace 语义——直接以 restored 重建 machine（未挂订阅，无通知泄漏）
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
    seconds = savedSec;
    finished = restored.status !== "playing";
  } else {
    machine = createState<GameState>(newGame({ difficulty }));
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "ms-wrap";

  // 难度段选（单选行，选中态黑底反转）
  const seg = document.createElement("div");
  seg.className = "ms-seg";
  seg.setAttribute("role", "group");
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "ms-btn";
    key.setAttribute("data-diff", d);
    key.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行（等宽文本：剩余雷数 + 计时）
  const statusMines = document.createElement("span");
  const statusTime = document.createElement("span");
  const status = document.createElement("div");
  status.className = "ms-status";
  status.appendChild(statusMines);
  status.appendChild(statusTime);

  // 盘面：固定 44px 格（§10.7）；hard 13×13 超宽时外层横向滚动
  const scroll = document.createElement("div");
  scroll.className = "ms-scroll";
  const board = document.createElement("div");
  board.className = "ms-board";
  board.setAttribute("role", "grid");
  const cells: HTMLButtonElement[] = [];
  const firstState = machine.get();
  board.style.setProperty("--ms-cols", String(firstState.cols));
  for (let idx = 0; idx < firstState.rows * firstState.cols; idx++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ms-cell";
    cell.setAttribute("data-idx", String(idx));
    board.appendChild(cell);
    cells.push(cell);
  }
  scroll.appendChild(board);

  // Dig / Flag 模式（触屏无右键 → 两模式切换，任务规格）
  const modes = document.createElement("div");
  modes.className = "ms-modes";
  modes.setAttribute("role", "group");
  const digKey = document.createElement("button");
  digKey.type = "button";
  digKey.className = "ms-btn";
  digKey.setAttribute("data-mode", "dig");
  digKey.setAttribute("aria-pressed", "true");
  digKey.textContent = WORDS.dig;
  const flagKey = document.createElement("button");
  flagKey.type = "button";
  flagKey.className = "ms-btn";
  flagKey.setAttribute("data-mode", "flag");
  flagKey.setAttribute("aria-pressed", "false");
  flagKey.textContent = WORDS.flag;
  modes.appendChild(digKey);
  modes.appendChild(flagKey);

  // 新游戏（内联确认：无 showModal 依赖，老 WebKit 安全）
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "ms-new";
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement("div");
  confirmBox.className = "ms-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "ms-confirm__row";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "ms-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "ms-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（title + stats + 导流 CTA）
  const resultTitle = document.createElement("div");
  resultTitle.className = "ms-result__title";
  const resultStats = document.createElement("p");
  resultStats.className = "ms-result__stats";
  const resultCta = document.createElement("a");
  resultCta.className = "ms-result__cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "ms-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "ms-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(scroll);
  wrap.appendChild(modes);
  wrap.appendChild(newBtn);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 计时（§6：setInterval 自持、visibilitychange 对齐、不写入 logic state；
  //    任务规格：首交互启动——未布雷（placed=false）不开表）──
  let startedAt = Date.now() - seconds * 1000;
  let lastSavedSec = seconds;
  let lastTimeShown = -1;

  function renderTime(): void {
    if (seconds !== lastTimeShown) {
      statusTime.textContent = WORDS.timeLabel + " " + fmtTime(seconds);
      lastTimeShown = seconds;
    }
  }

  function startTimer(): void {
    if (activeTimer !== null || finished) return;
    startedAt = Date.now() - seconds * 1000;
    activeTimer = setInterval(() => {
      seconds = ((Date.now() - startedAt) / 1000) | 0;
      renderTime();
      if (seconds - lastSavedSec >= 15) {
        lastSavedSec = seconds;
        persist();
      }
    }, 1000);
  }

  function stopTimer(): void {
    if (activeTimer !== null) {
      clearInterval(activeTimer);
      activeTimer = null;
    }
    seconds = ((Date.now() - startedAt) / 1000) | 0;
    renderTime();
  }

  function onVisibility(): void {
    if (document.hidden) {
      stopTimer(); // 后台不计入用时（墨水屏设备省电 + 用时公平）
    } else if (machine.get().placed) {
      startTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  activeVisHandler = onVisibility;

  // ── 存档 ──
  function persist(): void {
    if (finished) return;
    save<SavePayload>(SLUG, "save1", { s: serialize(machine.get()), sec: seconds });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  let lastMinesShown = -9999;

  function patch(s: GameState): void {
    const lost = s.status === "lost";
    const total = s.rows * s.cols;
    for (let idx = 0; idx < total; idx++) {
      patchCellAt(cells[idx], s, idx, lost);
    }
    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle("is-on", DIFFICULTIES[i] === difficulty);
    }
    digKey.classList.toggle("is-on", !flagMode);
    digKey.setAttribute("aria-pressed", flagMode ? "false" : "true");
    flagKey.classList.toggle("is-on", flagMode);
    flagKey.setAttribute("aria-pressed", flagMode ? "true" : "false");
    confirmBox.classList.toggle("is-open", pendingDiff !== null);

    const minesShown = mineCounter(s);
    if (minesShown !== lastMinesShown) {
      statusMines.textContent = WORDS.minesLabel + " " + minesShown;
      lastMinesShown = minesShown;
    }
    renderTime();

    // 终局判定只走 logic（§5.3）
    if (!finished && s.status !== "playing") finishGame(s);
  }

  /** 单格 patch：数字 textContent + 1-bit 状态 class（§10.4/§10.5） */
  function patchCellAt(el: HTMLButtonElement, s: GameState, idx: number, lost: boolean): void {
    const revealed = s.revealed[idx];
    const flagged = s.flags[idx];
    const isMineShow = lost && s.mines[idx] && !flagged; // 失败揭示的雷
    const isWrong = lost && flagged && !s.mines[idx]; // 错误旗 → 黑底白 X
    const unknown = !revealed && !flagged && !isMineShow && !isWrong;
    const n = revealed && s.placed ? cellNumber(s, (idx / s.cols) | 0, idx % s.cols) : 0;
    const text = revealed && n > 0 ? String(n) : "";
    if (el.textContent !== text) el.textContent = text; // 仅变更格落盘（EPDC 局部刷新）
    el.classList.toggle("is-open", revealed);
    el.classList.toggle("is-unknown", unknown);
    el.classList.toggle("is-flag", flagged && !isWrong);
    el.classList.toggle("is-mine", isMineShow);
    el.classList.toggle("is-boom", lost && s.exploded === idx);
    el.classList.toggle("is-wrong", isWrong);
    el.classList.toggle("is-sel", idx === selected);
    const label =
      "r" + (((idx / s.cols) | 0) + 1) + " c" + ((idx % s.cols) + 1) +
      (revealed ? (n > 0 ? ": " + n : ": clear") : flagged ? ": flag" : unknown ? ": hidden" : "");
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
  }

  /** 选中格变化：只 patch 前后两格 */
  function moveSelection(idx: number): void {
    const s = machine.get();
    const lost = s.status === "lost";
    const prev = selected;
    selected = idx;
    if (prev >= 0) patchCellAt(cells[prev], s, prev, lost);
    if (idx >= 0) patchCellAt(cells[idx], s, idx, lost);
  }

  // ── 终局（成绩 + 导流 CTA；文案取自页面 content JSON 的 DOM 通道，见文件头）──
  function resolveCta(): { href: string; label: string } {
    const el = document.querySelector("a[data-egames-cta]");
    if (el) {
      const href = el.getAttribute("href");
      if (href) return { href: href, label: el.textContent || FALLBACK_CTA.label };
    }
    return FALLBACK_CTA;
  }

  function finishGame(s: GameState): void {
    finished = true;
    stopTimer();
    remove(SLUG, "save1"); // 完局清档（下次进入开新局）
    resultTitle.textContent = s.status === "won" ? WORDS.cleared : WORDS.boom;
    resultStats.textContent =
      s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1) +
      " · " + s.mineCount + " mines · " + fmtTime(seconds);
    const cta = resolveCta();
    resultCta.setAttribute("href", cta.href);
    resultCta.textContent = cta.label;
    resultBox.classList.add("is-open");
  }

  // ── 换局（新游戏/切难度共用；有进度先确认，防误触丢局）──
  function startNew(d: Difficulty): void {
    difficulty = d;
    machine = createState<GameState>(newGame({ difficulty: d, seed: opts ? opts.seed : undefined }));
    seconds = 0;
    lastSavedSec = 0;
    finished = false;
    selected = -1;
    flagMode = false;
    pendingDiff = null;
    lastTimeShown = -1;
    resultBox.classList.remove("is-open");
    board.style.setProperty("--ms-cols", String(machine.get().cols));
    // 难度变更可能改变格数：增补/移除多余 cell（重建子节点属一次性结构变化，非渲染路径）
    const want = machine.get().rows * machine.get().cols;
    while (cells.length > want) {
      const extra = cells.pop();
      if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
    }
    while (cells.length < want) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ms-cell";
      cell.setAttribute("data-idx", String(cells.length));
      board.appendChild(cell);
      cells.push(cell);
    }
    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    persist(); // 新局立即落盘：patch 是直调、不触发 notify，且未布雷无计时 tick 兜底，
    // 不显式落盘的话刷新会回到换局前的旧局（sudoku 靠 15s tick 兜底，本游戏开表晚）
  }

  function requestNew(d: Difficulty): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已有玩家操作）；终局后直接换局
    if (finished || !machine.canUndo()) {
      startNew(d);
    } else {
      pendingDiff = d;
      patch(machine.get());
    }
  }

  // ── 输入：一律先过 logic，no-op（原引用）不入状态机 ──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) {
      machine.commit(next);
      if (machine.get().placed) startTimer(); // 首交互开表
    }
  }

  /** 触屏/鼠标点击格子的模式语义 */
  function tapCell(idx: number): void {
    const s = machine.get();
    moveSelection(idx);
    if (finished || pendingDiff !== null) return;
    const r = (idx / s.cols) | 0;
    const c = idx % s.cols;
    if (flagMode) {
      commitIfChanged(toggleFlag(s, r, c));
      return;
    }
    if (s.revealed[idx]) {
      // Dig 模式点已展开数字格 → chord（旗数=数字时点开其余邻格）
      commitIfChanged(chord(s, r, c));
    } else {
      commitIfChanged(dig(s, r, c));
    }
  }

  /** 键盘对选中格的主操作（Enter/Space）：未挖 dig、已展开数字格 chord */
  function actOnSelected(): void {
    if (finished || pendingDiff !== null || selected < 0) return;
    const s = machine.get();
    const r = (selected / s.cols) | 0;
    const c = selected % s.cols;
    if (s.revealed[selected]) {
      commitIfChanged(chord(s, r, c));
    } else {
      commitIfChanged(dig(s, r, c));
    }
  }

  function flagSelected(): void {
    if (finished || pendingDiff !== null || selected < 0) return;
    const s = machine.get();
    commitIfChanged(toggleFlag(s, (selected / s.cols) | 0, selected % s.cols));
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  board.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr === null) return;
    tapCell(parseInt(idxStr, 10));
  });

  seg.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute("data-diff") as Difficulty | null;
    if (!d || d === difficulty) return;
    requestNew(d);
  });

  modes.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const m = target.getAttribute("data-mode");
    if (m === null) return;
    flagMode = m === "flag";
    patch(machine.get());
  });

  newBtn.addEventListener("click", () => {
    requestNew(difficulty);
  });

  confirmOk.addEventListener("click", () => {
    if (pendingDiff !== null) startNew(pendingDiff);
  });
  confirmCancel.addEventListener("click", () => {
    pendingDiff = null;
    patch(machine.get());
  });

  // 物理键盘（§6：howToPlay 承诺了方向键/Enter/F）：方向键边缘即停、不环绕
  function onKeyDown(ev: KeyboardEvent): void {
    if (finished || pendingDiff !== null) return;
    if (ev.key === "f" || ev.key === "F") {
      flagSelected();
      return;
    }
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
      ev.preventDefault();
      actOnSelected();
      return;
    }
    const s = machine.get();
    const dr = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
    const dc = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
    if (dr === 0 && dc === 0) return;
    ev.preventDefault();
    const base = selected < 0 ? ((s.rows / 2) | 0) * s.cols + ((s.cols / 2) | 0) : selected;
    let r = ((base / s.cols) | 0) + dr;
    let c = (base % s.cols) + dc;
    if (r < 0) r = 0;
    if (r > s.rows - 1) r = s.rows - 1;
    if (c < 0) c = 0;
    if (c > s.cols - 1) c = s.cols - 1;
    const next = r * s.cols + c;
    if (next === base && selected >= 0) return;
    moveSelection(next);
    cells[next].focus();
  }
  document.addEventListener("keydown", onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 订阅（onChange：render patch + 存档两条独立订阅）──
  function persistOnChange(): void {
    lastSavedSec = seconds;
    persist();
  }
  machine.onChange(patch);
  machine.onChange(persistOnChange);

  patch(machine.get());
  if (machine.get().placed && !finished) startTimer(); // 恢复有进度存档则继续计时
}
