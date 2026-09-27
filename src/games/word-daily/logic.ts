/**
 * word-daily/logic — 每日猜词纯函数逻辑层（契约见仓库根《开发规约-游戏扩展框架.md》§5）。
 *
 * - 零 DOM、零 React、零第三方依赖；唯一 import 为 `_engine/rng`（§5.1）。
 * - 所有状态转移不可变：返回新 state、不改入参；no-op 时返回**原引用**（render diff 依据）。
 * - 每日模式确定性：seed = seedFromDate(UTC 日期) → 答案 = ANSWERS[createRng(seed).int(N)]。
 *   同一天全设备同一词（产品核心卖点）。⚠ ANSWERS 表内容上线即冻结：增删词会改变
 *   seed→答案映射，破坏进行中的当日对局与已发出的分享串（见任务报告「遗留风险」）。
 * - 答案不入存档（契约决策⑤）：answer 恒由 seed 确定性重推导（answerOf）。
 * - 语法 ES2015 以内；API 仅 ES2015 白名单（includes/replaceAll/padStart 等禁用，
 *   见规约 §10.8 黑名单与 build-games.mjs 静态扫描）。
 */

import { createRng, seedFromDate } from '../_engine/rng';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** 反馈三态：0=不在词内（细边框）、1=在词内位置错（粗边框）、2=位置正确（黑底反转） */
export type Mark = 0 | 1 | 2;

export type GameMode = 'daily' | 'practice';
export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  mode: GameMode;
  /** 每日模式的 UTC 日期 'YYYY-MM-DD'（存档 key 与分享串题号）；practice 恒 null */
  day: string | null;
  /** uint32 种子；answer 的唯一决定因素（决策⑤：不落盘） */
  seed: number;
  /** 已提交猜测（每项均为合法 5 字母词，无重复），长度 ≤ 6 */
  guesses: string[];
  status: GameStatus;
}

export interface NewGameResult {
  /** 本局答案（仅内存持有；不入存档） */
  answer: string;
  state: GameState;
}

// ---------------------------------------------------------------------------
// 词库（内嵌常量；答案表上线即冻结，见文件头）
//
// 载体：逗号分隔单字符串（无引号数组，产物省字节；split(',') 为 ES3 API）。
// ANSWERS：1491 个高频 5 字母词（按词频人工筛选；段内字母序，相邻前缀对 gzip 友好）。
// EXTRA：135 个可猜但不作答案的词（规则变形 cards/reads… 与次高频词 cycle/bored…）。
// 完整性由 logic.test.ts 永久把关：全 5 字母、全 [a-z]、字母序（即无重复）、两表无交集。
// ---------------------------------------------------------------------------

