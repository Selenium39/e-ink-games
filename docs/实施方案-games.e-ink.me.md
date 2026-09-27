# games.e-ink.me 实施方案

> 版本：v1（2026-09-27）
> 前置文档：《调研报告-墨水屏游戏网站.md》
> 定位：免费墨水屏浏览器游戏站，SEO 引流至 e-ink.me，2026 年 11 月 Q4 峰值前上线。

---

## 一、对你 5 点要求的逐一回应

### 1. 域名 `games.e-ink.me` — ✅ 接受，附一个已权衡的替代项

**纯 SEO 角度，子目录 `e-ink.me/games/` 更优**：Google 把子域名当半独立站点，权重继承弱于子目录。

**但架构上子目录不可行**：主站在 Zeabur（Docker），新站在 Cloudflare，子目录意味着主站要反代 Cloudflare——增加单点故障和复杂度，得不偿失。且已有 `news.e-ink.me` 先例，品牌一致。

**结论：用 `games.e-ink.me`，用互链弥补权重传递**（见 §6.4）。注意新子域名从零起步，**上线越早越好**（Google 收录+权重积累需要 4-6 周，倒排后 10 月中旬必须是上线死线）。

### 2. Next.js + Cloudflare — ✅ 接受，但收窄为"静态导出 + Cloudflare Pages"

三种 Next.js 上 Cloudflare 的方式，明确选第一种：

| 方式 | 结论 |
|---|---|
| **静态导出（`output: 'export'`）+ Cloudflare Pages** | ✅ **选这个**。游戏站全部内容 evergreen，无服务端动态需求；全球 CDN 静态 HTML 对墨水屏设备（慢网络+慢浏览器+小内存）是最优解；news 站已验证此模式 |
| `@cloudflare/next-on-pages`（edge runtime） | ❌ 引入运行时约束和调试复杂度，本站无此需求 |
| `@opennextjs/cloudflare` | ❌ 同上，为 SSR/ISR 设计，本站用不上 |

**细节**：不做 ISR；OG 分享图构建时批量预生成（游戏数有限，无需运行时生成）；Cloudflare 免费额度对本站流量绰绰有余；`wrangler pages deploy` 或接 Git 自动构建均可。

### 3. UI 用 epaper-components — ✅ 接受，这是本方案最大的技术红利

该库就是为墨水屏 web UI 而生（108 个原生 custom elements、零运行时依赖、patch 式 DOM 更新保持小脏区以触发 EPDC 部分刷新、全局禁动画、无 hover、1-bit 友好状态编码）。对游戏站直接可用的组件：`e-button`、`e-dialog`、`e-grid`、`e-keypad`（数独/2048 输入）、`e-segmented`（难度选择）、`e-badge`/`e-chip`、`e-meter`/`e-progress`（计时/步数）、`e-result`（游戏结束+导流位）、`e-pin-input`（猜数字类）、`e-tabs`、`e-alert`、`e-prose`（SEO 正文排版）。

**⚠️ 必须正视的约束（分层策略）**：库以 ES module 分发，老 Kindle（ES3/NetFront）跑不了；新 Kindle（固件 5.13.7+，WebKit）和 BOOX 没问题。因此采用**三层渐进增强**：

1. **内容层（HTML/CSS，无 JS）**：所有 SEO 内容、游戏说明、FAQ、站内导航——禁 JS 也可完整阅读。Kindle 浏览器用户禁用 JS 的比例不低（好读静态页），这层保证他们不白来。
2. **游戏层（epaper-components + vanilla JS）**：页面内容加载后按需注入。目标设备：新 Kindle / BOOX / 任何现代浏览器。
3. **降级提示**：特性检测失败（无 customElements/module）时显示"Your browser is too old for the interactive game"文案（不影响内容层）。

### 4. 设计风格：**我决定用 epaper-components.dev**（vercel.com/design.md 仅取排版纪律）

**理由**：
- **主题契合度碾压**：epaper 站的设计语言是"为电子墨水屏设计的印刷美学"——纯黑白、报纸式粗细分隔线、衬线大标题 + 等宽全大写小标签、直角、零圆角零阴影零渐变。这套语言**本身就是本站产品理念的现场演示**：访客（尤其从 Google 搜"kindle games"进来的）打开页面的第一眼就在体验"墨水屏感"。
- **组件库默认美学即此风格**：用 `--ink-*` token 原生对齐，零定制成本。选 Vercel 风格（Geist 无衬线、灰阶层次、微交互）反而要 overrides，且其灰阶中间调在墨水屏上 dithering 不一致（组件库文档明确警告）。
- **Vercel design.md 可借鉴的部分**（融入我们的规范）：8pt 间距网格、字号阶梯纪律、WCAG AA 对比度要求。仅此而已。

