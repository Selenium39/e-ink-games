// 根布局：只负责接入全站 CSS，本身不做文档壳（pass-through）。
//
// 为什么不在这里渲染 <html>/<body>：locale 存在于 /en/、/zh/ 段中，
// 只有 src/app/[locale]/layout.tsx 知道当前语言，才能输出正确的
// <html lang>。因此文档壳由两个下游各自提供：
//   - src/app/[locale]/layout.tsx  → 带 lang 的 html/body
//   - src/app/page.tsx             → 根跳转页自带完整文档
// 这与 next-intl 等多语言方案对根布局的标准处理一致。

import type { ReactNode } from "react";

// 样式引入顺序不可调换：库 tokens → 站点品牌覆盖 → 站点全局。
// styles.min.css 是库官方合并压缩产物（tokens+base+components，
// gzip ≈13KB，满足 §4.4 全站 CSS ≤25KB 预算且为后续游戏页留余量）。
import "@marcomattes/epaper-components/styles.min.css";
import "@/styles/tokens.css";
import "@/styles/global.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
