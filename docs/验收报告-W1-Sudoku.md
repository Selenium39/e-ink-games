# 验收报告 — W1 Sudoku 打样（技术 SEO 收尾 + 性能预算终验 + 总体 QA）

> 站点：games.e-ink.me（静态导出 Next.js 15，Cloudflare Pages 目标托管）
> 报告日期：2026-09-27　环境：macOS / Node（仓库根 `npm run build` 全链路实测）
> 性质：终验报告。所有数据为本次构建实测，非估算。

---

## 一、结论摘要

| # | 结论 |
|---|------|
| 1 | **`npm run build` 全链路绿**：games:build → games:build:template → gen:og → next build（10 页静态生成）→ gen:sitemap，零报错退出；`npx tsc --noEmit` exit 0；`npx vitest run` 84/84 通过。 |
| 2 | **性能预算四项全达标且余量巨大**：首页 HTML gzip 3.75–4.00KB（预算 30KB）、游戏页 HTML gzip 7.91–8.49KB（预算 30KB）、sudoku.js gzip 7.22KB（预算 15KB）、全站 CSS gzip 13.59KB（预算 25KB）。无超标项，无需优化动作。 |
| 3 | **技术 SEO 三通道全就位且互相一致**：sitemap（6 URL，priority 分层 + hreflang ×3）、HTML head（canonical 每语言自指 + hreflang 与 sitemap 逐 URL 一致）、JSON-LD 三件套（VideoGame / FAQPage / BreadcrumbList）逐字段合规。 |
| 4 | **扩展性演练达成目标**：复制 `_template` 为 demo-stub（6 个新文件、零改动既有文件）后，registry 自动发现 → bundle/OG 图自动生成 → 12 页自动生成 → sitemap 自动收录 → 首页卡片与分类计数自动出现。**新增一个游戏 = 仅新增游戏目录本身（代码目录 + 文案目录），零手工登记。** |
| 5 | **analytics 双向验证通过**：env 未设置 → out/ 全树零 analytics 痕迹（零请求红线）；设置假 ID 构建 → GA4 与 Umami 脚本正确注入且随语言页全量出现。`.env.example` 只含变量名与占位注释，**仓库中无任何真实 key**（红线自查通过）。 |

---

## 二、本任务交付物

| 文件 | 说明 |
|---|---|
| `scripts/gen-sitemap.mjs`（新增） | registry 驱动 sitemap 生成：esbuild 转译 `games.registry.ts` + `i18n/config.ts` 后动态 import（单一事实来源，脚本零手工游戏/语言清单）；深度扫描 `out/**/index.html` 得页面全集；priority 分层；每 URL 输出 hreflang `xhtml:link` alternates；断言 registry 游戏页与首页全部收录（漏生成 fail-fast）。 |
| `scripts/gen-og.mjs`（新增） | OG 分享图生成：内联 SVG 模板（1200×630 黑白印刷风：衬线大标题=游戏名自适应字号、等宽全大写小标签、粗黑分隔线、右下角 games.e-ink.me）→ sharp 栅格化 → `public/og/{slug}.png`；registry 外孤儿图自动清除。 |
| `public/robots.txt`（新增） | `User-agent: * / Allow: /` + `Sitemap: https://games.e-ink.me/sitemap.xml`。 |
| `public/llms.txt`（新增） | 英文：站点一句话定位（family 归属）+ Games/Catalog/Languages 三段核心 URL 清单。 |
| `src/app/[locale]/page.tsx`（升级） | 首页从占位升级为 registry 驱动：游戏卡列表（等宽分类标签 + Play free → + content 层 tagline，en 回退、半成品降级为纯标题卡）+ 五分类导航占位（有游戏显计数、无游戏显 Coming soon，分类页上线前不出链接）。H1 与导流位未动。 |
| `src/components/Analytics.tsx`（新增） | GA4 + Umami 门控注入（server component，构建期求值）：`NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_UMAMI_ID` / `NEXT_PUBLIC_UMAMI_SRC` 三变量独立门控；ID/URL 形状校验防呆（非法值构建期 warn 并跳过）；未设置返回 null 零渲染。 |
| `src/app/[locale]/layout.tsx`（改 2 行） | 原 `[analytics 注入位]` 注释处替换为 `<Analytics />`。 |
| `.env.example`（新增） | 仅变量名 + 占位注释；`.gitignore` 已确认忽略 `.env`/`.env.*` 并白名单 `!.env.example`。 |
| `src/app/[locale]/games/[slug]/page.tsx`（最小改动） | `generateMetadata` 的 openGraph 增加 `images: [{ url: /og/{slug}.png, width: 1200, height: 630, alt }]`。 |
| `package.json`（改） | build 链接为 `build:games → build:games:template → gen:og → next build → gen:sitemap`（gen:og 在 next build 前——public 产物需拷入 out/；gen:sitemap 在后——需探测 out/ 树）；新增 `gen:og` / `gen:sitemap` 两个脚本入口。 |

