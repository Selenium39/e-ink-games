#!/usr/bin/env node
// 游戏构建管线（契约《开发规约-游戏扩展框架.md》§2.2 / §3 / §10）。
//
//   1. node:fs 扫描 src/games 下各目录的 meta.json（下划线目录一律忽略；不依赖任何打包器专有魔法）
//   2. 每游戏四件套齐全性检查（缺 → warning + 跳过，视为半成品，契约 §1）
//   3. meta.json 校验：slug 格式与目录名一致、category/engineFeatures 封闭词表、字段类型、全局唯一
//   4. esbuild 逐游戏打包 → public/games/{slug}.js（IIFE / es2015 / minify / 无 sourcemap）
//      解析到 react 依赖即 fail（契约 §1 禁令）
//   5. 产物断言：gzip ≤ 15KB；ES2016+ API 黑名单静态扫描（§10.8）；无 import/export 残留（§10.9）
//   6. 生成 src/lib/games.registry.ts（@generated 生成物，入库提交，禁手改）
//
// 用法：
//   node scripts/build-games.mjs                    # 正式管线（_template 等下划线目录不参与）
//   node scripts/build-games.mjs --include-template # 额外打包 _template 做管线验证（仍不进 registry）
//
// 无任何可构建游戏时：生成空 registry 并友好跳过（exit 0）。
// 任一断言失败：非零退出（构建期失败优于运行期出错，§0.5）。
import process from "node:process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(scriptDir, "..");
const GAMES_DIR = join(SITE_ROOT, "src", "games");
const OUT_DIR = join(SITE_ROOT, "public", "games");
const REGISTRY_FILE = join(SITE_ROOT, "src", "lib", "games.registry.ts");
const TYPES_REL_FROM_LIB = "../content/games/types"; // registry → GameMeta 类型单一来源（契约 §2.1）

const SLUG_RE = /^[a-z0-9-]+$/;
const CATEGORIES = ["puzzle", "word", "board", "logic", "daily"];
const FEATURES = ["grid", "keypad", "timer", "undo", "notes", "hints", "daily"];
const REQUIRED_FILES = ["logic.ts", "render.ts", "index.ts", "meta.json"];
const GZIP_LIMIT_BYTES = 15 * 1024;
const TEMPLATE_DIR = "_template";

const includeTemplate = process.argv.includes("--include-template");

let failed = false;
const fail = (msg) => {
  console.error("  ✗ " + msg);
  failed = true;
};
const warn = (msg) => console.warn("  ⚠ " + msg);

console.log("== games:build ==");
if (includeTemplate) console.log("(--include-template：额外打包 _template 做管线验证，不进 registry)");

// ── 1. 扫描 ─────────────────────────────────────────────────────
// 下划线目录一律忽略（契约 §1）；唯一例外：--include-template 时特批 _template 参与打包验证。
const dirs = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => (name.startsWith("_") ? includeTemplate && name === TEMPLATE_DIR : true))
  .sort();

if (dirs.length === 0) {
  console.log("ℹ src/games/ 下没有可构建的游戏目录 —— 生成空 registry，跳过打包。");
}

// ── 2/3. 四件套 + meta 校验 ─────────────────────────────────────
const metas = [];
const seenSlugs = new Set();

for (const dir of dirs) {
  console.log("\n[" + dir + "]");
  const gameDir = join(GAMES_DIR, dir);

  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(gameDir, f)));
  if (missing.length > 0) {
    warn(`${dir}/ 缺少 ${missing.join("、")} —— 视为半成品，不打包、不进 registry、不出页面（契约 §1）`);
    continue;
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(join(gameDir, "meta.json"), "utf8"));
  } catch (e) {
    fail(`meta.json 解析失败：${e.message}`);
    continue;
  }

  validateMeta(dir, meta, dir === TEMPLATE_DIR);
  // 仅收 slug 合法、与目录一致且未重复的 meta（校验失败项已在 validateMeta 中报错）
  const slugOk =
    typeof meta.slug === "string" &&
    (dir === TEMPLATE_DIR ? meta.slug === dir : SLUG_RE.test(meta.slug) && meta.slug === dir);
  if (slugOk && !seenSlugs.has(meta.slug)) {
    seenSlugs.add(meta.slug);
    metas.push(meta);
  }
}

