/**
 * hangman/logic — 刽子手猜词纯函数逻辑层（契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（注入随机源，§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 参数非法（非法难度/种子/字母）属编程错误：throw 让开发期暴露；
 *   唯一例外 `deserialize`：存档可能来自外部/旧版本，损坏一律返回 null，绝不抛。
 * - 随机全部来自注入的 createRng：同 seed + 同难度必产出同词（存档恢复的确定性基础）。
 * - 语法 ES2020 以内，API 仅用 ES2015 白名单（打包 target es2015，不补 polyfill）。
 *
 * 存档与防作弊（契约决策⑤「存档不含 solution」的落地）：
 *   GameState 内存态含 word/category，但 serialize 刻意排除——存档只存
 *   { difficulty, seed, guessed, wrongCount, status }；恢复时由同 seed 重生成
 *   word（newGame 确定性），并校验 wrongCount/status 与 guessed 的盘面一致性，
 *   篡改档直接作废（deserialize → null）。玩家翻档只能看到种子，看不到明文词。
 */

import { createRng } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'playing' | 'won' | 'lost';

/** 经典规则：6 次错误机会（第 6 错判负） */
export const MAX_WRONG = 6;

export interface GameState {
  difficulty: Difficulty;
  /** 实际使用的种子（uint32）；serialize 保留（恢复时重生成词），非每日挑战语义 */
  seed: number;
  /** 目标词（小写）。内存态；serialize 排除（决策⑤，见文件头） */
  word: string;
  /** 类别标签（如 'animal'；easy 难度 UI 显示提示）。内存态；serialize 排除 */
  category: string;
  /** 已猜字母（按猜测顺序追加、去重、小写 a-z） */
  guessed: string;
  /** 当前错误数 0..MAX_WRONG */
  wrongCount: number;
  status: GameStatus;
}

export interface NewGameResult {
  /** 目标词（小写） */
  word: string;
  /** 类别标签 */
  category: string;
  /** 初始 state（免去 render 手工拼装） */
  state: GameState;
}

/** 词库词条（wordList 导出结构，测试与 render 校验用） */
export interface WordEntry {
  word: string;
  category: string;
}

// ---------------------------------------------------------------------------
// 词库（内嵌常量；gzip 预算见任务规格：总 400-600 词，产物 gzip ≤15KB）
//
// 难度定义：
//   easy   4-6 字母高频常用词（UI 附带类别提示）
//   medium 6-8 字母中频词
//   hard   9-12 字母低频词
// 组织：难度 → 类别 → 词数组。类别名只出现一次（比每词带标签省 ~1.5KB raw）；
// 全部小写纯字母、难度内与跨难度均不重复（logic.test.ts 词库不变量断言）。
// ---------------------------------------------------------------------------

