/**
 * word-search/logic — 字母网格找单词纯函数逻辑层（契约《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（注入随机源，§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op（未命中/非共线/重复判定）返回
 *   **原引用**（render diff 依据）。
 * - 参数非法（坐标越界、非法难度、坏 state 形状）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自注入的 createRng：同 seed 必产出同盘面（本游戏 seeded=false，
 *   但生成器内部必须确定性走 rng——同 rng 序列同题，可测试性基础）。
 * - 判定不依赖词的放置位置（placements 不进 GameState）：只按「两点共线（8 方向）
 *   且线段拼出的串（正向或反向）等于词单中未找到的词」判定——存档天然防翻答案
 *   （契约决策⑤），且随机填充字母意外拼出词单中的词时同样可被选中（业界标准行为）。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 */

import { createRng } from '../_engine/rng';
import type { Rng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 一个词在网格中的放置（谜题「解」信息——不进 GameState/存档，决策⑤） */
export interface Placement {
  word: string;
  row: number; // 首字母所在行（按 word 正向）
  col: number; // 首字母所在列
  dr: number; // 方向行步进 ∈ {-1,0,1}
  dc: number; // 方向列步进 ∈ {-1,0,1}
}

export interface GameState {
  difficulty: Difficulty;
  /** null = 随机组局 */
  seed: number | null;
  /** 网格边长（格子数 size*size） */
  size: number;
  /** 本局主题名（THEMES 之一） */
  theme: string;
  /** size*size 个 'A'-'Z'（行优先：idx = r*size + c） */
  grid: string[];
  /** 本局词单（大写 3-10 字母，无重复） */
  words: string[];
  /** 与 words 对齐：true = 已找到 */
  found: boolean[];
  /** size*size：true = 属于某个已找到词的线段（render 反转高亮用） */
  foundCells: boolean[];
}

export interface NewGameResult {
  state: GameState;
  placements: Placement[];
  theme: string;
}

// ---------------------------------------------------------------------------
// 常量：难度参数、方向、主题词单
// ---------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** 难度 → 网格边长 / 藏词数（任务规格：10×10 藏 6 / 12×12 藏 8 / 14×14 藏 10） */
const SIZE_OF: Record<Difficulty, number> = { easy: 10, medium: 12, hard: 14 };
const COUNT_OF: Record<Difficulty, number> = { easy: 6, medium: 8, hard: 10 };

/** 词单长度上限（deserialize 宽容校验用；生成兜底路径下词数只减不增） */
const WORD_MAX_COUNT = COUNT_OF.hard;

/** 词长约束（任务规格：3-10 个大写字母） */
const WORD_MIN_LEN = 3;
const WORD_MAX_LEN = 10;

/** 8 方向：水平/垂直/两对角，正反均可 */
const DIRS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [-1, 1],
];

/** 剩余格填充字母表 */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 主题词单（任务规格：4-6 主题，每主题 30-60 个常见真实单词，总量控制在 ~200-300）。
 * 5 主题共 238 词（Animals 44 / Food 52 / Nature 48 / Technology 49 / Space 45），
 * 全部为大写英文真实单词、长度 3-10、主题内无重复；gzip 后词单仅占产物小头（实测见报告）。
 */
