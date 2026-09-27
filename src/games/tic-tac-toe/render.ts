/**
 * tic-tac-toe/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切"这步是否合法/是否赢了"的判断只调 logic.ts 导出函数；
 * 本文件仅持有纯 UI 状态（选中格）并做最小脏区 patch。
 *
 * 组件选型（沿 sudoku 打样裁决）：@marcomattes/epaper-components@2.0.0 任何
 * 入口都会引入含 ES2021 `.replaceAll(` 等黑名单 API 的共享 chunk，与
 * build-games.mjs 静态扫描（规约 §10.8）结构性冲突——故本游戏同样全部自绘
 * vanilla DOM（视觉遵循 epaper 印刷美学：--ink-* token、3px 粗线、1-bit
 * 反转、无动画无 hover）。模式/难度切换为 e-segmented 语义等价物。
 *
 * 本地化通道（2026-09 16 语言）：bundle 为全语言共享的静态 IIFE，游戏内
 * 文案经 DOM 通道注入——页面 SSG 把 ui-words.json 对应语言节写进
 * #game-root 的 data-egames-words 属性，mount 时与 words.en.ts 的
 * EN_WORDS 浅合并（缺键英文兜底）；难度词同走词表（diffLabel）。
 * 导流 CTA 走既有 DOM 通道：页面模板在 promo 位输出
 * <a data-egames-cta href=…>{content.cta.label}</a>，mount 时读取覆盖；
 * 检测不到时用英文兜底。
 *
 * 1-bit 状态表达（§10.5）：
 * - X/O 落子 = 内联 SVG 描边图形（stroke=currentColor）
 * - 连线三格 = 黑底白字反转（is-line）
 * - 当前回合方徽章 / d-pad 选中格 = 3px 粗边框（is-turn / is-sel）
 * - 禁用按钮 = dashed 边框；禁 opacity/灰阶/彩色
 */
import {
  applyMove,
  bestMove,
  deserialize,
  newGame,
  serialize,
  type Difficulty,
  type GameState,
  type Mode,
} from "./logic";
import { diffLabel, mergeWords, readWords } from "../_engine/i18n";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";
import { EN_WORDS } from "./words.en";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "tic-tac-toe";

const MODES: Mode[] = ["ai", "2p"];
const DIFFICULTIES: Difficulty[] = ["easy", "hard"];

/** 存档载荷（key=save1；契约 §4.1 存档 key 约定） */
interface SavePayload {
  s: string;
}

