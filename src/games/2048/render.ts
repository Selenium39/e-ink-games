/**
 * 2048/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：胜负/死局/合并判定只调 logic.ts 导出函数；本文件仅持有
 * 纯 UI 状态（计时、win 面板已读标记、best 分缓存）并做最小脏区 patch。
 *
 * 组件选型（沿用 sudoku 打样裁决）：@marcomattes/epaper-components@2.0.0
 * 任何入口都经共享 chunk 引入 core/base-form-control（含 ES2021 `.replaceAll(`
 * 等），与 build-games.mjs 的 API 黑名单断言（规约 §10.8）结构性冲突，故
 * UI 全部自绘 vanilla DOM：--ink-* token、3px 粗线、1-bit 反转，无动画无 hover。
 *
 * 无动画替代表达（任务规格）：新出现的块 = inset 3px 粗边框标记一轮，
 * 本步合并结果格 = 黑底白字反转标记一轮；下一次有效移动由 logic 的
 * spawnedAt / mergedAt 天然覆盖清除。禁任何 transition/animation。
 *
 * 本地化通道（2026-09 16 语言）：bundle 为全语言共享的静态 IIFE，游戏内
 * 文案经 DOM 通道注入——页面 SSG 把 ui-words.json 对应语言节写进
 * #game-root 的 data-egames-words 属性，mount 时与 words.en.ts 的
 * EN_WORDS 浅合并（缺键英文兜底）。导流 CTA 走既有 DOM 通道：页面模板
 * 在 promo 位输出 <a data-egames-cta href=…>{content.cta.label}</a>，
 * mount 时读取覆盖；检测不到时用英文兜底。
 */
import {
  deserialize,
  move,
  newGame,
  serialize,
  type Dir,
  type GameState,
} from "./logic";
import { mergeWords, readWords } from "../_engine/i18n";
import { createRng } from "../_engine/rng";
import type { Rng } from "../_engine/rng";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";
import { EN_WORDS } from "./words.en";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "2048";

/** swipe 判定阈值（px）：位移 ≥ 此值才算一次方向手势 */
const SWIPE_MIN_PX = 30;
/** touchmove 超过此位移即视为滑动意图，preventDefault 阻止页面滚动 */
const TOUCH_SCROLL_GUARD_PX = 10;

/** 存档载荷（契约 §5.2 风格：{ s: logic 序列化串, sec: render 计时 }，不含 undo 栈，决策⑤） */
interface SavePayload {
  s: string;
  sec: number;
}

