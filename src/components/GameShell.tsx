'use client';

// 游戏壳（契约 §7.1）：站点唯一 'use client' 游戏组件。职责仅三项——
//   1. 输出 <div id="game-root" data-game=… data-fallback=…>（含 noscript + 加载占位段落）；
//   2. 注入 <script defer src="/games/{slug}.js">；
//   3. SSG 时 data-fallback 取当前语言文案。
// 禁止承载 SEO 正文（契约 §7.3 双向禁令）；交互控件归游戏 render.ts（决策⑦）。
//
// 加载状态语义（2026-09 修复线上间歇性"浏览器过老"误报）：
// 占位段默认显示中性的"加载中"——bundle 挂载成功即被清掉（mount 首行
// root.textContent=""）。两类失败路径分开兜底：
//   - bundle 已执行但特性检测失败（§3.2）：bundle 自行用 data-fallback 整段替换；
//   - bundle 根本没执行（弱网/CDN 抖动/被拦截，defer script 无重试）：
//     下方 inline 探测 8s 后把占位段改写为 data-load-error 文案。

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
}: GameShellProps) {
  return (
    <div id="game-root" data-game={slug} data-fallback={fallback} data-load-error={error}>
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