const ANSWERS_RAW =
  'abide,about,above,abuse,actor,acute,adapt,admit,adobe,adopt,adult,after,again,agent,agree,ahead,' +
  'aisle,alarm,album,alert,alike,alive,allow,alone,along,aloud,alpha,altar,alter,amaze,amber,among,' +
  'ample,amuse,angel,anger,angle,angry,ankle,annex,annoy,anvil,apart,apple,apply,arena,argue,arise,' +
  'armor,aroma,array,arrow,aside,asset,audio,audit,avoid,await,awake,award,aware,awful,' +
  'bacon,badge,bagel,baker,basic,basil,basin,batch,beach,beard,beast,began,begin,being,belly,below,' +
  'bench,berry,birth,black,blade,blame,bland,blank,blast,blaze,bleak,blend,bless,blind,blink,bliss,' +
  'block,blond,blood,bloom,blunt,blush,board,boast,bonus,boost,booth,brace,braid,brain,brake,brand,' +
  'brash,brass,brave,bravo,bread,break,breed,brick,bride,brief,bring,brisk,broad,broke,brood,brook,' +
  'broom,brown,brush,buddy,build,built,bulky,bully,bunch,burly,burnt,burst,buyer,' +
  'cabin,cable,camel,canal,candy,canoe,cargo,carol,carry,carve,catch,cause,cease,cello,chair,chalk,' +
  'charm,chart,chase,cheek,cheer,chess,chest,chick,chief,child,chili,chill,chime,choir,chord,chore,' +
  'chunk,cider,cigar,civic,civil,claim,clamp,clash,clasp,class,clean,clear,clerk,click,cliff,climb,' +
  'cling,cloak,clock,clone,close,cloth,cloud,clown,clump,coach,coast,cobra,cocoa,colon,color,comet,' +
  'comic,comma,condo,coral,couch,cough,could,count,court,cover,crack,craft,crane,crank,crash,crate,' +
  'crawl,crazy,cream,creed,creek,creep,crest,crime,crisp,crown,crude,cruel,crumb,crush,crust,cubic,' +
  'curly,curse,curve,' +
  'daddy,daily,dairy,daisy,dance,dealt,debut,decay,decor,delay,delta,demon,denim,dense,depth,derby,' +
  'devil,diary,digit,diner,dirty,disco,ditch,diver,dizzy,dodge,doing,dolly,donor,donut,dough,dozen,' +
  'draft,drain,drama,drank,drape,drawn,dread,dream,dress,drier,drift,drill,drink,drive,drone,drool,' +
  'droop,drove,drown,drunk,dryer,dusty,dwarf,dwell,dying,' +
  'eager,eagle,early,earth,easel,eaten,eater,eight,eject,elbow,elder,elect,elite,email,embed,ember,' +
  'empty,enact,endow,enemy,enjoy,entry,epoxy,equal,equip,erase,erect,erode,error,erupt,essay,evade,' +
  'event,every,evict,evoke,exact,excel,exert,exile,exist,expel,extra,' +
  'fable,facet,faint,fairy,faith,false,fancy,fatal,fault,fauna,feast,fence,ferry,fetch,fever,fewer,' +
  'fiber,field,fiend,fiery,fifth,fifty,fight,filth,final,finch,first,fishy,fizzy,flame,flank,flare,' +
  'flash,flask,fleet,flesh,flick,flier,fling,flint,flirt,float,flock,flood,floor,flora,floss,flour,' +
  'flown,fluff,fluid,fluke,flung,flush,flute,foamy,focal,focus,foggy,folly,foray,force,forge,forgo,' +
  'forth,forty,forum,found,foyer,frail,frame,frank,fraud,freak,fresh,front,frost,froth,frown,froze,' +
  'fruit,fudge,fully,fungi,funky,funny,fussy,fuzzy,' +
  'gauge,gaunt,gauze,gavel,gecko,geese,genie,genre,ghost,ghoul,giant,giddy,given,giver,glade,gland,' +
  'glare,glass,glaze,gleam,glide,glint,gloat,globe,gloom,glory,gloss,glove,going,goner,gooey,goofy,' +
  'goose,gorge,gouge,grade,graft,grand,grant,grape,graph,grasp,grass,grate,grave,gravy,graze,great,' +
  'greed,green,greet,grief,grill,grime,grimy,grind,gripe,groan,groom,grope,gross,group,grove,growl,' +
  'grown,gruff,grunt,guard,guava,guess,guest,guide,guild,guilt,guise,' +
  'habit,hairy,handy,happy,hardy,harsh,haste,hasty,hatch,haunt,haven,havoc,hazel,heard,heart,heave,' +
  'heavy,hedge,hefty,hello,hence,heron,hilly,hinge,hippo,hitch,holly,honey,honor,horde,horse,hotel,' +
  'hound,house,hover,human,humid,humor,hunch,hurry,husky,hutch,hyena,' +
  'icing,ideal,idiom,idiot,igloo,image,imply,incur,index,inept,inert,infer,inlet,inner,input,irate,' +
  'irony,issue,itchy,ivory,' +
  'jelly,jewel,jiffy,joint,joker,jolly,judge,juice,juicy,jumbo,jumpy,juror,' +
  'kayak,kebab,khaki,kiosk,kitty,knack,knead,kneel,knelt,knife,knock,known,koala,' +
  'label,labor,laden,ladle,lager,lance,lapel,lapse,large,larva,lasso,latch,later,latex,lathe,laugh,' +
  'layer,leapt,learn,lease,leash,least,leave,ledge,leech,legal,lemon,lemur,level,lever,light,' +
  'liken,limbo,limit,linen,liner,lingo,liter,liver,livid,llama,lobby,local,lodge,lofty,logic,login,' +
  'loose,lorry,loser,lotus,louse,lousy,lower,loyal,lucid,lucky,lunar,lunch,lunge,lusty,lyric,' +
  'madam,madly,mafia,magic,magma,maize,major,maker,mambo,mango,mangy,mania,manic,manor,maple,march,' +
  'marry,marsh,mason,match,maxim,maybe,mayor,meant,meaty,medal,media,medic,melee,melon,mercy,merge,' +
  'merit,merry,metal,meter,metro,midst,might,milky,mimic,mince,miner,minor,minus,moist,molar,moldy,' +
  'money,month,moody,moose,moral,motel,motif,motor,motto,mound,mount,mourn,mouse,mouth,mover,movie,' +
  'mower,muddy,mummy,munch,mural,murky,mushy,music,musty,' +
  'naive,nanny,nasal,nasty,natal,naval,navel,needy,nerve,never,newer,newly,nicer,niche,niece,night,' +
  'ninja,ninth,noble,nobly,noise,noisy,nomad,noose,north,notch,novel,nudge,nurse,nutty,nylon,' +
  'oasis,occur,ocean,often,olive,omega,onion,onset,opera,optic,orbit,order,organ,other,otter,ought,' +
  'ounce,outer,overt,owing,owner,oxide,ozone,' +
  'pagan,paint,panda,panel,panic,pants,paper,parka,parse,party,pasta,paste,pasty,patch,patio,patty,' +
  'pause,peace,peach,pearl,pecan,pedal,penny,peony,perch,peril,perky,pesky,petal,petty,phase,phone,' +
  'phony,photo,piano,picky,piece,piety,piggy,pilot,pinch,pitch,pithy,pivot,pixel,pixie,pizza,place,' +
  'plaid,plain,plait,plane,plank,plant,plate,plaza,plead,pleat,pluck,plumb,plume,plump,plush,point,' +
  'poise,poker,polar,polka,poppy,porch,pouch,pound,power,prank,prawn,press,price,prick,pride,prime,' +
  'print,prior,prism,prize,probe,prone,prong,proof,prose,proud,prove,prowl,proxy,prune,psalm,pulse,' +
  'punch,pupil,puppy,purge,purse,putty,pylon,' +
  'quack,quake,quart,queen,queer,quell,query,quest,queue,quick,quiet,quill,quilt,quirk,quite,quota,' +
  'quote,' +
  'radar,radio,rainy,raise,rally,ranch,range,rapid,raspy,ratio,ratty,raven,reach,react,ready,realm,' +
  'rebel,refer,regal,reign,relax,relay,relic,remit,repay,repel,reply,rerun,reset,resin,retry,reuse,' +
  'rhino,rhyme,rider,ridge,rifle,right,rigid,rinse,ripen,risen,riser,risky,rival,river,rivet,roach,' +
  'roast,robin,robot,rocky,rodeo,rogue,roomy,roost,rotor,rouge,rough,round,rouse,route,rover,rowdy,' +
  'royal,ruddy,rugby,ruler,rumor,runny,rural,rusty,' +
  'salad,salty,salvo,sandy,satin,sauce,saucy,sauna,savor,savvy,scald,scale,scalp,scaly,scamp,scant,' +
  'scare,scarf,scary,scene,scent,scoff,scold,scone,scoop,scoot,scope,score,scorn,scour,scout,scowl,' +
  'scrap,screw,scrub,scuba,sedan,seedy,seize,sense,serum,serve,setup,seven,sever,sewer,shack,shade,' +
  'shady,shaft,shake,shaky,shale,shall,shame,shank,shape,shard,share,shark,sharp,shave,shawl,shear,' +
  'sheen,sheep,sheer,sheet,shelf,shell,shift,shine,shiny,shirt,shock,shone,shook,shoot,shore,short,' +
  'shout,shove,shown,showy,shred,shrew,shrub,shrug,sight,silly,since,siren,sixth,sixty,skate,skier,' +
  'skiff,skill,skirt,skull,skunk,slack,slain,slang,slant,slash,slate,slave,sleek,sleep,sleet,slept,' +
  'slice,slick,slide,slime,slimy,sling,slink,slope,sloth,slump,slung,slunk,slurp,slush,smack,small,' +
  'smart,smash,smear,smell,smelt,smile,smirk,smoke,smoky,snack,snail,snake,snaky,snare,snarl,sneak,' +
  'sneer,sniff,snore,snort,snout,snowy,snuck,snuff,soapy,sober,soggy,solar,solid,solve,sonar,sorry,' +
  'sound,south,space,spade,spare,spark,spasm,spawn,speak,spear,speck,speed,spell,spend,spent,spice,' +
  'spicy,spike,spill,spine,spiny,spire,spite,splat,split,spoil,spoke,spoof,spook,spool,spoon,spore,' +
  'sport,spout,spray,spree,squad,squat,stack,staff,stage,stain,stair,stake,stale,stalk,stall,stamp,' +
  'stand,stank,stare,stark,start,stash,state,steak,steal,steam,steel,steep,steer,stern,stick,stiff,' +
  'still,stilt,sting,stink,stint,stock,stole,stomp,stone,stony,stood,stool,stoop,store,stork,storm,' +
  'story,stout,stove,strap,straw,stray,strip,strut,stuck,study,stuff,stump,stung,stunk,stunt,sugar,' +
  'sulky,sunny,super,surge,surly,sushi,swamp,swarm,sweat,sweep,sweet,swell,swept,swift,swine,swing,' +
  'swirl,swoop,sword,swore,sworn,swung,syrup,' +
  'tabby,table,taboo,tacit,tacky,taffy,taint,taken,tally,talon,tango,tangy,taper,tardy,tarot,taste,' +
  'tasty,taunt,teach,teary,tease,teddy,teeth,tempo,tenet,tenor,tense,tenth,terse,thank,theft,their,' +
  'theme,there,these,thick,thief,thigh,thing,think,third,thong,thorn,those,three,threw,throb,throw,' +
  'thumb,thump,thyme,tiara,tidal,tiger,tight,timer,timid,tipsy,titan,title,toast,today,token,tonal,' +
  'tonic,tooth,topaz,topic,torch,torso,total,totem,touch,tough,towel,tower,toxic,toxin,trace,track,' +
  'tract,trade,trail,train,trait,tramp,trash,tread,treat,trend,triad,trial,tribe,trick,tried,tries,' +
  'troll,troop,trope,trout,truce,truck,truly,trunk,truss,trust,truth,tulip,tumor,tunic,turbo,tutor,' +
  'tweak,tweed,tweet,twice,twine,twirl,twist,tying,' +
  'ultra,uncle,under,undid,undue,unfit,unify,union,unite,unity,until,unzip,upper,upset,urban,usage,' +
  'usher,usual,utter,' +
  'vague,valet,valid,valor,value,valve,vapor,vault,vegan,venom,venue,verge,verse,video,vigil,vigor,' +
  'villa,vinyl,viola,viper,viral,virus,visit,visor,vista,vital,vivid,vocal,vodka,vogue,voice,vowel,' +
  'vying,' +
  'wacky,wafer,wager,wagon,waist,waive,waltz,waste,watch,water,weary,weave,wedge,weigh,weird,whack,' +
  'whale,wharf,wheat,wheel,where,which,whiff,while,whine,whiny,whirl,whisk,white,whole,whoop,whose,' +
  'widen,wider,wield,wince,winch,windy,wiser,wispy,witch,witty,woken,woman,women,woody,wordy,world,' +
  'worry,worse,worst,worth,would,wound,woven,wring,write,wrung,wryly,' +
  'yacht,yearn,yeast,yield,young,yours,youth,yummy,' +
  'zebra,zesty,zonal';