/** vs AI 战绩（key=stats；任务书：win/lose/draw，仅 AI 模式累计） */
interface Stats {
  w: number;
  l: number;
  d: number;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内文案（本地化：mount 时以 data-egames-words 注入词覆盖，见文件头） */
let WORDS: Record<string, string> = EN_WORDS;

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover
// （§10.2）；颜色只用 --ink-* token（基础行带字面量回退锚点，其余依赖站点
// token 注入以压尺寸）；min 后 ≤2KB（§3.4）。压缩手段：三类按钮（seg 键/
// 工具键/棋盘格）公共声明合并到首行；seg 与 tools 容器统一为 1px 缝隙线网格；
// badge 非交互元素不占 44px 触控高、常态无边框（当前回合 3px 粗框对比更强）。
const CSS = [
  ".ttt-wrap{max-width:24rem;margin:0 auto}",
  ".ttt-btn,.ttt-tool,.ttt-cell{-webkit-appearance:none;appearance:none;background:var(--ink-bg);color:var(--ink-fg);cursor:pointer;font:inherit}",
  ".ttt-seg,.ttt-tools{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--ink-fg);border:1px solid var(--ink-fg)}",
  ".ttt-seg{margin:0 0 .5rem}",
  ".ttt-tools{margin-top:.6rem}",
  ".ttt-btn,.ttt-tool{min-height:44px;font-size:.9rem}",
  ".ttt-btn{border:0}",
  ".ttt-btn.is-on,.ttt-cell.is-line{background:var(--ink-fg);color:var(--ink-bg)}",
  ".ttt-btn.is-on{font-weight:700}",
  ".ttt-tool[disabled]{border-style:dashed;cursor:default}",
  ".ttt-turnrow{display:flex;justify-content:space-between;gap:.4rem;margin-bottom:.5rem}",
  ".ttt-badges{display:flex;gap:.4rem}",
  ".ttt-badge{padding:.3rem .5rem;font-size:.9rem}",
  ".ttt-badge.is-turn{border:3px solid var(--ink-fg);font-weight:700}",
  ".ttt-state{font-weight:700}",
  ".ttt-board{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--ink-fg);border:3px solid var(--ink-fg)}",
  ".ttt-cell{min-height:88px;border:0;display:flex;align-items:center;justify-content:center}",
  ".ttt-mark{display:none;width:64%;height:64%;stroke:currentColor;fill:none;stroke-width:16;pointer-events:none}",
  ".ttt-cell.is-x .ttt-mark--x,.ttt-cell.is-o .ttt-mark--o{display:block}",
  ".ttt-cell.is-sel{box-shadow:inset 0 0 0 3px var(--ink-fg)}",
  ".ttt-cell.is-sel.is-line{box-shadow:inset 0 0 0 3px var(--ink-bg)}",
  ".ttt-record{margin:.6rem 0 0;font-size:.9rem}",
  ".ttt-result{display:none;border:3px solid var(--ink-fg);margin-top:.6rem}",
  ".ttt-result.is-open{display:block}",
  ".ttt-result__title{background:var(--ink-fg);color:var(--ink-bg);font-weight:700;padding:.5rem .6rem}",
  ".ttt-result__stats{padding:.5rem .6rem;margin:0;font-family:var(--ink-mono,monospace);font-size:.9rem;color:var(--site-prose-fg,#333)}",
  ".ttt-result__cta{display:block;padding:.6rem;color:var(--ink-fg)}",
  ".ttt-hint{margin:.6rem 0 0;font-size:.75rem}",
].join("");

function injectCss(): void {
  if (document.getElementById("game-" + SLUG + "-css")) return;
  const style = document.createElement("style");
  style.id = "game-" + SLUG + "-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 落子图形：X = 两笔描边线，O = 描边圆环（stroke=currentColor，1-bit 安全） */
function markSvg(kind: "x" | "o"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ttt-mark");
  svg.classList.add(kind === "x" ? "ttt-mark--x" : "ttt-mark--o");
  if (kind === "x") {
    const l1 = document.createElementNS(SVG_NS, "line");
    l1.setAttribute("x1", "24");
    l1.setAttribute("y1", "24");
    l1.setAttribute("x2", "76");
    l1.setAttribute("y2", "76");
    const l2 = document.createElementNS(SVG_NS, "line");
    l2.setAttribute("x1", "76");
    l2.setAttribute("y1", "24");
    l2.setAttribute("x2", "24");
    l2.setAttribute("y2", "76");
    svg.appendChild(l1);
    svg.appendChild(l2);
  } else {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", "50");
    c.setAttribute("cy", "50");
    c.setAttribute("r", "30");
    svg.appendChild(c);
  }
  return svg;
}

// 模块级可清理资源：幂等重挂载（契约 §3.3.3）时先释放上一份。
let activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

function teardownPrevious(): void {
  if (activeKeyHandler !== null) {
    document.removeEventListener("keydown", activeKeyHandler);
    activeKeyHandler = null;
  }
}

/**
 * 挂载入口（index.ts 注册到 window.EGames 后调用；幂等，契约 §3.3.3）。
 * 玩家执 X 先手（固定，任务书规格）；vs Computer 模式 AI 执 O 同步即时回应。
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

  // ── 状态：先恢复存档（key=save1），无档才开新局（AI/easy 为默认选择）──
  let stats: Stats = { w: 0, l: 0, d: 0 };
  const savedStats = load<Stats>(SLUG, "stats");
  if (
    savedStats &&
    typeof savedStats === "object" &&
    typeof savedStats.w === "number" &&
    typeof savedStats.l === "number" &&
    typeof savedStats.d === "number"
  ) {
    stats = savedStats;
  }

  const saved = load<SavePayload>(SLUG, "save1");
  let restored: GameState | null = null;
  if (saved && typeof saved.s === "string") {
    restored = deserialize(saved.s);
  }
  let machine: ReturnType<typeof createState<GameState>>;
  if (restored) {
    // 载入存档用 replace 语义（§4.4）：直接以 restored 重建 machine；
    // undo 栈不随存档恢复（契约决策⑤）
    machine = createState<GameState>(restored);
  } else {
    machine = createState<GameState>(newGame({ mode: "ai", difficulty: "easy" }));
  }

  // 本局终局已计入 stats 的项（终局 undo 时回滚，防重复计分）
  let finishedStat: "w" | "l" | "d" | null = null;
  let selected = -1; // d-pad 选中格 idx 或 -1

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "ttt-wrap";

  // 模式段选（e-segmented 语义等价：单选行，选中态黑底反转）
  const modeSeg = document.createElement("div");
  modeSeg.className = "ttt-seg";
  modeSeg.setAttribute("role", "group");
  const modeKeys: Record<string, HTMLButtonElement> = {};
  const modeLabels: Record<Mode, string> = { ai: WORDS.modeAi, "2p": WORDS.mode2p };
  for (let i = 0; i < MODES.length; i++) {
    const m = MODES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "ttt-btn";
    key.setAttribute("data-mode", m);
    key.textContent = modeLabels[m];
    modeSeg.appendChild(key);
    modeKeys[m] = key;
  }

  // 难度段选（仅 AI 模式可见；2P 隐藏）
  const diffSeg = document.createElement("div");
  diffSeg.className = "ttt-seg";
  diffSeg.setAttribute("role", "group");
  const diffKeys: Record<string, HTMLButtonElement> = {};
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "ttt-btn";
    key.setAttribute("data-diff", d);
    key.textContent = diffLabel(WORDS, d);
    diffSeg.appendChild(key);
    diffKeys[d] = key;
  }

  // 回合指示行：两枚徽章（当前回合 3px 粗框）+ 状态文字
  const turnRow = document.createElement("div");
  turnRow.className = "ttt-turnrow";
  const badges = document.createElement("span");
  badges.className = "ttt-badges";
  const badgeX = document.createElement("span");
  badgeX.className = "ttt-badge";
  const badgeO = document.createElement("span");
  badgeO.className = "ttt-badge";
  badges.appendChild(badgeX);
  badges.appendChild(badgeO);
  const stateText = document.createElement("span");
  stateText.className = "ttt-state";
  turnRow.appendChild(badges);
  turnRow.appendChild(stateText);

  // 3×3 棋盘（role=grid；格子 ≥44×44 且大得多，触控友好）
  const board = document.createElement("div");
  board.className = "ttt-board";
  board.setAttribute("role", "grid");
  const cells: HTMLButtonElement[] = [];
  for (let idx = 0; idx < 9; idx++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ttt-cell";
    cell.setAttribute("data-idx", String(idx));
    cell.appendChild(markSvg("x"));
    cell.appendChild(markSvg("o"));
    board.appendChild(cell);
    cells.push(cell);
  }

  // 工具行：Undo | New Game（井字棋局短，换局不设确认框——与 sudoku 的差异决策）
  const tools = document.createElement("div");
  tools.className = "ttt-tools";
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "ttt-tool";
  undoBtn.textContent = WORDS.undo;
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "ttt-tool";
  newBtn.textContent = WORDS.newGame;
  tools.appendChild(undoBtn);
  tools.appendChild(newBtn);

  // 战绩行（仅 AI 模式有意义；2P 隐藏）
  const recordLine = document.createElement("p");
  recordLine.className = "ttt-record";

  // 终局面板（e-result 语义等价：title + stats + 导流 CTA）
  const resultTitle = document.createElement("div");
  resultTitle.className = "ttt-result__title";
  const resultStats = document.createElement("p");
  resultStats.className = "ttt-result__stats";
  const resultCta = document.createElement("a");
  resultCta.className = "ttt-result__cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "ttt-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "ttt-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(modeSeg);
  wrap.appendChild(diffSeg);
  wrap.appendChild(turnRow);
  wrap.appendChild(board);
  wrap.appendChild(tools);
  wrap.appendChild(recordLine);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 存档 ──
  function saveStats(): void {
    save<Stats>(SLUG, "stats", stats);
  }

  function persist(): void {
    const s = machine.get();
    if (s.status !== "playing") return; // 终局在 finishGame 清档
    save<SavePayload>(SLUG, "save1", { s: serialize(s) });
  }

  // ── 状态文字（回合/结果，全走 state 字段——判断在 logic 已完成）──
  function stateLabel(s: GameState): string {
    if (s.status === "draw") return WORDS.draw;
    if (s.status === "won") {
      if (s.mode === "ai") return s.winner === 1 ? WORDS.youWin : WORDS.computerWins;
      return s.winner === 1 ? WORDS.xWins : WORDS.oWins;
    }
    if (s.mode === "ai") return WORDS.yourMove; // AI 同步回应，玩家只会看到自己的回合
    return s.turn === 1 ? WORDS.xToMove : WORDS.oToMove;
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  let lastStateLabel = "";
  let lastRecordShown = "";

  function patch(s: GameState): void {
    const lineSet: Record<number, boolean> = {};
    if (s.line !== null) {
      for (let i = 0; i < s.line.length; i++) lineSet[s.line[i]] = true;
    }
    for (let idx = 0; idx < 9; idx++) {
      const el = cells[idx];
      const v = s.board[idx];
      el.classList.toggle("is-x", v === 1);
      el.classList.toggle("is-o", v === 2);
      el.classList.toggle("is-line", lineSet[idx] === true);
      el.classList.toggle("is-sel", idx === selected);
      const label =
        "Row " + (((idx / 3) | 0) + 1) + ", column " + ((idx % 3) + 1) +
        (v === 1 ? ": X" : v === 2 ? ": O" : ": empty");
      if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
    }

    // 段选选中态 + 难度行显隐
    modeKeys.ai.classList.toggle("is-on", s.mode === "ai");
    modeKeys["2p"].classList.toggle("is-on", s.mode === "2p");
    diffSeg.style.display = s.mode === "ai" ? "" : "none";
    diffKeys.easy.classList.toggle("is-on", s.difficulty === "easy");
    diffKeys.hard.classList.toggle("is-on", s.difficulty === "hard");

    // 徽章：标签随模式，当前回合 3px 粗框（终局保留胜者框、平局双方无框）
    badgeX.textContent = "X · " + (s.mode === "ai" ? WORDS.you : WORDS.player1);
    badgeO.textContent = "O · " + (s.mode === "ai" ? WORDS.computer : WORDS.player2);
    const turnX = s.status === "playing" ? s.turn === 1 : s.winner === 1;
    const turnO = s.status === "playing" ? s.turn === 2 : s.winner === 2;
    badgeX.classList.toggle("is-turn", turnX);
    badgeO.classList.toggle("is-turn", turnO);

    const label = stateLabel(s);
    if (label !== lastStateLabel) {
      stateText.textContent = label;
      lastStateLabel = label;
    }

    undoBtn.disabled = !machine.canUndo();

    const isAi = s.mode === "ai";
    recordLine.style.display = isAi ? "" : "none";
    const rec = WORDS.record + " " + stats.w + "W · " + stats.l + "L · " + stats.d + "D";
    if (isAi && rec !== lastRecordShown) {
      recordLine.textContent = rec;
      lastRecordShown = rec;
    }

    // 终局面板展开（finishGame 填充内容；这里只负责出现/消失）
    resultBox.classList.toggle("is-open", s.status !== "playing");
  }

  // ── 终局：记战绩 + 清档 + 填终局面板 ──
  function resolveCta(): { href: string; label: string } {
    const el = document.querySelector("a[data-egames-cta]");
    if (el) {
      const href = el.getAttribute("href");
      if (href) return { href: href, label: el.textContent || FALLBACK_CTA.label };
    }
    return FALLBACK_CTA;
  }

  function onFinished(s: GameState): void {
    if (s.mode === "ai") {
      const key: "w" | "l" | "d" = s.winner === 1 ? "w" : s.winner === 2 ? "l" : "d";
      stats[key] += 1;
      finishedStat = key;
      saveStats();
    } else {
      finishedStat = null;
    }
    remove(SLUG, "save1"); // 完局清档（下次进入开新局；sudoku 先例）
    resultTitle.textContent = stateLabel(s);
    resultStats.textContent =
      (s.mode === "ai" ? diffLabel(WORDS, s.difficulty) + " · " : "") +
      WORDS.record + " " + stats.w + "W · " + stats.l + "L · " + stats.d + "D";
    const cta = resolveCta();
    resultCta.setAttribute("href", cta.href);
    resultCta.textContent = cta.label;
  }

  // ── AI 同步回应（easy/hard 均瞬时；计算在 logic.bestMove）──
  function aiMove(): void {
    const s = machine.get();
    if (s.mode !== "ai" || s.status !== "playing" || s.turn !== 2) return;
    const idx = bestMove(s, s.difficulty);
    if (idx < 0) return;
    const next = applyMove(s, idx);
    if (next !== s) machine.commit(next);
  }

  // ── 玩家/双人落子（合法性判断全走 logic；no-op 不入 undo 栈）──
  function playAt(idx: number): void {
    const s = machine.get();
    if (s.status !== "playing") return;
    if (s.mode === "ai" && s.turn === 2) return; // AI 回合（防御，正常同步流程不会停留在此）
    const next = applyMove(s, idx);
    if (next === s) return;
    machine.commit(next);
    aiMove();
  }

  // ── 撤销：vs AI 撤到玩家回合（= 玩家+AI 各一步）；双人撤一步；终局可撤并回滚战绩 ──
  function undoMove(): void {
    if (!machine.canUndo()) return;
    const cur = machine.get();
    if (cur.status !== "playing") {
      if (finishedStat !== null) {
        stats[finishedStat] -= 1;
        if (stats[finishedStat] < 0) stats[finishedStat] = 0;
        finishedStat = null;
        saveStats();
      }
    }
    machine.undo();
    const s = machine.get();
    if (
      s.mode === "ai" &&
      s.status === "playing" &&
      s.turn === 2 &&
      machine.canUndo()
    ) {
      machine.undo(); // 再撤 AI 的那一步，回到玩家落子前
    }
  }

  // ── 订阅绑定（mount 与 startNew 共用；顺序：终局记账 → patch → 存档）──
  function bindMachine(m: ReturnType<typeof createState<GameState>>): void {
    m.onChange((s) => {
      // 终局检测：进入非 playing 且本局未记账 → 记战绩/清档/填面板（状态由 logic 产出）
      if (s.status !== "playing" && finishedStat === null && !resultBox.classList.contains("is-open")) {
        onFinished(s);
      }
    });
    m.onChange(patch);
    m.onChange(persist);
  }

  // ── 换局（模式/难度切换与 New Game 共用；直接重开，不设确认——局短成本低的决策）──
  function startNew(m: Mode, d: Difficulty): void {
    machine = createState<GameState>(newGame({ mode: m, difficulty: d }));
    finishedStat = null;
    selected = -1;
    bindMachine(machine);
    patch(machine.get());
    // 玩家执 X 先手：新局永远轮玩家，无需 AI 首步
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  // 棋子 SVG 设 pointer-events:none（见 CSS），点击命中恒为格子按钮本身
  board.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute("data-idx");
    if (idxStr === null) return;
    playAt(parseInt(idxStr, 10));
  });

  modeSeg.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const m = target.getAttribute("data-mode") as Mode | null;
    if (m === null) return;
    const cur = machine.get();
    if (m === cur.mode) return;
    // 切换模式沿用当前难度选择（难度选择仅在 AI 模式有效）
    startNew(m, cur.difficulty);
  });

  diffSeg.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute("data-diff") as Difficulty | null;
    if (d === null) return;
    const cur = machine.get();
    if (cur.mode !== "ai" || d === cur.difficulty) return;
    startNew("ai", d);
  });

  undoBtn.addEventListener("click", () => {
    undoMove();
  });

  newBtn.addEventListener("click", () => {
    const cur = machine.get();
    startNew(cur.mode, cur.difficulty);
  });

  // 物理键盘（§6：数字键 1-9 = 左上到右下直接落子；方向键移动选中；Enter/空格落子）
  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.key >= "1" && ev.key <= "9") {
      playAt(parseInt(ev.key, 10) - 1);
      return;
    }
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      const base = selected < 0 ? 4 : selected; // 无选中从盘心开始
      let r = (base / 3) | 0;
      let c = base % 3;
      if (ev.key === "ArrowUp") r = r > 0 ? r - 1 : 0;
      if (ev.key === "ArrowDown") r = r < 2 ? r + 1 : 2;
      if (ev.key === "ArrowLeft") c = c > 0 ? c - 1 : 0;
      if (ev.key === "ArrowRight") c = c < 2 ? c + 1 : 2;
      selected = r * 3 + c;
      patch(machine.get());
      cells[selected].focus();
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      if (selected >= 0) {
        ev.preventDefault();
        playAt(selected);
      }
      return;
    }
    if (ev.key === "Backspace" || ev.key === "Delete" || ev.key === "u" || ev.key === "U") {
      ev.preventDefault();
      undoMove();
    }
  }
  document.addEventListener("keydown", onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 初始绑定 + 首屏渲染 ──
  bindMachine(machine);

  // 恢复的存档异常停留在终局（正常终局即清档；remove 失败等极端路径）：补记账
  const initial = machine.get();
  if (initial.status !== "playing") {
    onFinished(initial);
  }

  patch(initial);

  // 恢复存档的异常时序防御：若停在 AI 回合（正常流程同步走完，不应出现），立即补走
  aiMove();
}
