/**
 * hangman/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切「这步是否命中/是否终局」的判断只调 logic.ts 导出函数；
 * 本文件仅持有纯 UI 状态（待确认难度）并做最小脏区 patch。
 *
 * 组件选型说明（跟随 sudoku 打样裁决）：@marcomattes/epaper-components@2.0.0
 * 任何组件入口都经共享 chunk 引入含 `.replaceAll(` 等 ES2021 API 的 core，
 * 与 build-games.mjs 的 ES2016+ API 黑名单断言（规约 §10.8）结构性冲突，
 * 故本游戏 UI 全部自绘 vanilla DOM（视觉遵循 epaper 印刷美学：--ink-* token、
 * 1-bit 反转、无动画无 hover）。本地化通道缺口同 sudoku：游戏内固定英文短词，
 * 导流 CTA 走页面模板的 <a data-egames-cta> DOM 通道，检测不到用英文兜底。
 *
 * 火柴人：内联 SVG，绞架常显 + 6 组笔画（头/身/双臂/双腿）预置 <g visibility>
 * 显隐切换——每错一步只翻转一个属性（禁 CSS 动画，§10.2）。
 */
import {
  deserialize,
  guessLetter,
  newGame,
  revealed,
  serialize,
  type Difficulty,
  type GameState,
} from "./logic";
import { MAX_WRONG } from "./logic";
import { createState } from "../_engine/state";
import { load, remove, save } from "../_engine/storage";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "hangman";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** 词格上限（词库最长 12 字母；换局不重建 DOM，多余格 display:none） */
const MAX_CELLS = 12;

/** 存档载荷（契约 §4.1 key：save1 = 主存档槽；hangman 无 timer，仅序列化局面） */
interface SavePayload {
  s: string;
}

/** 战绩（契约 §4.1 key：stats；按难度记胜场/局数） */
interface Rec {
  w: number;
  g: number;
}
type StatsBag = Record<Difficulty, Rec>;

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内固定英文短词（本地化通道缺口，见文件头说明） */
const WORDS = {
  wrong: "WRONG",
  wins: "WINS",
  category: "Category",
  confirm: "Start a new game? Current progress will be lost.",
  ok: "OK",
  cancel: "Cancel",
  newGame: "New Game",
  youWin: "You win!",
  youLost: "You lost!",
  theWordWas: "The word was",
  progressSaved: "Progress is saved automatically.",
};

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover
// （§10.2），1-bit 状态：命中字母=黑底白字、未命中=虚线边框禁用态、
// 答案揭示=反转（§10.5）；颜色只用 --ink-* token（带字面量回退）。
// min 后 ≤2KB（§3.4）：按钮 reset 与反转态用组合选择器合并声明。
const CSS = [
  ".hmg-wrap{max-width:27rem;margin:0 auto}",
  ".hmg-seg,.hmg-pad{display:grid;gap:1px;background:var(--ink-fg,#000);border:1px solid var(--ink-fg,#000)}",
  ".hmg-seg{grid-template-columns:repeat(3,1fr);margin:0 0 .75rem}",
  ".hmg-pad{grid-template-columns:repeat(9,1fr)}",
  ".hmg-btn,.hmg-key,.hmg-cbtn,.hmg-new{font:inherit;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none}",
  ".hmg-btn{min-height:44px;padding:.25rem .5rem;font-size:.875rem}",
  ".hmg-key{min-height:48px;padding:.25rem;font-size:1rem}",
  ".hmg-cbtn{min-height:44px;font-size:.875rem;border:1px solid var(--ink-fg,#000)}",
  ".hmg-new{display:block;width:100%;min-height:48px;margin-top:.75rem;font-size:.875rem;border:1px solid var(--ink-fg,#000)}",
  ".hmg-btn.is-on,.hmg-key.is-hit{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700;cursor:default}",
  ".hmg-key.is-miss{border:1px dashed var(--ink-fg,#000);cursor:default}",
  ".hmg-status{display:flex;justify-content:space-between;gap:1rem;font-family:var(--ink-mono,ui-monospace,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);padding:.125rem 0 .375rem;margin-bottom:.75rem}",
  ".hmg-stage{display:flex;gap:1rem;align-items:flex-start;justify-content:center;margin-bottom:.75rem}",
  ".hmg-svg{width:102px;height:136px;flex:none;color:var(--ink-fg,#000)}",
  ".hmg-side{flex:1;min-width:0}",
  ".hmg-cat{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;margin:0 0 .375rem;min-height:1.1em;color:var(--site-prose-fg,#333)}",
  ".hmg-word{display:flex;flex-wrap:wrap;gap:2px}",
  ".hmg-cell{flex:1 0 14px;min-height:44px;display:flex;align-items:flex-end;justify-content:center;font-size:1.25rem;line-height:1.4;border-bottom:3px solid var(--ink-fg,#000);text-transform:uppercase}",
  ".hmg-cell.is-off{display:none}",
  ".hmg-cell.is-answer{background:var(--ink-fg,#000);color:var(--ink-bg,#fff)}",
  ".hmg-confirm,.hmg-result{display:none;border:3px solid var(--ink-fg,#000);margin-top:.75rem}",
  ".hmg-confirm.is-open,.hmg-result.is-open{display:block}",
  ".hmg-confirm{padding:.75rem}",
  ".hmg-confirm p{margin:0;font-size:.875rem;color:var(--site-prose-fg,#333)}",
  ".hmg-confirm__row{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-top:.625rem}",
  ".hmg-result__title{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700;padding:.5rem .75rem;font-size:1.125rem}",
  ".hmg-result__stats{padding:.5rem .75rem;margin:0;font-family:var(--ink-mono,ui-monospace,monospace);font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);color:var(--site-prose-fg,#333)}",
  ".hmg-result__cta{display:block;padding:.625rem .75rem;color:var(--ink-fg,#000)}",
  ".hmg-hint{margin:.625rem 0 0;font-size:.75rem;color:var(--site-prose-fg,#333)}",
].join("");