/** 累计统计（storage key: stats）：最佳分 + 达成 2048 局数 */
interface StatsPayload {
  best: number;
  wins: number;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内文案（本地化：mount 时以 data-egames-words 注入词覆盖，见文件头） */
let WORDS: Record<string, string> = EN_WORDS;

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover（§10.2）。
// 1-bit 状态（§10.5）：新块=inset 3px 粗框、合并=黑底白字反转；颜色只用
// --ink-* token（带字面量回退）；触控目标 ≥44px（§10.7）；min 后 ≤2KB（§3.4）。
// 公共按钮声明合并为一条选择器组，短类名控制在预算内。
const CSS = [
  ".g48-wrap{max-width:24rem;margin:0 auto}",
  ".g48-status{display:flex;justify-content:space-between;gap:.75rem;border-bottom:1px solid var(--ink-fg,#000);padding:.125rem 0;margin-bottom:.75rem}",
  ".g48-board{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:var(--ink-fg,#000);border:3px solid var(--ink-fg,#000)}",
  ".g48-cell{box-sizing:border-box;min-height:64px;display:grid;place-items:center;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);font-size:2rem;font-weight:700}",
  ".g48-cell.is-d3{font-size:1.5rem}",
  ".g48-cell.is-d4{font-size:1.125rem}",
  ".g48-cell.is-new{box-shadow:inset 0 0 0 3px var(--ink-fg,#000)}",
  ".g48-cell.is-merged{background:var(--ink-fg,#000);color:var(--ink-bg,#fff)}",
  ".g48-ctl{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.75rem}",
  ".g48-dpad{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px}",
  ".g48-side{display:flex;flex-direction:column;gap:2px}",
  ".g48-key,.g48-btn,.g48-cbtn{border:1px solid var(--ink-fg,#000);background:var(--ink-bg,#fff);color:var(--ink-fg,#000);font:inherit;cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".g48-key{min-height:48px;font-size:1rem}",
  ".g48-btn,.g48-cbtn{min-height:44px;font-size:.875rem}",
  ".g48-btn[disabled]{border-style:dashed}",
  ".g48-cbtn.is-solid{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700}",
  ".g48-hidden{display:none}",
  ".g48-confirm,.g48-result{border:3px solid var(--ink-fg,#000);margin-top:.75rem;display:none}",
  ".g48-confirm{padding:.75rem}",
  ".g48-confirm.is-open,.g48-result.is-open{display:block}",
  ".g48-crow{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.5rem}",
  ".g48-rt{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700;padding:.5rem .75rem;font-size:1.125rem}",
  ".g48-rs{margin:0;padding:.5rem .75rem;border-bottom:1px solid var(--ink-fg,#000)}",
  ".g48-rrow{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:.5rem .75rem 0}",
  ".g48-cta{display:block;padding:.5rem .75rem;color:var(--ink-fg,#000)}",
  ".g48-hint{margin:.5rem 0 0;font-size:.75rem}",
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
 * 2048 非 seeded：opts.seed 仅作 Rng 种子透传（缺省取时钟，规约 §3.3.5）。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落
  WORDS = mergeWords(EN_WORDS, readWords(root)); // 本地化词表（缺键英文兜底）

  injectCss();

  // 随机源：全部经 _engine/rng（§10.6 禁裸 Math.random）；一局长寿命 Rng 序列
  const rng: Rng = createRng(((opts && opts.seed) || Date.now()) >>> 0);

  // ── 状态：先恢复存档（key: save1），无档才生成新局 ──
  let seconds = 0;
  let winDismissed = false; // 胜利面板只提示一次；恢复已 won 的存档不再弹
  let winCounted = false; // 本局 2048 是否已计入 stats.wins

  const savedStats = load<StatsPayload>(SLUG, "stats");
  let best = savedStats && typeof savedStats.best === "number" ? savedStats.best : 0;
  let wins = savedStats && typeof savedStats.wins === "number" ? savedStats.wins : 0;

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
    // §4.4：载入存档用 replace 语义——直接以 restored 重建 machine（尚未挂订阅）；
    // undo 栈不随存档恢复（契约决策⑤）
    machine = createState<GameState>(restored);
    seconds = savedSec;
    winDismissed = restored.won; // 已达成过 2048 的局不再重复弹面板
    winCounted = restored.won; // 也不重复计胜场
  } else {
    machine = createState<GameState>(newGame(rng));
  }
  const rngNext: Rng = rng;
  if (best < machine.get().score) best = machine.get().score; // 存档分即为已达成分

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "g48-wrap";

  // 状态行：TIME / SCORE / BEST
  const statusTime = document.createElement("span");
  const statusScore = document.createElement("span");
  const statusBest = document.createElement("span");
  const status = document.createElement("div");
  status.className = "g48-status";
  status.appendChild(statusTime);
  status.appendChild(statusScore);
  status.appendChild(statusBest);

  // 4×4 盘面：语义化 CSS grid；格子非交互（2048 为全盘移动），d-pad 承接键盘等价操作
  const board = document.createElement("div");
  board.className = "g48-board";
  board.setAttribute("role", "grid");
  board.setAttribute("aria-label", "2048 board");
  const cells: HTMLDivElement[] = [];
  for (let idx = 0; idx < 16; idx++) {
    const cell = document.createElement("div");
    cell.className = "g48-cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("data-idx", String(idx));
    board.appendChild(cell);
    cells.push(cell);
  }

