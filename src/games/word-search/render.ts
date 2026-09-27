/**
 * word-search/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切「这步是否命中/是否赢了」的判断只调 logic.ts 导出函数
 * （trySelect / isSolved）；本文件仅持有纯 UI 状态（锚点格、键盘光标、计时）
 * 并做最小脏区 patch。
 *
 * 组件选型说明（沿 sudoku 打样裁决）：
 * 任务规约允许 @marcomattes/epaper-components 具名导入，但实测 2.0.0 任何组件
 * 入口都会经共享 chunk 引入含 ES2021 replaceAll 调用的 core 代码，与
 * build-games.mjs 的 API 黑名单断言（规约 §10.8）结构性冲突（详见
 * sudoku/render.ts 文件头）。故本游戏同款全自绘 vanilla DOM，视觉严格遵循
 * epaper 印刷美学：--ink-* token、粗线、1-bit 反转、无动画无 hover。
 *
 * 交互模型（触屏优先 + d-pad 双通道）：
 * - 触屏：点词首字母格 → 点词尾字母格（任意一端起选均可命中）。
 * - 键盘：方向键移动虚线光标，Enter/Space 设起点或确认终点，Escape 取消。
 *   14×14 在 600px 宽 ≈42px/格，略低于 44px 触控标准——d-pad 即规格书要求的
 *   补偿通道（报告已说明）。
 *
 * 本地化通道缺口（沿 sudoku 打样裁决）：游戏 bundle 为全语言共享静态 IIFE，
 * content JSON 的 locale 文案无构建期注入通道——游戏内固定英文短词，导流 CTA
 * 走 DOM 通道（页面模板 promo 位 <a data-egames-cta>），检测不到用英文兜底。
 */
import {
  deserialize,
  isSolved,
  newGame,
  serialize,
  trySelect,
  type Difficulty,
  type GameState,
} from "./logic";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "word-search";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** 存档载荷（契约 §5.2：{ s: logic 序列化串, sec: render 计时 }，不含 placements/undo 栈） */
interface SavePayload {
  s: string;
  sec: number;
}

