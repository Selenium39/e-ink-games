#!/usr/bin/env node
// OG 分享图生成：registry 驱动，每游戏一张 1200×630 PNG（public/og/{slug}.png），
// 另加站点级默认图一张（public/og/site.png，首页/about 等非游戏页共用）。
//
// 设计（黑白印刷风，与站点 epaper 美学同源）：
//   - 纯白底，全部元素纯黑；零圆角、零灰阶、零彩色
//   - 左上：等宽全大写小标签（E-INK GAMES · 分类）
//   - 中央：衬线大标题 = 游戏名（按字符数自适应字号，不换行）
//   - 标题下：粗黑分隔线 + 等宽全大写副标签（FREE · NO DOWNLOAD · IN YOUR BROWSER）
//   - 右下角：等宽 games.e-ink.me
// 站点默认图同款节拍，但内容不依赖游戏清单（加减游戏无需改图）：
//   - eyebrow=域名 / 中央=品牌名 E-Ink Games / 副标签=FOR KINDLE · BOOX · KOBO
// 栅格化用 sharp（librsvg；serif/monospace 走系统字体兜底链）。
// registry 之外残留的 {slug}.png 一并清除（游戏下线后 out/ 不出孤儿图；site.png 恒保留）。
//
// 在 next build 之前运行（public/og/ 需被拷入 out/），见 package.json build 链。
import process from "node:process";
import { mkdirSync, readFileSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(scriptDir, "..");
const OG_DIR = join(SITE_ROOT, "public", "og");
const W = 1200;
const H = 630;
const MARGIN = 80;

// ── 加载 registry（单一事实来源，与 gen-sitemap.mjs 同法）────────
async function loadRegistry() {
  const tmp = mkdtempSync(join(tmpdir(), "eg-og-"));
  const outfile = join(tmp, "mod.mjs");
  try {
    await esbuild({
      entryPoints: [join(SITE_ROOT, "src/lib/games.registry.ts")],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      packages: "external",
      logLevel: "silent",
    });
    return (await import(pathToFileURL(outfile).href)).GAMES;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const escapeXml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

/** 衬线大标题自适应字号：Georgia 均宽 ≈0.52em/字符，留足左右边距且封顶 200px */
function titleFontSize(text) {
  const est = (W - MARGIN * 2) / (0.52 * Math.max(text.length, 1));
  return Math.floor(Math.min(200, est));
}

function svgFor(game) {
  const title = escapeXml(game.title);
  const eyebrow = escapeXml(`E-INK GAMES · ${String(game.category).toUpperCase()}`);
  const sub = "FREE · NO DOWNLOAD · IN YOUR BROWSER";
  const fontSize = titleFontSize(game.title);
  // 视觉垂直节拍：eyebrow 基线 132 → 标题基线 ≈ 400 → 分隔线 470 → 副标签基线 540 → 域名基线 578
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${MARGIN}" y="132" font-family="'Courier New', Courier, monospace" font-size="34" font-weight="700" letter-spacing="6" fill="#000000">${eyebrow}</text>
  <line x1="${MARGIN}" y1="160" x2="${W - MARGIN}" y2="160" stroke="#000000" stroke-width="2"/>
  <text x="${W / 2}" y="400" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" fill="#000000">${title}</text>
  <rect x="${MARGIN}" y="452" width="${W - MARGIN * 2}" height="12" fill="#000000"/>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-size="30" font-weight="700" letter-spacing="6" fill="#000000">${sub}</text>
  <text x="${W - MARGIN}" y="578" text-anchor="end" font-family="'Courier New', Courier, monospace" font-size="28" font-weight="700" fill="#000000">games.e-ink.me</text>
</svg>`;
}

/** 站点级默认图：与游戏图同款视觉节拍，但零游戏元素（数量增减不影响） */
function svgForSite() {
  const title = "E-Ink Games";
  const fontSize = titleFontSize(title);
  const sub = "FOR KINDLE · BOOX · KOBO";
  const corner = "FREE · NO DOWNLOAD · IN YOUR BROWSER";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${MARGIN}" y="132" font-family="'Courier New', Courier, monospace" font-size="34" font-weight="700" letter-spacing="6" fill="#000000">GAMES.E-INK.ME</text>
  <line x1="${MARGIN}" y1="160" x2="${W - MARGIN}" y2="160" stroke="#000000" stroke-width="2"/>
  <text x="${W / 2}" y="400" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" fill="#000000">${escapeXml(title)}</text>
  <rect x="${MARGIN}" y="452" width="${W - MARGIN * 2}" height="12" fill="#000000"/>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-size="30" font-weight="700" letter-spacing="6" fill="#000000">${sub}</text>
  <text x="${W - MARGIN}" y="578" text-anchor="end" font-family="'Courier New', Courier, monospace" font-size="28" font-weight="700" fill="#000000">${corner}</text>
</svg>`;
}

const GAMES = await loadRegistry();
console.log("== gen:og ==");
if (GAMES.length === 0) console.log("ℹ registry 为空，跳过游戏 OG 图生成");

mkdirSync(OG_DIR, { recursive: true });

const wanted = new Set(GAMES.map((g) => `${g.slug}.png`));
wanted.add("site.png"); // 站点默认图非 registry 产物，恒保留
// 孤儿清理：registry 之外的分享图不再输出（out/ 亦不会收录）
for (const name of readdirSync(OG_DIR)) {
  if (name.endsWith(".png") && !wanted.has(name)) {
    rmSync(join(OG_DIR, name));
    console.log(`  ⚠ 移除孤儿图 public/og/${name}（registry 中已无对应游戏）`);
  }
}

for (const game of GAMES) {
  const outfile = join(OG_DIR, `${game.slug}.png`);
  await sharp(Buffer.from(svgFor(game))).png({ compressionLevel: 9 }).toFile(outfile);
  const kb = (readFileSync(outfile).length / 1024).toFixed(1);
  console.log(`  ✓ public/og/${game.slug}.png  ${kb} KB  (${W}×${H}, title "${game.title}")`);
}

// 站点级默认图（首页/about 继承 layout openGraph 引用此图）
{
  const outfile = join(OG_DIR, "site.png");
  await sharp(Buffer.from(svgForSite())).png({ compressionLevel: 9 }).toFile(outfile);
  const kb = (readFileSync(outfile).length / 1024).toFixed(1);
  console.log(`  ✓ public/og/site.png  ${kb} KB  (${W}×${H}, site default)`);
}

console.log(`\n✓ gen:og 完成（${GAMES.length} 张游戏图 + 1 张站点图）`);