function validateMeta(dir, meta, isTemplate) {
  // 模板（--include-template 验证路径）slug 恒为 "_template"（= 目录名），豁免正式 slug 词表：
  // 复制为新游戏时目录与 slug 一并改为合法 slug（见 _template 内注释）。
  if (typeof meta.slug !== "string" || (isTemplate ? meta.slug !== dir : !SLUG_RE.test(meta.slug))) {
    fail(`slug 非法（须匹配 ${SLUG_RE}）：${JSON.stringify(meta.slug)}`);
  } else if (meta.slug !== dir) {
    fail(`slug "${meta.slug}" 与目录名 "${dir}" 不一致（契约 §2.1）`);
  }
  if (typeof meta.title !== "string" || meta.title.length === 0) {
    fail("title 缺失或非字符串");
  }
  if (!CATEGORIES.includes(meta.category)) {
    fail(`category 非法 "${meta.category}"（封闭词表：${CATEGORIES.join("/")}）`);
  }
  if (
    !Array.isArray(meta.difficulties) ||
    meta.difficulties.length === 0 ||
    !meta.difficulties.every((d) => typeof d === "string" && d.length > 0)
  ) {
    fail('difficulties 须为非空 string[]（无难度游戏给 ["standard"]）');
  }
  if (
    !Array.isArray(meta.engineFeatures) ||
    !meta.engineFeatures.every((f) => FEATURES.includes(f))
  ) {
    fail(`engineFeatures 含未知值（封闭词表：${FEATURES.join("/")}）`);
  }
  if (typeof meta.seeded !== "boolean") {
    fail("seeded 缺失或非 boolean");
  }
  if (meta.seo !== undefined) {
    if (typeof meta.seo !== "object" || meta.seo === null || Array.isArray(meta.seo)) {
      fail("seo 若存在须为对象");
    } else if (
      meta.seo.keywordsHint !== undefined &&
      !Array.isArray(meta.seo.keywordsHint)
    ) {
      fail("seo.keywordsHint 若存在须为 string[]");
    }
  }
  if (seenSlugs.has(meta.slug)) {
    fail(`slug "${meta.slug}" 重复（全局唯一，契约 §2.2）`);
  }
}

// ── 4/5. esbuild 打包 + 产物断言 ────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

/** 禁 react（契约 §1：游戏 bundle 解析到 react 依赖即 fail） */
const banReactPlugin = {
  name: "ban-react",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path === "react" || args.path.startsWith("react/")) {
        return {
          errors: [
            {
              text: `游戏 bundle 禁止 import react（契约 §1）：${args.path}。游戏逻辑/渲染须为零 React 的 vanilla 实现。`,
            },
          ],
        };
      }
      return undefined;
    });
  },
};

