/**
 * word-daily/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 边界：一切「词是否合法 / 是否命中 / 是否终局」判定只调 logic 导出函数；
 * 本文件仅持有纯 UI 状态（当前行输入、提示消息、计分防重入标志）。
 *
 * 组件选型：与 sudoku 打样一致，自绘 vanilla DOM——实测 epaper-components 任何
 * 入口都经共享 chunk 引入 ES2021 API（replaceAll/closest/ElementInternals），
 * 与 §10.8 黑名单结构性冲突（详见 sudoku/render.ts 头注与打样报告）。
 * 视觉遵循 epaper 印刷美学：--ink-* token、1-bit 反转、粗细边框分级、无动画无 hover。
 *
 * 本地化通道（2026-09 16 语言）：bundle 为全语言共享的静态 IIFE，游戏内
 * 文案经 DOM 通道注入——页面 SSG 把 ui-words.json 对应语言节写进
 * #game-root 的 data-egames-words 属性，mount 时与 words.en.ts 的
 * EN_WORDS 浅合并（缺键英文兜底）。
 * 导流 CTA 走既有 DOM 通道：页面模板在 promo 位输出
 * <a data-egames-cta href=…>{content.cta.label}</a>，mount 时读取覆盖；
 * 检测不到时用英文兜底。
 *
 * 统计口径（任务规格「Practice 不计入 daily 与 streak」的落实）：stats 键仅由
 * daily 局驱动——Practice 局不写 played/wins，也不触碰 streak（避免与
 * 「昨天是否连赢」的判定相互污染）。
 */
import {
  answerOf,
  deserialize,
  isValidGuess,
  isoDay,
  keyStates,
  marksOf,
  newDailyGame,
  newPracticeGame,
  serialize,
  shareText,
  submitGuess,
  type GameState,
} from "./logic";
import { mergeWords, readWords } from "../_engine/i18n";
import { createState } from "../_engine/state";
import { load, save } from "../_engine/storage";
import { EN_WORDS } from "./words.en";

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = "word-daily";

/** 累计统计（stats 键载荷；仅 daily 局驱动） */
interface Stats {
  p: number; // played
  w: number; // wins
  c: number; // current streak
  m: number; // max streak
}

/** 存档载荷：daily:{day} 键，data.s = logic 序列化串（答案不入档，决策⑤） */
interface SavePayload {
  s: string;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: "https://e-ink.me",
  label: "Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me",
};

/** 游戏内文案（本地化：mount 时以 data-egames-words 注入词覆盖，见文件头；商标红线：不含受限词） */
let WORDS: Record<string, string> = EN_WORDS;

