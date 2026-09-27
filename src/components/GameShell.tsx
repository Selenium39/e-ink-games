'use client';

import { useEffect } from "react";

// 游戏壳（契约 §7.1）：站点唯一 'use client' 游戏组件。职责仅四项——
//   1. 输出 <div id="game-root" data-game=… data-fallback=…>（含 noscript + 加载占位段落）；
//   2. 注入 <script defer src="/games/{slug}.js">；
//   3. SSG 时 data-fallback 取当前语言文案；
//   4. SSG 时 data-egames-words 注入当前语言的引擎 UI 词表
//      （words.en.ts + ui-words.json 合并结果；bundle mount 时读取，
//      缺键英文兜底——2026-09 16 语言通道）。
// 禁止承载 SEO 正文（契约 §7.3 双向禁令）；交互控件归游戏 render.ts（决策⑦）。
//
// #game-root 恒 dir="ltr"：盘面是坐标语义 grid（数独 9×9、2048 方向键），
// RTL 语言（ar）页面上游戏区不镜像；页面正文 RTL 由 layout 的 <html dir> 决定。
//
// 加载状态语义（2026-09 修复线上间歇性"浏览器过老"误报）：
// 占位段默认显示中性的"加载中"——bundle 挂载成功即被清掉（mount 首行
// root.textContent=""）。两类失败路径分开兜底：
//   - bundle 已执行但特性检测失败（§3.2）：bundle 自行用 data-fallback 整段替换；
//   - bundle 根本没执行（弱网/CDN 抖动/被拦截，defer script 无重试）：
//     下方 inline 探测 8s 后把占位段改写为 data-load-error 文案。
//
// 客户端路由挂载通道（2026-09 修复"站内导航进游戏页永远 loading"）：
// React 客户端渲染插入的 <script> 不会被浏览器执行（react.dev/reference/
// react-dom/components/script：仅 async script 受 React 加载管理）——SSG HTML
// 里的 defer script 只在整页加载时执行，站内 Link 导航到达的页面里它是死 DOM，
// 游戏 bundle 从未被请求，占位段永远停在"加载中"（线上实测复现）。故本组件
// useEffect 补一条指令式通道，与 SSR defer 双轨并存：
//   - bundle 未执行（window.EGames[slug] 缺席）且占位仍在：createElement
//     注入 async script（.src 属性赋值的动态 script 必执行），onerror 时把
//     占位段改写为 data-load-error 文案（客户端导航场景 inline 探测同样
//     是死脚本，由本通道接管失败反馈）；
//   - bundle 已执行过（再次客户端导航回本页，React 重建了占位子树）：
//     直接调用注册表里的幂等 mount 重挂（§3.3.3）；
//   - SSR defer 已先行完成挂载（占位已被清）：什么都不做。
// 双轨并发的双执行（慢网直开：defer 在途时本通道又注入一份）由 bundle 顶层
// 幂等 guard 拦截（scripts/build-games.mjs 统一包裹）。

export interface GameShellProps {
  slug: string;
  /**
   * 特性检测失败时的降级文案（当前 locale；契约决策③：壳层预置，bundle 优先读取）。
   * 缺省用英文兜底文案。SSG 页面应从 games.common 公共词（§8.1）传入本地化文案。
   */
  fallback?: string;
  /** 禁 JS 时的提示文案。缺省英文。同上由页面传入本地化文案。 */
  noscript?: string;
  /** bundle 执行前的加载占位文案（JS 可用时短暂可见）。缺省英文。 */
  loading?: string;
  /** bundle 加载/执行失败（超时探测）时的提示文案。缺省英文。 */
  error?: string;
  /** 引擎 UI 词表（当前 locale；页面 SSG 从 words.en.ts + ui-words.json 合并）。 */
  words?: Record<string, string>;
}

const DEFAULT_FALLBACK = 'This game needs a newer browser.';
const DEFAULT_NOSCRIPT =
  'This game runs entirely in your browser — please enable JavaScript to play.';
const DEFAULT_LOADING = 'Loading…';
const DEFAULT_ERROR = 'Failed to load the game — please refresh to retry.';

export default function GameShell({
  slug,
  fallback = DEFAULT_FALLBACK,
  noscript = DEFAULT_NOSCRIPT,
  loading = DEFAULT_LOADING,
  error = DEFAULT_ERROR,
  words,
}: GameShellProps) {
  // 指令式挂载通道：见文件头"客户端路由挂载通道"。依赖数组仅 slug
  //（SSG 页面 locale 变化 = 不同 URL 的整页加载，不产生同组件重挂）。
  useEffect(() => {
    const root = document.getElementById("game-root");
    if (!root || root.getAttribute("data-game") !== slug) return;

    const entry = window.EGames?.[slug];
    if (entry) {
      // bundle 已执行过：再次客户端导航回本页，React 重建的占位子树
      // 需幂等重挂（mount 自带全新开局 + 存档恢复语义）
      if (root.querySelector("p[data-game-loading]")) entry.mount(root);
      return;
    }
    // 占位已被清 = SSR defer 通道已完成挂载（或 MO 重挂在途），不介入
    if (!root.querySelector("p[data-game-loading]")) return;

    // bundle 从未执行（客户端导航到达 / SSR defer 尚在途中）：
    // 指令式注入。.src 属性赋值的动态 script 浏览器必执行
    const script = document.createElement("script");
    script.src = `/games/${slug}.js`;
    script.async = true;
    script.onerror = () => {
      const placeholder = root.querySelector("p[data-game-loading]");
      if (placeholder) {
        placeholder.textContent = root.getAttribute("data-load-error") || DEFAULT_ERROR;
      }
    };
    document.body.appendChild(script);
  }, [slug]);

  return (
    <div
      id="game-root"
      data-game={slug}
      data-fallback={fallback}
      data-load-error={error}
      data-egames-words={words ? JSON.stringify(words) : undefined}
      dir="ltr"
    >
      <noscript>
        <p>{noscript}</p>
      </noscript>
      {/* 加载占位：JS 执行前的默认可见状态。挂载成功被 mount 清掉；
          特性检测失败被 bundle 以 data-fallback 文案整段替换（§3.2 决策③） */}
      <p data-game-loading>{loading}</p>
      {/* 加载失败探测：8s 后占位段仍在 = bundle 从未执行（defer 无重试无 onerror）。
          纯常量字符串无注入面；React 水合若重建本子树致重执行，重复 setTimeout 幂等无害 */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'setTimeout(function(){var r=document.getElementById("game-root"),p=r&&r.querySelector("p[data-game-loading]");if(p)p.textContent=r.getAttribute("data-load-error")},8000)',
        }}
      />
      {/* 静态导出兼容：直接输出普通 defer script（非 type=module、非 next/script loader），
          SSR HTML 原样携带；defer 保证 DOM 解析完成后再执行，不阻塞首屏（契约 §7.1） */}
      <script defer src={`/games/${slug}.js`} />
    </div>
  );
}
