/**
 * nonogram/render — DOM patch 渲染层（契约 §5.3 / §6）。
 *
 * 与 logic 的边界：一切"该线是否完成/是否赢了"的判断只调 logic.ts 导出函数
 * （lineStatus/isSolved）；本文件仅持有纯 UI 状态（选中格、计时、待确认难度）
 * 并做最小脏区 patch。
 *
 * 组件选型（沿用 sudoku 打样裁决）：@marcomattes/epaper-components@2.0.0 任何
 * 入口都经共享 chunk 引入 ES2021 API（.replaceAll/.closest/ElementInternals），
 * 与 build-games.mjs 的 API 黑名单断言冲突，故 UI 全部自绘 vanilla DOM，
 * 视觉遵循 epaper 印刷美学（--ink-* token、1-bit 反转、无动画无 hover）。
 *
 * 本地化通道（2026-09 16 语言）：bundle 为全语言共享的静态 IIFE，游戏内
 * 文案经 DOM 通道注入——页面 SSG 把 ui-words.json 对应语言节写进
 * #game-root 的 data-egames-words 属性，mount 时与 words.en.ts 的
 * EN_WORDS 浅合并（缺键英文兜底）；难度词同走词表（diffLabel）。
 * 导流 CTA 走既有 DOM 通道：页面模板在 promo 位输出
 * <a data-egames-cta href=…>{content.cta.label}</a>，mount 时读取覆盖；
 * 检测不到时用英文兜底。
 */
import {
  cycleCell,
  deserialize,
  isSolved,
  lineStatus,
  newGame,
  serialize,
  setCell,
  type Difficulty,
  type GameState,
} from './logic';
import { diffLabel, mergeWords, readWords } from '../_engine/i18n';
import { createState } from '../_engine/state';
import { load, remove, save } from '../_engine/storage';
import { seedFromDate } from '../_engine/rng';
import { EN_WORDS } from './words.en';

/** 与 index.ts 的 SLUG 保持一致 */
const SLUG = 'nonogram';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Daily 入口盘面规格（任务书：每日一题用 medium 盘） */
const DAILY_DIFFICULTY: Difficulty = 'medium';

/** 存档载荷（契约决策⑤：{ s: logic 序列化串, sec: render 计时 }，不含 solution/undo 栈） */
interface SavePayload {
  s: string;
  sec: number;
}

/** 累计统计（契约 key 表：stats）。best[difficulty] = 最快完成秒数 */
interface Stats {
  played: number;
  solved: number;
  best: Record<string, number>;
}

/** CTA 英文兜底（页面 promo 位有 data-egames-cta 时被 content 文案覆盖） */
const FALLBACK_CTA = {
  href: 'https://e-ink.me',
  label: 'Enjoying the game? Turn any web article into an EPUB for your Kindle — e-ink.me',
};

/** 游戏内文案（本地化：mount 时以 data-egames-words 注入词覆盖，见文件头；UI 禁 "Picross" 商标词） */
let WORDS: Record<string, string> = EN_WORDS;