const EXTRA_RAW =
  'acted,added,aging,asked,baked,balls,banks,based,bikes,birds,bored,boxed,boxes,cards,cheap,check,' +
  'chose,cross,crowd,cycle,deals,death,dined,doubt,ended,enter,faces,facts,fears,feels,filed,files,' +
  'finds,fixed,forms,games,gives,goods,hands,heads,hears,helps,hints,holds,hopes,hours,ideas,joins,' +
  'keeps,kills,kinds,lands,leads,lifts,liked,lines,links,lived,lives,loads,looks,loved,makes,marks,' +
  'means,meets,minds,mixed,moved,needs,noted,offer,opens,pages,parks,parts,paths,picks,plans,plays,' +
  'pools,posts,pulls,reads,rests,rides,rises,risks,roads,rolls,rooms,roots,rules,saves,sells,sends,' +
  'shops,sides,signs,sites,sorts,stays,steps,stops,suits,takes,talks,tasks,teams,tears,tends,terms,' +
  'tests,times,tired,tools,tours,trips,tubes,turns,views,votes,waits,walks,walls,wants,warns,wears,' +
  'weeks,winds,wires,words,works,wrote,years';

/** 答案表（字母序）。答案选择的唯一数据源——内容冻结（见文件头）。 */
export const ANSWERS: string[] = ANSWERS_RAW.split(',');

