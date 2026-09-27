// 极简事件（契约 §4.3）。logic.ts 不使用 events（纯函数无副作用）；
// 本模块供 render 层内部解耦（如输入模块 → 棋盘模块）。

export type Handler<T = unknown> = (payload: T) => void;

export interface Emitter<Events extends Record<string, unknown>> {
  /** 注册监听；返回 off 函数 */
  on<K extends keyof Events & string>(event: K, fn: Handler<Events[K]>): () => void;
  off<K extends keyof Events & string>(event: K, fn: Handler<Events[K]>): void;
  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void;
}

/**
 * 行为钉死（契约 §4.3）：
 *  - emit 同步调用、按注册顺序；
 *  - emit 对 handler 列表取快照遍历——回调内 on/off 不影响本轮（不跳变）；
 *  - 回调内对**同一事件**再 emit 直接忽略（重入保护，不死递归）；
 *  - 单个 handler 抛错被吞掉且不中断后续 handler（墨水屏设备无 console，错误静默）。
 */
export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  const buckets: Record<string, Handler<never>[]> = Object.create(null);
  const emitting: Record<string, boolean> = Object.create(null);

  function off<K extends keyof Events & string>(event: K, fn: Handler<Events[K]>): void {
    const list = buckets[event];
    if (!list) return;
    const idx = list.indexOf(fn as Handler<never>);
    if (idx !== -1) list.splice(idx, 1);
  }

  return {
    on<K extends keyof Events & string>(event: K, fn: Handler<Events[K]>): () => void {
      const list = buckets[event] || (buckets[event] = []);
      list.push(fn as Handler<never>);
      return function () {
        off(event, fn);
      };
    },

    off,

    emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
      if (emitting[event]) return; // 重入保护
      const list = buckets[event];
      if (!list || list.length === 0) return;

      emitting[event] = true;
      try {
        const snapshot = list.slice();
        for (let i = 0; i < snapshot.length; i++) {
          try {
            (snapshot[i] as Handler<Events[K]>)(payload);
          } catch {
            /* 静默：不中断后续 handler */
          }
        }
      } finally {
        emitting[event] = false;
      }
    },
  };
}