const THEMES: ReadonlyArray<{ name: string; words: string[] }> = [
  {
    name: 'Animals',
    words: [
      'BEAR', 'BIRD', 'BISON', 'CAMEL', 'CAT', 'CHEETAH', 'COW', 'CRAB', 'DEER', 'DOG',
      'DOLPHIN', 'DUCK', 'EAGLE', 'FISH', 'FOX', 'FROG', 'GIRAFFE', 'GOAT', 'GOOSE', 'HORSE',
      'KANGAROO', 'KOALA', 'LEOPARD', 'LION', 'LLAMA', 'MONKEY', 'MOOSE', 'MOUSE', 'OTTER', 'OWL',
      'PANDA', 'PIG', 'PUMA', 'RABBIT', 'SEAL', 'SHEEP', 'SHARK', 'SNAKE', 'SQUIRREL', 'TIGER',
      'TURTLE', 'WHALE', 'WOLF', 'ZEBRA',
    ],
  },
  {
    name: 'Food',
    words: [
      'APPLE', 'BACON', 'BANANA', 'BEAN', 'BREAD', 'BUTTER', 'CABBAGE', 'CAKE', 'CARROT', 'CELERY',
      'CHEESE', 'CHERRY', 'CITRUS', 'COOKIE', 'CORN', 'CRACKER', 'CUCUMBER', 'DONUT', 'EGG', 'FLOUR',
      'GARLIC', 'GINGER', 'GRAPE', 'HONEY', 'JUICE', 'LEMON', 'LETTUCE', 'MANGO', 'MELON', 'MILK',
      'MUFFIN', 'NOODLE', 'NUT', 'OLIVE', 'ONION', 'ORANGE', 'PANCAKE', 'PASTA', 'PEACH', 'PEAR',
      'PEPPER', 'PIZZA', 'PLUM', 'POTATO', 'RICE', 'SALAD', 'SOUP', 'SPINACH', 'STEAK', 'TOMATO',
      'WAFFLE', 'YOGURT',
    ],
  },
  {
    name: 'Nature',
    words: [
      'ACORN', 'BAY', 'BEACH', 'BREEZE', 'BROOK', 'CANYON', 'CAVE', 'CLIFF', 'CLOUD', 'DAISY',
      'DESERT', 'FIELD', 'FIRE', 'FLOWER', 'FOREST', 'FROST', 'GARDEN', 'GLACIER', 'GRASS', 'HILL',
      'ISLAND', 'LAKE', 'LEAF', 'MEADOW', 'MOSS', 'MOUNTAIN', 'OCEAN', 'PINE', 'POND', 'RAIN',
      'RIVER', 'ROOT', 'ROSE', 'SAND', 'SKY', 'SNOW', 'STORM', 'STREAM', 'SUN', 'SUNFLOWER',
      'THUNDER', 'TREE', 'TULIP', 'VALLEY', 'VINE', 'WATERFALL', 'WIND', 'WOOD',
    ],
  },
  {
    name: 'Technology',
    words: [
      'ARRAY', 'BANDWIDTH', 'BINARY', 'BOOT', 'BROWSER', 'BUTTON', 'CHIP', 'CIRCUIT', 'CODE', 'COMPILER',
      'CURSOR', 'DATA', 'DATABASE', 'DISK', 'DOWNLOAD', 'EMAIL', 'FILE', 'FIREWALL', 'FOLDER', 'FORMAT',
      'GADGET', 'HACKER', 'HARDWARE', 'ICON', 'INTERNET', 'KERNEL', 'KEYBOARD', 'LAPTOP', 'LINK', 'MEMORY',
      'MODEM', 'MONITOR', 'NETWORK', 'PASSWORD', 'PIXEL', 'PRINTER', 'PROCESSOR', 'PROGRAM', 'ROBOT', 'ROUTER',
      'SCANNER', 'SCREEN', 'SERVER', 'SIGNAL', 'SOFTWARE', 'TABLET', 'TERMINAL', 'TRACKPAD', 'WIFI', 'WIRELESS',
    ],
  },
  {
    name: 'Space',
    words: [
      'ALIEN', 'ASTEROID', 'AURORA', 'COMET', 'COSMIC', 'COSMOS', 'CRATER', 'DRIFT', 'EARTH', 'ECLIPSE',
      'GALAXY', 'GRAVITY', 'HOVER', 'JUPITER', 'LAUNCH', 'LANDING', 'LUNAR', 'MARS', 'MERCURY', 'METEOR',
      'MODULE', 'MOON', 'NEBULA', 'NEPTUNE', 'ORBIT', 'ORBITAL', 'PLANET', 'PLUTO', 'PROBE', 'ROCKET',
      'ROVER', 'SATURN', 'SHUTTLE', 'SOLAR', 'SPACE', 'SPACESHIP', 'STAR', 'SUPERNOVA', 'TELESCOPE', 'TITAN',
      'TRAJECTORY', 'URANUS', 'UNIVERSE', 'VENUS', 'VELOCITY', 'ZODIAC',
    ],
  },
];