**边界说明**：分类页（0.8）与 guides 页（0.7）当前不存在路由，gen-sitemap 以 out/ 目录探测决定是否收录——当前自动不出 URL，未来页面一上线即自动进入 sitemap，无需改脚本。about 页任务分层未定义，为消灭 orphan 页以 priority 0.5 收录（自主决策，见 §四）。

---

## 三、build 全链路实测

```
npm run build
== games:build ==            sudoku gzip 7.11KB / 15.00KB（zlib level 9，管线口径）
== games:build (template) == _template gzip 2.31KB / 15.00KB
== gen:og ==                 public/og/sudoku.png 35.6KB (1200×630)
✓ Compiled successfully / ✓ Generating static pages (10/10) / ✓ Exporting (2/2)
== gen:sitemap ==            out/sitemap.xml（6 URL × hreflang 3）
```

- 10 页 = 2 语言 × (首页 + about + sudoku 游戏页) + 根跳转页 + 404；`out/` 目录式尾斜杠结构完整。
- `npx tsc --noEmit` → exit 0；`npx vitest run` → **84 tests / 5 files 全绿**（608ms）。
- 真实浏览器（ego-browser，本地静态服务）视觉验证：首页报纸头版风 H1 + GAME CATALOG 卡片 + BROWSE BY CATEGORY 分类表渲染正常；游戏页 Sudoku 可玩（难度段选黑底反转、TIME/ERR 等宽状态行、9×9 棋盘、数字键盘全部正常）。

## 四、性能预算实测表（gzip -9，CLI 口径）

| 项 | 预算 | 实测 | 余量 | 结论 |
|---|---|---|---|---|
| 首页 HTML（en） | ≤30KB | **3.75KB**（raw 16.3KB） | 87% | ✅ |
| 首页 HTML（zh） | ≤30KB | **4.00KB**（raw 16.2KB） | 87% | ✅ |
| 游戏页 HTML（en） | ≤30KB | **7.91KB**（raw 40.8KB） | 74% | ✅ |
| 游戏页 HTML（zh） | ≤30KB | **8.49KB**（raw 40.9KB） | 72% | ✅ |
| sudoku.js | ≤15KB | **7.22KB**（raw 22.1KB） | 52% | ✅ |
| _template.js | ≤15KB | **2.33KB**（管线口径 2.31KB） | 85% | ✅ |
| 全站 CSS（`out/_next/static/css/*.css` 两个文件） | ≤25KB | **13.59KB**（12.69 + 0.90） | 46% | ✅ |
| 页内联样式（React 19 提升 `<style>`） | — | 首页 0.37KB / 游戏页 0.58KB | — | （随 HTML 计） |

**超标项：无。** 优化建议：暂不需要。前瞻提示（游戏数增多后优先级从高到低）：
1. 游戏页 HTML 的 40.8KB raw 主要来自内容层（设备表 + FAQ + 文案），gzip 后 8KB，单游戏增量约 2KB gzip，30 语言 × 16 游戏规模下首页/游戏页仍远低于预算。
2. 全站 CSS 中 epaper 库 styles.min.css 占 12.69KB，为各游戏共享，不随游戏数增长。
3. OG 图 35.6KB/张不计入页面加载预算（仅社交平台抓取）。