// §10.8：es2015 target 只转语法不补 API——ES2016+ 内建黑名单静态扫描（minified 属性名不改写，可按属性访问匹配）
const API_BLACKLIST = [
  [/\.flat\s*\(/, "Array.prototype.flat"],
  [/\.flatMap\s*\(/, "Array.prototype.flatMap"],
  [/\.replaceAll\s*\(/, "String.prototype.replaceAll"],
  [/\.padStart\s*\(/, "String.prototype.padStart"],
  [/\.padEnd\s*\(/, "String.prototype.padEnd"],
  [/\.trimStart\s*\(/, "String.prototype.trimStart"],
  [/\.trimEnd\s*\(/, "String.prototype.trimEnd"],
  [/\.at\s*\(/, "String/Array.prototype.at"],
  [/Object\.fromEntries\b/, "Object.fromEntries"],
  [/Object\.entries\b/, "Object.entries"],
  [/Object\.values\b/, "Object.values"],
  [/\bglobalThis\b/, "globalThis"],
  [/\bstructuredClone\b/, "structuredClone"],
  [/Promise\.allSettled\b/, "Promise.allSettled"],
  [/Promise\.any\b/, "Promise.any"],
  [/\.animate\s*\(/, "Element.animate"],
  [/\bPointerEvent\b/, "PointerEvent"],
  [/\bonpointer(?:down|up|move|over|enter|out|leave|cancel)\b/, "Pointer Events 属性"],
  [/\.closest\s*\(/, "Element.closest"],
  [/\.replaceWith\s*\(/, "Element.replaceWith"],
  [/\.after\s*\(/, "Element.after"],
  [/\.before\s*\(/, "Element.before"],
  [/\.append\s*\(/, "ParentNode.append（请用 appendChild）"],
  [/\.prepend\s*\(/, "ParentNode.prepend"],
];

const rows = [];

for (const meta of metas) {
  const slug = meta.slug;
  const outfile = join(OUT_DIR, slug + ".js");
  try {
    await build({
      entryPoints: [join(GAMES_DIR, slug, "index.ts")],
      outfile,
      bundle: true,
      minify: true,
      sourcemap: false,
      format: "iife",
      target: ["es2015"],
      legalComments: "none",
      logLevel: "silent",
      plugins: [banReactPlugin],
    });
  } catch (e) {
    const text =
      e && e.errors ? e.errors.map((x) => x.text).join("; ") : e && e.message ? e.message : String(e);
    fail(`${slug}: esbuild 打包失败 —— ${text}`);
    continue;
  }

  // 幂等 guard（客户端路由修复配套，2026-09）：慢网直开时 SSR defer script
  // 与 GameShell useEffect 补注入的 async script 可能双到达执行。bundle 顶层
  // 以 window.EGames[slug] 已注册为标记拦截二次执行——防 MutationObserver
  // 累积挂载（boot 每次执行都会 new 一个、永不 disconnect）与 mount 双开局。
  // 特性检测失败的老浏览器路径不受影响：注册发生在检测之后，guard 不拦，
  // 二次执行只是幂等地重写一次降级文案。ES5 兼容，gzip 约 +40B。
  const iife = readFileSync(outfile, "utf8");
  const code = `!function(){var g=window.EGames;if(g&&g[${JSON.stringify(slug)}])return;${iife}}()`;
  writeFileSync(outfile, code);

  const gz = gzipSync(Buffer.from(code, "utf8"), { level: 9 });

  if (gz.length > GZIP_LIMIT_BYTES) {
    fail(
      `${slug}: gzip ${(gz.length / 1024).toFixed(2)}KB 超出 15KB 预算（契约 §3.5）`,
    );
  }

  // §10.9：普通 <script defer> IIFE，不得残留 import/export
  if (/^\s*(import|export)[\s{"'*]/m.test(code) || /\bexport\s*\{/.test(code)) {
    fail(`${slug}: 产物含 import/export 残留（IIFE 契约 §3.1）`);
  }

  for (const [re, label] of API_BLACKLIST) {
    if (re.test(code)) {
      fail(`${slug}: 产物命中 ES2016+ API 黑名单 —— ${label}（契约 §10.8，target es2015 不补 API）`);
    }
  }

  rows.push({ slug, raw: code.length, gz: gz.length });
}

// ── 尺寸表 ──────────────────────────────────────────────────────
if (rows.length > 0) {
  console.log("\n== 产物尺寸（gzip level 9） ==");
  for (const r of rows) {
    console.log(
      `  ${r.slug.padEnd(24)} raw ${(r.raw / 1024).toFixed(2).padStart(8)} KB   gzip ${(r.gz / 1024).toFixed(2).padStart(8)} KB / 15.00 KB`,
    );
  }
}

// ── 6. 生成 registry（契约 §2.2：生成物，禁手改）────────────────
// registry 只承载正式游戏（排除 _template 等下划线目录）；类型从
// src/content/games/types.ts import（契约 §2.1 的类型单一来源）。
const registryGames = metas.filter((m) => !m.slug.startsWith("_"));

const registrySource = `// @generated by scripts/build-games.mjs — DO NOT EDIT
// 数据源：src/games/*/meta.json（下划线目录忽略）。新增游戏零登记——
// 填好 meta.json 后重跑 npm run build:games 即自动更新本文件（契约 §2.2 / §9）。
// 路由、分类页、sitemap、OG 图、每日聚合的 generateStaticParams 全部 import 本文件。
import type { GameCategory, GameMeta } from "${TYPES_REL_FROM_LIB}";

/** 按 slug 字母序（构建期已排序） */
export const GAMES: readonly GameMeta[] = ${JSON.stringify(registryGames, null, 2)};

export function getGames(): readonly GameMeta[] {
  return GAMES;
}

export function getGame(slug: string): GameMeta | undefined {
  for (let i = 0; i < GAMES.length; i++) {
    if (GAMES[i].slug === slug) return GAMES[i];
  }
  return undefined;
}

const CATEGORY_ORDER: readonly GameCategory[] = ${JSON.stringify(CATEGORIES)};

/** 分类 → 游戏（键恒齐全、组内按 slug 字母序；空分类为数组，分类页路由可直接遍历） */
export function getGamesByCategory(): Record<GameCategory, GameMeta[]> {
  const out = {} as Record<GameCategory, GameMeta[]>;
  for (let i = 0; i < CATEGORY_ORDER.length; i++) out[CATEGORY_ORDER[i]] = [];
  for (let i = 0; i < GAMES.length; i++) {
    const g = GAMES[i];
    (out[g.category] || (out[g.category] = [])).push(g);
  }
  return out;
}
`;

writeFileSync(REGISTRY_FILE, registrySource);
console.log("\n✓ 已生成 " + REGISTRY_FILE.replace(SITE_ROOT + "/", "") + `（${registryGames.length} 个游戏）`);

if (failed) {
  console.error("\n✗ games:build 失败（构建期失败优于运行期出错，契约 §0.5）");
  process.exit(1);
}
console.log("\n✓ games:build 完成");
