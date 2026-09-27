/**
 * hidden-code/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切「这步是否合法/反馈几 peg/是否胜负」的判断只调 logic.ts
 * 导出函数；本文件仅持有纯 UI 状态（当前槽位、待确认难度）并做最小脏区 patch。
 *
 * 组件选型：沿 sudoku 打样裁决——@marcomattes/epaper-components 任何入口均引入
 * 含 ES2021 API 的共享 chunk，与 build-games.mjs 的 ES2016+ 黑名单断言结构性冲突，
 * 故本游戏同样全自绘 vanilla DOM（--ink-* token、3px 粗线、1-bit、无动画无 hover）。
 *
 * 符号集：6 个高区分度几何字符 ●■▲★◆▼（1-bit 友好、零外部请求；Unicode 基本几何
 * 形状区，Kindle 内置字体覆盖良好——真机冒烟项）。easy 难度仅用前 5 个。
 *
 * undo 语义（任务书）：撤销「当前行未提交的输入」，历史行不可撤——落地方式：
 * fillSymbol/clearSlot 走 machine.commit（入 undo 栈）；submitGuess 后**重建**
 * state machine（undo 栈清零），已提交行天然不可回退。
 *
 * 商标红线：bundle 内一切文案（WORDS）不出现任何商标词。
 */
import {
  clearSlot,
  deserialize,
  DIFFICULTY_SPECS,
  fillSymbol,
  isLost,
  isOver,
  isWon,
  newGame,
  serialize,
  submitGuess,
  type Difficulty,
  type GameState,
  type GuessEntry,
} from './logic';
import { createState } from '../_engine/state';
import type { StateMachine } from '../_engine/state';
import { load, remove, save } from '../_engine/storage';

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = 'hidden-code';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 符号字符表（索引 = logic 的符号索引；easy 难度只用前 5 个） */
const SYMBOLS = ['●', '■', '▲', '★', '◆', '▼'];

/** 存档载荷（契约 §4.1 key：save1；无 timer 故无 sec 字段） */
interface SavePayload {
  s: string;
}

/** 累计战绩（契约 §4.1 key：stats；winRounds = 获胜局所用轮数总和，供算平均） */
interface StatsPayload {
  played: number;
  won: number;
  winRounds: number;
}

/** CTA 英文兜底（页面模板 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: 'https://e-ink.me',
  label: 'Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me',
};

/** 游戏内固定英文短词（本地化通道缺口沿 sudoku 裁决；商标红线：不用任何商标词） */
const WORDS = {
  round: 'ROUND',
  check: 'Check',
  undo: 'Undo',
  newGame: 'New Game',
  confirm: 'Start a new game? Current progress will be lost.',
  ok: 'OK',
  cancel: 'Cancel',
  win: 'Code broken!',
  lose: 'Out of rounds',
  answer: 'THE CODE WAS',
  wonLabel: 'WON',
  avgLabel: 'AVG',
  legendExact: 'right slot',
  legendPartial: 'wrong slot',
  progressSaved: 'Progress is saved automatically.',
};