## 五、技术 SEO 终验

### 5.1 sitemap（out/sitemap.xml）

| 核对项 | 结果 |
|---|---|
| URL 数 vs out/ 目录树 | **6 = 6**（`/{en,zh}/`、`/{en,zh}/about/`、`/{en,zh}/games/sudoku/`）；根跳转页与 404 正确排除 |
| priority 分层 | 首页 1.0 ×2、游戏页 0.9 ×2、about 0.5 ×2；分类 0.8 / guides 0.7 无页面未出 URL（探测机制，见 §二边界说明） |
| hreflang | 每 URL 3 条 `xhtml:link`（en / zh / x-default→/en/ 同路径），语言集合 = ENABLED_LOCALES |
| registry 断言 | gen-sitemap 内置断言：registry × ENABLED_LOCALES 的游戏页与首页任一缺失即构建失败 |

### 5.2 hreflang 双通道一致性

逐 URL 比对 HTML `<head>`（`src/lib/seo.ts#alternatesFor` 输出）与 sitemap `xhtml:link`：**URL 集合与顺序完全一致**（languages 键序 = ENABLED_LOCALES，随后 x-default）。canonical 每语言自指（`/en/games/sudoku/` 的 canonical 即自身，符合多语言站规范）。
技术备注：React 19 将该属性渲染为 `hrefLang`（camelCase）；HTML 属性名 ASCII 大小写不敏感，浏览器与爬虫解析后等效 `hreflang`，非缺陷、无需处理。

### 5.3 JSON-LD 三件套逐字段核对（/en/games/sudoku/ 实测）

| @type | 字段核对 |
|---|---|
| **VideoGame** | name="Sudoku" ✅ / description=content.meta.description ✅ / genre="Puzzle"（来自 meta.seo.videoGameGenre）✅ / gamePlatform="Web Browser" ✅ / operatingSystem="Any e-reader browser" ✅ / applicationCategory="Game" ✅ / inLanguage="en"（zh 页实测 "zh"）✅ / url=canonical ✅ / offers: Offer+price "0"+USD+InStock ✅ / publisher: Organization E-Ink.me → https://e-ink.me ✅ |
| **FAQPage** | mainEntity 恰 4 问（Free? / My device? / Jailbreak? / Offline?），每问 Question.name + acceptedAnswer.Answer.text，与页面可见 FAQ 逐字一致 ✅ |
| **BreadcrumbList** | 2 级：E-Ink Games → https://games.e-ink.me/en/（position 1）、Sudoku → 游戏页 canonical（position 2），与可见面包屑一致 ✅ |

### 5.4 robots.txt / llms.txt / OG 图

- `out/robots.txt`：Allow all + Sitemap 绝对 URL ✅
- `out/llms.txt`：英文一句话定位 + Games/Catalog/Languages 三段 URL 清单，Sudoku 条目含差异化描述 ✅
- `public/og/sudoku.png`：1200×630、35.6KB；游戏页 head 实测输出 `og:image`（绝对 URL）+ `og:image:width/height/alt` ✅（metadataBase 解析相对路径）

### 5.5 analytics 门控（双向实测）

| 场景 | 结果 |
|---|---|
| 三变量均未设置（正式构建） | `grep -rl "gtag\|umami" out/` → **零文件命中**，HTML 零痕迹、零外域请求 ✅ |
| 设置假值构建（G-TEST123456 / test-website-id / https://umami.example.com/script.js） | GA4 `googletagmanager.com/gtag/js?id=…` + 内联 dataLayer 初始化 + Umami `defer` + `data-website-id` 均注入，各语言页全量出现；验证后已恢复无 env 构建 ✅ |

**安全红线自查**：`.env.example` 仅含变量名与占位注释；全仓 grep 无真实 key/测量 ID；`.gitignore` 忽略 `.env`/`.env.*` 并白名单 `!.env.example`。（此前 news 站 .env.example 泄露真实 API key 的事故模式已双重规避；该事故的 key 轮换仍待用户处理，见遗留清单外事项。）

## 六、扩展性演练（demo-stub 存根全链路）

