// 游戏框（契约 §7.2）：server component（禁止 'use client'）。
// 三区布局：棋盘主区（children）+ 可选静态侧栏（sidebar）+ 可选静态导流位（promo）。
// 交互控件一律不作为 props 传入（契约决策⑦）——全部由游戏 render.ts 创建。
// epaper 印刷美学：3px 粗线 / 1px 细线分隔、直角、无圆角、无动画、纯黑白。

import type { ReactNode } from "react";

export interface GameFrameProps {
  /** 棋盘/游戏区——页面组合时放入 <GameShell slug=… /> */
  children: ReactNode;
  /** 可选：SSG 静态侧栏（设备提示卡等，无交互） */
  sidebar?: ReactNode;
  /** 导流位（SSG 静态，无 JS 可见；契约 §8 cta 字段渲染于此） */
  promo?: ReactNode;
}

const CSS = `
.game-frame{border-top:3px solid var(--ink-fg,#000)}
.game-frame__inner{display:grid;grid-template-columns:1fr}
.game-frame__board{min-width:0;padding:1.25rem 0 1.5rem}
.game-frame__sidebar{border-top:1px solid var(--ink-fg,#000);padding:1rem 0 0}
.game-frame__promo{border-top:3px solid var(--ink-fg,#000);border-bottom:1px solid var(--ink-fg,#000);padding:1rem 0;margin-top:1.5rem}
@media (min-width:48em){
  .game-frame__inner--with-sidebar{grid-template-columns:minmax(0,1fr) 17rem;column-gap:2.5rem}
  .game-frame__inner--with-sidebar .game-frame__sidebar{border-top:0;border-left:1px solid var(--ink-fg,#000);padding:0 0 0 1.5rem}
}
`;

export default function GameFrame({ children, sidebar, promo }: GameFrameProps) {
  return (
    <section className="game-frame">
      {/* 组件自带样式：React 19 按 href 去重提升，静态导出无额外请求 */}
      <style href="game-frame" precedence="default">{CSS}</style>
      <div
        className={
          "game-frame__inner" + (sidebar ? " game-frame__inner--with-sidebar" : "")
        }
      >
        <div className="game-frame__board">{children}</div>
        {sidebar ? <aside className="game-frame__sidebar">{sidebar}</aside> : null}
      </div>
      {promo ? <aside className="game-frame__promo">{promo}</aside> : null}
    </section>
  );
}