/** 整体重排轮数上限：单轮内放不齐全部词则清空网格换洗牌序重来（确定性重试） */
const MAX_LAYOUT_ROUNDS = 24;
/** 单词放置尝试次数上限（随机方向 × 随机起点） */
const MAX_PLACE_ATTEMPTS = 128;

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

/** 主题名清单（契约外导出，供测试/诊断核对词单来源；先例：sudoku countSolutions） */
export function listThemes(): string[] {
  const out: string[] = [];
  for (let i = 0; i < THEMES.length; i++) out.push(THEMES[i].name);
  return out;
}

/** 按主题名取词单副本；未知主题 → null（契约外导出，同上） */
export function themeWordsOf(name: string): string[] | null {
  for (let i = 0; i < THEMES.length; i++) {
    if (THEMES[i].name === name) return THEMES[i].words.slice();
  }
  return null;
}

function isUpperAlphaWord(w: string): boolean {
  if (typeof w !== 'string') return false;
  for (let i = 0; i < w.length; i++) {
    const code = w.charCodeAt(i);
    if (code < 65 || code > 90) return false; // A-Z
  }
  return w.length > 0;
}

function reverseString(s: string): string {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) out += s.charAt(i);
  return out;
}

/** 词沿 (row,col)+dir 放置是否可行：沿途每格要么空、要么字母与词字母相同（允许交叉共享） */
function fitsAt(
  grid: string[],
  size: number,
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
): boolean {
  for (let k = 0; k < word.length; k++) {
    const cell = grid[(row + dr * k) * size + (col + dc * k)];
    if (cell !== '' && cell !== word.charAt(k)) return false;
  }
  return true;
}

/** 随机方向 × 随机起点尝试放置一词；成功写入网格并返回放置信息，否则 null */
function placeWord(
  grid: string[],
  size: number,
  word: string,
  rng: Rng,
): Placement | null {
  const len = word.length;
  const span = size - len + 1; // 起点（沿正方向轴）可用格数；len ≤ size 恒 > 0
  for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
    const dir = DIRS[rng.int(DIRS.length)];
    const dr = dir[0];
    const dc = dir[1];
    // 起点范围保证终点不越界；dr=-1 时行起点 ∈ [len-1, size-1]，余类推
    const row = dr === 1 ? rng.int(span) : dr === -1 ? (len - 1) + rng.int(span) : rng.int(size);
    const col = dc === 1 ? rng.int(span) : dc === -1 ? (len - 1) + rng.int(span) : rng.int(size);
    if (fitsAt(grid, size, word, row, col, dr, dc)) {
      for (let k = 0; k < len; k++) {
        grid[(row + dr * k) * size + (col + dc * k)] = word.charAt(k);
      }
      return { word, row, col, dr, dc };
    }
  }
  return null;
}

/**
 * 布局生成：目标 count 词全部放入 size×size 网格。
 * 每轮清空网格、重洗候选词序再试（确定性重试）；全程只由 rng 驱动。
 * 返回放置数最多的一轮（参数下失败率趋近 0；兜底保证不死循环、不抛错）。
 */
