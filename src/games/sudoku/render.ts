/**
 * sudoku/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切"这步是否合法/是否赢了"的判断只调 logic.ts 导出函数；
 * 本文件仅持有纯 UI 状态（选中格、铅笔模式、计时）并做最小脏区 patch。
 *
 * 组件选型说明（重要，打样决策）：
 * 任务原点名 e-keypad / e-segmented / e-dialog / e-result，但实测
 * @marcomattes/epaper-components@2.0.0 **任何组件入口**（含最轻的 result）都会
 * 经共享 chunk 引入 core/base-form-control，其中含 10+ 处 ES2021 `.replaceAll(`
 * （另有 keypad 的 `.append(`、segmented/dialog 的 `.closest(`、form 系组件的
 * ElementInternals 依赖）——与 build-games.mjs 的 ES2016+ API 黑名单断言
 * （规约 §10.8）结构性冲突，产物无法通过 games:build；ElementInternals 在
 * 老 Kindle WebKit 上还会运行时抛错。故本打样 UI 全部自绘 vanilla DOM
 * （视觉严格遵循 epaper 印刷美学：--ink-* token、3px 粗线、1-bit 反转、
 * 无动画无 hover），冲突与两条修复路径已在任务报告上报框架侧裁决。
 *
 * 本地化通道缺口（打样裁决）：游戏 bundle 为全语言共享的静态 IIFE，
 * content JSON 的 locale 文案无构建期注入通道。游戏内固定英文短词
 * （数独社区通用），导流 CTA 走 DOM 通道：页面模板在 promo 位输出
 * <a data-egames-cta href=…>{content.cta.label}</a>，mount 时读取覆盖；
 * 检测不到时用英文兜底。确认条/结果面板标题同属该缺口，报告中已列。
 */
import {
  applyMove,
  checkErrors,
  clearCell,
  deserialize,
  isSolved,
  newGame,
  serialize,
  toggleNote,
  type Difficulty,
  type GameState,
} from "./logic";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "sudoku";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