// 私有 CSS（契约决策④）：运行时一次性 <style> 注入，min 后 ≤2KB（类名/变量别名精简）。
// 硬约束（§10.2/§10.5）：无 animation/transition/hover；1-bit 三态：
// 位置正确 ih=黑底白字反转、位置错 in=3px 粗边框、不在词内 im=细边框+常规字重。
// --f/--g/--p/--m 为站点 ink token 的本地别名（定义在 .wd-w，后代继承）。
const CSS = [
  ".wd-w{max-width:26rem;margin:0 auto;--f:var(--ink-fg,#000);--g:var(--ink-bg,#fff);--p:var(--site-prose-fg,#333);--m:var(--ink-mono,ui-monospace,monospace)}",
  ".wd-mo{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--f);border:1px solid var(--f);margin-bottom:.5rem}",
  ".wd-m,.wd-k{font:inherit;border:0;background:var(--g);color:var(--f);cursor:pointer;padding:0}",
  ".wd-m{min-height:44px;font-size:.875rem}",
  ".wd-m.io{background:var(--f);color:var(--g);font-weight:700}",
  ".wd-d,.wd-ms,.wd-rs{font-size:.875rem}",
  ".wd-d{font-family:var(--m);border-bottom:1px solid var(--f);padding:.125rem 0 .25rem;margin-bottom:.5rem}",
  ".wd-ms{min-height:1.5rem;font-weight:700}",
  ".wd-b{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;max-width:17rem;margin:0 auto .75rem}",
  ".wd-c{box-sizing:border-box;min-height:56px;display:flex;align-items:center;justify-content:center;font:inherit;font-size:1.7rem;font-weight:700;border:1px solid var(--f);background:var(--g);color:var(--f)}",
  ".wd-c.ic{border:2px dashed var(--f)}",
  ".wd-kb,.wd-kr{display:grid;gap:1px;background:var(--f)}",
  ".wd-kb{border:1px solid var(--f)}",
  ".wd-kr{grid-template-columns:repeat(9,1fr)}",
  ".wd-k10{grid-template-columns:repeat(10,1fr)}",
  ".wd-k{min-height:48px;font-size:1rem;font-weight:700}",
  ".wd-kd{font-size:.75rem}",
  ".wd-c.ih,.wd-k.ih{background:var(--f);color:var(--g)}",
  ".wd-c.in,.wd-k.in{border:3px solid var(--f)}",
  ".wd-c.im,.wd-k.im{font-weight:400}",
  ".wd-k.im{border:1px solid var(--f)}",
  ".wd-r{display:none;border:3px solid var(--f);margin-top:.75rem}",
  ".wd-r.is-open{display:block}",
  ".wd-rt{background:var(--f);color:var(--g);font-weight:700;padding:.5rem .75rem}",
  ".wd-rb{padding:.625rem .75rem}",
  ".wd-rw{margin:0 0 .5rem;font-size:1.125rem;font-weight:700;letter-spacing:.2em}",
  ".wd-sl,.wd-h{font-size:.75rem;color:var(--p)}",
  ".wd-sl{margin:0 0 .25rem}",
  ".wd-sh{font-family:var(--m);font-size:.875rem;white-space:pre;-webkit-user-select:text;user-select:text;border:1px solid var(--f);padding:.5rem;margin:0 0 .5rem}",
  ".wd-rs{margin:0 0 .5rem;color:var(--p)}",
  ".wd-rc{display:block;color:var(--f);padding:.25rem 0}",
  ".wd-h{margin:.625rem 0 0}",
].join("");

