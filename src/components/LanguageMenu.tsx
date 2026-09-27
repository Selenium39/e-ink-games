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
      {/* 增强（纯 ES5，两项职责）：
          1. 同路径换语言：href 默认 /{locale}/，改写为当前路径的语言变体。
             执行时机：内联同步脚本会在 React 水合前跑、随后水合重建子树把
             href 恢复成 SSR 默认值——故延迟到水合后执行，且双触发幂等。
          2. 浮层越界翻转：details toggle 时实测浮层 rect，超出视口即翻转
             对齐方向（CSS 断点 left/right 只覆盖典型布局，flex-wrap 换行
             时机随内容宽度浮动，中间区间靠此兜底；行内样式优先于媒体查询） */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            '(function(){function rw(){var d=document.getElementById("site-lang");if(!d)return;var p=location.pathname,m=p.match(/^\\/[a-z]{2}(?:-[A-Za-z]{2})?\\//);if(!m)return;var r=p.slice(m[0].length),a=d.getElementsByTagName("a");for(var i=0;i<a.length;i++){var l=a[i].getAttribute("hreflang");if(l&&a[i].getAttribute("href")!=="/"+l+"/"+r)a[i].setAttribute("href","/"+l+"/"+r)}}function flip(){var u=this.querySelector("ul");if(!u)return;u.style.left="";u.style.right="";var b=u.getBoundingClientRect(),vw=document.documentElement.clientWidth;if(b.right>vw+4){u.style.left="auto";u.style.right="0"}else if(b.left<0){u.style.left="0";u.style.right="auto"}}function bind(){var d=document.getElementById("site-lang");if(!d||d.dataset.flipBound==="1")return;d.dataset.flipBound="1";d.addEventListener("toggle",flip)}setTimeout(function(){rw();bind()},100);if(document.readyState!=="loading"){window.addEventListener("load",function(){rw();bind()})}else{document.addEventListener("DOMContentLoaded",function(){rw();bind()})}})()',
        }}
      />
    </details>
  );
}