function buildLayout(
  size: number,
  count: number,
  candidates: string[],
  rng: Rng,
): { grid: string[]; placements: Placement[] } {
  let bestGrid: string[] | null = null;
  let bestPlacements: Placement[] = [];
  for (let round = 0; round < MAX_LAYOUT_ROUNDS; round++) {
    const grid = new Array<string>(size * size).fill('');
    const placements: Placement[] = [];
    const queue = rng.shuffle(candidates);
    let qi = 0;
    while (placements.length < count && qi < queue.length) {
      const word = queue[qi];
      qi++;
      const p = placeWord(grid, size, word, rng);
      if (p !== null) placements.push(p);
    }
    if (placements.length === count) return { grid, placements };
    if (placements.length > bestPlacements.length) {
      bestGrid = grid;
      bestPlacements = placements;
    }
  }
  // 兜底（理论不可达）：返回 best-effort —— words 取实际放入的词
  const grid = bestGrid !== null ? bestGrid : new Array<string>(size * size).fill('');
  return { grid, placements: bestPlacements };
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 生成新局：按难度随机选主题 + 抽词 + 8 方向布局 + 随机字母补空。
 * 唯一随机源 createRng(opts.seed ?? (Date.now() >>> 0))。
 * 难度非法 / seed 非 uint32 整数 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): NewGameResult {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('word-search: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('word-search: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number | null = null;
  let rng: Rng;
  if (opts.seed === undefined) {
    rng = createRng(Date.now() >>> 0);
  } else {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('word-search: seed must be a uint32 integer');
    }
    seed = s;
    rng = createRng(s);
  }

  const size = SIZE_OF[opts.difficulty];
  const count = COUNT_OF[opts.difficulty];
  const theme = rng.pick(THEMES);
  const candidates: string[] = [];
  for (let i = 0; i < theme.words.length; i++) {
    const w = theme.words[i];
    if (w.length >= WORD_MIN_LEN && w.length <= WORD_MAX_LEN && w.length <= size) {
      candidates.push(w);
    }
  }
  if (candidates.length < count) {
    // 词单常量已保证每主题 ≥30 词且长度 3-10；此防御分支正常不可达
    throw new Error('word-search: theme "' + theme.name + '" has too few usable words');
  }

  const layout = buildLayout(size, count, candidates, rng);
  // 剩余空格填随机字母（确定性走 rng）
  for (let i = 0; i < layout.grid.length; i++) {
    if (layout.grid[i] === '') layout.grid[i] = LETTERS.charAt(rng.int(LETTERS.length));
  }

  const words: string[] = [];
  for (let i = 0; i < layout.placements.length; i++) words.push(layout.placements[i].word);

  const state: GameState = {
    difficulty: opts.difficulty,
    seed,
    size,
    theme: theme.name,
    grid: layout.grid,
    words,
    found: new Array<boolean>(words.length).fill(false),
    foundCells: new Array<boolean>(size * size).fill(false),
  };
  return { state, placements: layout.placements, theme: theme.name };
}

// ---------------------------------------------------------------------------
// 选词判定（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('word-search: state must be a GameState object');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('word-search: unknown difficulty "' + String(state.difficulty) + '"');
  }
  if (state.size !== SIZE_OF[state.difficulty]) {
    throw new Error('word-search: size ' + String(state.size) + ' does not match difficulty');
  }
  if (listThemes().indexOf(state.theme) === -1) {
    throw new Error('word-search: unknown theme "' + String(state.theme) + '"');
  }
  const cells = state.size * state.size;
  if (!Array.isArray(state.grid) || state.grid.length !== cells) {
    throw new Error('word-search: state.grid must contain size*size entries');
  }
  for (let i = 0; i < cells; i++) {
    if (!isUpperAlphaWord(state.grid[i]) || state.grid[i].length !== 1) {
      throw new Error('word-search: grid cell at ' + i + ' is not a single A-Z letter');
    }
  }
  if (!Array.isArray(state.words) || state.words.length === 0 || state.words.length > WORD_MAX_COUNT) {
    throw new Error('word-search: state.words has invalid length');
  }
  for (let i = 0; i < state.words.length; i++) {
    const w = state.words[i];
    if (!isUpperAlphaWord(w) || w.length < WORD_MIN_LEN || w.length > WORD_MAX_LEN) {
      throw new Error('word-search: word at ' + i + ' is not 3-10 A-Z letters');
    }
    if (state.words.indexOf(w) !== i) {
      throw new Error('word-search: duplicate word "' + w + '"');
    }
  }
  if (!Array.isArray(state.found) || state.found.length !== state.words.length) {
    throw new Error('word-search: state.found must align with state.words');
  }
  if (!Array.isArray(state.foundCells) || state.foundCells.length !== cells) {
    throw new Error('word-search: state.foundCells must contain size*size entries');
  }
}