  // d-pad 十字（触屏主输入；键盘方向键等价）
  const dpad = document.createElement("div");
  dpad.className = "g48-dpad";
  dpad.setAttribute("role", "group");
  dpad.setAttribute("aria-label", "Direction pad");
  const dirKeys: Record<Dir, HTMLButtonElement> = {
    up: makeKey("up", WORDS.up),
    down: makeKey("down", WORDS.down),
    left: makeKey("left", WORDS.left),
    right: makeKey("right", WORDS.right),
  };
  dpad.appendChild(document.createElement("div")); // 十字占位（无样式空格）
  dpad.appendChild(dirKeys.up);
  dpad.appendChild(document.createElement("div"));
  dpad.appendChild(dirKeys.left);
  dpad.appendChild(dirKeys.down);
  dpad.appendChild(dirKeys.right);

  // 右侧纵排：Undo / New Game
  const side = document.createElement("div");
  side.className = "g48-side";
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "g48-btn";
  undoBtn.textContent = WORDS.undo;
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "g48-btn";
  newBtn.textContent = WORDS.newGame;
  side.appendChild(undoBtn);
  side.appendChild(newBtn);

  const ctl = document.createElement("div");
  ctl.className = "g48-ctl";
  ctl.appendChild(dpad);
  ctl.appendChild(side);

