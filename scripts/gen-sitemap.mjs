#!/usr/bin/env node
// sitemap 生成（实施方案 §6.2 验收：priority 分层 × hreflang alternates）。
//
//   1. esbuild 短暂转译 src/lib/games.registry.ts + src/lib/i18n/config.ts 后动态
//      import——registry 与 ENABLED_LOCALES 保持单一事实来源，脚本零手工游戏/语言清单
//   2. 深度扫描 out/**/index.html 得到全部可索引页面（分类页 /category/{cat}/、
//      guides 页上线后 next build 产出目录，本脚本即自动收录，无需改这里）
//   3. priority 分层：首页 1.0 / 游戏页 0.9 / 分类 0.8 / guides 0.7 / 其他（about）0.5；
//      当前无页面的类别天然不出 URL（out/ 里没有目录）
//   4. 每 URL 输出 hreflang xhtml:link alternates（语言集合 = ENABLED_LOCALES，
//      x-default → /en/ 同路径）——与 <head> 通道 src/lib/seo.ts#alternatesFor 双通道一致
//   5. 断言：registry × ENABLED_LOCALES 的游戏页与首页全部收录（漏生成即构建失败）；
//      根跳转页（meta refresh）与 404 不收录
//   6. 写 out/sitemap.xml（next build 之后运行，见 package.json build 链）
//
// lastmod 刻意省略：无可信时间源，Google 对不可靠 lastmod 的处理是忽略。
import process from "node:process";
import { readdirSync, rmSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(scriptDir, "..");
const OUT_DIR = join(SITE_ROOT, "out");

// ── 1. 加载 TS 单一事实来源（registry + i18n config）────────────
async function loadTsModule(relPath) {
  const tmp = mkdtempSync(join(tmpdir(), "eg-seo-"));
  const outfile = join(tmp, "mod.mjs");
  try {
    await esbuild({
      entryPoints: [join(SITE_ROOT, relPath)],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      logLevel: "silent",
    });
    const mod = await import(pathToFileURL(outfile).href);
    return mod;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const registry = await loadTsModule("src/lib/games.registry.ts");
const i18n = await loadTsModule("src/lib/i18n/config.ts");

const GAMES = registry.GAMES;
const ENABLED_LOCALES = i18n.ENABLED_LOCALES;
const DEFAULT_LOCALE = i18n.DEFAULT_LOCALE;
const SITE_URL = i18n.SITE_URL;
const CATEGORIES = Object.keys(registry.getGamesByCategory()); // 封闭词表顺序

console.log("== gen:sitemap ==");
console.log(
  `  locales=[${ENABLED_LOCALES.join(",")}] x-default=/${DEFAULT_LOCALE}/ games=${GAMES.length}`,
);

// ── 2. 扫描 out/ 目录树 → 可索引页面 URL ────────────────────────
function walkIndexFiles(dir, base) {
  let found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found = found.concat(walkIndexFiles(full, base));
    } else if (entry.name === "index.html") {
      // out/ 相对路径 → 站内路径（目录式尾斜杠）
      found.push("/" + relative(base, dirname(full)).split("\\").join("/") + "/");
    }
  }
  return found;
}

/** 去掉路径首段的语言前缀：'/zh/games/sudoku/' → '/games/sudoku/'（与 seo.ts 同语义） */
function stripLocalePrefix(pathname) {
  const rest = pathname.slice(1).split("/").filter(Boolean);
  if (rest.length > 0 && ENABLED_LOCALES.includes(rest[0])) rest.shift();
  return "/" + rest.join("/") + (rest.length > 0 ? "/" : "");
}

/** 路径 → priority（实施方案 §6.2 分层；about 等辅助页 0.5） */
function priorityFor(pathname) {
  const p = stripLocalePrefix(pathname);
  if (p === "/") return "1.0";
  if (/^\/games\/[a-z0-9-]+\/$/.test(p)) return "0.9";
  if (/^\/category\/[a-z0-9-]+\/$/.test(p)) return "0.8";
  if (p.startsWith("/guides/")) return "0.7";
  return "0.5";
}

let pages = [];
if (existsSync(OUT_DIR)) {
  pages = walkIndexFiles(OUT_DIR, OUT_DIR).filter((p) => {
    const first = p.slice(1).split("/")[0];
    // 根跳转页与 404 不进 sitemap；只收录启用语言段
    return ENABLED_LOCALES.includes(first);
  });
  pages.sort();
} else {
  console.error("✗ out/ 不存在——gen:sitemap 必须在 next build 之后运行（见 package.json）");
  process.exit(1);
}

const urlFor = (path) => SITE_URL + path;

// hreflang alternates：与 src/lib/seo.ts#alternatesFor 输出同一 URL 集合与顺序
// （languages 键序 = ENABLED_LOCALES，随后 x-default）。
function alternatesFor(path) {
  const suffix = stripLocalePrefix(path);
  const links = ENABLED_LOCALES.map(
    (l) =>
      `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor("/" + l + suffix)}"/>`,
  );
  links.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor("/" + DEFAULT_LOCALE + suffix)}"/>`,
  );
  return links;
}

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

// ── 3. 组装 + 断言 ──────────────────────────────────────────────
let failed = false;
const fail = (msg) => {
  console.error("  ✗ " + msg);
  failed = true;
};

const body = [];
for (const path of pages) {
  body.push("  <url>");
  body.push(`    <loc>${escapeXml(urlFor(path))}</loc>`);
  body.push(...alternatesFor(path));
  body.push(`    <priority>${priorityFor(path)}</priority>`);
  body.push("  </url>");
}

const collectPaths = new Set(pages);
// 断言 B/C：registry 游戏页与首页必须全部收录（next build 漏生成 → 此处 fail-fast）
for (const locale of ENABLED_LOCALES) {
  if (!collectPaths.has(`/${locale}/`)) fail(`首页 /${locale}/ 未被收录（out/ 缺 index.html）`);
  for (const g of GAMES) {
    const p = `/${locale}/games/${g.slug}/`;
    if (!collectPaths.has(p)) fail(`游戏页 ${p} 未被收录（out/ 缺 index.html）`);
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/gen-sitemap.mjs — DO NOT EDIT -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body.join("\n")}
</urlset>
`;

writeFileSync(join(OUT_DIR, "sitemap.xml"), sitemap);

// ── 4. 摘要（供验收报告核对 URL 数与分层）──────────────────────
const byPriority = {};
for (const path of pages) {
  const pr = priorityFor(path);
  (byPriority[pr] || (byPriority[pr] = [])).push(path);
}
console.log("\n== sitemap 分层 ==");
for (const pr of Object.keys(byPriority).sort((a, b) => Number(b) - Number(a))) {
  console.log(`  ${pr}  ${String(byPriority[pr].length).padStart(3)} URL`);
  for (const p of byPriority[pr]) console.log(`       ${p}`);
}
console.log(`\n✓ 已生成 out/sitemap.xml（${pages.length} URL × hreflang ${ENABLED_LOCALES.length + 1}）`);

if (failed) {
  console.error("\n✗ gen:sitemap 失败（构建期失败优于运行期出错）");
  process.exit(1);
}
