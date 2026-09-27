/**
 * memory/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：翻牌合法性、两张判定、配对/胜利判定全部调 logic.ts 导出函数；
 * 本文件仅持有纯 UI 状态（键盘选中牌、计时）并做最小脏区 patch。
 *
 * 组件选型说明（沿用 sudoku 打样决策）：@marcomattes/epaper-components@2.0.0 任何
 * 组件入口都经共享 chunk 引入含 ES2021 `.replaceAll(` 等的 core 代码，与
 * build-games.mjs 的 ES2016+ API 黑名单断言（规约 §10.8）结构性冲突，且
 * ElementInternals 在老 Kindle WebKit 上运行时抛错——故本游戏 UI 全部自绘
 * vanilla DOM（视觉遵循 epaper 印刷美学：--ink-* token、1-bit 反转、无动画无 hover）。
 *
 * 本地化通道缺口（沿用 sudoku 打样裁决）：游戏 bundle 为全语言共享静态 IIFE，
 * 游戏内固定英文短词（WORDS 常量）；导流 CTA 走 DOM 通道
 * （页面模板 promo 位 <a data-egames-cta>，mount 时读取覆盖，缺省英文兜底）。
 *
 * 翻牌时序：logic 判定两张不匹配后牌保持 CARD_UP 挂起，render 层 setTimeout
 * 800ms 后调 logic.flipBack 翻回（禁 CSS transition/animation，§10.2）；挂起期间
 * logic.flipCard 自身 no-op 锁输入（防连点第三张），render 无需另设锁标志。
 *
 * 悔棋取舍：meta.engineFeatures 不含 "undo"，UI 不出悔棋按钮（文案/功能与 meta
 * 声明严格一致，翻牌配对游戏的 undo 会直接翻开已见牌作弊，玩法上也无意义）；
 * 状态仍走 _engine/state 状态机管理（onChange 订阅、commit 语义），undo 栈闲置。
 */
import {
  flipCard,
  flipBack,
  isSolved,
  newGame,
  serialize,
  deserialize,
  upIndices,
  LAYOUT,
  type Difficulty,
  type GameState,
} from "./logic";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "memory";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** 12 种风格统一的 1-bit 几何符号（文本字形，0 外部请求；id = 数组下标） */
const GLYPHS = ["●", "■", "▲", "★", "◆", "▼", "○", "□", "△", "＋", "×", "◇"];

/** 牌背中央标记（细边框 + 中点，与翻开态黑白反转强区分） */
const BACK_MARK = "·";

/** 不匹配对挂起时长（ms）：停留展示后翻回（任务规格 ~800ms） */
const FLIP_BACK_MS = 800;

/** 存档载荷（契约 §5.2 精神：{ s: logic 序列化串, sec: render 计时 }） */
interface SavePayload {
  s: string;
  sec: number;
}