function cellIndex(size: number, r: number, c: number): number {
  if (
    typeof r !== 'number' || typeof c !== 'number' ||
    !Number.isInteger(r) || !Number.isInteger(c) ||
    r < 0 || r >= size || c < 0 || c >= size
  ) {
    throw new Error('word-search: row/col out of range: r=' + String(r) + ' c=' + String(c));
  }
  return r * size + c;
}

/**
 * 选词判定：点选 (r1,c1) → (r2,c2)。
 * 两点共线（8 方向）且线段串（正向或反向）等于某未找到的词 → 命中：
 * 置 found、线段格置 foundCells，返回新 state；否则返回原引用（no-op）。
 * 线段允许以词的任意一端为起点（用户无从知晓放置方向，业界标准行为）。
 * 坐标越界 throw（编程错误）。
 */
export function trySelect(
  state: GameState,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): GameState {
  assertStateShape(state);
  cellIndex(state.size, r1, c1);
  cellIndex(state.size, r2, c2);
  const size = state.size;
  const dr = r2 - r1;
  const dc = c2 - c1;
  if (dr === 0 && dc === 0) return state; // 同格：未构成线段
  const colinear = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!colinear) return state; // 非 8 方向共线：拒绝
  const stepR = dr > 0 ? 1 : dr < 0 ? -1 : 0;
  const stepC = dc > 0 ? 1 : dc < 0 ? -1 : 0;
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  let seg = '';
  for (let k = 0; k < len; k++) {
    seg += state.grid[(r1 + stepR * k) * size + (c1 + stepC * k)];
  }
  const reversed = reverseString(seg);
  for (let i = 0; i < state.words.length; i++) {
    if (state.found[i]) continue; // 已找到的词：重复判定 no-op
    const w = state.words[i];
    if (w.length !== len) continue; // 长度不匹配：跳过
    if (w === seg || w === reversed) {
      const found = state.found.slice();
      found[i] = true;
      const foundCells = state.foundCells.slice();
      for (let k = 0; k < len; k++) {
        foundCells[(r1 + stepR * k) * size + (c1 + stepC * k)] = true;
      }
      return {
        difficulty: state.difficulty,
        seed: state.seed,
        size: state.size,
        theme: state.theme,
        grid: state.grid,
        words: state.words,
        found,
        foundCells,
      };
    }
  }
  return state;
}

/** 词单全部找到 = 胜利。（state 内数据非法时按未解处理，assertStateShape 会先 throw） */
export function isSolved(state: GameState): boolean {
  assertStateShape(state);
  for (let i = 0; i < state.found.length; i++) {
    if (!state.found[i]) return false;
  }
  return true;
}

/** 从网格读出 (row,col)+dir 方向长度 len 的线段串（render/测试辅助；越界 throw） */
export function readSegment(
  state: GameState,
  row: number,
  col: number,
  dr: number,
  dc: number,
  len: number,
): string {
  assertStateShape(state);
  if (!Number.isInteger(len) || len < 1) {
    throw new Error('word-search: invalid segment length');
  }
  let dirOk = false;
  for (let i = 0; i < DIRS.length; i++) {
    if (DIRS[i][0] === dr && DIRS[i][1] === dc) {
      dirOk = true;
      break;
    }
  }
  if (!dirOk) throw new Error('word-search: (dr,dc) must be one of the 8 directions');
  const endR = row + dr * (len - 1);
  const endC = col + dc * (len - 1);
  cellIndex(state.size, row, col);
  cellIndex(state.size, endR, endC);
  let out = '';
  for (let k = 0; k < len; k++) out += state.grid[(row + dr * k) * state.size + (col + dc * k)];
  return out;
}