function injectCss(): void {
  if (document.getElementById("game-" + SLUG + "-css")) return;
  const style = document.createElement("style");
  style.id = "game-" + SLUG + "-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ── 火柴人 SVG（7 态：绞架常显 + 6 组笔画 visibility 显隐）──────────

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as SVGElement;
}

function svgLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const l = svgEl("line") as SVGLineElement;
  l.setAttribute("x1", String(x1));
  l.setAttribute("y1", String(y1));
  l.setAttribute("x2", String(x2));
  l.setAttribute("y2", String(y2));
  return l;
}

/**
 * 绞架常显（底座/立柱/横梁/斜撑/吊绳）；parts[0..5] 依次为
 * 头/身/左臂/右臂/左腿/右腿，初始全部 visibility:hidden——
 * 每错一步只翻转一个 <g> 的 visibility 属性（最小脏区，§10.4）。
 */
function buildGallows(): { root: SVGSVGElement; parts: SVGGElement[] } {
  const root = svgEl("svg") as SVGSVGElement;
  root.setAttribute("viewBox", "0 0 120 160");
  root.setAttribute("class", "hmg-svg");
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "hangman gallows");

  const stroke = (el: SVGElement): SVGElement => {
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "4");
    el.setAttribute("stroke-linecap", "round");
    return el;
  };

  const frame = svgEl("g");
  frame.setAttribute("fill", "none");
  frame.appendChild(stroke(svgLine(12, 150, 72, 150))); // 底座
  frame.appendChild(stroke(svgLine(24, 150, 24, 14))); // 立柱
  frame.appendChild(stroke(svgLine(24, 14, 88, 14))); // 横梁
  frame.appendChild(stroke(svgLine(24, 44, 48, 14))); // 斜撑
  frame.appendChild(stroke(svgLine(88, 14, 88, 26))); // 吊绳
  root.appendChild(frame);

  const parts: SVGGElement[] = [];
  const part = (): SVGGElement => {
    const g = svgEl("g") as SVGGElement;
    g.setAttribute("fill", "none");
    g.setAttribute("visibility", "hidden");
    return g;
  };

  const head = part(); // 1 错：头
  const circle = svgEl("circle") as SVGCircleElement;
  circle.setAttribute("cx", "88");
  circle.setAttribute("cy", "36");
  circle.setAttribute("r", "10");
  head.appendChild(stroke(circle));
  parts.push(head);

  const body = part(); // 2 错：身体
  body.appendChild(stroke(svgLine(88, 46, 88, 88)));
  parts.push(body);

  const armL = part(); // 3 错：左臂
  armL.appendChild(stroke(svgLine(88, 56, 72, 74)));
  parts.push(armL);

  const armR = part(); // 4 错：右臂
  armR.appendChild(stroke(svgLine(88, 56, 104, 74)));
  parts.push(armR);

  const legL = part(); // 5 错：左腿
  legL.appendChild(stroke(svgLine(88, 88, 74, 116)));
  parts.push(legL);

  const legR = part(); // 6 错：右腿
  legR.appendChild(stroke(svgLine(88, 88, 102, 116)));
  parts.push(legR);

  for (let i = 0; i < parts.length; i++) root.appendChild(parts[i]);
  return { root, parts };
}

// ── 战绩存取（stats key，契约 §4.1）──────────────────────────────

function blankStats(): StatsBag {
  return { easy: { w: 0, g: 0 }, medium: { w: 0, g: 0 }, hard: { w: 0, g: 0 } };
}