/** 每难度累计统计（bestMoves/bestSec 完局时取更优值） */
interface DiffStats {
  games: number;
  bestMoves: number;
  bestSec: number;
}
type StatsPayload = Record<string, DiffStats | undefined>;

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
  newGame: "New Game",
  solved: "All pairs found!",
  timeLabel: "TIME",
  movesLabel: "MOVES",
  pairsLabel: "PAIRS",
  bestLabel: "Best on", // 后接难度名，如 "Best on Easy"
  newBest: "New personal best on this difficulty!",
  progressSaved: "Progress is saved automatically.",
};

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover（§10.2）。
// 1-bit 状态（§10.5 + 任务规格）：牌背=细边框+中点、翻开=黑底白字反转、
// 配对完成=inset 3px 粗边框（白底黑字保持符号可读）、键盘选中=虚线 outline
// （up 牌上白色）。颜色只用 --ink-* token（带字面量回退）。
// 触控目标：牌 min-height 52px、按钮 44-48px（§10.7）。
// 公共声明收敛到 .mem-wrap button 通配（appearance/font/底色/光标），min 后 ≤2KB（§3.4）。
const CSS = [
  // 局部别名 --k/--w/--p：缩短重复的 token 回退串（兼容面与直接 var(--ink-*) 完全一致）
  ".mem-wrap{max-width:30rem;margin:0 auto;--k:var(--ink-fg,#000);--w:var(--ink-bg,#fff);--p:var(--site-prose-fg,#333);--m:var(--ink-mono,monospace)}",
  ".mem-wrap button{-webkit-appearance:none;appearance:none;font:inherit;background:var(--w);color:var(--k);cursor:pointer}",
  ".mem-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--k);border:1px solid var(--k);margin:0 0 .75rem}",
  ".mem-btn{min-height:44px;padding:0 6px;font-size:.875rem;border:0}",
  ".mem-btn.is-on{background:var(--k);color:var(--w);font-weight:700}",
  ".mem-status{display:flex;justify-content:space-between;gap:.75rem;font-family:var(--m);font-size:.8125rem;border-bottom:1px solid var(--k);padding:2px 0 6px;margin-bottom:.75rem}",
  ".mem-board{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--k);border:3px solid var(--k)}",
  ".mem-board--c6{grid-template-columns:repeat(6,1fr)}",
  ".mem-card{min-height:52px;padding:0;font-size:1.375rem;border:0}",
  ".mem-card.is-up{background:var(--k);color:var(--w)}",
  ".mem-card.is-matched{box-shadow:inset 0 0 0 3px var(--k)}",
  ".mem-card.is-sel{outline:3px dashed var(--k);outline-offset:-3px}",
  ".mem-card.is-up.is-sel{outline-color:var(--w)}",
  ".mem-new{width:100%;min-height:48px;margin-top:.75rem;font-size:.875rem;border:1px solid var(--k)}",
  ".mem-confirm{display:none;border:3px solid var(--k);padding:.75rem;margin-top:.75rem}",
  ".mem-confirm.is-open{display:block}",
  ".mem-confirm p{margin:0;font-size:.875rem;color:var(--p)}",
  ".mem-confirm div{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-top:10px}",
  ".mem-cbtn{min-height:44px;font-size:.875rem;border:1px solid var(--k)}",
  ".mem-result{display:none;border:3px solid var(--k);margin-top:.75rem}",
  ".mem-result.is-open{display:block}",
  ".mem-result__title{background:var(--k);color:var(--w);font-weight:700;padding:.5rem .75rem}",
  ".mem-result p{padding:.5rem .75rem;margin:0;font-family:var(--m);font-size:.875rem;border-bottom:1px solid var(--k);color:var(--p)}",
  ".mem-result__cta{display:block;padding:.625rem .75rem;color:var(--k)}",
  ".mem-hint{margin:10px 0 0;font-size:.75rem;color:var(--p)}",
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 模块级可清理资源：幂等重挂载（契约 §3.3.3）时先释放上一份。
let activeTimer: ReturnType<typeof setInterval> | null = null;
let activeVisHandler: (() => void) | null = null;
let activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;
let activeFlipTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (activeFlipTimer !== null) {
    clearTimeout(activeFlipTimer);
    activeFlipTimer = null;
  }
}