const EXTRA: string[] = EXTRA_RAW.split(',');

/** 合法猜测字典：ANSWERS ∪ EXTRA（普通对象 + null 原型，不用 Map/Set——§10.8 保守化） */
const VALID: Record<string, boolean> = Object.create(null);
for (let i = 0; i < ANSWERS.length; i++) VALID[ANSWERS[i]] = true;
for (let i = 0; i < EXTRA.length; i++) VALID[EXTRA[i]] = true;

// ---------------------------------------------------------------------------
// 日期与答案推导
// ---------------------------------------------------------------------------

/** UTC 日期 → 'YYYY-MM-DD'（与 seedFromDate 的 UTC 口径一致） */
export function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

function assertSeed(seed: number, who: string): void {
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('word-daily: ' + who + ' seed must be a uint32 integer, got ' + String(seed));
  }
}

/** seed → 答案（唯一映射；同 seed 恒同词） */
function answerForSeed(seed: number): string {
  return ANSWERS[createRng(seed).int(ANSWERS.length)];
}

/** 由 state.seed 确定性重推导答案（存档恢复路径；决策⑤：答案永不落盘） */
export function answerOf(state: GameState): string {
  assertStateShape(state);
  return answerForSeed(state.seed);
}

// ---------------------------------------------------------------------------
// newGame
// ---------------------------------------------------------------------------