// 私有 CSS（契约决策④）：运行时一次性注入，min 后 ≤2KB（§3.4）。
// 无 animation/transition/hover（§10.2）；1-bit 状态：当前槽=inset 3px 粗框、
// 禁用=dashed 边框、结果标题=黑底白字反转（§10.5）；触控目标 ≥44px（§10.7）。
// 体积控制：--f/--b/--m/--p 四个局部 token 短路全局 var() 回退链（行为等价：
// 同样要求浏览器支持 CSS 自定义属性，不支持时同样整体回退到 UA 样式），
// 并以选择器分组合并共享声明（reset/字号/边框/间距）。
const CSS = [
  // 局部 token：f=前景 b=背景 m=等宽 p=正文辅助色（继承自 --ink-* 站点 token）
  '.hcd-wrap{max-width:27rem;margin:0 auto;--f:var(--ink-fg,#000);--b:var(--ink-bg,#fff);--m:var(--ink-mono,monospace);--p:var(--site-prose-fg,#333)}',
  // 按钮 reset（全部交互控件共享；-webkit- 前缀全目标设备可用，省掉标准属性副本）
  '.hcd-btn,.hcd-key,.hcd-slot,.hcd-act,.hcd-new{font:inherit;background:var(--b);color:var(--f);cursor:pointer;-webkit-appearance:none}',
  '.hcd-slot,.hcd-act,.hcd-new{border:1px solid var(--f)}',
  '.hcd-btn,.hcd-key,.hcd-slot,.hcd-act,.hcd-new{min-height:48px}',
  '.hcd-btn,.hcd-act,.hcd-status,.hcd-confirm p,.hcd-rstats{font-size:.875rem}',
  '.hcd-legend{font-size:.75rem;color:var(--p);margin-bottom:.5rem}',
  '.hcd-hslots,.hcd-rcode,.hcd-slot{font-size:1.375rem}',
  '.hcd-hslots,.hcd-crow,.hcd-rcode{display:grid;grid-auto-flow:column;gap:.5rem}',
  '.hcd-seg,.hcd-pad{display:grid;gap:1px;background:var(--f);border:1px solid var(--f)}',
  '.hcd-seg{grid-template-columns:repeat(3,1fr)}',
  '.hcd-pad{grid-template-columns:repeat(6,1fr)}',
  '.hcd-pad--5{grid-template-columns:repeat(5,1fr)}',
  '.hcd-key{font-size:1.25rem}',
  '.hcd-btn.is-on{background:var(--f);color:var(--b);font-weight:700}',
  '.hcd-status,.hcd-rstats{font-family:var(--m)}',
  '.hcd-status,.hcd-hrow,.hcd-rstats{border-bottom:1px solid var(--f)}',
  '.hcd-status{display:flex;justify-content:space-between}',
  '.hcd-trio{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem}',
  '.hcd-new,.hcd-trio,.hcd-confirm,.hcd-result{margin-top:.75rem}',
  '.hcd-board{max-height:19rem;overflow:auto;padding:.5rem;margin-bottom:.75rem;border:3px solid var(--f)}',
  '.hcd-confirm,.hcd-result{border:3px solid var(--f)}',
  '.hcd-hrow{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.25rem 0}',
  '.hcd-crow{margin-top:.5rem}',
  '.hcd-slot.is-cur{box-shadow:inset 0 0 0 3px var(--f)}',
  '.hcd-act[disabled]{border-style:dashed;cursor:default}',
  '.hcd-new{width:100%}',
  '.hcd-confirm{padding:.75rem}',
  '.hcd-confirm p{margin:0}',
  '.hcd-rtitle{background:var(--f);color:var(--b);font-weight:700;padding:.5rem .75rem;font-size:1.125rem}',
  '.hcd-rans{display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem}',
  '.hcd-rstats{padding:.5rem .75rem;margin:0;color:var(--p)}',
  '.hcd-rcta{display:block;padding:.5rem .75rem;color:var(--f)}',
].join('');

