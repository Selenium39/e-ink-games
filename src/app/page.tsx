// 根路径 / → /en/ 的跳转页。
//
// 为什么用 HTML meta refresh 而不是服务端 301：本站 output: 'export'
// 纯静态导出（next.config.ts），没有服务端可执行重定向；Cloudflare Pages
// 虽可用 _redirects 文件做 301，但那会把重定向规则放在代码库之外、
// 且本地 `out/` 产物不可自验证。meta refresh + canonical 指向 /en/
// 是静态导出下 SEO 最稳的组合：Google 将 meta refresh 0 秒视为
// 重定向信号，canonical 明确告诉它索引目标是 /en/ 而非本页。
// JS location.replace 只是给现代浏览器的即时兜底，no-JS（老 Kindle）
// 环境由 meta refresh 与可见链接兜底。

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "E-Ink Games",
  description: "Free browser games for Kindle & e-ink readers.",
  alternates: {
    canonical: `${SITE_URL}/en/`,
  },
};

export default function RootRedirectPage() {
  return (
    <html lang="en">
      <body>
        {/* React 19 会把 <meta> 提升到 <head>，此处写在 body 内即可 */}
        <meta httpEquiv="refresh" content="0; url=/en/" />
        <script
          dangerouslySetInnerHTML={{ __html: `location.replace("/en/")` }}
        />
        <noscript>
          <p>
            <a href="/en/">E-Ink Games — continue to the English site.</a>
          </p>
        </noscript>
      </body>
    </html>
  );
}