/**
 * 每日局：seedFromDate(UTC 日期) 驱动——同一天全设备同一词（确定性核心）。
 * date 非法（Invalid Date）throw。
 */
export function newDailyGame(date: Date): NewGameResult {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('word-daily: newDailyGame requires a valid Date');
  }
  const day = isoDay(date);
  const seed = seedFromDate(date);
  const state: GameState = { mode: 'daily', day, seed, guesses: [], status: 'playing' };
  return { answer: answerForSeed(seed), state };
}

/**
 * 练习局：随机种子（无 seed 时由 Date.now 混合派生——禁裸 Math.random，§10.6）。
 * 同一毫秒内连开两局也不同词（t 与两个乘法散列异或）。
 */
export function newPracticeGame(seed?: number): NewGameResult {
  let s: number;
  if (seed === undefined) {
    const t = Date.now();
    s = (t ^ Math.imul(t >>> 13, 0x85ebca6b) ^ Math.imul(t >>> 7, 0xc2b2ae35)) >>> 0;
  } else {
    assertSeed(seed, 'newPracticeGame');
    s = seed;
  }
  const state: GameState = { mode: 'practice', day: null, seed: s, guesses: [], status: 'playing' };
  return { answer: answerForSeed(s), state };
}

// ---------------------------------------------------------------------------
// 反馈（经典两遍算法：位置匹配优先，剩余字母按计数消耗——不得多记）
// ---------------------------------------------------------------------------

function assertWordShape(w: string, who: string): void {
  if (typeof w !== 'string' || !/^[a-z]{5}$/.test(w)) {
    throw new Error(
      'word-daily: ' + who + ' must be 5 lowercase letters, got ' + JSON.stringify(w),
    );
  }
}

/**
 * 猜测反馈。第一遍标 guess[i]===answer[i]（Mark 2），并对 answer 中未匹配字母计数；
 * 第二遍其余位置按剩余计数消耗给 Mark 1（用尽则 0）。重复字母不多记。
 * guess/answer 形状非法（非 5 小写字母）throw（编程错误契约）。
 */