  // 新局确认（有进度先确认，防误触丢局；内联确认替代 e-dialog，老 WebKit 安全）
  const confirmBox = document.createElement("div");
  confirmBox.className = "g48-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "g48-crow";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "g48-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "g48-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板：胜利（可继续）/ 失败共用骨架，按 state 切换
  const resultTitle = document.createElement("div");
  resultTitle.className = "g48-rt";
  const resultStats = document.createElement("p");
  resultStats.className = "g48-rs";
  const keepBtn = document.createElement("button");
  keepBtn.type = "button";
  keepBtn.className = "g48-cbtn is-solid";
  keepBtn.textContent = WORDS.keepGoing;
  const againBtn = document.createElement("button");
  againBtn.type = "button";
  againBtn.className = "g48-cbtn";
  againBtn.textContent = WORDS.newGame;
  const resultRow = document.createElement("div");
  resultRow.className = "g48-rrow";
  resultRow.appendChild(keepBtn);
  resultRow.appendChild(againBtn);
  const resultCta = document.createElement("a");
  resultCta.className = "g48-cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "g48-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultRow);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "g48-hint";
  hint.textContent = WORDS.hint;
  const savedHint = document.createElement("p");
  savedHint.className = "g48-hint";
  savedHint.textContent = WORDS.progressSaved;

  wrap.appendChild(status);
  wrap.appendChild(board);
  wrap.appendChild(ctl);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  wrap.appendChild(savedHint);
  root.appendChild(wrap);

  function makeKey(dir: Dir, label: string): HTMLButtonElement {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "g48-key";
    key.setAttribute("data-dir", dir);
    key.setAttribute("aria-label", "Move " + label.toLowerCase());
    key.textContent = arrowText(dir);
    return key;
  }

  function arrowText(dir: Dir): string {
    // 纯文本箭头（1-bit 友好，无图标请求）
    return dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "left" ? "◀" : "▶";
  }

  // ── 计时（§6：setInterval 自持、visibilitychange 对齐、不写入 logic state）──
  let startedAt = Date.now() - seconds * 1000;
  let lastSavedSec = seconds;
  let lastTimeShown = -1;
  let lastScoreShown = -1;
  let lastBestShown = -1;
  let pendingNew = false;

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
        // 计时不入 logic state，随存档存 sec；tick 侧 15s 节流落盘
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
    } else if (!machine.get().over) {
      startTimer();
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  activeVisHandler = onVisibility;

  // ── 存档（save1）与统计（stats）──
  function persist(): void {
    const s = machine.get();
    if (s.over) return; // 死局清档（finishGame 处 remove），不落盘
    save<SavePayload>(SLUG, "save1", { s: serialize(s), sec: seconds });
  }

  function persistStats(): void {
    save<StatsPayload>(SLUG, "stats", { best: best, wins: wins });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  function patch(s: GameState): void {
    for (let idx = 0; idx < 16; idx++) {
      patchCellAt(cells[idx], s, idx);
    }

    if (s.score !== lastScoreShown) {
      statusScore.textContent = WORDS.scoreLabel + " " + s.score;
      lastScoreShown = s.score;
    }
    if (best !== lastBestShown) {
      statusBest.textContent = WORDS.bestLabel + " " + best;
      lastBestShown = best;
    }

    undoBtn.disabled = !machine.canUndo();
    confirmBox.classList.toggle("is-open", pendingNew);
    renderTime();

    // 终局面板：失败 > 胜利提示 > 关闭（判定全部来自 logic state，§5.3）
    const showWin = !s.over && s.won && !winDismissed;
    const open = s.over || showWin;
    resultBox.classList.toggle("is-open", open);
    if (open) {
      const isOver = s.over;
      const title = isOver ? WORDS.overTitle : WORDS.winTitle;
      if (resultTitle.textContent !== title) resultTitle.textContent = title;
      const statsText = WORDS.finalScore + " " + s.score + " · " + fmtTime(seconds);
      if (resultStats.textContent !== statsText) resultStats.textContent = statsText;
      keepBtn.classList.toggle("g48-hidden", isOver); // 失败无「继续」
      if (isOver) fillCta();
    }
    if (s.over) stopTimer();
  }

  /** 单格 patch：数值 + 位数分级 + 一轮 1-bit 标记（新块/合并） */
  function patchCellAt(el: HTMLDivElement, s: GameState, idx: number): void {
    const v = s.cells[idx];
    const text = v === 0 ? "" : String(v);
    if (el.textContent !== text) el.textContent = text; // 仅变更格落盘（EPDC 局部刷新）
    el.classList.toggle("is-d3", v >= 100 && v < 1000);
    el.classList.toggle("is-d4", v >= 1000);
    el.classList.toggle("is-new", v !== 0 && idx === s.spawnedAt);
    let merged = false;
    for (let i = 0; i < s.mergedAt.length; i++) {
      if (s.mergedAt[i] === idx) {
        merged = true;
        break;
      }
    }
    el.classList.toggle("is-merged", merged);
    const label =
      "row " + (((idx / 4) | 0) + 1) + " col " + ((idx % 4) + 1) + (v !== 0 ? ": " + v : "");
    if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
  }

  /** 终局 CTA：优先页面 content JSON 的 DOM 通道（见文件头），否则英文兜底 */
  function fillCta(): void {
    const el = document.querySelector("a[data-egames-cta]");
    let href = FALLBACK_CTA.href;
    let label = FALLBACK_CTA.label;
    if (el) {
      const h = el.getAttribute("href");
      if (h) {
        href = h;
        label = el.textContent || label;
      }
    }
    if (resultCta.getAttribute("href") !== href) resultCta.setAttribute("href", href);
    if (resultCta.textContent !== label) resultCta.textContent = label;
  }

  // ── 移动（判定全走 logic；no-op 原引用 → 不 commit、不入 undo 栈，§5.3）──
  function doMove(dir: Dir): void {
    const cur = machine.get();
    if (cur.over || pendingNew) return;
    if (cur.won && !winDismissed) return; // 胜利面板待用户选择
    const next = move(cur, dir, rngNext);
    if (next === cur) return;
    // 胜场统计：本会话内 won 首次翻转才计（恢复存档不重复计）
    if (next.won && !cur.won && !winCounted) {
      winCounted = true;
      wins += 1;
      persistStats();
    }
    if (next.score > best) {
      best = next.score;
      persistStats();
    }
    machine.commit(next);
  }

  // ── 新局（面板/按钮共用；有进度先确认）──
  function startNew(): void {
    machine.replace(newGame(rngNext));
    seconds = 0;
    lastSavedSec = 0;
    winDismissed = false;
    winCounted = false;
    pendingNew = false;
    resultBox.classList.remove("is-open");
    remove(SLUG, "save1"); // 旧局作废
    patch(machine.get());
    startTimer();
  }

  function requestNew(): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已有玩家操作）
    if (machine.canUndo()) {
      pendingNew = true;
      patch(machine.get());
    } else {
      startNew();
    }
  }

  // 死局收尾：清档（下次进入开新局）

  // ── 交互绑定（click + keydown + touch；禁 Pointer Events，§6/§10.8）──
  dpad.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const dir = target.getAttribute("data-dir") as Dir | null;
    if (dir === null) return;
    doMove(dir);
  });

  undoBtn.addEventListener("click", () => {
    machine.undo();
  });

  newBtn.addEventListener("click", () => {
    requestNew();
  });

  confirmOk.addEventListener("click", () => {
    if (pendingNew) startNew();
  });
  confirmCancel.addEventListener("click", () => {
    pendingNew = false;
    patch(machine.get());
  });

  keepBtn.addEventListener("click", () => {
    winDismissed = true; // 提示后可继续（任务规格）
    patch(machine.get());
  });
  againBtn.addEventListener("click", () => {
    startNew();
  });

  // 物理键盘：方向键移动（howToPlay 承诺），preventDefault 防页面滚动
  function onKeyDown(ev: KeyboardEvent): void {
    const dir: Dir | null =
      ev.key === "ArrowUp"
        ? "up"
        : ev.key === "ArrowDown"
          ? "down"
          : ev.key === "ArrowLeft"
            ? "left"
            : ev.key === "ArrowRight"
              ? "right"
              : null;
    if (dir === null) return;
    ev.preventDefault();
    doMove(dir);
  }
  document.addEventListener("keydown", onKeyDown);
  activeKeyHandler = onKeyDown;

  // 触屏 swipe（任务规格：touchstart/touchend 位移判定，阈值 30px）
  let touchX = 0;
  let touchY = 0;
  let touchActive = false;
  wrap.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length !== 1) return;
      touchX = ev.touches[0].clientX;
      touchY = ev.touches[0].clientY;
      touchActive = true;
    },
    { passive: true },
  );
  wrap.addEventListener(
    "touchmove",
    (ev) => {
      if (!touchActive || ev.touches.length !== 1) return;
      const dx = ev.touches[0].clientX - touchX;
      const dy = ev.touches[0].clientY - touchY;
      // 已超出轻点抖动范围 → 视为滑动意图，阻止页面滚动
      if (Math.abs(dx) > TOUCH_SCROLL_GUARD_PX || Math.abs(dy) > TOUCH_SCROLL_GUARD_PX) {
        ev.preventDefault();
      }
    },
    { passive: false },
  );
  wrap.addEventListener("touchend", (ev) => {
    if (!touchActive) return;
    touchActive = false;
    const t = ev.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    doMove(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
    );
  });
  wrap.addEventListener("touchcancel", () => {
    touchActive = false;
  });

  // ── 订阅（onChange：render patch + 存档两条独立订阅）──
  machine.onChange(patch);
  machine.onChange(() => {
    const s = machine.get();
    if (s.over) {
      remove(SLUG, "save1"); // 死局清档（下次进入开新局）
      return;
    }
    lastSavedSec = seconds;
    persist();
  });

  patch(machine.get());
  if (!machine.get().over) startTimer(); // 恢复存档则从原秒数继续计时
}