/** 存档载荷（契约 §5.2：{ s: logic 序列化串, sec: render 计时 }，不含 solution/undo 栈） */
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
  notes: "Notes",
  erase: "Erase",
  undo: "Undo",
  newGame: "New Game",
  solved: "Solved!",
  timeLabel: "TIME",
  errLabel: "ERR",
  progressSaved: "Progress is saved automatically.",
};

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover
// （§10.2），1-bit 状态：选中=inset 3px 粗框、错误=黑底白字反转、given=粗体
// 实心 vs 玩家=常规（§10.5）；颜色只用 --ink-* token（带字面量回退）。
// 细线=grid gap 露底色；宫界粗线=宫界格 3px border；min 文件后 ≤2KB（§3.4）。
const CSS = [
  ".sdk-wrap{max-width:27rem;margin:0 auto}",
  ".sdk-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--ink-fg,#000);border:1px solid var(--ink-fg,#000);margin:0 0 .75rem}",
  ".sdk-btn{min-height:44px;padding:.25rem .5rem;font:inherit;font-size:.875rem;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".sdk-btn.is-on{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700}",
  ".sdk-status{display:flex;justify-content:space-between;gap:1rem;font-family:var(--ink-mono,ui-monospace,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);padding:.125rem 0 .375rem;margin-bottom:.75rem}",
  ".sdk-board{display:grid;grid-template-columns:repeat(9,1fr);gap:1px;background:var(--ink-fg,#000);border:3px solid var(--ink-fg,#000);margin-bottom:1px}",
  ".sdk-cell{box-sizing:border-box;min-height:44px;padding:0;font:inherit;font-size:1.25rem;line-height:1;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".sdk-cell.is-bx{border-right:3px solid var(--ink-fg,#000)}",
  ".sdk-cell.is-by{border-bottom:3px solid var(--ink-fg,#000)}",
  ".sdk-cell.is-given{font-weight:700}",
  ".sdk-cell.is-note{font-family:var(--ink-mono,ui-monospace,monospace);font-size:.625rem;letter-spacing:.08em}",
  ".sdk-cell.is-sel{box-shadow:inset 0 0 0 3px var(--ink-fg,#000)}",
  ".sdk-cell.is-error{background:var(--ink-fg,#000);color:var(--ink-bg,#fff)}",
  ".sdk-cell.is-sel.is-error{box-shadow:inset 0 0 0 3px var(--ink-bg,#fff)}",
  ".sdk-pad{display:grid;grid-template-columns:repeat(9,1fr);gap:1px;background:var(--ink-fg,#000);border:1px solid var(--ink-fg,#000);margin-top:.75rem}",
  ".sdk-pad--trio{grid-template-columns:repeat(3,1fr);margin-top:1px}",
  ".sdk-key{min-height:48px;padding:.25rem;font:inherit;font-size:1.25rem;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".sdk-pad--trio .sdk-key{font-size:.875rem}",
  ".sdk-key.is-on{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700}",
  ".sdk-key[disabled],.sdk-btn[disabled],.sdk-new[disabled]{border-style:dashed;cursor:default}",
  ".sdk-new{display:block;width:100%;min-height:48px;margin-top:.75rem;font:inherit;font-size:.875rem;border:1px solid var(--ink-fg,#000);background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".sdk-confirm{display:none;border:3px solid var(--ink-fg,#000);padding:.75rem;margin-top:.75rem}",
  ".sdk-confirm.is-open{display:block}",
  ".sdk-confirm p{margin:0;font-size:.875rem;color:var(--site-prose-fg,#333)}",
  ".sdk-confirm__row{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-top:.625rem}",
  ".sdk-cbtn{min-height:44px;font:inherit;font-size:.875rem;border:1px solid var(--ink-fg,#000);background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".sdk-result{display:none;border:3px solid var(--ink-fg,#000);margin-top:.75rem}",
  ".sdk-result.is-open{display:block}",
  ".sdk-result__title{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700;padding:.5rem .75rem;font-size:1.125rem}",
  ".sdk-result__stats{padding:.5rem .75rem;margin:0;font-family:var(--ink-mono,ui-monospace,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);color:var(--site-prose-fg,#333)}",
  ".sdk-result__cta{display:block;padding:.625rem .75rem;color:var(--ink-fg,#000)}",
  ".sdk-hint{margin:.625rem 0 0;font-size:.75rem;color:var(--site-prose-fg,#333)}",
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

/** notes bitmask → 升序数字串（"1 4 7"）；0 → "" */
function noteText(mask: number): string {
  let out = "";
  for (let v = 1; v <= 9; v++) {
    if ((mask & (1 << (v - 1))) !== 0) out += (out ? " " : "") + v;
  }
  return out;
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
 * opts.seed 为外部注入种子（预留每日挑战通道）；缺省不传——newGame 内部用
 * Date.now() 随机组局。对规约 §3.3.5「seeded 游戏缺省取当日种子」的裁决：
 * 普通游戏页的"新游戏"必须每次出新题（seedFromDate 会让同日所有新局同题），
 * 当日种子留给 P2 每日挑战入口经 opts.seed 注入（§3.3 的 MountOpts 预留位），
 * 裁决理由已同步任务报告。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落

  injectCss();

  // ── 状态：先恢复存档（契约 §4.1 key：save1），无档才生成新局 ──
  let difficulty: Difficulty = "easy";
  let seconds = 0;
  let solved = false;
  let selected = -1; // idx 或 -1
  let notesMode = false;
  let pendingDiff: Difficulty | null = null; // 待确认的换局难度

  // 有档先还原、无档才生成（newGame 挖洞可达数百毫秒，不能白跑）
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
    // §4.4：载入存档用 replace 语义——此处直接以 restored 重建 machine
    //（尚未挂任何订阅，无通知泄漏）；undo 栈不随存档恢复（契约决策⑤）
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
    seconds = savedSec;
  } else {
    machine = createState<GameState>(newGame({ difficulty }).state);
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "sdk-wrap";

  // 难度段选（e-segmented 语义等价：单选行，选中态黑底反转）
  const seg = document.createElement("div");
  seg.className = "sdk-seg";
  seg.setAttribute("role", "group");
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "sdk-btn";
    key.setAttribute("data-diff", d);
    key.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行（e-meter 等价：等宽文本计时 + 错误计数）
  const statusTime = document.createElement("span");
  const statusErr = document.createElement("span");
  const status = document.createElement("div");
  status.className = "sdk-status";
  status.appendChild(statusTime);
  status.appendChild(statusErr);

  // 9×9 盘面：语义化 CSS grid；3×3 宫用 3px 粗线（is-bx/is-by 预置在宫界格）
  const board = document.createElement("div");
  board.className = "sdk-board";
  board.setAttribute("role", "grid");
  const cells: HTMLButtonElement[] = [];
  for (let idx = 0; idx < 81; idx++) {
    const r = (idx / 9) | 0;
    const c = idx % 9;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className =
      "sdk-cell" + (c === 2 || c === 5 ? " is-bx" : "") + (r === 2 || r === 5 ? " is-by" : "");
    cell.setAttribute("data-idx", String(idx));
    board.appendChild(cell);
    cells.push(cell);
  }

  // 数字键盘（e-keypad 语义等价）：1-9 横排
  const pad = document.createElement("div");
  pad.className = "sdk-pad";
  for (let v = 1; v <= 9; v++) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "sdk-key";
    key.setAttribute("data-key", String(v));
    key.textContent = String(v);
    pad.appendChild(key);
  }

  // 功能键行：Notes（开关）| Erase | Undo
  const trio = document.createElement("div");
  trio.className = "sdk-pad sdk-pad--trio";
  const notesKey = document.createElement("button");
  notesKey.type = "button";
  notesKey.className = "sdk-key";
  notesKey.setAttribute("data-key", "notes");
  notesKey.setAttribute("aria-pressed", "false");
  notesKey.textContent = WORDS.notes;
  const eraseKey = document.createElement("button");
  eraseKey.type = "button";
  eraseKey.className = "sdk-key";
  eraseKey.setAttribute("data-key", "erase");
  eraseKey.textContent = WORDS.erase;
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "sdk-key";
  undoBtn.setAttribute("data-key", "undo");
  undoBtn.textContent = WORDS.undo;
  trio.appendChild(notesKey);
  trio.appendChild(eraseKey);
  trio.appendChild(undoBtn);

  // 新游戏（内联确认替代 e-dialog：无 showModal 依赖，老 WebKit 安全）
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "sdk-new";
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement("div");
  confirmBox.className = "sdk-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "sdk-confirm__row";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "sdk-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "sdk-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（e-result 语义等价：title + stats + 导流 CTA）
  const resultTitle = document.createElement("div");
  resultTitle.className = "sdk-result__title";
  resultTitle.textContent = WORDS.solved;
  const resultStats = document.createElement("p");
  resultStats.className = "sdk-result__stats";
  const resultCta = document.createElement("a");
  resultCta.className = "sdk-result__cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "sdk-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "sdk-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(board);
  wrap.appendChild(pad);
  wrap.appendChild(trio);
  wrap.appendChild(newBtn);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 计时（§6：setInterval 自持、visibilitychange 对齐、不写入 logic state）──
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
    if (activeTimer !== null) return;
    startedAt = Date.now() - seconds * 1000;
    activeTimer = setInterval(() => {
      seconds = ((Date.now() - startedAt) / 1000) | 0;
      renderTime();
      if (seconds - lastSavedSec >= 15) {
        // 计时不入 logic state，随存档存 sec（§5.2）；tick 侧 15s 节流落盘
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
    } else if (!solved) {
      startTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  activeVisHandler = onVisibility;

  // ── 存档（§5.2 组装归 render/index 层）──
  function persist(): void {
    if (solved) return;
    save<SavePayload>(SLUG, "save1", { s: serialize(machine.get()), sec: seconds });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  let lastErrShown = -1;

  function patch(s: GameState): void {
    const errors = checkErrors(s);
    const errorSet: Record<number, boolean> = {};
    for (let i = 0; i < errors.length; i++) errorSet[errors[i]] = true;

    for (let idx = 0; idx < 81; idx++) {
      patchCellAt(cells[idx], s, idx, errorSet);
    }

    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle("is-on", DIFFICULTIES[i] === difficulty);
    }
    notesKey.classList.toggle("is-on", notesMode);
    notesKey.setAttribute("aria-pressed", notesMode ? "true" : "false");
    undoBtn.disabled = !machine.canUndo();
    confirmBox.classList.toggle("is-open", pendingDiff !== null);

    const errShown = solved ? 0 : errors.length;
    if (errShown !== lastErrShown) {
      statusErr.textContent = WORDS.errLabel + " " + errShown;
      lastErrShown = errShown;
    }
    renderTime();

    // 终局判定只走 logic（§5.3）；面板在 finishGame() 展开
    if (!solved && isSolved(s)) finishGame(s);
  }

  /** 单格 patch（§10 最小脏区示例的落地）；全量 patch 逐格复用 */
  function patchCellAt(
    el: HTMLButtonElement,
    s: GameState,
    idx: number,
    errorSet: Record<number, boolean>,
  ): void {
    const v = s.values[idx];
    const n = s.notes[idx];
    const isNote = v === 0 && n !== 0;
    const text = v !== 0 ? String(v) : isNote ? noteText(n) : "";
    if (el.textContent !== text) el.textContent = text; // 仅变更格落盘（EPDC 局部刷新）
    el.classList.toggle("is-given", s.givens[idx]);
    el.classList.toggle("is-note", isNote);
    el.classList.toggle("is-error", errorSet[idx] === true);
    el.classList.toggle("is-sel", idx === selected);
    const label = "r" + (((idx / 9) | 0) + 1) + " c" + ((idx % 9) + 1) + (v !== 0 ? ": " + v : "");
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
  }

  /** 选中格变化：只 patch 前后两格 */
  function moveSelection(idx: number): void {
    const prev = selected;
    selected = idx;
    if (prev >= 0) {
      patchCellAt(cells[prev], machine.get(), prev, errorSetOf(machine.get()));
    }
    if (idx >= 0) {
      patchCellAt(cells[idx], machine.get(), idx, errorSetOf(machine.get()));
    }
  }

  function errorSetOf(s: GameState): Record<number, boolean> {
    const errors = checkErrors(s);
    const set: Record<number, boolean> = {};
    for (let i = 0; i < errors.length; i++) set[errors[i]] = true;
    return set;
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
    solved = true;
    stopTimer();
    remove(SLUG, "save1"); // 完局清档（下次进入开新局）
    resultStats.textContent =
      s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1) + " · " + fmtTime(seconds);
    const cta = resolveCta();
    resultCta.setAttribute("href", cta.href);
    resultCta.textContent = cta.label;
    resultBox.classList.add("is-open");
  }

  // ── 换局（新游戏/切难度共用；有进度先确认，防误触丢局）──
  function startNew(d: Difficulty): void {
    difficulty = d;
    machine = createState<GameState>(
      newGame({ difficulty: d, seed: opts ? opts.seed : undefined }).state,
    );
    seconds = 0;
    lastSavedSec = 0;
    solved = false;
    selected = -1;
    notesMode = false;
    pendingDiff = null;
    resultBox.classList.remove("is-open");
    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    startTimer();
  }

  function requestNew(d: Difficulty): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已有玩家操作），判定走 state machine
    if (machine.canUndo()) {
      pendingDiff = d;
      patch(machine.get());
    } else {
      startNew(d);
    }
  }

  // ── 输入：一律先过 logic，no-op（原引用）不入 undo 栈（§5.3 / logic 契约）──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) machine.commit(next);
  }

  function inputDigit(v: number): void {
    if (solved || selected < 0) return;
    const s = machine.get();
    const r = (selected / 9) | 0;
    const c = selected % 9;
    if (notesMode) {
      commitIfChanged(toggleNote(s, r, c, v));
    } else {
      commitIfChanged(applyMove(s, r, c, v));
    }
  }

  function eraseSelected(): void {
    if (solved || selected < 0) return;
    const s = machine.get();
    commitIfChanged(clearCell(s, (selected / 9) | 0, selected % 9));
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  board.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr === null) return;
    moveSelection(parseInt(idxStr, 10));
  });

  seg.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute("data-diff") as Difficulty | null;
    if (!d || d === difficulty) return;
    requestNew(d);
  });

  pad.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const key = target.getAttribute("data-key");
    if (key === null) return;
    inputDigit(parseInt(key, 10));
  });

  trio.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const key = target.getAttribute("data-key");
    if (key === "notes") {
      notesMode = !notesMode;
      patch(machine.get());
    } else if (key === "erase") {
      eraseSelected();
    } else if (key === "undo") {
      machine.undo();
    }
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

  // 物理键盘（§6：howToPlay 承诺了方向键/数字键/退格）；方向键边缘即停、不环绕
  function onKeyDown(ev: KeyboardEvent): void {
    if (solved || pendingDiff !== null) return;
    if (ev.key >= "1" && ev.key <= "9") {
      inputDigit(parseInt(ev.key, 10));
      return;
    }
    if (ev.key === "Backspace" || ev.key === "Delete") {
      eraseSelected();
      return;
    }
    const dr =
      ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
    const dc =
      ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
    if (dr === 0 && dc === 0) return;
    ev.preventDefault();
    const base = selected < 0 ? 40 : selected; // 无选中从盘心开始
    let r = ((base / 9) | 0) + dr;
    let c = (base % 9) + dc;
    if (r < 0) r = 0;
    if (r > 8) r = 8;
    if (c < 0) c = 0;
    if (c > 8) c = 8;
    const next = r * 9 + c;
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
  if (!solved) startTimer(); // 恢复存档则从原秒数继续计时
}