export function grade(guess: string, answer: string): Mark[] {
  assertWordShape(guess, 'grade guess');
  assertWordShape(answer, 'grade answer');
  const marks: Mark[] = [0, 0, 0, 0, 0];
  const counts = new Array<number>(26).fill(0);
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess.charCodeAt(i) === answer.charCodeAt(i)) {
      marks[i] = 2;
    } else {
      counts[answer.charCodeAt(i) - 97]++;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (marks[i] === 2) continue;
    const ci = guess.charCodeAt(i) - 97;
    if (counts[ci] > 0) {
      marks[i] = 1;
      counts[ci]--;
    }
  }
  return marks;
}

/** 已提交各行的反馈矩阵（row = guesses 下标）。 */
export function marksOf(state: GameState): Mark[][] {
  assertStateShape(state);
  const answer = answerForSeed(state.seed);
  const out: Mark[][] = [];
  for (let i = 0; i < state.guesses.length; i++) {
    out.push(grade(state.guesses[i], answer));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 猜测校验与提交
// ---------------------------------------------------------------------------

/** 5 字母且在合法猜测字典（ANSWERS ∪ EXTRA）内。非 string 一律 false，不 throw。 */
export function isValidGuess(word: string): boolean {
  return typeof word === 'string' && VALID[word] === true;
}

function assertStateShape(state: GameState): void {
  if (state === null || typeof state !== 'object') {
    throw new Error('word-daily: state must be a GameState object');
  }
  if (state.mode !== 'daily' && state.mode !== 'practice') {
    throw new Error('word-daily: unknown mode "' + String(state.mode) + '"');
  }
  if (state.status !== 'playing' && state.status !== 'won' && state.status !== 'lost') {
    throw new Error('word-daily: unknown status "' + String(state.status) + '"');
  }
  if (state.mode === 'daily' && typeof state.day !== 'string') {
    throw new Error('word-daily: daily state requires a string day');
  }
  if (state.mode === 'practice' && state.day !== null) {
    throw new Error('word-daily: practice state requires day === null');
  }
  assertSeed(state.seed, 'state');
  if (!Array.isArray(state.guesses) || state.guesses.length > MAX_GUESSES) {
    throw new Error(
      'word-daily: state.guesses must be an array of at most ' + MAX_GUESSES + ' entries',
    );
  }
}

/**
 * 提交猜测。词非法（非 5 字母/不在字典）throw——render 层须先过 isValidGuess；
 * 已终局为 no-op（返回原引用）。第 6 次未中 → lost；命中 → won。
 */
export function submitGuess(state: GameState, word: string): GameState {
  assertStateShape(state);
  assertWordShape(word, 'submitGuess word');
  if (!isValidGuess(word)) {
    throw new Error('word-daily: guess "' + word + '" is not in the word list');
  }
  if (state.status !== 'playing') return state;
  if (state.guesses.length >= MAX_GUESSES) return state; // 双保险（正常路径不可达）
  const answer = answerForSeed(state.seed);
  const guesses = state.guesses.slice();
  guesses.push(word);
  const won = word === answer;
  const lost = !won && guesses.length >= MAX_GUESSES;
  return {
    mode: state.mode,
    day: state.day,
    seed: state.seed,
    guesses,
    status: won ? 'won' : lost ? 'lost' : 'playing',
  };
}

/**
 * 屏幕键盘三态历史：correct > present > absent，已取得的更高状态不被低状态覆盖。
 */
export function keyStates(state: GameState): Record<string, Mark> {
  assertStateShape(state);
  const answer = answerForSeed(state.seed);
  const best: Record<string, Mark> = {};
  for (let g = 0; g < state.guesses.length; g++) {
    const marks = grade(state.guesses[g], answer);
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = state.guesses[g].charAt(i);
      const prev = best[ch];
      if (prev === undefined || marks[i] > prev) best[ch] = marks[i];
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 存档序列化（紧凑 6 段：`wd1;<d|p>;<day|->;<seed>;<p|w|l>;<g1,g2,…>`）
// ---------------------------------------------------------------------------

function isValidDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return y >= 1970 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/**
 * 紧凑存档串（不含答案——决策⑤；答案由 seed 重推导）。抛错条件同 assertStateShape
 * （编程错误）；deserialize 才负责宽容。guesses 间用 `,` 连接（词内无逗号，免转义）。
 */
export function serialize(state: GameState): string {
  assertStateShape(state);
  for (let i = 0; i < state.guesses.length; i++) {
    assertWordShape(state.guesses[i], 'serialize guess');
  }
  if (state.mode === 'daily' && !isValidDay(state.day as string)) {
    throw new Error('word-daily: serialize got invalid day ' + JSON.stringify(state.day));
  }
  const day = state.day === null ? '-' : state.day;
  return (
    'wd1;' + state.mode.charAt(0) + ';' + day + ';' + (state.seed >>> 0) + ';' +
    state.status.charAt(0) + ';' + state.guesses.join(',')
  );
}

/**
 * 解析 serialize 产物；任何非法/损坏/缺字段输入 → null（绝不抛）。
 * 额外做终局自洽校验（防伪造档）：won ⇒ 末猜=答案；lost ⇒ 恰 6 猜且末猜≠答案；
 * playing ⇒ ≤5 猜且末猜≠答案。重复猜测亦非法（提交路径不可能产生）。
 */
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string') return null;
    const segs = raw.split(';');
    if (segs.length !== 6 || segs[0] !== 'wd1') return null;

    let mode: GameMode;
    if (segs[1] === 'd') mode = 'daily';
    else if (segs[1] === 'p') mode = 'practice';
    else return null;

    let day: string | null;
    if (segs[2] === '-') {
      day = null;
      if (mode === 'daily') return null;
    } else {
      if (mode !== 'daily' || !isValidDay(segs[2])) return null;
      day = segs[2];
    }

    if (!/^\d{1,10}$/.test(segs[3])) return null;
    const seed = Number(segs[3]);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;

    let status: GameStatus;
    if (segs[4] === 'p') status = 'playing';
    else if (segs[4] === 'w') status = 'won';
    else if (segs[4] === 'l') status = 'lost';
    else return null;

    const guesses: string[] = [];
    if (segs[5] !== '') {
      const parts = segs[5].split(',');
      if (parts.length > MAX_GUESSES) return null;
      for (let i = 0; i < parts.length; i++) {
        if (!/^[a-z]{5}$/.test(parts[i])) return null;
        if (!isValidGuess(parts[i])) return null; // 存档词必须在字典内
        for (let j = 0; j < guesses.length; j++) {
          if (guesses[j] === parts[i]) return null; // 重复猜测非法
        }
        guesses.push(parts[i]);
      }
    }

    // 终局自洽：以 seed 重推导答案核对
    const answer = answerForSeed(seed);
    const last = guesses.length > 0 ? guesses[guesses.length - 1] : '';
    if (status === 'won') {
      if (guesses.length < 1 || last !== answer) return null;
    } else if (status === 'lost') {
      if (guesses.length !== MAX_GUESSES || last === answer) return null;
    } else {
      if (guesses.length >= MAX_GUESSES) return null; // 第 6 猜必终局
      if (guesses.length > 0 && last === answer) return null; // 命中即 won
    }

    return { mode, day, seed, guesses, status };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 分享串（纯文本；■=位置对 ▣=字母对位置错 □=不在词内；长按选中复制，无 clipboard API）
// ---------------------------------------------------------------------------

/** 结算分享串。playing 状态调用 throw（编程错误——仅终局展示）。 */
export function shareText(state: GameState): string {
  assertStateShape(state);
  if (state.status === 'playing') {
    throw new Error('word-daily: shareText requires a finished game');
  }
  const score = state.status === 'won' ? String(state.guesses.length) : 'X';
  const head =
    state.mode === 'daily'
      ? 'Word Daily #' + state.day + ' ' + score + '/' + MAX_GUESSES
      : 'Word Daily (practice) ' + score + '/' + MAX_GUESSES;
  const answer = answerForSeed(state.seed);
  const lines: string[] = [];
  for (let g = 0; g < state.guesses.length; g++) {
    const marks = grade(state.guesses[g], answer);
    let line = '';
    for (let i = 0; i < WORD_LENGTH; i++) {
      line += marks[i] === 2 ? '■' : marks[i] === 1 ? '▣' : '□';
    }
    lines.push(line);
  }
  return head + '\n\n' + lines.join('\n');
}