/**
 * 挂载入口（index.ts 注册到 window.EGames 后调用；幂等，契约 §3.3.3）。
 * opts.seed 透传给 newGame 供外部可复现组局（当前页面路径不传 → Date.now 随机）。
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
  let selected = -1; // 键盘选中牌 idx 或 -1
  let pendingDiff: Difficulty | null = null; // 待确认的换局难度

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
    // 恢复即收回挂起牌（刷新点正处 800ms 翻回窗口时，挂起对无人翻回会锁死输入）
    const clean = flipBack(restored);
    machine = createState<GameState>(clean); // replace 语义：载入存档不入 undo 栈
    difficulty = clean.difficulty;
    seconds = savedSec;
  } else {
    machine = createState<GameState>(
      newGame({ difficulty, seed: opts ? opts.seed : undefined }),
    );
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "mem-wrap";

  // 难度段选（单选行，选中态黑底反转）
  const seg = document.createElement("div");
  seg.className = "mem-seg";
  seg.setAttribute("role", "group");
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "mem-btn";
    key.setAttribute("data-diff", d);
    key.textContent = cap(d);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行：等宽文本 TIME / MOVES / PAIRS
  const statusTime = document.createElement("span");
  const statusMoves = document.createElement("span");
  const statusPairs = document.createElement("span");
  const status = document.createElement("div");
  status.className = "mem-status";
  status.appendChild(statusTime);
  status.appendChild(statusMoves);
  status.appendChild(statusPairs);

  // 牌板：语义化 CSS grid（列数随难度 4/6）
  const board = document.createElement("div");
  board.className = "mem-board";
  board.setAttribute("role", "grid");
  const cells: HTMLButtonElement[] = [];

  function rebuildBoard(total: number): void {
    // 一次性结构变更（换局时牌数/布局变化，非渲染路径）
    board.textContent = "";
    cells.length = 0;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mem-card";
      cell.setAttribute("data-idx", String(i));
      board.appendChild(cell);
      cells.push(cell);
    }
  }

  // 新游戏（内联确认：有进度先确认，防误触丢局）
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "mem-new";
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement("div");
  confirmBox.className = "mem-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "mem-confirm__row";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "mem-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "mem-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（title + 本局成绩 + 最佳 + 导流 CTA）
  const resultTitle = document.createElement("div");
  resultTitle.className = "mem-result__title";
  resultTitle.textContent = WORDS.solved;
  const resultStats = document.createElement("p");
  resultStats.className = "mem-result__stats";
  const resultBest = document.createElement("p");
  resultBest.className = "mem-result__stats";
  const resultCta = document.createElement("a");
  resultCta.className = "mem-result__cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "mem-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultBest);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "mem-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(board);
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

  // ── 存档（§5.2 组装归 render 层）──
  function persist(): void {
    if (solved) return;
    save<SavePayload>(SLUG, "save1", { s: serialize(machine.get()), sec: seconds });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList/outline 相关 class）──
  let lastMovesShown = -1;
  let lastPairsShown = -1;

  function patch(s: GameState): void {
    for (let idx = 0; idx < cells.length; idx++) {
      patchCardAt(cells[idx], s, idx);
    }
    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle("is-on", DIFFICULTIES[i] === difficulty);
    }
    confirmBox.classList.toggle("is-open", pendingDiff !== null);
    if (s.moves !== lastMovesShown) {
      statusMoves.textContent = WORDS.movesLabel + " " + s.moves;
      lastMovesShown = s.moves;
    }
    const pairsShown = s.matched + "/" + LAYOUT[difficulty].pairs;
    if (pairsShown !== lastPairsShown) {
      statusPairs.textContent = WORDS.pairsLabel + " " + pairsShown;
      lastPairsShown = pairsShown;
    }
    renderTime();
    if (!solved && isSolved(s)) finishGame(s);
  }

  /** 单牌 patch：只改变化项（text/class/aria），EPDC 局部刷新 */
  function patchCardAt(el: HTMLButtonElement, s: GameState, idx: number): void {
    const card = s.cards[idx];
    const text = card === 0 ? BACK_MARK : GLYPHS[s.symbols[idx]];
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle("is-up", card === 1);
    el.classList.toggle("is-matched", card === 2);
    el.classList.toggle("is-sel", idx === selected);
    const label =
      "card " + (idx + 1) + (card === 2 ? ", matched" : card === 1 ? ", up" : "");
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
  }

  // ── 终局（成绩 + 最佳 + 导流 CTA；文案取自页面 content JSON 的 DOM 通道）──
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
      cap(s.difficulty) + " · " + s.moves + " " + WORDS.movesLabel.toLowerCase() + " · " + fmtTime(seconds);

    // stats：按难度分别记录（结构 {easy:{...},medium:{...},hard:{...}}，key=stats）
    let stats: StatsPayload = {};
    const stored = load<StatsPayload>(SLUG, "stats");
    if (stored && typeof stored === "object") stats = stored;
    const prev = stats[s.difficulty];
    const firstGame = !prev || typeof prev.games !== "number";
    const prevBestMoves = firstGame ? 0 : prev!.bestMoves;
    const prevBestSec = firstGame ? 0 : prev!.bestSec;
    const isBest = firstGame || s.moves < prevBestMoves || seconds < prevBestSec;
    stats[s.difficulty] = {
      games: (firstGame ? 0 : prev!.games) + 1,
      bestMoves: firstGame || s.moves < prevBestMoves ? s.moves : prevBestMoves,
      bestSec: firstGame || seconds < prevBestSec ? seconds : prevBestSec,
    };
    save<StatsPayload>(SLUG, "stats", stats);

    const best = stats[s.difficulty]!;
    resultBest.textContent = isBest
      ? WORDS.newBest
      : WORDS.bestLabel + " " + cap(s.difficulty) + ": " + best.bestMoves + " " +
        WORDS.movesLabel.toLowerCase() + " · " + fmtTime(best.bestSec);
    const cta = resolveCta();
    resultCta.setAttribute("href", cta.href);
    resultCta.textContent = cta.label;
    resultBox.classList.add("is-open");
  }

  // ── 换局（新游戏/切难度共用）──
  function startNew(d: Difficulty): void {
    difficulty = d;
    if (activeFlipTimer !== null) {
      clearTimeout(activeFlipTimer);
      activeFlipTimer = null;
    }
    machine = createState<GameState>(
      newGame({ difficulty: d, seed: opts ? opts.seed : undefined }),
    );
    seconds = 0;
    lastSavedSec = 0;
    solved = false;
    selected = -1;
    pendingDiff = null;
    lastMovesShown = -1;
    lastPairsShown = "";
    resultBox.classList.remove("is-open");

    const layout = LAYOUT[d];
    if (cells.length !== layout.cols * layout.rows) rebuildBoard(layout.cols * layout.rows);
    board.classList.toggle("mem-board--c6", layout.cols === 6);

    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    startTimer();
  }

  function requestNew(d: Difficulty): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已有玩家操作）；终局无进度可保护，直接换
    if (!solved && machine.canUndo()) {
      pendingDiff = d;
      patch(machine.get());
    } else {
      startNew(d);
    }
  }

  // ── 翻牌输入：一律先过 logic；no-op（原引用）不入状态机 ──
  function onFlip(idx: number): void {
    if (solved || pendingDiff !== null) return;
    const cur = machine.get();
    const next = flipCard(cur, idx);
    if (next === cur) return;
    machine.commit(next);
    if (upIndices(next).length === 2) {
      // 不匹配对挂起 → 800ms 后翻回（setTimeout 控制，禁 CSS 过渡）
      if (activeFlipTimer !== null) clearTimeout(activeFlipTimer);
      activeFlipTimer = setTimeout(() => {
        activeFlipTimer = null;
        const now = machine.get();
        if (upIndices(now).length !== 2) return; // 期间已换局等，防御
        machine.commit(flipBack(now));
      }, FLIP_BACK_MS);
    }
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  board.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr === null) return;
    selected = parseInt(idxStr, 10);
    onFlip(selected);
  });

  seg.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute("data-diff") as Difficulty | null;
    if (!d || d === difficulty) return;
    requestNew(d);
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

  // 物理键盘（§6：howToPlay 承诺了方向键 + Enter/Space）；方向键边缘即停、不环绕
  function onKeyDown(ev: KeyboardEvent): void {
    if (solved || pendingDiff !== null) return;
    const total = cells.length;
    const cols = LAYOUT[difficulty].cols;
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
      if (selected >= 0) {
        ev.preventDefault();
        onFlip(selected);
      }
      return;
    }
    const dr = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
    const dc = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
    if (dr === 0 && dc === 0) return;
    ev.preventDefault();
    const base = selected < 0 ? 0 : selected; // 无选中从首张开始
    let r = ((base / cols) | 0) + dr;
    let c = (base % cols) + dc;
    const rows = (total / cols) | 0;
    if (r < 0) r = 0;
    if (r > rows - 1) r = rows - 1;
    if (c < 0) c = 0;
    if (c > cols - 1) c = cols - 1;
    const next = r * cols + c;
    if (next === selected) return;
    const prev = selected;
    selected = next;
    if (prev >= 0 && prev < total) patchCardAt(cells[prev], machine.get(), prev);
    if (next < total) patchCardAt(cells[next], machine.get(), next);
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

  // 初始布局（难度恢复自存档时列数可能为 6）
  const initLayout = LAYOUT[difficulty];
  rebuildBoard(initLayout.cols * initLayout.rows);
  board.classList.toggle("mem-board--c6", initLayout.cols === 6);
  patch(machine.get());
  if (!solved) startTimer(); // 恢复存档则从原秒数继续计时
}