const WORD_BANK: Record<Difficulty, Record<string, readonly string[]>> = {
  easy: {
    animal: [
      'lamb', 'goose', 'bird', 'fish', 'lion', 'tiger', 'bear', 'horse', 'sheep', 'mouse',
      'snake', 'zebra', 'panda', 'koala', 'camel', 'goat', 'duck', 'frog', 'wolf', 'deer',
      'seal', 'crab', 'dove', 'crow', 'swan', 'hawk', 'eagle', 'shark', 'whale', 'rabbit',
      'monkey',
    ],
    food: [
      'rice', 'bread', 'milk', 'cake', 'meat', 'soup', 'salad', 'pizza', 'pasta', 'honey',
      'sugar', 'apple', 'mango', 'grape', 'lemon', 'peach', 'bacon', 'toast', 'candy', 'cheese',
      'flour', 'melon',
    ],
    place: [
      'park', 'shop', 'bank', 'beach', 'city', 'farm', 'hotel', 'school', 'church', 'market',
      'island', 'bridge', 'street', 'house', 'store', 'attic', 'castle', 'forest', 'river', 'cinema',
    ],
    nature: [
      'tree', 'leaf', 'rain', 'snow', 'wind', 'star', 'moon', 'cloud', 'storm', 'plant',
      'grass', 'stone', 'ocean', 'field', 'hill', 'lake', 'wave', 'fire', 'sand', 'pond',
    ],
    object: [
      'book', 'desk', 'door', 'lamp', 'chair', 'phone', 'table', 'clock', 'glass', 'coin',
      'fork', 'spoon', 'plate', 'knife', 'paper', 'pencil', 'sofa', 'shelf', 'oven', 'brush',
      'radio', 'watch', 'torch', 'mirror',
    ],
    vehicle: ['bike', 'boat', 'ship', 'train', 'plane', 'truck', 'wagon', 'taxi', 'sled', 'jeep', 'tram'],
    sport: ['golf', 'ball', 'game', 'team', 'race', 'tennis', 'soccer', 'hockey', 'rugby', 'match'],
    music: ['song', 'drum', 'piano', 'flute', 'violin', 'guitar', 'tune', 'band', 'voice', 'opera'],
    job: [
      'cook', 'chef', 'nurse', 'pilot', 'actor', 'baker', 'clown', 'guard', 'judge', 'mayor',
      'model', 'poet', 'doctor', 'farmer',
    ],
    clothing: [
      'coat', 'shirt', 'dress', 'shoe', 'sock', 'glove', 'scarf', 'jeans', 'belt', 'boot',
      'cape', 'vest', 'jacket', 'apron',
    ],
    color: ['blue', 'gray', 'green', 'white', 'black', 'brown', 'yellow', 'purple', 'orange', 'pink', 'gold', 'silver'],
  },
  medium: {
    animal: [
      'donkey', 'turtle', 'parrot', 'spider', 'beetle', 'lizard', 'turkey', 'chicken', 'penguin', 'giraffe',
      'gorilla', 'hamster', 'leopard', 'ostrich', 'dolphin', 'squirrel', 'kangaroo', 'hedgehog', 'flamingo', 'peacock',
      'octopus', 'lobster', 'reindeer', 'mongoose', 'panther', 'buffalo',
    ],
    food: [
      'butter', 'cookie', 'muffin', 'waffle', 'yogurt', 'banana', 'cherry', 'potato', 'tomato', 'carrot',
      'pepper', 'walnut', 'almond', 'noodle', 'dinner', 'pickle', 'popcorn', 'pancake', 'vinegar', 'cabbage',
      'lettuce', 'pumpkin', 'shrimp', 'dessert', 'meatball',
    ],
    place: [
      'garden', 'museum', 'tunnel', 'valley', 'temple', 'harbor', 'station', 'library', 'factory', 'village',
      'theater', 'stadium', 'college', 'campus', 'airport', 'balcony', 'bakery', 'garage', 'office', 'palace',
      'gallery', 'suburb', 'country', 'capital', 'highway', 'horizon',
    ],
    nature: [
      'rainbow', 'thunder', 'breeze', 'meadow', 'prairie', 'volcano', 'canyon', 'sunset', 'spring', 'summer',
      'autumn', 'winter', 'monsoon', 'glacier', 'tornado', 'mangrove', 'desert', 'jungle', 'rainfall', 'sunshine',
      'twilight',
    ],
    object: [
      'window', 'pillow', 'blanket', 'curtain', 'wardrobe', 'cabinet', 'drawer', 'candle', 'basket', 'bottle',
      'kettle', 'teapot', 'shovel', 'hammer', 'ladder', 'umbrella', 'monitor', 'printer', 'scanner', 'calendar',
      'envelope', 'notebook', 'suitcase', 'barrel', 'chimney', 'bucket',
    ],
    vehicle: [
      'tractor', 'subway', 'rocket', 'scooter', 'bicycle', 'carriage', 'minibus', 'rowboat', 'trawler', 'minivan',
      'trolley', 'pickup', 'sailboat',
    ],
    sport: [
      'cricket', 'boxing', 'skating', 'cycling', 'running', 'archery', 'marathon', 'referee', 'penalty', 'karate',
      'sprint', 'diving', 'rowing', 'surfing', 'bowling', 'baseball', 'football',
    ],
    music: ['concert', 'trumpet', 'melody', 'rhythm', 'chorus', 'singer', 'recital', 'sonata', 'lyrics', 'anthem', 'serenade'],
    job: [
      'teacher', 'dentist', 'soldier', 'sailor', 'artist', 'author', 'banker', 'lawyer', 'engineer', 'plumber',
      'painter', 'dancer', 'writer', 'surgeon', 'tailor', 'cashier', 'janitor', 'butcher',
    ],
    clothing: ['sweater', 'uniform', 'sneaker', 'hoodie', 'sandal', 'slipper', 'raincoat', 'mitten', 'blazer', 'cardigan', 'jumpsuit'],
  },
  hard: {
    animal: [
      'alligator', 'crocodile', 'chimpanzee', 'rhinoceros', 'hippopotamus', 'rattlesnake', 'hummingbird', 'grasshopper', 'jellyfish', 'butterfly',
      'dragonfly', 'woodpecker', 'porcupine', 'armadillo', 'salamander', 'cuttlefish', 'barracuda', 'orangutan', 'wildebeest', 'tarantula',
    ],
    food: [
      'pineapple', 'watermelon', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cranberry', 'hamburger', 'milkshake', 'spaghetti',
      'cappuccino', 'croissant', 'chocolate', 'marmalade', 'pomegranate', 'artichoke', 'asparagus', 'cauliflower', 'nectarine', 'margarine',
      'marshmallow', 'gingerbread', 'shortbread',
    ],
    place: [
      'cathedral', 'monastery', 'lighthouse', 'skyscraper', 'university', 'greenhouse', 'observatory', 'continent', 'peninsula', 'waterfall',
      'amphitheater', 'boardwalk', 'campground', 'courtyard', 'marketplace', 'laboratory', 'kindergarten', 'neighborhood', 'crossroads', 'intersection',
      'planetarium',
    ],
    nature: [
      'avalanche', 'earthquake', 'hurricane', 'lightning', 'wilderness', 'evergreen', 'wildflower', 'stalactite', 'stalagmite', 'quicksand',
      'whirlpool', 'sandstorm', 'snowflake', 'moonlight', 'starlight', 'mountaintop',
    ],
    vehicle: [
      'helicopter', 'submarine', 'locomotive', 'spaceship', 'limousine', 'bulldozer', 'motorcycle', 'hovercraft', 'ambulance', 'stagecoach',
      'trolleybus',
    ],
    sport: [
      'basketball', 'badminton', 'gymnastics', 'snowboarding', 'skateboard', 'triathlon', 'tournament', 'gymnasium', 'windsurfing', 'volleyball',
      'snorkeling', 'billiards', 'bobsleigh',
    ],
    music: ['saxophone', 'orchestra', 'harmonica', 'accordion', 'xylophone', 'tambourine', 'synthesizer', 'metronome', 'euphonium'],
    job: [
      'astronaut', 'librarian', 'firefighter', 'blacksmith', 'electrician', 'veterinarian', 'translator', 'journalist', 'photographer', 'historian',
      'geologist', 'biologist', 'zoologist', 'clockmaker', 'glassblower', 'shipwright', 'carpenter', 'conductor', 'magistrate', 'accountant',
    ],
    object: [
      'television', 'microscope', 'telescope', 'typewriter', 'wheelbarrow', 'chandelier', 'paperweight', 'mousetrap', 'flashlight', 'thermometer',
      'barometer', 'wastebasket', 'hourglass', 'periscope', 'gramophone', 'corkscrew', 'nutcracker',
    ],
  },
};

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const STATUSES: GameStatus[] = ['playing', 'won', 'lost'];