**本站设计规范要点**（继承 epaper-components.dev）：
- 配色：`--ink-bg: #ffffff` / `--ink-fg: #000000`，**全站不用中间灰**做状态（dithering 风险），灰只用于大段正文 `#333` 级别
- 粗细线对比：区块分隔用 2-3px 粗黑线，控件边框 1px 细线（报纸层级感）
- 标题衬线（可选本地字体栈：Georgia/衬线系统栈，避免外部字体请求拖慢墨水屏设备），标签/导航等宽大写（`ui-monospace, monospace`）
- 主按钮黑底白字实心、次按钮描边；状态用反转/填充翻转，不用透明度
- 无圆角、无阴影、无动画、无 hover

### 5. 高度重视 SEO、免费、引流主站 — ✅ 核心目标，全案见 §6

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages（静态导出 out/，全球 CDN）                    │
│  games.e-ink.me（DNS 同账号，零成本接子域名）                    │
└─────────────────────────────────────────────────────────────┘
        │ 构建时
┌─────────────────────────────────────────────────────────────┐
│  Next.js 15 App Router（output: 'export'）                    │
│  ├── 路由层：/{locale} 程序化静态页                              │
│  ├── SEO 层：generateMetadata / sitemap / JSON-LD / hreflang   │
│  └── 游戏层：每游戏一个 vanilla JS bundle（构建时打包 ES5 IIFE）  │
├─────────────────────────────────────────────────────────────┤
│  @marcomattes/epaper-components（npm 依赖，tree-shake 白名单）  │
│  tokens.css + base.css + components.css（.ink-page 作用域）    │
└─────────────────────────────────────────────────────────────┘
        │ 互链
┌──────────────────────┬──────────────────────┐
│ e-ink.me（Zeabur）    │ news.e-ink.me        │
│ 页脚/工具页加 Games 入口 │ 三角链                │
└──────────────────────┴──────────────────────┘
```

**项目目录**（※ 2026-09-27 结构调整：仓库根即代码目录，文档收进 `docs/`；下图为方案原貌，树中 site 目录层已并入仓库根）：

```
e-ink-games/
├── 调研报告-墨水屏游戏网站.md
├── 实施方案-games.e-ink.me.md   ← 本文档
└── 【站点代码——2026-09-27 起直接位于仓库根】
    ├── next.config.ts           # output:'export'，按游戏代码分割
    ├── src/
    │   ├── app/[locale]/
    │   │   ├── page.tsx                 # 首页：游戏目录（SEO 主入口）
    │   │   ├── games/[slug]/page.tsx    # 游戏落地页（程序化生成）
    │   │   ├── category/[slug]/page.tsx # 分类聚合页（puzzle/word/board）
    │   │   ├── guides/[slug]/page.tsx   # 教程长尾页
    │   │   ├── about/page.tsx           # 品牌页（导流主站核心位）
    │   │   └── layout.tsx               # header/footer/CTA/analytics
    │   ├── components/
    │   │   ├── GameShell.tsx            # 'use client' 游戏容器（懒加载+特性检测）
    │   │   ├── GameFrame.tsx            # 统一游戏布局（棋盘+侧栏：状态/控制）
    │   │   └── seo/                     # JsonLd、Faq、Breadcrumbs
    │   ├── games/                       # ★ 游戏引擎（纯 vanilla，不依赖 React）
    │   │   ├── _engine/                 # 共用：状态机、存档、输入、事件
    │   │   ├── sudoku/{logic.ts, render.ts, meta.json}
    │   │   ├── minesweeper/...
    │   │   └── ...                      # meta.json 驱动页面生成
    │   ├── lib/
    │   │   ├── games.registry.ts        # 游戏元数据注册表（slug/i18n/分类/设备表）
    │   │   ├── seo.ts                   # alternatesFor 移植自主站
    │   │   └── i18n/                    # 16 语言文案（games.common + per-game）
    │   └── styles/tokens.css            # 覆盖 --ink-*（品牌微调）
    └── scripts/
        ├── gen-og.mjs                  # 构建时批量生成 OG 图（@vercel/og 离线跑）
        └── gen-sitemap.mjs