// 私有 CSS（契约决策④）：运行时一次性注入；无 animation/transition/hover
// （§10.2）；1-bit 状态：填充=黑底反转、排除=× 符号、完成线提示=黑底反转、
// 选中=inset 3px 粗框（§10.5）；颜色只用 --ink-* token（带字面量回退）。
// 触控目标：easy/medium 格 min-height 44px；hard 15×15 物理放不下 44px，
// 格 28px + 方向键 d-pad 导航补偿（任务书允许，howToPlay 如实描述）。
// min 后 ≤2KB（§3.4）。细线 = grid gap 露底色；粗外框 = 3px border。
const CSS = [
  '.ng-w{max-width:32rem;margin:0 auto}',
  '.ng-w15{max-width:30rem}',
  '.ng-sg,.ng-at,.ng-t{display:grid;gap:1px;background:var(--ink-fg,#000);border:1px solid var(--ink-fg,#000)}',
  '.ng-t{border-width:3px}',
  '.ng-sg{grid-template-columns:repeat(4,1fr);margin:0 0 .75rem}',
  '.ng-at,.ng-cr{grid-template-columns:1fr 1fr}',
  '.ng-at{margin-top:.75rem}',
  '.ng-b,.ng-k,.ng-cb,.ng-c,.ng-ko,.ng-h{font:inherit;border:0;background:var(--ink-bg,#fff);color:var(--ink-fg,#000);cursor:pointer;-webkit-appearance:none;appearance:none;padding:0}',
  '.ng-b,.ng-k,.ng-cb{font-size:.875rem}',
  '.ng-b{min-height:44px;padding:.25rem}',
  '.ng-k{min-height:48px;padding:.25rem}',
  '.ng-cb{min-height:44px;border:1px solid var(--ink-fg,#000)}',
  '.ng-b.is-on,.ng-h.is-done,.ng-rst{background:var(--ink-fg,#000);color:var(--ink-bg,#fff);font-weight:700}',
  '.ng-rst{padding:.5rem .75rem}',
  '.ng-st{display:flex;justify-content:space-between;font-family:monospace;font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000);padding:.25rem 0;margin-bottom:.5rem}',
  '.ng-h{font-family:monospace;font-size:.75rem}',
  '.ng-hr{display:flex;justify-content:flex-end;align-items:center;padding:0 .375rem;min-width:2.5rem}',
  '.ng-hc{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:.25rem 0}',
  '.ng-c{min-height:44px}',
  '.ng-c.is-fill{background:var(--ink-fg,#000)}',
  '.ng-c.is-x{font-weight:700}',
  '.ng-c.is-sel{box-shadow:inset 0 0 0 3px var(--ink-fg,#000)}',
  '.ng-c.is-fill.is-sel{box-shadow:inset 0 0 0 3px var(--ink-bg,#fff)}',
  '.ng-w15 .ng-c{min-height:28px}',
  '.ng-w15 .ng-h{font-size:.625rem}',
  '.ng-cf,.ng-rs{display:none;border:3px solid var(--ink-fg,#000);margin-top:.75rem}',
  '.ng-cf.is-open,.ng-rs.is-open{display:block}',
  '.ng-cf{padding:.75rem}',
  '.ng-cf p,.ng-w>p{margin:0;font-size:.875rem;color:var(--site-prose-fg,#333)}',
  '.ng-w>p{margin:.625rem 0 0;font-size:.75rem}',
  '.ng-cr{display:grid;gap:.75rem;margin-top:.625rem}',
  '.ng-rss{padding:.5rem .75rem;margin:0;font-family:monospace;font-size:.875rem;border-bottom:1px solid var(--ink-fg,#000)}',
  '.ng-rsc{display:block;padding:.625rem .75rem;color:var(--ink-fg,#000)}',
].join('');

function injectCss(): void {
  if (document.getElementById('game-' + SLUG + '-css')) return;
  const style = document.createElement('style');
  style.id = 'game-' + SLUG + '-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** 秒 → mm:ss（≥1h 为 h:mm:ss） */
function fmtTime(total: number): string {
  const h = (total / 3600) | 0;
  const m = ((total % 3600) / 60) | 0;
  const s = total % 60;
  return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s);
}

/** UTC 日期 → YYYY-MM-DD（每日挑战记录 key 用，契约 §4.1 key 表） */
function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' + m : '' + m) + '-' + (day < 10 ? '0' + day : '' + day);
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
    document.removeEventListener('visibilitychange', activeVisHandler);
    activeVisHandler = null;
  }
  if (activeKeyHandler !== null) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
}

/**
 * 挂载入口（index.ts 注册到 window.EGames 后调用；幂等，契约 §3.3.3）。
 * opts.seed 为外部注入种子（每日挑战通道，如 /daily 聚合页）；缺省不传时
 * 页面内 "Daily" 按钮自行取 seedFromDate 当日种子（§4.2）——普通
 * "新局"必须每次出新题，不能用当日种子（同 sudoku 裁决）。
 */
