# 内容目录（games content）

每游戏一个独立落地页是本站 SEO 核心打法。本目录存放**程序化游戏页模板**消费的全部文案
（实施方案 §6.2），类型定义在 [`games/types.ts`](games/types.ts)，消费方是
`/games/[slug]/page.tsx`（generateMetadata、FAQPage/VideoGame JSON-LD、设备表、FAQ、导流位）。

## 目录结构

```
src/content/
├── README.md            ← 本文件（schema 说明 + 新游戏复制指引）
└── games/
    ├── types.ts         ← 内容 schema 的 TS 类型（权威参考，新增字段先改这里）
    └── sudoku/
        ├── en.json      ← source of truth：字段必须齐全
        └── zh.json      ← 可增量上线；缺的字段构建期回退 en
```

## 字段清单与长度约束

类型见 `games/types.ts` 的 `GameContent`。**en 的长度约束是硬性校验项**；
zh 及其他 CJK locale 按「1 个中文字符 ≈ 2 个英文字符」的展示宽度折算放宽，
品牌词（Kindle、BOOX、Kobo 等）不译。

| 字段 | 用途 | en 约束 | CJK 折算 |
|---|---|---|---|
| `meta.title` | SEO `<title>` | ≤60 字符，须含 "{Game} for Kindle" | ≤32 个中文字符 |
| `meta.description` | meta description | ≤155 字符，须含 kindle / e-ink / free / no download 语义 | ≤78 个中文字符 |
| `h1` | 页面 H1 | 模板 `{Game} for Kindle & E-Ink — Free, No Download`，含设备词 | 同模板意译 |
| `tagline` | 一句话价值主张 | 一句完整的话，含设备词 | 同左 |
| `howToPlay.steps[]` | 结构化玩法步骤 | 5–8 步，**合计 ≥150 词**；覆盖键盘 + 触屏两种操作；engineFeatures 含 `notes` 时必须讲 pencil marks | 质量对齐 en，无词数下限 |
| `deviceTable.rows[]` | 设备兼容表 | ≥5 行；每行 `status` + 一句 `note` 说明 | 同左 |
| `whyEInk` | 无闪烁技术叙事 | 30–70 词（目标 ~50），竞品全无的差异化区块 | 同左 |
| `faq[]` | FAQPage JSON-LD | 恰 4 条（免费？/我的设备？/要越狱吗？/能离线吗？），每答 40–60 词 | 同左 |
| `cta.label` | 游戏结束导流位 | ≤140 字符，自然衔接「玩完游戏」场景，href 限 e-ink.me / news.e-ink.me / games.e-ink.me | ≤70 个中文字符 |
| `related` | 同类游戏内链 | `category` 用 `GameCategory` 词表；`relatedSlugs` 构建期校验须存在于 registry，首发游戏先留 `[]` | 同左 |

`status` 展示词（Works / Limited / Unavailable 等）由 `lib/i18n` 的 games.common
映射，**不在每游戏 JSON 重复**；`DeviceRow.note` 才是每游戏的原创文案。

## 事实红线（QA 必查）

1. **不虚构设备支持状态。** 基线事实（调研报告 §设备矩阵）：
   - 新 Kindle（2021+，固件 5.13.7+，Paperwhite / Scribe / Colorsoft）→ `yes`
   - 老 Kindle（2016 前实验性 NetFront 浏览器，ES3 级 JS）→ `no`，注明"页面可读但游戏无法运行"
   - BOOX（Android，完整 Chromium）→ `yes`
   - Kobo（内置浏览器较弱，ES5 左右）→ `limited`
   - reMarkable（无官方浏览器，需越狱第三方）→ `no`
   新设备上线前先真机验证再改状态。
2. **商标词不出现**（Wordle、Scrabble 等），表述用 "Wordle-style" 类写法。
3. 禁机翻腔：zh 文案按母语写作标准审读，不逐字对译 en。
4. FAQ 答案与 deviceTable 事实必须一致（设备、固件、越狱、离线四处交叉核对）。

## 新增一个游戏的文案（5 步）

前置：`src/games/<slug>/meta.json` 已存在（见开发规约 §9 checklist 第 1–7 步）。

1. 新建目录 `src/content/games/<slug>/`，复制任一现有游戏（如 `sudoku/en.json`）作骨架。
2. **只改文案，不改字段结构**——所有字段必填（en 为 source of truth）。
   `howToPlay` 步骤须与该游戏 `meta.json` 的 `engineFeatures` 实际能力一致，
   不得描述游戏里不存在的功能。
3. 跑校验脚本核对 en 长度/词数约束（构建管线会再次校验，fail 即构建失败）。
4. 新语言增量补：`cp en.json zh.json` 后翻译，缺字段会自动回退 en
   （字段级合并，见开发规约 §8.1），语言可后补。
5. 自查事实红线（上节 4 条）+ `npm run dev` 打开 `/{locale}/games/<slug>/` 肉眼过一遍。

## 消费方（不要在这些地方硬编码文案）

- `/games/[slug]/page.tsx`：generateMetadata、`GameContent` 各区块渲染
- JSON-LD：FAQPage（`faq`）、VideoGame（`meta` + meta.json `seo.videoGameGenre`）
- GameFrame 游戏结束 promo 位（`cta`）
- sitemap / hreflang（`meta.title` 参与 alternates）
