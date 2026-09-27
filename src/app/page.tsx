// 根路径 / → 语言协商跳转页（2026-09 16 语言：JS 可用时按浏览器语言
// 落到对应语言站；无法协商时仍落 /en/）。
//
// 为什么用 HTML meta refresh 而不是服务端 301：本站 output: 'export'
// 纯静态导出，没有服务端可执行重定向；meta refresh + canonical 指向 /en/
// 是静态导出下 SEO 最稳的组合：Google 将 meta refresh 0 秒视为
// 重定向信号，canonical 明确告诉它索引目标是 /en/ 而非本页
//（爬虫不执行协商脚本，语义对 SEO 不变）。
// 协商脚本为纯 ES5 同步代码（老 Kindle WebKit 兼容）：
// navigator.languages 归一化 → 命中 16 语言之一即跳，否则 /en/；
// zh-Hant/zh-TW/zh-HK/zh-MO 归 zh-TW，其余 zh-* 归 zh。
// no-JS（老 Kindle）环境由 meta refresh 与可见链接兜底到 /en/。

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "E-Ink Games",
  description: "Free browser games for Kindle & e-ink readers.",
  alternates: {
    canonical: `${SITE_URL}/en/`,
  },
};

// 纯 ES5 同步语言协商（与 site 静态导出哲学一致：无 async、无箭头函数）。
const NEGOTIATE_SNIPPET = `(function(){var L=["en","zh","de","es","fr","it","pt","ja","ko","ru","nl","pl","tr","sv","ar","zh-TW"];function norm(t){t=(t||"").toLowerCase();if(t.indexOf("zh")===0){if(t.indexOf("-hant")>-1||t.indexOf("-tw")>-1||t.indexOf("-hk")>-1||t.indexOf("-mo")>-1)return"zh-TW";return"zh"}var p=t.split("-")[0];return L.indexOf(p)>-1?p:null}var langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language]);for(var i=0;i<langs.length;i++){var l=norm(langs[i]);if(l){location.replace("/"+l+"/");return}}location.replace("/en/")})()`;

export default function RootRedirectPage() {
  return (
    <html lang="en">
      <body>
        {/* React 19 会把 <meta> 提升到 <head>，此处写在 body 内即可 */}
        <meta httpEquiv="refresh" content="0; url=/en/" />
        <script dangerouslySetInnerHTML={{ __html: NEGOTIATE_SNIPPET }} />
        <noscript>
          <p>
            <a href="/en/">E-Ink Games — continue to the English site.</a>
          </p>
        </noscript>
      </body>
    </html>
  );
}