/** 展平缓存（模块级只读缓存，惰性构建；纯函数语义不受影响） */
const flatCache: Record<string, WordEntry[]> = {};

/** 该难度的全部词条（类别展平；返回内部数组的引用，调用方勿改） */
export function wordList(difficulty: Difficulty): WordEntry[] {
  if (DIFFICULTIES.indexOf(difficulty) === -1) {
    throw new Error('hangman: unknown difficulty "' + String(difficulty) + '"');
  }
  if (flatCache[difficulty]) return flatCache[difficulty];
  const out: WordEntry[] = [];
  const bank = WORD_BANK[difficulty];
  for (const category in bank) {
    if (!Object.prototype.hasOwnProperty.call(bank, category)) continue;
    const words = bank[category];
    for (let i = 0; i < words.length; i++) {
      out.push({ word: words[i], category: category });
    }
  }
  flatCache[difficulty] = out;
  return out;
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 生成新局：按难度从词库抽一词（唯一随机源 createRng）。
 * 同 seed + 同难度 → 同词同类别（确定性；deserialize 恢复依赖此性质）。
 * 难度非法 / seed 非 uint32 整数 → throw。
 */
export function newGame(opts: { difficulty: Difficulty; seed?: number }): NewGameResult {
  if (opts === null || typeof opts !== 'object') {
    throw new Error('hangman: newGame requires an opts object');
  }
  if (DIFFICULTIES.indexOf(opts.difficulty) === -1) {
    throw new Error('hangman: unknown difficulty "' + String(opts.difficulty) + '"');
  }
  let seed: number;
  if (opts.seed === undefined) {
    seed = Date.now() >>> 0;
  } else {
    const s = opts.seed;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) {
      throw new Error('hangman: seed must be a uint32 integer');
    }
    seed = s;
  }
  const list = wordList(opts.difficulty);
  const entry = list[createRng(seed).int(list.length)];
  const state: GameState = {
    difficulty: opts.difficulty,
    seed: seed,
    word: entry.word,
    category: entry.category,
    guessed: '',
    wrongCount: 0,
    status: 'playing',
  };
  return { word: entry.word, category: entry.category, state };
}