function loadStats(): StatsBag {
  const raw = load<StatsBag>(SLUG, "stats");
  if (raw === null || typeof raw !== "object") return blankStats();
  const out = blankStats();
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const rec = raw[d];
    if (rec && typeof rec === "object" &&
        typeof rec.w === "number" && Number.isInteger(rec.w) && rec.w >= 0 &&
        typeof rec.g === "number" && Number.isInteger(rec.g) && rec.g >= 0 && rec.g >= rec.w) {
      out[d] = { w: rec.w, g: rec.g };
    }
  }
  return out;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
 * hangman 非 seeded：opts.seed 仅保留透传通道，缺省时每局 newGame 内部取
 * Date.now() 种子（每局新词；每日挑战为 P2，经 MountOpts 注入）。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === "1") {
    root.textContent = ""; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落

  injectCss();

  // ── 状态：先恢复存档（save1 只存 playing 态；终局即清档），无档开新局 ──
  let difficulty: Difficulty = "easy";
  let finished = false;
  let pendingDiff: Difficulty | null = null;
  let stats = loadStats();

  const saved = load<SavePayload>(SLUG, "save1");
  let restored: GameState | null = null;
  if (saved && typeof saved.s === "string") {
    const parsed = deserialize(saved.s);
    if (parsed && parsed.status === "playing") restored = parsed;
  }
  let machine: ReturnType<typeof createState<GameState>>;
  if (restored) {
    // §4.4：载入存档用 replace 语义——直接以 restored 重建 machine
    //（尚未挂任何订阅，无通知泄漏）；undo 栈不随存档恢复（契约决策⑤）
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
  } else {
    machine = createState<GameState>(newGame({ difficulty }).state);
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "hmg-wrap";

  // 难度段选（单选行，选中态黑底反转）
  const seg = document.createElement("div");
  seg.className = "hmg-seg";
  seg.setAttribute("role", "group");
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement("button");
    key.type = "button";
    key.className = "hmg-btn";
    key.setAttribute("data-diff", d);
    key.textContent = capFirst(d);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行（左：错误计数；右：当前难度战绩）
  const statusWrong = document.createElement("span");
  const statusRec = document.createElement("span");
  const status = document.createElement("div");
  status.className = "hmg-status";
  status.appendChild(statusWrong);
  status.appendChild(statusRec);

  // 舞台：火柴人 + （类别提示 + 词格）
  const gallows = buildGallows();
  const cat = document.createElement("p");
  cat.className = "hmg-cat";
  const wordBox = document.createElement("div");
  wordBox.className = "hmg-word";
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < MAX_CELLS; i++) {
    const cell = document.createElement("div");
    cell.className = "hmg-cell is-off";
    wordBox.appendChild(cell);
    cells.push(cell);
  }
  const side = document.createElement("div");
  side.className = "hmg-side";
  side.appendChild(cat);
  side.appendChild(wordBox);
  const stage = document.createElement("div");
  stage.className = "hmg-stage";
  stage.appendChild(gallows.root);
  stage.appendChild(side);

  // 字母键盘：A-Z 字母序 3 行（9/9/8；≥44px 触控目标，§10.7）
  const pad = document.createElement("div");
  pad.className = "hmg-pad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "letter keys");
  const keyEls: Record<string, HTMLButtonElement> = {};
  for (let code = 97; code <= 122; code++) {
    const letter = String.fromCharCode(code);
    const key = document.createElement("button");
    key.type = "button";
    key.className = "hmg-key";
    key.setAttribute("data-key", letter);
    key.textContent = letter.toUpperCase();
    pad.appendChild(key);
    keyEls[letter] = key;
  }

  // 新游戏（内联确认，无 modal 依赖，老 WebKit 安全）
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "hmg-new";
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement("div");
  confirmBox.className = "hmg-confirm";
  const confirmText = document.createElement("p");
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement("div");
  confirmRow.className = "hmg-confirm__row";
  const confirmOk = document.createElement("button");
  confirmOk.type = "button";
  confirmOk.className = "hmg-cbtn";
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement("button");
  confirmCancel.type = "button";
  confirmCancel.className = "hmg-cbtn";
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（title + 明细 + 导流 CTA）
  const resultTitle = document.createElement("div");
  resultTitle.className = "hmg-result__title";
  const resultStats = document.createElement("p");
  resultStats.className = "hmg-result__stats";
  const resultCta = document.createElement("a");
  resultCta.className = "hmg-result__cta";
  resultCta.setAttribute("rel", "noopener");
  const resultBox = document.createElement("div");
  resultBox.className = "hmg-result";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement("p");
  hint.className = "hmg-hint";
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(stage);
  wrap.appendChild(pad);
  wrap.appendChild(newBtn);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 存档（§5.2 存档组装归 render 层）──
  function persist(): void {
    if (finished) return;
    save<SavePayload>(SLUG, "save1", { s: serialize(machine.get()) });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList/单属性，禁 innerHTML）──
  let lastWrongShown = -1;
  let lastWrongText = "";
  let lastRecText = "";
  let lastCatText: string | null = null;

  function patch(s: GameState): void {
    // 火柴人：仅当错误数变化时 patch 差异笔画
    if (s.wrongCount !== lastWrongShown) {
      for (let i = 0; i < gallows.parts.length; i++) {
        gallows.parts[i].setAttribute(
          "visibility",
          i < s.wrongCount ? "visible" : "hidden",
        );
      }
      lastWrongShown = s.wrongCount;
    }

    // 词格：预置 12 格按词长显隐；命中揭示；负局答案反转（§10.5 1-bit）
    const mask = revealed(s.word, s.guessed);
    for (let i = 0; i < MAX_CELLS; i++) {
      const el = cells[i];
      if (i >= s.word.length) {
        if (!el.classList.contains("is-off")) el.classList.add("is-off");
        continue;
      }
      el.classList.remove("is-off");
      const ch = s.word.charAt(i);
      const show = mask[i] || finished; // 终局全揭示
      const text = show ? ch : "";
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle("is-answer", !mask[i] && finished);
    }

    // 键盘：命中=黑底白字、未命中=虚线禁用（§10.5）
    for (let code = 97; code <= 122; code++) {
      const letter = String.fromCharCode(code);
      const el = keyEls[letter];
      const idx = s.guessed.indexOf(letter);
      const hit = idx !== -1 && s.word.indexOf(letter) !== -1;
      el.classList.toggle("is-hit", hit);
      el.classList.toggle("is-miss", idx !== -1 && !hit);
      el.disabled = idx !== -1;
    }

    // 难度段选 / 确认框
    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle("is-on", DIFFICULTIES[i] === difficulty);
    }
    confirmBox.classList.toggle("is-open", pendingDiff !== null);

    // 状态行（diff 后才写 textContent）
    const wrongText = WORDS.wrong + " " + s.wrongCount + "/" + MAX_WRONG;
    if (wrongText !== lastWrongText) {
      statusWrong.textContent = wrongText;
      lastWrongText = wrongText;
    }
    const rec = stats[difficulty];
    const recText = WORDS.wins + " " + rec.w + "/" + rec.g;
    if (recText !== lastRecText) {
      statusRec.textContent = recText;
      lastRecText = recText;
    }

    // 类别提示：easy 常显；负局后任意难度揭示（答案语境）
    let catText = "";
    if (difficulty === "easy" || finished) {
      catText = WORDS.category + ": " + capFirst(s.category);
    }
    if (catText !== lastCatText) {
      cat.textContent = catText;
      lastCatText = catText;
    }

    // 终局判定只走 logic（§5.3）；面板在 finishGame() 展开
    if (!finished && s.status !== "playing") finishGame(s);
  }

  // ── 终局（战绩 + 答案揭示 + 导流 CTA）──
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
    remove(SLUG, "save1"); // 完局清档（下次进入开新局）
    // 战绩按难度累计（won → w+1；局数 g+1）
    const rec = stats[s.difficulty];
    rec.g++;
    if (s.status === "won") rec.w++;
    save(SLUG, "stats", stats);

    resultTitle.textContent = s.status === "won" ? WORDS.youWin : WORDS.youLost;
    resultStats.textContent =
      capFirst(s.difficulty) + " · " + WORDS.theWordWas + " " +
      s.word.toUpperCase() + " · " + WORDS.wrong + " " + s.wrongCount + "/" + MAX_WRONG;
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
    finished = false;
    pendingDiff = null;
    resultBox.classList.remove("is-open");
    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    persist(); // 新局立即落档（崩掉/刷新后可续）
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

  // ── 输入：一律先过 logic，no-op（原引用）不入 undo 栈（§5.3）──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) machine.commit(next);
  }

  function inputLetter(letter: string): void {
    if (finished || pendingDiff !== null) return;
    commitIfChanged(guessLetter(machine.get(), letter));
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
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
    inputLetter(key);
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

  // 物理键盘（§6：A-Z 物理键直猜；大小写均收）
  function onKeyDown(ev: KeyboardEvent): void {
    if (finished || pendingDiff !== null) return;
    const k = ev.key;
    if (typeof k !== "string" || k.length !== 1) return;
    const lower = k.toLowerCase();
    if (lower < "a" || lower > "z") return;
    inputLetter(lower);
  }
  document.addEventListener("keydown", onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 订阅（onChange：render patch + 存档两条独立订阅）──
  function persistOnChange(): void {
    persist();
  }
  machine.onChange(patch);
  machine.onChange(persistOnChange);

  patch(machine.get());
  if (!restored) persist(); // 全新局立即落档；恢复局沿用旧档不重写
}