按契约 §9 checklist 执行：`cp -r src/games/_template src/games/demo-stub` → 全局替换 slug → meta.json 改 slug="demo-stub"/category="logic" → 新建 content `en.json`+`zh.json` → `npm run build`。

**新增文件清单（共 6 个，全部为新增，零改动任何既有文件）：**
```
src/games/demo-stub/{logic.ts, render.ts, index.ts, meta.json}   # 4 个游戏文件
src/content/games/demo-stub/{en.json, zh.json}                   # 2 个文案文件
```
（`src/lib/games.registry.ts` 被 build 自动重写——@generated 构建产物，契约禁手改，不计入"动文件"。）

**六通道自动出现实测：**

| 通道 | 实测证据 |
|---|---|
| registry 自动发现 | `✓ 已生成 src/lib/games.registry.ts（2 个游戏）` |
| bundle 自动打包 + 断言 | demo-stub gzip 2.31KB / 15KB 通过 |
| OG 图自动生成 | `public/og/demo-stub.png` 39.3KB（标题自适应字号生效） |
| 页面自动生成 | 静态页 10 → **12**（`/en/games/demo-stub/`、`/zh/games/demo-stub/`） |
| sitemap 自动收录 | 6 → **8 URL**，demo-stub 两页 priority 0.9、hreflang ×3 |
| 首页/元数据自动出现 | 首页卡自动出现（Demo Stub + tagline）；分类计数自动变化（Puzzle 1 GAME、Logic 1 GAME）；游戏页 `og:image=/og/demo-stub.png`、x-default hreflang、JSON-LD 三件套齐备 |

验证后存根已删除（含 bundle 与 OG 图），重建恢复 1 游戏基线，`grep` 确认全树无 demo-stub 残留。

**结论：新增一个游戏实际需要动 0 个既有文件，仅新增游戏目录本身（游戏代码目录 4 文件 + 文案目录 2 文件）。目标达成。** 分类页/guides 上线后同理自动进入 sitemap（out/ 探测机制）。

## 七、遗留清单（含建议时机）

| # | 事项 | 建议时机 |
|---|---|---|
| 1 | **Cloudflare Pages 部署 + DNS**（用户操作；`out/` 静态产物已就绪，构建命令 `npm run build`、输出目录 `out`；`.env` 三变量在 Pages 控制台配置） | 立即——本报告完成后即可部署，是后续一切的前置 |
| 2 | **真机 Kindle / BOOX 验证**（局部刷新、可玩性、降级路径；契约 §12 真机冒烟项） | 部署后一周内（W2 首批游戏上线前）——需公网可达 URL，本报告的桌面浏览器验证不能替代 |
| 3 | **GSC 提交**（验证 games.e-ink.me → 提交 sitemap.xml） | DNS 生效后立即（部署同日可做；robots.txt/sitemap.xml 已就绪，提交即被拉取） |
| 4 | **e-ink.me 与 news.e-ink.me 反向互链**（家族站互链是外链冷启动的基座） | W2 内（news 站部署时同步加；games 侧 footer 家族条已就位） |
| 5 | **其余语言文案补齐至 16 个**（当前 ENABLED_LOCALES=[en,zh]，候选 vi/hi；扩语言三步：补 messages 字典 → 加入数组 → 补各游戏 content） | W3（文案周，按实施方案排期；依 GSC 收录数据可调整优先语言） |
| 6 | **eink.link / Reddit / Show HN 外链冷启动** | GSC 收录后 1–2 周（先有 ≥3 个游戏的内容深度再引流；Show HN 选美东工作日上午） |
| 7 | i18n `games.common` 公共词表就位后，收编游戏页/首页的文件内 en/zh 映射（打样期约定模式，非缺陷） | W3 文案周 |

## 八、红线自查

- ✅ 未执行 `git commit` / 未部署 / 未向任何外部服务发请求（本地验证仅 127.0.0.1 回环；依赖 sharp/esbuild 均已在锁版依赖内，未安装任何新包）
- ✅ 仓库无真实 key / 测量 ID
- ✅ 报告数据全部实测（构建输出、gzip 实测、grep/JSON 提取、真实浏览器截图）