// ---------------------------------------------------------------------------
// 盘面查询
// ---------------------------------------------------------------------------

/** word 各位置字母是否已被猜中（render 画下划线格；非法 word throw） */
export function revealed(word: string, guessed: string): boolean[] {
  assertWord(word);
  if (typeof guessed !== 'string' || !/^[a-z]*$/.test(guessed)) {
    throw new Error('hangman: guessed must be a lowercase a-z string');
  }
  const out = new Array<boolean>(word.length);
  for (let i = 0; i < word.length; i++) {
    out[i] = guessed.indexOf(word.charAt(i)) !== -1;
  }
  return out;
}

/** word 的全部字母是否均已被猜中（胜利判定） */
export function isRevealed(word: string, guessed: string): boolean {
  const mask = revealed(word, guessed);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 状态转移（不可变；no-op 返回原引用）
// ---------------------------------------------------------------------------

function assertWord(word: string): void {
  if (typeof word !== 'string' || !/^[a-z]{3,12}$/.test(word)) {
    throw new Error('hangman: word must be 3-12 lowercase letters, got ' + String(word));
  }
}

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('hangman: state must be a GameState object');
  }
  if (DIFFICULTIES.indexOf(state.difficulty) === -1) {
    throw new Error('hangman: unknown difficulty "' + String(state.difficulty) + '"');
  }
  if (typeof state.seed !== 'number' || !Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff) {
    throw new Error('hangman: state.seed must be a uint32 integer');
  }
  assertWord(state.word);
  if (typeof state.category !== 'string' || state.category.length === 0) {
    throw new Error('hangman: state.category must be a non-empty string');
  }
  if (typeof state.guessed !== 'string' || !/^[a-z]*$/.test(state.guessed)) {
    throw new Error('hangman: state.guessed must be a lowercase a-z string');
  }
  for (let i = 0; i < state.guessed.length; i++) {
    if (state.guessed.indexOf(state.guessed.charAt(i)) !== i) {
      throw new Error('hangman: state.guessed contains duplicate letter "' + state.guessed.charAt(i) + '"');
    }
  }
  if (typeof state.wrongCount !== 'number' || !Number.isInteger(state.wrongCount) || state.wrongCount < 0 || state.wrongCount > MAX_WRONG) {
    throw new Error('hangman: state.wrongCount must be an integer 0-' + MAX_WRONG);
  }
  if (STATUSES.indexOf(state.status) === -1) {
    throw new Error('hangman: unknown status "' + String(state.status) + '"');
  }
  // 盘面不变量：wrongCount 与 guessed 中未命中数一致；status 与盘面一致
  let misses = 0;
  for (let i = 0; i < state.guessed.length; i++) {
    if (state.word.indexOf(state.guessed.charAt(i)) === -1) misses++;
  }
  if (misses !== state.wrongCount) {
    throw new Error('hangman: state.wrongCount (' + state.wrongCount + ') does not match guessed misses (' + misses + ')');
  }
  const won = isRevealed(state.word, state.guessed);
  if (state.status === 'won' && !won) throw new Error('hangman: status is won but word is not fully revealed');
  if (state.status === 'lost' && !(state.wrongCount === MAX_WRONG && !won)) {
    throw new Error('hangman: status is lost but wrongCount < ' + MAX_WRONG + ' or word is fully revealed');
  }
  if (state.status === 'playing' && (won || state.wrongCount === MAX_WRONG)) {
    throw new Error('hangman: status is playing but game is already decided');
  }
}