/** 累计统计（key: stats；played=开过的局数，won=完成局数，best=各难度最佳秒数） */
interface StatsPayload {
  played: number;
  won: number;
  best: Record<string, number>;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内固定英文短词（本地化通道缺口，见文件头说明） */
const WORDS = {
  confirm: "Start a new puzzle? Words found so far will be lost.",
  ok: "OK",
  cancel: "Cancel",
  newGame: "New Puzzle",
  solved: "All words found!",
  timeLabel: "TIME",
  foundLabel: "FOUND",
  themeLabel: "THEME",
  progressSaved: "Progress is saved automatically.",
};

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover
// （§10.2）；1-bit 状态（§10.5）：已找到=黑底白字反转、选词起点=inset 3px 粗框、
// 键盘光标=inset 2px 细框；颜色只用 --ink-* token（不写字面量回退——token 由
// 站点全局注入，缺失时初始色同为黑字白底，视觉等价；省出的字节换 2KB 预算）。
// 细线=grid gap 露底色；公共选择器组压缩体积，min 后 ≤2KB（§3.4）。
const CSS = [
  ".wsr-wrap{max-width:34rem;margin:0 auto}",
  ".wsr-grid{display:grid;gap:1px;background:var(--ink-fg);border:1px solid var(--ink-fg)}",
  ".wsr-seg,.wsr-words{grid-template-columns:repeat(3,1fr)}",
  ".wsr-seg{margin:0 0 .75rem}",
  ".wsr-words{margin-top:.75rem}",
  ".wsr-btn,.wsr-cbtn,.wsr-cell,.wsr-new{font:inherit;border:0;background:var(--ink-bg);color:var(--ink-fg);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".wsr-btn,.wsr-cbtn{min-height:44px;padding:.25rem;font-size:.875rem}",
  ".wsr-btn.is-on{background:var(--ink-fg);color:var(--ink-bg);font-weight:700}",
  ".wsr-status{display:flex;justify-content:space-between;font:.8125rem var(--ink-mono);border-bottom:1px solid var(--ink-fg);padding:.125rem 0 .375rem;margin:0 0 .75rem}",
  ".wsr-board{border-width:2px;font-size:1rem}",
  ".wsr-b10{font-size:1.125rem}",
  ".wsr-b14{font-size:.875rem}",
  ".wsr-cell{min-height:36px;padding:0;line-height:1}",
  ".wsr-cell.is-found{background:var(--ink-fg);color:var(--ink-bg);font-weight:700}",
  ".wsr-cell.is-anchor{box-shadow:inset 0 0 0 3px var(--ink-fg)}",
  ".wsr-cell.is-cursor{box-shadow:inset 0 0 0 2px var(--ink-fg)}",
  ".wsr-cell.is-found.is-anchor{box-shadow:inset 0 0 0 3px var(--ink-bg)}",
  ".wsr-word{font:.8125rem/40px var(--ink-mono);padding:0 .375rem;text-align:center;background:var(--ink-bg);color:var(--ink-fg)}",
  ".wsr-word.is-found{text-decoration:line-through}",
  ".wsr-new{display:block;width:100%;min-height:48px;margin-top:.75rem;font-size:.875rem;border:1px solid var(--ink-fg)}",
  ".wsr-confirm,.wsr-result{display:none;border:3px solid var(--ink-fg);margin-top:.75rem}",
  ".wsr-confirm.is-open,.wsr-result.is-open{display:block}",
  ".wsr-confirm{padding:.75rem}",
  ".wsr-confirm p{margin:0;font-size:.875rem}",
  ".wsr-crow{display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem;margin-top:.5rem}",
  ".wsr-result>div{background:var(--ink-fg);color:var(--ink-bg);font-weight:700;padding:.5rem .75rem;font-size:1rem}",
  ".wsr-result>p{padding:.5rem .75rem;margin:0;font:.875rem var(--ink-mono);border-bottom:1px solid var(--ink-fg)}",
  ".wsr-result>a{padding:.625rem .75rem;color:var(--ink-fg)}",
  ".wsr-hint{margin:.625rem 0 0;font-size:.75rem}",
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function loadStats(): StatsPayload {
  const s = load<StatsPayload>(SLUG, "stats");
  if (
    s && typeof s === "object" &&
    typeof s.played === "number" && typeof s.won === "number" &&
    s.best && typeof s.best === "object"
  ) {
    return { played: s.played, won: s.won, best: s.best };
  }
  return { played: 0, won: 0, best: {} };
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
 * seeded=false：opts.seed 预留位当前页面路径不传，newGame 内部用 Date.now() 随机组局。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落

  injectCss();

  // ── 状态：先恢复存档（key: save1），无档才生成新局 ──
  let difficulty: Difficulty = "easy";
  let seconds = 0;
  let solved = false;
  let anchor = -1; // 选词起点格 idx（-1 = 未设）
  let cursor = -1; // 键盘光标格 idx（-1 = 未出现）
  let pendingDiff: Difficulty | null = null;

  const saved = load<SavePayload>(SLUG, "save1");
  let restored: GameState | null = null;
  let savedSec = 0;
  if (saved && typeof saved.s === "string" && typeof saved.sec === "number") {
    const parsed = deserialize(saved.s);
    if (parsed && !isSolved(parsed)) {
      // 完局旧档（异常路径：完局应已清档）不作恢复，走下方重开
      restored = parsed;
      savedSec = saved.sec;
    }
  }
  let machine: ReturnType<typeof createState<GameState>>;
  if (restored) {
    // §4.4：载入存档用 replace 语义——直接以 restored 重建 machine（尚未挂订阅）；
    // played 已在该局开局时计入，恢复不重复计
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
    seconds = savedSec;
  } else {
    machine = createState<GameState>(newGame({ difficulty, seed: opts ? opts.seed : undefined }).state);
    bumpPlayed();
  }

  function bumpPlayed(): void {
    const st = loadStats();
    st.played += 1;
    save(SLUG, "stats", st);
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "wsr-wrap";

  // 难度段选（单选行，选中态黑底反转）
  const seg = document.createElement("div");
  seg.className = "wsr-grid wsr-seg";
  seg.setAttribute("role", "group");
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "wsr-btn";
    key.setAttribute("data-diff", d);
    key.textContent = capitalize(d);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行：TIME | FOUND n/m | THEME
  const statusTime = document.createElement("span");
  const statusFound = document.createElement("span");
  const statusTheme = document.createElement("span");
  const status = document.createElement("div");
  status.className = "wsr-status";
  status.appendChild(statusTime);
  status.appendChild(statusFound);
  status.appendChild(statusTheme);

  // 棋盘/词单：尺寸随难度变化，建为可替换节点（startNew 重建，非渲染路径）
  let board = document.createElement("div");
  let cells: HTMLButtonElement[] = [];
  let wordList = document.createElement("div");
  let wordEls: HTMLDivElement[] = [];

  function buildBoard(size: number): void {
    const next = document.createElement("div");
    next.className =
      "wsr-grid wsr-board" + (size === 10 ? " wsr-b10" : size === 14 ? " wsr-b14" : "");
    next.setAttribute("role", "grid");
    next.style.gridTemplateColumns = "repeat(" + size + ",1fr)";
    const nextCells: HTMLButtonElement[] = [];
    for (let idx = 0; idx < size * size; idx++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "wsr-cell";
      cell.setAttribute("data-idx", String(idx));
      next.appendChild(cell);
      nextCells.push(cell);
    }
    if (board.parentNode) board.parentNode.replaceChild(next, board);
    else wrap.appendChild(next);
    board = next;
    cells = nextCells;
  }

  function buildWordList(words: string[]): void {
    const next = document.createElement("div");
    next.className = "wsr-grid wsr-words";
    const nextEls: HTMLDivElement[] = [];
    for (let i = 0; i < words.length; i++) {
      const el = document.createElement("div");
      el.className = "wsr-word";
      el.setAttribute("data-wi", String(i));
      el.textContent = words[i];
      next.appendChild(el);
      nextEls.push(el);
    }
    if (wordList.parentNode) wordList.parentNode.replaceChild(next, wordList);
    else wrap.appendChild(next);
    wordList = next;
    wordEls = nextEls;
  }

  // 新游戏（内联确认，无 showModal 依赖）与结果面板、提示行
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "wsr-new";
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement("div");
  confirmBox.className = "wsr-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "wsr-crow";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "wsr-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "wsr-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（标题/统计/CTA 用标签选择器定样式，省类名字节）
  const resultTitle = document.createElement("div");
  resultTitle.textContent = WORDS.solved;
  const resultStats = document.createElement("p");
  const resultCta = document.createElement("a");
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "wsr-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "wsr-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  buildBoard(machine.get().size);
  buildWordList(machine.get().words);
  wrap.appendChild(newBtn);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 计时（§6：setInterval 自持、visibilitychange 对齐、不写入 logic state）──
  let startedAt = Date.now() - seconds * 1000;
  let lastSavedSec = seconds;
  let lastTimeShown = -1;
  let lastFoundShown = "";

  function renderStatus(s: GameState): void {
    if (seconds !== lastTimeShown) {
      statusTime.textContent = WORDS.timeLabel + " " + fmtTime(seconds);
      lastTimeShown = seconds;
    }
    let n = 0;
    for (let i = 0; i < s.found.length; i++) {
      if (s.found[i]) n++;
    }
    const foundText = WORDS.foundLabel + " " + n + "/" + s.words.length;
    if (foundText !== lastFoundShown) {
      statusFound.textContent = foundText;
      lastFoundShown = foundText;
    }
    const themeText = WORDS.themeLabel + " " + s.theme;
    if (statusTheme.textContent !== themeText) statusTheme.textContent = themeText;
  }

  function startTimer(): void {
    if (activeTimer !== null) return;
    startedAt = Date.now() - seconds * 1000;
    activeTimer = setInterval(() => {
      seconds = ((Date.now() - startedAt) / 1000) | 0;
      renderStatus(machine.get());
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
    renderStatus(machine.get());
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

  // ── 存档（组装归 render 层；完局清档）──
  function persist(): void {
    if (solved) return;
    save<SavePayload>(SLUG, "save1", { s: serialize(machine.get()), sec: seconds });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──

  /** 单格 patch：字母仅变更时写；1-bit 状态类逐个对齐 */
  function patchCell(el: HTMLButtonElement, s: GameState, idx: number): void {
    const text = s.grid[idx];
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("is-found", s.foundCells[idx] === true);
    el.classList.toggle("is-anchor", idx === anchor);
    el.classList.toggle("is-cursor", idx === cursor);
    const label = "r" + (((idx / s.size) | 0) + 1) + " c" + ((idx % s.size) + 1) + ": " + text;
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
  }

  /** 全量 patch：commit（找到词）后调用；平时增量路径见 moveCursor/setAnchor */
  function patch(s: GameState): void {
    for (let idx = 0; idx < cells.length; idx++) {
      patchCell(cells[idx], s, idx);
    }
    for (let i = 0; i < wordEls.length; i++) {
      wordEls[i].classList.toggle("is-found", s.found[i] === true);
    }
    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle("is-on", DIFFICULTIES[i] === difficulty);
    }
    confirmBox.classList.toggle("is-open", pendingDiff !== null);
    renderStatus(s);
    if (!solved && isSolved(s)) finishGame(s);
  }

  /** 锚点/光标变化：只 patch 受影响格（EPDC 局部刷新） */
  function patchSel(s: GameState, prevAnchor: number, prevCursor: number): void {
    const touched = [prevAnchor, prevCursor, anchor, cursor];
    for (let t = 0; t < touched.length; t++) {
      const idx = touched[t];
      if (idx >= 0 && idx < cells.length) {
        // 重复 idx 无妨：patchCell 是幂等对齐
        patchCell(cells[idx], s, idx);
      }
    }
  }

  function setAnchor(idx: number): void {
    const pa = anchor;
    anchor = idx;
    patchSel(machine.get(), pa, cursor);
  }

  function moveCursor(idx: number): void {
    const pc = cursor;
    cursor = idx;
    patchSel(machine.get(), anchor, pc);
  }

  // ── 选词（判定一律走 logic §5.3；no-op 原引用不入 undo 栈）──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) machine.commit(next);
  }

  /** 点选终点格：调 logic 判定，命中与否都清锚点（未命中 = 静默拒绝） */
  function selectTo(idx: number): void {
    if (solved || anchor < 0) return;
    const s = machine.get();
    const size = s.size;
    const next = trySelect(s, (anchor / size) | 0, anchor % size, (idx / size) | 0, idx % size);
    setAnchor(-1);
    commitIfChanged(next);
  }

  /** 格子激活（触屏 click / 键盘确认共用）：无锚点设锚点；有锚点判定；同格取消 */
  function activateCell(idx: number): void {
    if (solved || pendingDiff !== null) return;
    moveCursor(idx);
    if (anchor === idx) {
      setAnchor(-1); // 再点同格 = 取消
      return;
    }
    if (anchor < 0) {
      setAnchor(idx);
    } else {
      selectTo(idx);
    }
  }

  // ── 终局（成绩 + 导流 CTA；文案取页面 content JSON 的 DOM 通道，见文件头）──
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
    anchor = -1;
    const st = loadStats();
    st.won += 1;
    const prevBest = st.best[s.difficulty];
    if (prevBest === undefined || seconds < prevBest) st.best[s.difficulty] = seconds;
    save(SLUG, "stats", st);
    const best = st.best[s.difficulty];
    resultStats.textContent =
      capitalize(s.difficulty) + " · " + s.theme + " · " + fmtTime(seconds) +
      " · Best " + fmtTime(best);
    const cta = resolveCta();
    resultCta.setAttribute("href", cta.href);
    resultCta.textContent = cta.label;
    resultBox.classList.add("is-open");
    renderStatus(s);
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
    anchor = -1;
    cursor = -1;
    pendingDiff = null;
    resultBox.classList.remove("is-open");
    buildBoard(machine.get().size);
    buildWordList(machine.get().words);
    bumpPlayed();
    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    startTimer();
  }

  function requestNew(d: Difficulty): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已找到过词且未完局），判定走 state machine
    if (!solved && machine.canUndo()) {
      pendingDiff = d;
      patch(machine.get());
    } else {
      startNew(d);
    }
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  wrap.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr !== null) {
      activateCell(parseInt(idxStr, 10));
      return;
    }
    const d = target.getAttribute("data-diff");
    if (d !== null && d !== difficulty) {
      requestNew(d as Difficulty);
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

  // 物理键盘：方向键移动光标（边缘即停、不环绕）；Enter/Space 设锚/确认；Escape 取消。
  // 焦点在非格子原生按钮（难度/确认）上时不拦截 Enter/Space——原生 click 需保留。
  function onKeyDown(ev: KeyboardEvent): void {
    if (pendingDiff !== null) return;
    const t = ev.target as HTMLElement | null;
    const onOtherButton =
      t !== null && t.tagName === "BUTTON" && t.getAttribute("data-idx") === null;
    if (ev.key === "Enter" || ev.key === " ") {
      if (onOtherButton) return;
      ev.preventDefault();
      if (solved) return;
      const idx = cursor >= 0 ? cursor : -1;
      if (idx < 0) return;
      activateCell(idx);
      return;
    }
    if (ev.key === "Escape") {
      if (anchor >= 0) setAnchor(-1);
      return;
    }
    if (solved) return;
    const size = machine.get().size;
    const dr = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
    const dc = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
    if (dr === 0 && dc === 0) return;
    ev.preventDefault();
    const base = cursor < 0 ? ((size * size) / 2) | 0 : cursor; // 无光标从盘心开始
    let r = ((base / size) | 0) + dr;
    let c = (base % size) + dc;
    if (r < 0) r = 0;
    if (r > size - 1) r = size - 1;
    if (c < 0) c = 0;
    if (c > size - 1) c = size - 1;
    const next = r * size + c;
    if (next === base && cursor >= 0) return;
    moveCursor(next);
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