// ---------------------------------------------------------------------------
// 存档序列化
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（盘面+词单+进度；不含 placements——决策⑤防翻档作弊）。
 *
 * 格式（`;` 分 9 段）：
 *   `ws1;<difficulty>;<seed|->;<size>;<theme>;<grid>;<words>;<found01>;<foundCellsHex>`
 *
 * - grid：size*size 个大写字母（100-196 字符）。
 * - words：逗号分隔（词内无逗号）。
 * - found01：与 words 对齐的 '0'/'1' 串。
 * - foundCellsHex：size*size bit 按序每 4 bit 一个小写 hex 字符
 *   （25/36/49 字符），尾余位恒 0。
 *
 * 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀，
 * cookie 层 3.5KB 上限更安全（与 sudoku 打样同款决策，已在任务报告列出）。
 * 抛错条件同 assertStateShape（编程错误）；deserialize 才负责宽容。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  let foundStr = '';
  for (let i = 0; i < state.found.length; i++) foundStr += state.found[i] ? '1' : '0';
  const nibbles = Math.ceil((state.size * state.size) / 4);
  let hex = '';
  for (let nib = 0; nib < nibbles; nib++) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const idx = nib * 4 + j;
      if (idx < state.foundCells.length && state.foundCells[idx]) v |= 1 << (3 - j);
    }
    hex += '0123456789abcdef'.charAt(v);
  }
  const seedStr = state.seed === null ? '-' : String(state.seed >>> 0);
  return (
    'ws1;' + state.difficulty + ';' + seedStr + ';' + String(state.size) + ';' + state.theme +
    ';' + state.grid.join('') + ';' + state.words.join(',') + ';' + foundStr + ';' + hex
  );
}

function hexVal(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  return -1;
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 严格校验：段数、难度词表、size 与难度匹配、seed 范围、主题名单、
 * grid 字母与长度、words 词形与去重、found 对齐、hex 长度/字符/尾余位。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 9 || segs[0] !== 'ws1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;

    let seed: number | null;
    if (segs[2] === '-') {
      seed = null;
    } else {
      if (!/^\d{1,10}$/.test(segs[2])) return null;
      seed = Number(segs[2]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    }

    if (!/^\d{1,3}$/.test(segs[3])) return null;
    const size = Number(segs[3]);
    if (size !== SIZE_OF[difficulty]) return null;

    const theme = segs[4];
    if (listThemes().indexOf(theme) === -1) return null;

    const cells = size * size;
    const gridStr = segs[5];
    if (gridStr.length !== cells) return null;
    const grid = new Array<string>(cells);
    for (let i = 0; i < cells; i++) {
      const code = gridStr.charCodeAt(i);
      if (code < 65 || code > 90) return null;
      grid[i] = gridStr.charAt(i);
    }

    const words = segs[6] === '' ? [] : segs[6].split(',');
    if (words.length === 0 || words.length > WORD_MAX_COUNT) return null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!isUpperAlphaWord(w) || w.length < WORD_MIN_LEN || w.length > WORD_MAX_LEN) return null;
      if (w.length > size) return null; // 网格放不下的词必非法
      if (words.indexOf(w) !== i) return null;
    }

    const foundStr = segs[7];
    if (foundStr.length !== words.length) return null;
    const found = new Array<boolean>(words.length);
    for (let i = 0; i < foundStr.length; i++) {
      const ch = foundStr.charAt(i);
      if (ch !== '0' && ch !== '1') return null;
      found[i] = ch === '1';
    }

    const hex = segs[8];
    const nibbles = Math.ceil(cells / 4);
    if (hex.length !== nibbles) return null;
    const foundCells = new Array<boolean>(cells);
    for (let i = 0; i < cells; i++) {
      const h = hexVal(hex.charCodeAt(i >> 2));
      if (h < 0) return null;
      foundCells[i] = ((h >>> (3 - (i & 3))) & 1) === 1;
    }
    // 尾 nibble 的余位（超出 cells 的 bit）必须为 0
    const tail = hexVal(hex.charCodeAt(nibbles - 1));
    const padBits = nibbles * 4 - cells;
    if (padBits > 0 && (tail & ((1 << padBits) - 1)) !== 0) return null;

    return { difficulty, seed, size, theme, grid, words, found, foundCells };
  } catch (e) {
    return null;
  }
}