/**
 * 猜一个字母。参数非法（非单个小写字母）throw（编程错误）；
 * 以下为业务 no-op（返回原引用）：终局后再猜、重复猜已猜过的字母。
 * 命中：guessed 追加；若全揭示 → status 'won'。
 * 未命中：guessed 追加 + wrongCount+1；达 MAX_WRONG → status 'lost'。
 */
export function guessLetter(state: GameState, letter: string): GameState {
  assertStateShape(state);
  if (typeof letter !== 'string' || !/^[a-z]$/.test(letter)) {
    throw new Error('hangman: letter must be a single lowercase a-z character, got ' + String(letter));
  }
  if (state.status !== 'playing') return state;
  if (state.guessed.indexOf(letter) !== -1) return state;
  const guessed = state.guessed + letter;
  const hit = state.word.indexOf(letter) !== -1;
  const wrongCount = hit ? state.wrongCount : state.wrongCount + 1;
  let status: GameStatus = 'playing';
  if (isRevealed(state.word, guessed)) {
    status = 'won';
  } else if (wrongCount >= MAX_WRONG) {
    status = 'lost';
  }
  return {
    difficulty: state.difficulty,
    seed: state.seed,
    word: state.word,
    category: state.category,
    guessed: guessed,
    wrongCount: wrongCount,
    status: status,
  };
}

// ---------------------------------------------------------------------------
// 存档序列化（不含 word/category——决策⑤；恢复时由 seed 重生成，见文件头）
// ---------------------------------------------------------------------------

/**
 * 紧凑存档字符串（`;` 分 6 段）：
 *   `hangman1;<difficulty>;<seed>;<guessed|->;<wrongCount>;<status>`
 *
 * - guessed：按猜测顺序的字母串；空时为 `-`。
 * - 不用 JSON：存档会被 storage 载荷二次 JSON.stringify，无引号转义膨胀
 *   （与 sudoku 打样同款决策，已在任务报告列明）。
 * - state 非法 throw（编程错误）；deserialize 才负责宽容。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  return (
    'hangman1;' + state.difficulty + ';' + (state.seed >>> 0) + ';' +
    (state.guessed.length > 0 ? state.guessed : '-') + ';' +
    state.wrongCount + ';' + state.status
  );
}

/**
 * 解析 serialize 产物并还原完整 GameState（word/category 由同 seed 经 newGame 重生成）。
 * 任何非法/损坏/篡改输入 → null（绝不抛）。除格式校验外，还校验盘面一致性：
 * wrongCount 必须等于 guessed 中未命中数，status 必须与揭示进度相符（防篡改档）。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 6 || segs[0] !== 'hangman1') return null;

    const difficulty = segs[1] as Difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) return null;

    if (!/^\d{1,10}$/.test(segs[2])) return null;
    const seed = Number(segs[2]);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;

    const guessed = segs[3] === '-' ? '' : segs[3];
    if (!/^[a-z]*$/.test(guessed)) return null;
    for (let i = 0; i < guessed.length; i++) {
      if (guessed.indexOf(guessed.charAt(i)) !== i) return null; // 重复字母
    }

    if (!/^[0-6]$/.test(segs[4])) return null;
    const wrongCount = Number(segs[4]);

    const status = segs[5] as GameStatus;
    if (STATUSES.indexOf(status) === -1) return null;

    // 重生成词（同 seed 确定性）+ 一致性校验（assertStateShape 内完成，异常 → null）
    const regen = newGame({ difficulty: difficulty, seed: seed });
    const state: GameState = {
      difficulty: difficulty,
      seed: seed,
      word: regen.word,
      category: regen.category,
      guessed: guessed,
      wrongCount: wrongCount,
      status: status,
    };
    assertStateShape(state); // 不一致（篡改档）会 throw → 由 catch 吞掉返回 null
    return state;
  } catch (e) {
    return null;
  }
}