```

**关键工程决策：游戏逻辑与 React 完全解耦。** 每个游戏 = `logic.ts`（纯函数：状态转移）+ `render.ts`（DOM patch，借用 epaper 的 patch 策略）。Next.js 只负责壳页面生成和加载器注入。理由：① 游戏代码构建为独立 ES5 IIFE，不进 React 水合链路（墨水屏浏览器内存小，SPA 水合易崩）；② 同一份游戏核心未来可复用（TWA、离线包）。

---

## 三、信息架构与 URL 设计

```
/                       → 301 /en
/{locale}/              # 首页：全部游戏目录 + 分类导航
/{locale}/games/{slug}/ # 每游戏一页 ★ SEO 核心资产
/{locale}/category/{slug}/   # puzzle / word / board / logic / daily
/{locale}/guides/{slug}/     # 教程长尾（见 §6.2）
/{locale}/about/             # 关于+导流
```

URL 示例：`/en/games/sudoku/`、`/de/games/minesweeper/`、`/en/guides/play-games-on-kindle-without-jailbreak/`

**游戏 slug 用英文短词**（sudoku/minesweeper/word-daily/2048/nonogram…），全语言统一，hreflang 干净。

---

## 四、技术架构细节

### 4.1 Next.js 配置要点

- `output: 'export'` + `trailingSlash: true`（Cloudflare Pages 静态目录友好）
- `images: { unoptimized: true }`（静态导出约束；本站图片极少，全用内联 SVG/构建产物）
- 游戏 bundle：`games/*` 经 esbuild 构建为 `public/games/{slug}.js`（IIFE、target es2015、gzip <15KB/游戏），页面 `<script defer>` 按需加载——**不打包进 Next 主 bundle**

### 4.2 GameShell 加载策略（三层增强落地）

```tsx
// 伪代码示意
<div class="ink-page">
  <section>            {/* 内容层：SSG HTML，无 JS 可读 */}
    <h1>Sudoku for Kindle & E-Ink</h1>
    <p>玩法说明 300+ 词…</p>
    <Faq …/>
  </section>
  <div id="game-root" data-game="sudoku">
    <noscript>Enable JavaScript to play.</noscript>
  </div>
  <script defer src="/games/sudoku.js"></script>  {/* 特性检测后自注册 */}
</div>
```

`sudoku.js` 启动时检测 `window.customElements && customElements.define`：通过 → 挂载 epaper UI + 游戏循环；不通过 → `#game-root` 显示降级文案。内容层完全不受影响。

### 4.3 存档与状态

- 进度：`localStorage`（新 Kindle WebKit 支持）→ 降级 cookie → 无存档可玩
- 每日游戏（Wordle-like）：日期种子 = 简单可复现哈希（离线可算，无需服务端），结果分享文案生成纯文本（墨水屏友好，无图片分享）

### 4.4 性能预算（墨水屏设备的硬要求）

| 指标 | 预算 |
|---|---|
| 首屏 HTML | ≤ 30KB（gzip） |
| 游戏 JS 单游戏 | ≤ 15KB（gzip） |
| 全站 CSS（tokens+base+components+站点） | ≤ 25KB（gzip） |
| 外部请求 | 0 字体/0 图片（首屏全内联 SVG） |
| LCP（普通浏览器） | < 1s（CDN 静态，天然达标） |

---

## 五、游戏清单与优先级

| 批次 | 游戏 | 说明 |
|---|---|---|
| **P0（上线 10 个）** | Sudoku、Minesweeper、2048、Word Daily（Wordle 同玩法避商标）、Nonogram、Word Search、Memory Pairs、Tic-Tac-Toe、Hangman、Hidden Code（Mastermind 同玩法） | 全部回合制；搜索心智最强；`e-keypad`/`e-grid` 复用率最高 |
| **P1（+10，11 月）** | Othello、Lights Out、15-Puzzle、Tents、Sokoban、Maze、Battleship（单人猜位）、Go 9 路、Chess 简版、Kanagram | 补分类厚度，Othello/Go 源自 e-ink.club 验证过的需求 |
| **P2（12 月+）** | 每日挑战聚合页、难度分级系统、更多语言谜题库 | 留存向 |

**每游戏页 = 1 个静态页 × 16 语言**。P0 上线即 10 游戏 × 16 语 = 160 个 SEO 页 + 首页/分类/指南 ≈ **200+ 可收录 URL**。

---

## 六、SEO 全案（核心章节）

### 6.1 关键词 → 页面映射

| 词族（Autocomplete 实证） | 承接页面 |
|---|---|
| kindle games / free kindle games | 首页 H1: "Free Games for Kindle & E-Ink Readers — Play in Your Browser" |
| {game} for kindle / {game} e-ink | 游戏页 H1: "{Game} for Kindle & E-Ink — Free, No Download" |
| games for kindle paperwhite / scribe / boox | 游戏页内"设备兼容表"区块 + guides 设备专页 |
| kindle games without jailbreak / how to play games on kindle | `guides/play-games-on-kindle-without-jailbreak`（截流 jailbreak 联想流量，叙事：不用越狱，开浏览器就行） |
| e ink games / e ink tablet games | 首页与分类页副关键词 |

### 6.2 每游戏页模板（程序化，meta.json + i18n 驱动）

