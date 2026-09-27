'use client';

// 游戏壳（契约 §7.1）：站点唯一 'use client' 游戏组件。职责仅三项——
//   1. 输出 <div id="game-root" data-game=… data-fallback=…>（含 noscript + 静态降级段落）；
//   2. 注入 <script defer src="/games/{slug}.js">；
//   3. SSG 时 data-fallback 取当前语言文案。
// 禁止承载 SEO 正文（契约 §7.3 双向禁令）；交互控件归游戏 render.ts（决策⑦）。

export interface GameShellProps {
  slug: string;
  /**
   * 特性检测失败时的降级文案（当前 locale；契约决策③：壳层预置，bundle 优先读取）。
   * 缺省用英文兜底文案。SSG 页面应从 games.common 公共词（§8.1）传入本地化文案。
   */
  fallback?: string;
  /** 禁 JS 时的提示文案。缺省英文。同上由页面传入本地化文案。 */
  noscript?: string;
}

const DEFAULT_FALLBACK = 'This game needs a newer browser.';
const DEFAULT_NOSCRIPT =
  'This game runs entirely in your browser — please enable JavaScript to play.';

export default function GameShell({
  slug,
  fallback = DEFAULT_FALLBACK,
  noscript = DEFAULT_NOSCRIPT,
}: GameShellProps) {
  return (
    <div id="game-root" data-game={slug} data-fallback={fallback}>
      <noscript>
        <p>{noscript}</p>
      </noscript>
      {/* JS 可用但浏览器过老时，bundle 的特性检测（§3.2）会用 data-fallback 替换本段落 */}
      <p data-game-fallback-text={fallback}>{fallback}</p>
      {/* 静态导出兼容：直接输出普通 defer script（非 type=module、非 next/script loader），
          SSR HTML 原样携带；defer 保证 DOM 解析完成后再执行，不阻塞首屏（契约 §7.1） */}
      <script defer src={`/games/${slug}.js`} />
    </div>
  );
}