export function mount(root: HTMLElement, opts?: { seed?: number }): void {
  teardownPrevious();

  if (root.dataset.mounted === '1') {
    root.textContent = ''; // 清掉旧 UI，全量重建（挂载是一次性动作，非渲染路径）
  }
  root.dataset.mounted = '1';
  root.textContent = ''; // 清掉壳层占位/降级段落
  WORDS = mergeWords(EN_WORDS, readWords(root)); // 本地化词表（缺键英文兜底）

  injectCss();

  // ── 状态：先恢复存档（契约 §4.1 key：save1），无档才生成新局 ──
  let difficulty: Difficulty = 'easy';
  let seconds = 0;
  let solved = false;
  let selected = -1;
  let pendingDiff: Difficulty | null = null; // 待确认的换局难度
  let pendingDaily = false; // 待确认的是否 Daily 局
  let stats = loadStats();

  const saved = load<SavePayload>(SLUG, 'save1');
  let restored: GameState | null = null;
  let savedSec = 0;
  if (saved && typeof saved.s === 'string' && typeof saved.sec === 'number') {
    const parsed = deserialize(saved.s);
    if (parsed) {
      restored = parsed;
      savedSec = saved.sec;
    }
  }
  let machine: ReturnType<typeof createState<GameState>>;
  if (opts && opts.seed !== undefined) {
    // 外部注入 seed（如 /daily 聚合页）→ Daily 盘开局（契约 §3.3.5）。
    // 注入种子优先于存档恢复：每日入口必须给当日题，本地 save1（可能是
    // 半程随机局）不得抢占——该存档由 storage 保留，普通游戏页仍可续玩。
    difficulty = DAILY_DIFFICULTY;
    machine = createState<GameState>(newGame({ difficulty: DAILY_DIFFICULTY, seed: opts.seed }).state);
    bumpPlayed();
  } else if (restored) {
    // §4.4：载入存档用 replace 语义——直接以 restored 重建 machine
    //（尚未挂任何订阅，无通知泄漏）；undo 栈不随存档恢复（契约决策⑤）
    machine = createState<GameState>(restored);
    difficulty = restored.difficulty;
    seconds = savedSec;
  } else {
    machine = createState<GameState>(newGame({ difficulty }).state);
    bumpPlayed();
  }

  // ── 一次性建 DOM（render 全权创建与持有交互 DOM，§6；禁 innerHTML，§10.4）──
  const wrap = document.createElement('div');
  wrap.className = 'ng-w';
  wrap.className = 'ng-w' + (machine.get().size === 15 ? ' ng-w15' : '');

  // 难度段选 + Daily 入口（单选行语义；Daily 是动作按钮而非难度态）
  const seg = document.createElement('div');
  seg.className = 'ng-sg';
  seg.setAttribute('role', 'group');
  const segKeys: HTMLButtonElement[] = [];
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const d = DIFFICULTIES[i];
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'ng-b';
    key.setAttribute('data-diff', d);
    key.textContent = diffLabel(WORDS, d);
    seg.appendChild(key);
    segKeys.push(key);
  }
  const dailyBtn = document.createElement('button');
  dailyBtn.type = 'button';
  dailyBtn.className = 'ng-b';
  dailyBtn.setAttribute('data-diff', 'daily');
  dailyBtn.textContent = WORDS.daily;
  seg.appendChild(dailyBtn);
  segKeys.push(dailyBtn);

  // 状态行：计时 + 填充进度（进度分母 = 行提示段和，无需 solution）
  const statusTime = document.createElement('span');
  const statusFilled = document.createElement('span');
  const status = document.createElement('div');
  status.className = 'ng-st';
  status.appendChild(statusTime);
  status.appendChild(statusFilled);

  // 盘面容器（行列提示 + 格子；grid 列宽随 size 在 rebuildTable 设定）
  const table = document.createElement('div');
  table.className = 'ng-t';
  table.setAttribute('role', 'grid');

  // 功能行：Undo | New Puzzle
  const act = document.createElement('div');
  act.className = 'ng-at';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'ng-k';
  undoBtn.textContent = WORDS.undo;
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'ng-k';
  newBtn.textContent = WORDS.newGame;
  act.appendChild(undoBtn);
  act.appendChild(newBtn);

  // 新局确认（内联确认替代 e-dialog：无 showModal 依赖，老 WebKit 安全）
  const confirmBox = document.createElement('div');
  confirmBox.className = 'ng-cf';
  const confirmText = document.createElement('p');
  confirmText.textContent = WORDS.confirm;
  const confirmRow = document.createElement('div');
  confirmRow.className = 'ng-cr';
  const confirmOk = document.createElement('button');
  confirmOk.type = 'button';
  confirmOk.className = 'ng-cb';
  confirmOk.textContent = WORDS.ok;
  const confirmCancel = document.createElement('button');
  confirmCancel.type = 'button';
  confirmCancel.className = 'ng-cb';
  confirmCancel.textContent = WORDS.cancel;
  confirmRow.appendChild(confirmOk);
  confirmRow.appendChild(confirmCancel);
  confirmBox.appendChild(confirmText);
  confirmBox.appendChild(confirmRow);

  // 终局面板（e-result 语义等价：title + stats + 导流 CTA）
  const resultTitle = document.createElement('div');
  resultTitle.className = 'ng-rst';
  resultTitle.textContent = WORDS.solved;
  const resultStats = document.createElement('p');
  resultStats.className = 'ng-rss';
  const resultCta = document.createElement('a');
  resultCta.className = 'ng-rsc';
  resultCta.setAttribute('rel', 'noopener');
  const resultBox = document.createElement('div');
  resultBox.className = 'ng-rs';
  resultBox.setAttribute('role', 'status');
  resultBox.appendChild(resultTitle);
  resultBox.appendChild(resultStats);
  resultBox.appendChild(resultCta);

  const hint = document.createElement('p');
  hint.className = 'ng-hl';
  hint.textContent = WORDS.progressSaved;

  wrap.appendChild(seg);
  wrap.appendChild(status);
  wrap.appendChild(table);
  wrap.appendChild(act);
  wrap.appendChild(confirmBox);
  wrap.appendChild(resultBox);
  wrap.appendChild(hint);
  root.appendChild(wrap);

  // ── 盘面 DOM（按当前 size 重建；换难度时重跑）──
  let cells: HTMLButtonElement[] = [];
  let rowHintEls: HTMLElement[] = [];
  let colHintEls: HTMLElement[] = [];
  let lastMarks: number[] = [];

  function rebuildTable(size: number, clues: { rows: number[][]; cols: number[][] }): void {
    table.textContent = '';
    cells = [];
    rowHintEls = [];
    colHintEls = [];
    lastMarks = new Array<number>(size * size);
    for (let i = 0; i < lastMarks.length; i++) lastMarks[i] = -1;
    table.style.gridTemplateColumns = 'auto repeat(' + size + ',1fr)';

    const corner = document.createElement('div');
    corner.className = 'ng-ko';
    table.appendChild(corner);
    for (let c = 0; c < size; c++) {
      const el = document.createElement('div');
      el.className = 'ng-h ng-hc';
      appendClueNumbers(el, clues.cols[c]);
      table.appendChild(el);
      colHintEls.push(el);
    }
    for (let r = 0; r < size; r++) {
      const rh = document.createElement('div');
      rh.className = 'ng-h ng-hr';
      rh.textContent = clueText(clues.rows[r]);
      table.appendChild(rh);
      rowHintEls.push(rh);
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ng-c';
        cell.setAttribute('data-idx', String(r * size + c));
        table.appendChild(cell);
        cells.push(cell);
      }
    }
    wrap.className = 'ng-w' + (size === 15 ? ' ng-w15' : '');
  }

  /** 列提示：每数字一个竖排 span（行提示用 join(' ') 文本即可） */
  function appendClueNumbers(el: HTMLElement, clue: number[]): void {
    if (clue.length === 0) {
      const z = document.createElement('span');
      z.textContent = '0';
      el.appendChild(z);
      return;
    }
    for (let i = 0; i < clue.length; i++) {
      const s = document.createElement('span');
      s.textContent = String(clue[i]);
      el.appendChild(s);
    }
  }

  function clueText(clue: number[]): string {
    if (clue.length === 0) return '0';
    let s = '';
    for (let i = 0; i < clue.length; i++) s += (i > 0 ? ' ' : '') + clue[i];
    return s;
  }

  // ── 计时（§6：setInterval 自持、visibilitychange 对齐、不写入 logic state）──
  let startedAt = Date.now() - seconds * 1000;
  let lastSavedSec = seconds;
  let lastTimeShown = -1;

  function renderTime(): void {
    if (seconds !== lastTimeShown) {
      statusTime.textContent = WORDS.timeLabel + ' ' + fmtTime(seconds);
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
  document.addEventListener('visibilitychange', onVisibility);
  activeVisHandler = onVisibility;

  // ── 存档与统计（组装归 render 层，§5.2；key 表：save1/stats/daily:date）──
  function persist(): void {
    if (solved) return;
    save<SavePayload>(SLUG, 'save1', { s: serialize(machine.get()), sec: seconds });
  }

  function loadStats(): Stats {
    const s = load<Stats>(SLUG, 'stats');
    if (s && typeof s === 'object' && typeof s.played === 'number' && typeof s.solved === 'number' && s.best && typeof s.best === 'object') {
      return { played: s.played, solved: s.solved, best: s.best };
    }
    return { played: 0, solved: 0, best: {} };
  }

  function bumpPlayed(): void {
    stats.played++;
    save<Stats>(SLUG, 'stats', stats);
  }

  // ── 最小脏区 patch（§6：只改 textContent/classList，禁 innerHTML 全量重绘）──
  let lastFilledShown = -1;

  function patch(s: GameState): void {
    // 格子：与上次对比，只写变化的格（EPDC 局部刷新）；
    // patch 后同步 lastMarks——否则同格状态绕回缓存值时（如 ×→空）被误判未变
    for (let idx = 0; idx < s.marks.length; idx++) {
      if (s.marks[idx] !== lastMarks[idx]) {
        patchCellAt(cells[idx], s.marks[idx], idx === selected);
        lastMarks[idx] = s.marks[idx];
      }
    }
    // 行列提示完成态（判断走 logic.lineStatus，§5.3）
    const st = lineStatus(s);
    for (let i = 0; i < rowHintEls.length; i++) rowHintEls[i].classList.toggle('is-done', st.rows[i]);
    for (let i = 0; i < colHintEls.length; i++) colHintEls[i].classList.toggle('is-done', st.cols[i]);

    // 状态行
    let filled = 0;
    let target = 0;
    for (let i = 0; i < s.marks.length; i++) {
      if (s.marks[i] === 1) filled++;
    }
    for (let r = 0; r < s.size; r++) {
      const clue = s.clues.rows[r];
      for (let i = 0; i < clue.length; i++) target += clue[i];
    }
    if (filled !== lastFilledShown) {
      statusFilled.textContent = WORDS.filledLabel + ' ' + filled + '/' + target;
      lastFilledShown = filled;
    }

    // 难度/Daily 高亮
    const isDaily = machine.get().seed !== null;
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      segKeys[i].classList.toggle('is-on', !isDaily && DIFFICULTIES[i] === difficulty);
    }
    segKeys[DIFFICULTIES.length].classList.toggle('is-on', isDaily);

    undoBtn.disabled = !machine.canUndo();
    confirmBox.classList.toggle('is-open', pendingDiff !== null);
    renderTime();

    // 终局判定只走 logic（§5.3）；面板在 finishGame() 展开
    if (!solved && isSolved(s)) finishGame(s);
  }

  /** 单格 patch：三态 1-bit 表达（填充=黑底、排除=×、空=白底） */
  function patchCellAt(el: HTMLButtonElement, mark: number, isSelected: boolean): void {
    const text = mark === 2 ? '×' : '';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-fill', mark === 1);
    el.classList.toggle('is-x', mark === 2);
    el.classList.toggle('is-sel', isSelected);
  }

  /** 选中格变化：只 patch 前后两格（若状态有变） */
  function moveSelection(idx: number): void {
    const prev = selected;
    selected = idx;
    const s = machine.get();
    if (prev >= 0 && prev < cells.length) {
      patchCellAt(cells[prev], s.marks[prev], false);
      lastMarks[prev] = s.marks[prev];
    }
    if (idx >= 0 && idx < cells.length) {
      patchCellAt(cells[idx], s.marks[idx], true);
      lastMarks[idx] = s.marks[idx];
    }
  }

  // ── 终局（成绩 + 统计 + 每日记录 + 导流 CTA）──
  function resolveCta(): { href: string; label: string } {
    const el = document.querySelector('a[data-egames-cta]');
    if (el) {
      const href = el.getAttribute('href');
      if (href) return { href: href, label: el.textContent || FALLBACK_CTA.label };
    }
    return FALLBACK_CTA;
  }

  function finishGame(s: GameState): void {
    solved = true;
    stopTimer();
    remove(SLUG, 'save1'); // 完局清档（下次进入开新局）
    stats.solved++;
    let bestNote = '';
    if (typeof stats.best[s.difficulty] !== 'number' || seconds < stats.best[s.difficulty]) {
      stats.best[s.difficulty] = seconds;
      bestNote = ' · best ' + fmtTime(seconds);
    }
    save<Stats>(SLUG, 'stats', stats);
    if (s.seed !== null) {
      // 每日挑战当日结果（key 表：daily:{YYYY-MM-DD} UTC）；重玩不覆盖首录
      const key = 'daily:' + utcDateKey(new Date());
      if (load<{ sec: number }>(SLUG, key) === null) {
        save(SLUG, key, { sec: seconds, difficulty: s.difficulty });
      }
    }
    const label = s.seed !== null ? WORDS.daily : diffLabel(WORDS, s.difficulty);
    resultStats.textContent = label + ' · ' + s.size + '×' + s.size + ' · ' + fmtTime(seconds) + bestNote;
    const cta = resolveCta();
    resultCta.setAttribute('href', cta.href);
    resultCta.textContent = cta.label;
    resultBox.classList.add('is-open');
  }

  // ── 换局（难度/新题/Daily 共用；有进度先确认，防误触丢局）──
  function startNew(d: Difficulty, dailySeed?: number): void {
    difficulty = d;
    machine = createState<GameState>(newGame({ difficulty: d, seed: dailySeed }).state);
    seconds = 0;
    lastSavedSec = 0;
    solved = false;
    selected = -1;
    pendingDiff = null;
    pendingDaily = false;
    resultBox.classList.remove('is-open');
    rebuildTable(machine.get().size, machine.get().clues);
    machine.onChange(patch);
    machine.onChange(persistOnChange);
    patch(machine.get());
    bumpPlayed();
    startTimer();
  }

  function requestNew(d: Difficulty, dailySeed?: number): void {
    // 「有进度」以 undo 栈为准（栈非空 = 已有玩家操作）；已完成的局直接重开
    if (machine.canUndo() && !solved) {
      pendingDiff = d;
      pendingDaily = dailySeed !== undefined;
      patch(machine.get());
    } else {
      startNew(d, dailySeed);
    }
  }

  function requestDaily(): void {
    const today = seedFromDate(new Date());
    // 当日每日局已在进行中 → no-op（同一题）
    if (machine.get().seed === today && !solved) return;
    requestNew(DAILY_DIFFICULTY, today);
  }

  // ── 输入：一律先过 logic；no-op（原引用）不入 undo 栈（§5.3）──
  function commitIfChanged(next: GameState): void {
    if (next !== machine.get()) machine.commit(next);
  }

  function tapCell(idx: number): void {
    if (solved || idx < 0) return;
    const s = machine.get();
    if (selected !== idx) moveSelection(idx);
    commitIfChanged(cycleCell(s, (idx / s.size) | 0, idx % s.size));
  }

  function markSelected(mark: 0 | 1 | 2): void {
    if (solved || selected < 0) return;
    const s = machine.get();
    commitIfChanged(setCell(s, (selected / s.size) | 0, selected % s.size, mark));
  }

  // ── 交互绑定（click + keydown；禁 Pointer Events，§6）──
  table.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const idxStr = target.getAttribute('data-idx');
    if (idxStr === null) return;
    tapCell(parseInt(idxStr, 10));
  });

  seg.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const d = target.getAttribute('data-diff');
    if (d === null || d === 'daily') {
      if (d === 'daily') requestDaily();
      return;
    }
    if (d === difficulty && machine.get().seed === null) return;
    requestNew(d as Difficulty);
  });

  undoBtn.addEventListener('click', () => {
    machine.undo();
  });

  newBtn.addEventListener('click', () => {
    // Daily 局点 New Puzzle → 同尺寸随机局
    requestNew(machine.get().seed !== null ? DAILY_DIFFICULTY : difficulty);
  });

  confirmOk.addEventListener('click', () => {
    if (pendingDiff !== null) startNew(pendingDiff, pendingDaily ? seedFromDate(new Date()) : undefined);
  });
  confirmCancel.addEventListener('click', () => {
    pendingDiff = null;
    pendingDaily = false;
    patch(machine.get());
  });

  // 物理键盘（§6 + hard 15×15 d-pad 补偿）：方向键移动、Enter/空格循环三态、
  // X 切排除、退格清空；方向键边缘即停、不环绕
  function onKeyDown(ev: KeyboardEvent): void {
    if (solved || pendingDiff !== null) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (selected >= 0) tapCell(selected);
      return;
    }
    if (ev.key === 'x' || ev.key === 'X') {
      const s = machine.get();
      if (selected >= 0) {
        markSelected(s.marks[selected] === 2 ? 0 : 2);
      }
      return;
    }
    if (ev.key === 'Backspace' || ev.key === 'Delete') {
      markSelected(0);
      return;
    }
    const dr = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
    const dc = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0;
    if (dr === 0 && dc === 0) return;
    ev.preventDefault();
    const s = machine.get();
    const size = s.size;
    const base = selected < 0 ? ((size >> 1) * size + (size >> 1)) : selected; // 无选中从盘心开始
    let r = ((base / size) | 0) + dr;
    let c = (base % size) + dc;
    if (r < 0) r = 0;
    if (r > size - 1) r = size - 1;
    if (c < 0) c = 0;
    if (c > size - 1) c = size - 1;
    const next = r * size + c;
    if (next === base && selected >= 0) return;
    moveSelection(next);
    if (next < cells.length) cells[next].focus();
  }
  document.addEventListener('keydown', onKeyDown);
  activeKeyHandler = onKeyDown;

  // ── 订阅（onChange：render patch + 存档两条独立订阅）──
  function persistOnChange(): void {
    lastSavedSec = seconds;
    persist();
  }

  rebuildTable(machine.get().size, machine.get().clues);
  machine.onChange(patch);
  machine.onChange(persistOnChange);
  patch(machine.get());
  if (!solved) startTimer(); // 恢复存档则从原秒数继续计时
}