function injectCss(): void {
  if (document.getElementById("game-" + SLUG + "-css")) return;
  const style = document.createElement("style");
  style.id = "game-" + SLUG + "-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// 模块级可清理资源：幂等重挂载（契约 §3.3.3）时先释放上一份。
let activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

function teardownPrevious(): void {
  if (activeKeyHandler !== null) {
    document.removeEventListener("keydown", activeKeyHandler);
    activeKeyHandler = null;
  }
}

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function loadStats(): Stats {
  const st = load<Stats>(SLUG, "stats");
  if (
    st && typeof st === "object" &&
    typeof st.p === "number" && typeof st.w === "number" &&
    typeof st.c === "number" && typeof st.m === "number"
  ) {
    return { p: st.p, w: st.w, c: st.c, m: st.m };
  }
  return { p: 0, w: 0, c: 0, m: 0 };
}

/**
 * 挂载入口（index.ts 注册后调用；幂等，契约 §3.3.3）。
 * 恢复优先级：daily:{today} 存档（无论完成与否）> 全新每日局。
 * Practice 局不持久化（无限局，刷新即开新局；仅 daily 局有价值——见任务报告）。
 */
export function mount(root: HTMLElement): void {
  teardownPrevious();

  root.dataset.mounted = "1";
  root.textContent = ""; // 清掉壳层占位/降级段落（挂载一次性动作，非渲染路径）
  WORDS = mergeWords(EN_WORDS, readWords(root)); // 本地化词表（缺键英文兜底）

  injectCss();

  const today = isoDay(new Date());
  const restored = tryRestore(today);
  const machine = createState<GameState>(restored || newDailyGame(new Date()).state);

  // ── 纯 UI 状态 ──
  let input = ""; // 当前行已敲入的字母（≤5）
  let msg = ""; // 提示消息（Not enough letters / Not in word list）
  let finished = machine.get().status !== "playing"; // 恢复已完成局：不重复计分
  let stats = loadStats();

  function tryRestore(day: string): GameState | null {
    const rec = load<SavePayload>(SLUG, "daily:" + day);
    if (rec && typeof rec.s === "string") {
      const st = deserialize(rec.s);
      if (st && st.mode === "daily" && st.day === day) return st;
    }
    return null;
  }

  // ── 一次性建 DOM（render 全权创建与持有，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement("div");
  wrap.className = "wd-w";

  const modeBar = document.createElement("div");
  modeBar.className = "wd-mo";
  modeBar.setAttribute("role", "group");
  const dailyBtn = document.createElement("button");
  dailyBtn.type = "button";
  dailyBtn.className = "wd-m";
  dailyBtn.setAttribute("data-mode", "daily");
  dailyBtn.textContent = WORDS.daily;
  const practiceBtn = document.createElement("button");
  practiceBtn.type = "button";
  practiceBtn.className = "wd-m";
  practiceBtn.setAttribute("data-mode", "practice");
  practiceBtn.textContent = WORDS.practice;
  modeBar.appendChild(dailyBtn);
  modeBar.appendChild(practiceBtn);

  const dayLine = document.createElement("div");
  dayLine.className = "wd-d";
  const dayTitle = document.createElement("span");
  const dayScore = document.createElement("span");
  dayLine.appendChild(dayTitle);
  dayLine.appendChild(dayScore);

  const msgLine = document.createElement("div");
  msgLine.className = "wd-ms";

  const board = document.createElement("div");
  board.className = "wd-b";
  board.setAttribute("role", "grid");
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < 30; i++) {
    const cell = document.createElement("div");
    cell.className = "wd-c";
    board.appendChild(cell);
    cells.push(cell);
  }

  // 屏幕键盘（QWERTY 三行 + Enter/Del；每键 ≥44px 高，触控目标 §10.7）
  const keysWrap = document.createElement("div");
  keysWrap.className = "wd-kb";
  const keyEls: Record<string, HTMLButtonElement> = {};
  for (let r = 0; r < KEY_ROWS.length; r++) {
    const row = document.createElement("div");
    row.className = r === 0 ? "wd-kr wd-k10" : "wd-kr";
    const letters = KEY_ROWS[r];
    if (r === 2) {
      row.appendChild(makeKey("enter", WORDS.enter, true));
    }
    for (let i = 0; i < letters.length; i++) {
      row.appendChild(makeKey(letters.charAt(i), letters.charAt(i).toUpperCase(), false));
    }
    if (r === 2) {
      row.appendChild(makeKey("del", WORDS.del, true));
    }
    keysWrap.appendChild(row);
  }

  function makeKey(k: string, label: string, wide: boolean): HTMLButtonElement {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "wd-k" + (wide ? " wd-kd" : "");
    key.setAttribute("data-k", k);
    key.textContent = label;
    keyEls[k] = key;
    return key;
  }

  // 终局面板
  const resultTitle = document.createElement("div");
  resultTitle.className = "wd-rt";
  const resultWord = document.createElement("p");
  resultWord.className = "wd-rw";
  const shareLabel = document.createElement("p");
  shareLabel.className = "wd-sl";
  shareLabel.textContent = WORDS.shareHint;
  const shareBox = document.createElement("div");
  shareBox.className = "wd-sh";
  const resultStats = document.createElement("p");
  resultStats.className = "wd-rs";
  const resultCta = document.createElement("a");
  resultCta.className = "wd-rc";
  resultCta.setAttribute("rel", "noopener");
  const resultBody = document.createElement("div");
  resultBody.className = "wd-rb";
  resultBody.appendChild(resultWord);
  resultBody.appendChild(shareLabel);
  resultBody.appendChild(shareBox);
  resultBody.appendChild(resultStats);
  resultBody.appendChild(resultCta);
  const resultBox = document.createElement("div");
  resultBox.className = "wd-r";
  resultBox.setAttribute("role", "status");
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultBody);

  const hint = document.createElement("p");
  hint.className = "wd-h";
  hint.textContent = WORDS.saved;

  wrap.appendChild(modeBar);
  wrap.appendChild(dayLine);
  wrap.appendChild(msgLine);
  wrap.appendChild(board);
  wrap.appendChild(keysWrap);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── patch（§6：比较后只写差异格；数据变化只改 textContent/classList）──

  /** 已提交行 + 键盘三态 + 标题/面板（commit 后调用） */
  function patch(s: GameState): void {
    const marks = marksOf(s);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        patchCell(s, r, c, r < marks.length ? marks[r][c] : undefined);
      }
    }
    patchKeys(s);
    patchChrome(s);
    if (s.status !== "playing") {
      openResult(s);
      if (!finished) {
        finished = true;
        if (s.mode === "daily") recordDailyResult(s.status === "won");
      }
    } else {
      resultBox.classList.remove("is-open");
    }
  }

  /** 单格：字母 + 三态/光标 class（比较后写，EPDC 局部刷新） */
  function patchCell(s: GameState, r: number, c: number, mark: number | undefined): void {
    const el = cells[r * 5 + c];
    const isCurrentRow = s.status === "playing" && r === s.guesses.length;
    const text = r < s.guesses.length
      ? s.guesses[r].charAt(c).toUpperCase()
      : isCurrentRow && c < input.length
        ? input.charAt(c).toUpperCase()
        : "";
    if (el.textContent !== text) el.textContent = text;
    const hit = mark !== undefined && mark === 2;
    const near = mark !== undefined && mark === 1;
    const miss = mark !== undefined && mark === 0;
    el.classList.toggle("ih", hit);
    el.classList.toggle("in", near);
    el.classList.toggle("im", miss);
    el.classList.toggle("ic", isCurrentRow && c === input.length);
  }

  function patchKeys(s: GameState): void {
    // 无历史（新局/首挂载）也要跑：清掉上一局残留的三态 class
    const ks = s.guesses.length > 0 ? keyStates(s) : null;
    for (let r = 0; r < KEY_ROWS.length; r++) {
      for (let i = 0; i < KEY_ROWS[r].length; i++) {
        const ch = KEY_ROWS[r].charAt(i);
        const el = keyEls[ch];
        if (!el) continue;
        const m = ks === null ? undefined : ks[ch];
        el.classList.toggle("ih", m === 2);
        el.classList.toggle("in", m === 1);
        el.classList.toggle("im", m === 0);
      }
    }
  }

  function patchChrome(s: GameState): void {
    dailyBtn.classList.toggle("io", s.mode === "daily");
    practiceBtn.classList.toggle("io", s.mode === "practice");
    const title = s.mode === "daily" ? "#" + s.day : WORDS.practice;
    if (dayTitle.textContent !== title) dayTitle.textContent = title;
    const score = s.guesses.length + "/" + 6;
    if (dayScore.textContent !== score) dayScore.textContent = score;
    if (msgLine.textContent !== msg) msgLine.textContent = msg;
  }

  function setMsg(text: string): void {
    msg = text;
    patchChrome(machine.get());
  }

  // ── 终局：计分（仅 daily）与面板内容（幂等填充）──

  function recordDailyResult(won: boolean): void {
    stats = loadStats(); // 多标签页场景取最新
    stats.p++;
    if (won) {
      stats.w++;
      const yLine = load<SavePayload>(SLUG, "daily:" + isoDay(new Date(Date.now() - 86400000)));
      let yWon = false;
      if (yLine && typeof yLine.s === "string") {
        const y = deserialize(yLine.s);
        yWon = y !== null && y.status === "won";
      }
      stats.c = yWon ? stats.c + 1 : 1; // 昨天没玩/没赢 → streak 重新从 1 起算
      if (stats.c > stats.m) stats.m = stats.c;
    } else {
      stats.c = 0;
    }
    save<Stats>(SLUG, "stats", stats);
  }

  function resolveCta(): { href: string; label: string } {
    const el = document.querySelector("a[data-egames-cta]");
    if (el) {
      const href = el.getAttribute("href");
      if (href) return { href: href, label: el.textContent || FALLBACK_CTA.label };
    }
    return FALLBACK_CTA;
  }

  function openResult(s: GameState): void {
    const title = s.status === "won" ? WORDS.win : WORDS.lost;
    if (resultTitle.textContent !== title) resultTitle.textContent = title;
    const wordLine = WORDS.theWordWas + " " + answerOf(s).toUpperCase();
    if (resultWord.textContent !== wordLine) resultWord.textContent = wordLine;
    const share = shareText(s);
    if (shareBox.textContent !== share) shareBox.textContent = share;
    const st =
      s.mode === "daily"
        ? WORDS.played + " " + stats.p + " · " + WORDS.won + " " + stats.w + " · " +
          WORDS.streak + " " + stats.c + " · " + WORDS.best + " " + stats.m
        : WORDS.practiceNote;
    if (resultStats.textContent !== st) resultStats.textContent = st;
    const cta = resolveCta();
    if (resultCta.getAttribute("href") !== cta.href) resultCta.setAttribute("href", cta.href);
    if (resultCta.textContent !== cta.label) resultCta.textContent = cta.label;
    resultBox.classList.add("is-open");
    if (s.mode === "daily" && s.day === today) setMsg(WORDS.tomorrow);
  }

  // ── 输入（合法性判定全走 logic，§5.3）──

  function pressLetter(ch: string): void {
    const s = machine.get();
    if (s.status !== "playing") return;
    if (input.length >= 5) return;
    if (msg !== "") setMsg("");
    input += ch;
    patchCell(s, s.guesses.length, input.length - 1, undefined);
    patchCell(s, s.guesses.length, input.length, undefined); // 光标右移
  }

  function pressBackspace(): void {
    const s = machine.get();
    if (s.status !== "playing" || input.length === 0) return;
    if (msg !== "") setMsg("");
    const cleared = input.length - 1;
    input = input.slice(0, cleared);
    patchCell(s, s.guesses.length, cleared, undefined); // 清字母
    patchCell(s, s.guesses.length, input.length, undefined); // 光标左移
  }

  function pressEnter(): void {
    const s = machine.get();
    if (s.status !== "playing") return;
    if (input.length < 5) {
      setMsg(WORDS.notEnough);
      return;
    }
    const word = input;
    if (!isValidGuess(word)) {
      setMsg(WORDS.notInList);
      return;
    }
    input = "";
    machine.commit(submitGuess(s, word));
  }

  // ── 模式切换 ──

  function startMode(mode: "daily" | "practice"): void {
    const s = machine.get();
    if (s.mode === mode && s.status === "playing") return; // 同模式进行中：不重开
    let next: GameState;
    if (mode === "practice") {
      next = newPracticeGame().state; // 练习局永远开新词（不恢复旧练习）
    } else {
      next = tryRestore(today) || newDailyGame(new Date()).state;
    }
    input = "";
    setMsg("");
    finished = next.status !== "playing"; // 恢复已完成 daily：不重复计分
    machine.replace(next);
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──

  modeBar.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const m = target.getAttribute("data-mode");
    if (m === "daily" || m === "practice") startMode(m);
  });

  keysWrap.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const k = target.getAttribute("data-k");
    if (k === "enter") pressEnter();
    else if (k === "del") pressBackspace();
    else if (k !== null && k.length === 1) pressLetter(k);
  });

  // 硬件键盘（墨水屏设备常有实体键盘/d-pad）：字母 / Enter / Backspace
  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "Enter") {
      pressEnter();
      return;
    }
    if (ev.key === "Backspace" || ev.key === "Delete") {
      pressBackspace();
      return;
    }
    if (typeof ev.key === "string" && ev.key.length === 1) {
      const lower = ev.key.toLowerCase();
      if (lower >= "a" && lower <= "z") pressLetter(lower);
    }
  }
  document.addEventListener("keydown", onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 订阅（patch + daily 存档两条独立订阅）──
  machine.onChange(patch);
  machine.onChange((s) => {
    if (s.mode === "daily" && s.day !== null) {
      save<SavePayload>(SLUG, "daily:" + s.day, { s: serialize(s) });
    }
  });

  patch(machine.get());
}