1. **H1 + 一句话价值主张**（含设备词）
2. **游戏本体**（GameShell）
3. **How to play**（150+ 词，结构化步骤）
4. **设备兼容表**（Kindle Paperwhite/Scribe/Colorsoft、BOOX 全系、Kobo、Remarkable✗——本身就是 FAQ 素材和差异内容）
5. **Why it works on e-ink**（50 词：无闪烁设计说明——竞品全无的技术叙事，也是内链 guides 的钩子）
6. **FAQ 4 问**（Is it free? / Does it work on my Paperwhite? / Need jailbreak? / Offline?）→ `FAQPage` JSON-LD
7. **同类游戏内链**（category 页 + 3 个同类游戏卡）
8. **导流位**（见 §6.4）
9. `VideoGame` JSON-LD（name/description/genre/platform="Web Browser"/offer price 0/operatingSystem="Any e-reader browser"）

### 6.3 技术 SEO 清单（全部构建时生成）

- [ ] `sitemap.xml` 分层 priority（首页 1.0 > 游戏页 0.9 > 分类 0.8 > guides 0.7）× hreflang alternates（移植主站 `alternatesFor`）
- [ ] 16 语言 hreflang + `x-default → /en`（HTML 与 sitemap 双通道一致，复用主站已踩过坑的方案）
- [ ] OG 图构建时批量生成（每游戏一张 1200×630，黑白印刷风模板，`@vercel/og` 离线脚本）
- [ ] `robots.txt`（全允许 + sitemap）+ `llms.txt`（复用主站模式）
- [ ] GA4 + Umami 双埋点（Day 1，吸取 news 站教训）
- [ ] GSC 尽早提交（上线当天）

### 6.4 导流设计（免费站的唯一 KPI）

| 位置 | 形式 |
|---|---|
| 页脚全局 | "Part of the E-Ink.me family — Web to EPUB, e-reader tools →" |
| 游戏结束 `e-result` | "Enjoying? Turn any web article into an EPUB for your Kindle → e-ink.me"（场景无缝：玩完游戏→继续用设备阅读） |
| guides 正文 | 自然嵌工具链接（"把谜题 PDF 转成 EPUB 装进 Kindle"、"制作墨水屏壁纸"→ 主站对应工具页，双向互链） |
| about 页 | 品牌故事 + 主站全家桶 |
| **主站反向**（权重关键） | e-ink.me 页脚加 "Free E-Ink Games" 链接 + 墨水屏相关博客文中插游戏站链接；news 站三角链 |

外链冷启动：提交 eink.link（该目录 Games 类仅 2 站，收录门槛低，是本品类最相关外链）、r/einkgames 与 r/eink 发帖（Show 风格，ReKindle 已验证该渠道传播力）、Hacker News Show HN。

### 6.5 上线时间线（倒排 Q4）

| 周 | 里程碑 |
|---|---|
| W1（10.06–10.12） | 脚手架 + tokens 接入 + GameShell + **2 个游戏打样**（Sudoku、Minesweeper）+ 游戏页模板 |
| W2（10.13–10.19） | P0 其余 8 游戏 + 分类页 + 首页 |
| W3（10.20–10.26） | 16 语言文案 + sitemap/hreflang/JSON-LD/OG 图 + 导流位 + analytics |
| W4（10.27–11.02） | 真机测试（BOOX/新 Kindle 如可得；否则 BrowserStack 玻璃测试）+ **上线** + GSC + eink.link 提交 + Reddit 发布 |
| 11 月–12 月 | P1 游戏迭代；监控 GSC 关键词，补 guides 长尾页；吃 Q4 峰值 |

---

## 七、风险与开放问题

1. **新 Kindle 浏览器对 `<script type="module">`/customElements 的实际支持需真机验证**（kindleplay 用普通 script + 全局函数，是最稳证据）。缓解：游戏 bundle 一律构建为普通 `<script defer>` IIFE（非 module）；W1 打样阶段若能借到真机优先验证。
2. **epaper-components 的 npm 包版本稳定性**：0.x 版本，API 可能变。缓解：锁定版本 + fork 预案（MIT 许可，源码在本地）。
3. **16 语言一次性上的翻译质量**：游戏文案模板化程度高（规则说明雷同），AI 翻译+人工抽查可行；若 W3 吃紧，首发 8 语言（en/zh/de/es/fr/it/pt/ja），剩余 12 月补。
4. **Wordle/Scrabble 等商标**：玩法不受版权保护，商标词不做 H1/域名，正文用 "daily word game (Wordle-style)" 表述。
5. **流量天花板**：调研已明确这是长尾矩阵生意。成功标准建议定为：3 个月自然流量 1k+/月、6 个月 5k+/月、导流点击率 3-5%（Umami 可测），而非游戏行业量级。

---

## 八、下一步（待你确认后执行）

1. 站点脚手架初始化（Next.js 15 + epaper-components + tokens 接入）
2. GameShell + Sudoku 打样（验证全链路：静态导出→组件库→游戏 bundle→真机/仿真）
3. 同步准备：Cloudflare 项目创建、DNS 接入、GSC 资源
