// window.EGames 全局注册表类型声明（契约 §3.3）。
// 每个 bundle 在特性检测通过后向 window.EGames 注册 { mount }，并自挂载到
// #game-root[data-game="{slug}"]。

export interface MountOpts {
  /** 预留：外部注入每日种子等（契约 §3.3.5；缺省 undefined 时 seeded 游戏自行取当日种子） */
  seed?: number;
}

declare global {
  interface Window {
    EGames: Record<string, { mount: (root: HTMLElement, opts?: MountOpts) => void }>;
  }
}

export {};
