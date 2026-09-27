// 语言切换器（16 语言;2026-09 多语言补齐）。
//
// 交互哲学与站点三层增强一致：
//   1. 零 JS 可用——原生 <details>/<summary> 开合，SSG 链接默认指向各语言
//      首页 /{locale}/（任何情况下都是有效落点）；不支持 <details> 的极老
//      浏览器降级为常开列表，链接仍全部可点。
//   2. 有 JS 增强——下方内联 ES5 脚本读 location.pathname，把每个链接
//      改写为"当前路径的语言变体"（游戏页切语言仍在同一游戏页）。
//      precedent：GameShell 的 8s 加载探测脚本（同样内联、同样防御式）。
//   3. 爬虫可见——每条 <a> 带 hreflang 属性，与 head 的 alternates 呼应。
//
// server component（无 'use client'）：语言清单来自 config 的
// ENABLED_LOCALES，扩语言零改动。静态导出下 layout 拿不到当前 path，
// 故 href 改写只能放浏览器侧（见上方第 2 层）。

import { ENABLED_LOCALES, LOCALE_NAMES, t, type Locale } from "@/lib/i18n";

export default function LanguageMenu({ locale }: { locale: Locale }) {
  return (
    <details className="site-lang" id="site-lang">
      <summary aria-label={t(locale, "site.chrome.language.label")}>
        {LOCALE_NAMES[locale]}
      </summary>
      <ul>
        {ENABLED_LOCALES.map((l) => (
          <li key={l}>
            <a
              href={`/${l}/`}
              hrefLang={l}
              aria-current={l === locale ? "true" : undefined}
            >
              {LOCALE_NAMES[l]}
            </a>
          </li>
        ))}
      </ul>
      {/* 同路径换语言（纯 ES5；路径无语言前缀时不改写，保持默认）。
          执行时机：内联同步脚本会在 React 水合前跑、随后水合重建子树把
          href 恢复成 SSR 默认值——故延迟到水合后执行，且 rAF+load 双触发
          幂等（改写是纯 setAttribute，重复执行无害，同 GameShell 探测模式） */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            '(function(){function rw(){var d=document.getElementById("site-lang");if(!d)return;var p=location.pathname,m=p.match(/^\\/[a-z]{2}(?:-[A-Za-z]{2})?\\//);if(!m)return;var r=p.slice(m[0].length),a=d.getElementsByTagName("a");for(var i=0;i<a.length;i++){var l=a[i].getAttribute("hreflang");if(l&&a[i].getAttribute("href")!=="/"+l+"/"+r)a[i].setAttribute("href","/"+l+"/"+r)}}setTimeout(rw,100);if(document.readyState!=="loading"){window.addEventListener("load",rw)}else{document.addEventListener("DOMContentLoaded",rw)}})()',
        }}
      />
    </details>
  );
}
