// 静态导出站点配置。
// 注：原 next.config.ts（前序脚手架产物）在 TypeScript 7（原生 tsgo，
// JS API 与 5.x 不兼容）下无法被 Next 加载编译——
// "TypeError: Cannot read properties of undefined (reading 'fileExists')"，
// 故改为 mjs 格式绕开 Next 的 TS 配置加载路径（内容等价迁移）。
// 若 Next 后续版本适配 TS7，可迁回 .ts 以恢复类型标注。

import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态导出到 out/，由 Cloudflare Pages 以纯静态站点托管（实施方案 §一.2）。
  output: "export",

  // 目录式尾斜杠：/en/games/sudoku/ —— Cloudflare Pages 静态目录友好，
  // 且 URL 以 / 结尾在多语言站上 hreflang/canonical 最干净。
  trailingSlash: true,

  // 静态导出必须关闭 Next 图片优化管线；本站图片极少，全部内联 SVG 或构建期产物。
  images: { unoptimized: true },

  // eslint 配置文件已备好（eslint.config.mjs），但 eslint 本体不在锁版依赖清单内，
  // 构建期跳过 lint，避免"检测到配置但缺包"导致 build 失败。装上 eslint 后可移除此项。
  eslint: { ignoreDuringBuilds: true },

  // 构建期跳过 Next 内置类型检查：类型门禁由独立步骤 `npx tsc --noEmit`
  // 承担（与上方 eslint.ignoreDuringBuilds 同理）。并行开发期 src/games/**
  // 等模块由其他任务分头演进，build 不应被他人未完成文件卡住；
  // 全仓类型在 tsc 步骤统一把关。多人协作收尾后可移除此项。
  typescript: { ignoreBuildErrors: true },

  // 显式注入 @/ → src/ 别名：Next 解析 tsconfig paths 依赖
  // typescript/lib/typescript.js（TS5 布局），本仓锁定的 TypeScript 7
  // 原生包没有该文件，Next 会静默跳过 paths 注入（@/ 全部 Module not
  // found）。key 带尾斜杠做前缀替换，避免误匹配 @scope 包名
  // （如本站依赖 @marcomattes/epaper-components）。
  webpack: (config) => {
    // webpack alias 无 $ 的 key 按 request === key || startsWith(key + "/")
    // 匹配：key 用 "@" 即可命中 "@/lib/i18n"，且 "@scope/..."（如
    // @marcomattes/...）以 "@s" 开头不会被误替换。
    config.resolve.alias["@"] = srcDir;
    return config;
  },
};

export default nextConfig;