function injectCss(): void {
  if (document.getElementById('game-' + SLUG + '-css')) return;
  const style = document.createElement('style');
  style.id = 'game-' + SLUG + '-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** 反馈 peg 文本：exact 个实心 ● + partial 个空心 ○ */
function pegText(exact: number, partial: number): string {
  let s = '';
  for (let i = 0; i < exact; i++) s += '●';
  for (let i = 0; i < partial; i++) s += '○';
  return s;
}

/** 战绩均值（保留 1 位小数）；无胜场返回 '-' */
function avgRounds(stats: StatsPayload): string {
  if (stats.won < 1) return '-';
  return String(Math.round((stats.winRounds / stats.won) * 10) / 10);
}

// 模块级可清理资源：幂等重挂载（契约 §3.3.3）时先释放上一份。
let activeKeyHandler: ((ev: KeyboardEvent) => void) | null = null;

function teardownPrevious(): void {
  if (activeKeyHandler !== null) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
}

/**
 * 挂载入口（index.ts 注册到 window.EGames 后调用；幂等，契约 §3.3.3）。
 * seeded: false——不接每日种子，opts 通道（MountOpts 预留）当前不使用。
 */
export function mount(root: HTMLElement): void {
  teardownPrevious();

  if (root.dataset.mounted === '1') {
    root.textContent = ''; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = '1';
  root.textContent = ''; // 清掉壳层占位/降级段落

  injectCss();

  // ── 状态：先恢复存档（契约 §4.1 key：save1），无档才生成新局 ──
  let difficulty: Difficulty = 'easy';
  let over = false;
  let restoredOver = false; // 恢复即终局的存档：直接展示结果，不重复计战绩
  let pendingDiff: Difficulty | null = null;
  let activeSlot = 0;
  let stats = loadStats();

  const saved = load<SavePayload>(SLUG, 'save1');
  let restored: GameState | null = null;
  if (saved && typeof saved.s === 'string') {
    restored = deserialize(saved.s);
  }
  let machine: StateMachine<GameState>;
  if (restored) {
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
    if (isOver(restored)) {
      over = true;
      restoredOver = true;
    }
  } else {
    machine = createState<GameState>(newGame({ difficulty }).state);
  }

  function loadStats(): StatsPayload {
    const s = load<StatsPayload>(SLUG, 'stats');
    if (
      s && typeof s === 'object' &&
      typeof s.played === 'number' && typeof s.won === 'number' && typeof s.winRounds === 'number'
    ) {
      return s;
    }
    return { played: 0, won: 0, winRounds: 0 };
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement('div');
  wrap.className = 'hcd-wrap';

  // 难度段选（单选行，选中态黑底反转）
  const seg = document.createElement('div');
  seg.className = 'hcd-seg';
  seg.setAttribute('role', 'group');
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'hcd-btn';
    key.setAttribute('data-diff', d);
    key.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    seg.appendChild(key);
    segKeys.push(key);
  }

  // 状态行：轮次 | 战绩
  const statusRound = document.createElement('span');
  const statusStats = document.createElement('span');
  const status = document.createElement('div');
  status.className = 'hcd-status';
  status.appendChild(statusRound);
  status.appendChild(statusStats);

  // 反馈图例（●/○ 语义一行说明；div 免 UA margin，样式与底部 hint 共用本类）
  const legend = document.createElement('div');
  legend.className = 'hcd-legend';
  legend.textContent = '● ' + WORDS.legendExact + ' · ○ ' + WORDS.legendPartial;

  // 历史区（滚动容器：行数多时显示最近几行，overflow-y auto，无动画）
  const hrows = document.createElement('div');
  hrows.className = 'hcd-hrows';

  // 当前行（槽位按钮；当前槽 3px 粗框）
  const crow = document.createElement('div');
  crow.className = 'hcd-crow';
  const slots: HTMLButtonElement[] = [];

  const board = document.createElement('div');
  board.className = 'hcd-board';
  board.appendChild(hrows);
  board.appendChild(crow);

  // 符号键盘（难度切挡时整块重建：键数随 symbolCount 5/6 变化）
  const pad = document.createElement('div');
  pad.className = 'hcd-pad';

  // 功能行：Undo | Check
  const trio = document.createElement('div');
  trio.className = 'hcd-trio';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'hcd-act';
  undoBtn.textContent = WORDS.undo;
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'hcd-act';
  checkBtn.textContent = WORDS.check;
  trio.appendChild(undoBtn);
  trio.appendChild(checkBtn);

  // 新游戏（内联确认，防误触丢局）
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'hcd-new';
  newBtn.textContent = WORDS.newGame;

  const confirmBox = document.createElement('div');
  confirmBox.className = 'hcd-confirm';
  confirmBox.hidden = true;
  const confirmText = document.createElement('p');
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement('div');
  confirmRow.className = 'hcd-trio'; // 与 Undo/Check 行同样式（两列 grid）
  const confirmOk = document.createElement('button');
  confirmOk.type = 'button';
  confirmOk.className = 'hcd-act';
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement('button');
  confirmCancel.type = 'button';
  confirmCancel.className = 'hcd-act';
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板：标题 + （负局揭示答案）+ 战绩 + 导流 CTA
  const resultTitle = document.createElement('div');
  resultTitle.className = 'hcd-rtitle';
  const resultAnswer = document.createElement('div');
  resultAnswer.className = 'hcd-rans';
  const answerLabel = document.createElement('span');
  answerLabel.className = 'hcd-legend'; // 与图例同样式（.75rem 辅助色小字）
  answerLabel.textContent = WORDS.answer;
  const answerCode = document.createElement('span');
  answerCode.className = 'hcd-rcode';
  resultAnswer.appendChild(answerLabel);
  resultAnswer.appendChild(answerCode);
  const resultStats = document.createElement('p');
  resultStats.className = 'hcd-rstats';
  const resultCta = document.createElement('a');
  resultCta.className = 'hcd-rcta';
  resultCta.setAttribute('rel', 'noopener');
  const resultBox = document.createElement('div');
  resultBox.className = 'hcd-result';
  resultBox.hidden = true;
  resultBox.setAttribute('role', 'status');
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultAnswer);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement('div');
  hint.className = 'hcd-legend'; // 底部自动保存提示与图例共样式
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(legend);
  wrap.appendChild(board);
  wrap.appendChild(pad);
  wrap.appendChild(trio);
  wrap.appendChild(newBtn);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 难度相关 DOM（槽位数 / 键盘键数随难度重建；切难度或新局时调用）──
  function rebuildDifficultyDom(spec: { codeLength: number; symbolCount: number }): void {
    crow.textContent = '';
    slots.length = 0;
    for (let i = 0; i < spec.codeLength; i++) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'hcd-slot';
      slot.setAttribute('data-slot', String(i));
      crow.appendChild(slot);
      slots.push(slot);
    }

    pad.textContent = '';
    pad.className = 'hcd-pad' + (spec.symbolCount === 5 ? ' hcd-pad--5' : '');
    for (let s = 0; s < spec.symbolCount; s++) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'hcd-key';
      key.setAttribute('data-sym', String(s));
      key.setAttribute('aria-label', 'symbol ' + (s + 1));
      key.textContent = SYMBOLS[s];
      pad.appendChild(key);
    }
  }

  /** 历史行 DOM（提交时增量 appendChild；恢复存档时一次性构建） */
  function buildHistoryRow(entry: GuessEntry): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'hcd-hrow';
    const hs = document.createElement('span');
    hs.className = 'hcd-hslots';
    for (let k = 0; k < entry.guess.length; k++) {
      const c = document.createElement('span');
      c.textContent = SYMBOLS[entry.guess[k]];
      hs.appendChild(c);
    }
    const pegs = document.createElement('span');
    pegs.className = 'hcd-hpegs';
    pegs.textContent = pegText(entry.exact, entry.partial);
    pegs.setAttribute('aria-label', entry.exact + ' exact, ' + entry.partial + ' wrong slot');
    row.appendChild(hs);
    row.appendChild(pegs);
    return row;
  }

  // ── 存档（组装归 render 层，契约 §5.2）──
  function persist(): void {
    if (over) return;
    save<SavePayload>(SLUG, 'save1', { s: serialize(machine.get()) });
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList/disabled，禁 innerHTML）──
  let lastRoundShown = '';
  let lastStatsShown = '';

  function patch(s: GameState): void {
    const spec = DIFFICULTY_SPECS[s.difficulty];

    // 当前行槽位：仅变更格落盘（EPDC 局部刷新）
    for (let i = 0; i < slots.length; i++) {
      const v = s.current[i];
      const text = v === -1 ? '' : SYMBOLS[v];
      if (slots[i].textContent !== text) slots[i].textContent = text;
      slots[i].classList.toggle('is-cur', i === activeSlot && !over);
      const label = 'slot ' + (i + 1) + (v === -1 ? ' empty' : ': ' + SYMBOLS[v]);
      if (slots[i].getAttribute('aria-label') !== label) slots[i].setAttribute('aria-label', label);
    }

    // 状态行（值变才写）
    const roundNum = over ? s.history.length : Math.min(s.history.length + 1, spec.maxRounds);
    const roundText = WORDS.round + ' ' + roundNum + '/' + spec.maxRounds;
    if (roundText !== lastRoundShown) {
      statusRound.textContent = roundText;
      lastRoundShown = roundText;
    }
    const statsText =
      WORDS.wonLabel + ' ' + stats.won + ' · ' + WORDS.avgLabel + ' ' + avgRounds(stats);
    if (statsText !== lastStatsShown) {
      statusStats.textContent = statsText;
      lastStatsShown = statsText;
    }

    // 控件态
    const rowFull = s.current.indexOf(-1) === -1;
    checkBtn.disabled = over || !rowFull;
    undoBtn.disabled = over || !machine.canUndo();
    for (let i = 0; i < segKeys.length; i++) {
      segKeys[i].classList.toggle('is-on', DIFFICULTIES[i] === difficulty);
    }
    confirmBox.hidden = pendingDiff === null; // hidden 属性切换（UA display:none，省 CSS）

    // 终局判定只走 logic（§5.3）
    if (!over && isOver(s)) finishGame(s);
  }

  /** 当前槽变化：只 patch 前后两格 */
  function moveSlot(idx: number): void {
    const prev = activeSlot;
    activeSlot = idx;
    const s = machine.get();
    patchSlotAt(slots[prev], s, prev);
    patchSlotAt(slots[idx], s, idx);
  }

  function patchSlotAt(el: HTMLButtonElement, s: GameState, idx: number): void {
    const v = s.current[idx];
    const text = v === -1 ? '' : SYMBOLS[v];
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-cur', idx === activeSlot && !over);
  }

  // ── 输入：一律先过 logic，no-op（原引用）不入 undo 栈（§5.3）──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) machine.commit(next);
  }

  function inputSymbol(sym: number): void {
    if (over) return;
    const s = machine.get();
    if (sym >= DIFFICULTY_SPECS[s.difficulty].symbolCount) return;
    commitIfChanged(fillSymbol(s, activeSlot, sym));
    // 自动推进到下一个空槽（无空槽则停留）
    const next = machine.get();
    let target = -1;
    for (let i = 0; i < next.current.length; i++) {
      if (next.current[i] === -1) {
        target = i;
        break;
      }
    }
    if (target !== -1 && target !== activeSlot) moveSlot(target);
  }

  function eraseSlot(): void {
    if (over) return;
    const s = machine.get();
    if (s.current[activeSlot] !== -1) {
      commitIfChanged(clearSlot(s, activeSlot));
      return;
    }
    if (activeSlot > 0) {
      // 空槽退格：光标退到前一格并清除（对齐文本编辑器的 Backspace 直觉）
      moveSlot(activeSlot - 1);
      commitIfChanged(clearSlot(machine.get(), activeSlot));
    }
  }

  /** 提交当前行：追加历史 + 重建 machine（undo 栈清零 → 历史行锁定，见文件头） */
  function submit(): void {
    if (over || pendingDiff !== null) return;
    const next = submitGuess(machine.get());
    if (next === machine.get()) return; // 未填满 no-op（按钮已禁用，防御）
    bindMachine(createState<GameState>(next));
    persist(); // 先落档；若本击终局，finishGame 随后 remove 清档
    hrows.appendChild(buildHistoryRow(next.history[next.history.length - 1]));
    activeSlot = 0;
    patch(next);
    board.scrollTop = board.scrollHeight; // 滚到最新行（直接跳，无动画）
  }

  /** （重）挂 machine 订阅；submit/startNew 重建 machine 后调用 */
  function bindMachine(m: StateMachine<GameState>): void {
    machine = m;
    machine.onChange(patch);
    machine.onChange(persist);
  }

  // ── 终局（战绩 + 揭示答案 + 导流 CTA）──
  function resolveCta(): { href: string; label: string } {
    const el = document.querySelector('a[data-egames-cta]');
    if (el) {
      const href = el.getAttribute('href');
      if (href) return { href: href, label: el.textContent || FALLBACK_CTA.label };
    }
    return FALLBACK_CTA;
  }

  function finishGame(s: GameState): void {
    over = true;
    remove(SLUG, 'save1'); // 完局清档（下次进入开新局）
    if (!restoredOver) {
      // 战绩：胜场/平均用轮数（winRounds 只累计获胜局）
      stats.played++;
      const won = isWon(s);
      if (won) {
        stats.won++;
        stats.winRounds += s.history.length;
      }
      save<StatsPayload>(SLUG, 'stats', stats);
    }

    const spec = DIFFICULTY_SPECS[s.difficulty];
    resultTitle.textContent = isWon(s) ? WORDS.win : WORDS.lose;
    if (isWon(s)) {
      resultAnswer.style.display = 'none';
      resultStats.textContent =
        'Solved in ' + s.history.length + ' of ' + spec.maxRounds + ' rounds · ' +
        WORDS.wonLabel + ' ' + stats.won + '/' + stats.played + ' · ' +
        WORDS.avgLabel + ' ' + avgRounds(stats);
    } else {
      resultAnswer.style.display = '';
      answerCode.textContent = '';
      for (let i = 0; i < s.solution.length; i++) {
        const c = document.createElement('span');
        c.textContent = SYMBOLS[s.solution[i]];
        answerCode.appendChild(c);
      }
      resultStats.textContent =
        s.history.length + ' rounds used · ' +
        WORDS.wonLabel + ' ' + stats.won + '/' + stats.played + ' · ' +
        WORDS.avgLabel + ' ' + avgRounds(stats);
    }
    const cta = resolveCta();
    resultCta.setAttribute('href', cta.href);
    resultCta.textContent = cta.label;
    resultBox.hidden = false;
    // 终局刷新状态行（战绩/轮次缓存失效；patch 不会重入 finishGame——over 已置位）
    lastRoundShown = '';
    lastStatsShown = '';
    patch(s);
    undoBtn.disabled = true;
    checkBtn.disabled = true;
  }

  // ── 换局（新游戏/切难度共用；有进度先确认）──
  function startNew(d: Difficulty): void {
    difficulty = d;
    const fresh = newGame({ difficulty: d }).state;
    bindMachine(createState<GameState>(fresh));
    over = false;
    restoredOver = false;
    activeSlot = 0;
    pendingDiff = null;
    hrows.textContent = '';
    rebuildDifficultyDom(DIFFICULTY_SPECS[d]);
    resultBox.hidden = true;
    lastRoundShown = '';
    persist(); // 新局落档（刷新即恢复新局）
    patch(fresh);
    board.scrollTop = 0;
  }

  function hasProgress(): boolean {
    return machine.canUndo() || machine.get().history.length > 0;
  }

  function requestNew(d: Difficulty): void {
    if (hasProgress()) {
      pendingDiff = d;
      patch(machine.get());
    } else {
      startNew(d);
    }
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  seg.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute('data-diff') as Difficulty | null;
    if (!d || d === difficulty) return;
    requestNew(d);
  });

  crow.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target || over) return;
    const slotStr = target.getAttribute('data-slot');
    if (slotStr === null) return;
    moveSlot(parseInt(slotStr, 10));
  });

  pad.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const symStr = target.getAttribute('data-sym');
    if (symStr === null) return;
    inputSymbol(parseInt(symStr, 10));
  });

  undoBtn.addEventListener('click', () => {
    if (over) return;
    machine.undo(); // 逐格退当前行未提交输入（提交后栈已清零，历史行天然不可撤）
  });

  checkBtn.addEventListener('click', submit);

  newBtn.addEventListener('click', () => {
    requestNew(difficulty);
  });

  confirmOk.addEventListener('click', () => {
    if (pendingDiff !== null) startNew(pendingDiff);
  });
  confirmCancel.addEventListener('click', () => {
    pendingDiff = null;
    patch(machine.get());
  });

  // 物理键盘：数字 1-6 选符号 / 方向键移动槽位 / Backspace 退格 / Enter 提交
  function onKeyDown(ev: KeyboardEvent): void {
    if (over || pendingDiff !== null) return;
    if (ev.key === 'Enter') {
      if (!checkBtn.disabled) {
        ev.preventDefault();
        submit();
      }
      return;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
      ev.preventDefault();
      eraseSlot();
      return;
    }
    if (ev.key >= '1' && ev.key <= '6') {
      inputSymbol(parseInt(ev.key, 10) - 1);
      return;
    }
    const spec = DIFFICULTY_SPECS[machine.get().difficulty];
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      const delta = ev.key === 'ArrowLeft' ? -1 : 1;
      let next = activeSlot + delta;
      if (next < 0) next = 0;
      if (next > spec.codeLength - 1) next = spec.codeLength - 1; // 边缘即停，不环绕
      if (next !== activeSlot) moveSlot(next);
      return;
    }
  }
  document.addEventListener('keydown', onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 初始化：难度 DOM + 历史行（恢复档）+ 首次 patch ──
  rebuildDifficultyDom(DIFFICULTY_SPECS[difficulty]);
  const initial = machine.get();
  for (let i = 0; i < initial.history.length; i++) {
    hrows.appendChild(buildHistoryRow(initial.history[i]));
  }
  bindMachine(machine);
  if (over) {
    finishGame(initial); // 防御路径：终局存档直接展示（不重复计战绩）
  } else {
    persist();
    patch(initial);
    board.scrollTop = board.scrollHeight;
  }
}
