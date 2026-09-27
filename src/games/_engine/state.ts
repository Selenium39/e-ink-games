// 回合制通用状态机 + undo（契约 §4.4）。
// 状态更新为不可变风格：commit(newS) 传新对象；render 依赖 onChange 做最小脏区 diff（§6）。

export const UNDO_LIMIT_DEFAULT = 100;

/** 存档格式版本（state 层自有，与 storage 层 SCHEMA_VERSION 相互独立） */
export const STATE_SCHEMA_VERSION = 1;

/** S 必须是纯数据（JSON-serializable，无函数/类实例/undefined），否则 serialize 结果不合法 */
export interface Serialized<S> {
  v: number;
  current: S; // 存档只含当前态（契约决策⑤：不含 undo 栈，undo 历史刷新后丢失）
}

export interface StateMachine<S> {
  /** 当前状态（引用不变直到下次 commit/replace/undo） */
  get(): S;
  /** current 入 undo 栈后替换为 next；栈满丢最旧 */
  commit(next: S): void;
  /** 替换且不入 undo 栈（新开局/载入存档用） */
  replace(next: S): void;
  /** 回退一步并返回；栈空返回 null（不抛错） */
  undo(): S | null;
  canUndo(): boolean;
  undoDepth(): number;
  serialize(): Serialized<S>;
  /** v 不匹配或结构非法 → false 且状态不变 */
  deserialize(data: Serialized<S>): boolean;
  /** commit/replace/undo 后触发（render 订阅入口）；返回 off 函数 */
  onChange(fn: (s: S) => void): () => void;
}

export function createState<S>(
  initial: S,
  opts?: { undoLimit?: number },
): StateMachine<S> {
  let current: S = initial;
  const undoStack: S[] = [];
  const listeners: Array<(s: S) => void> = [];

  const undoLimit =
    opts &&
    typeof opts.undoLimit === "number" &&
    isFinite(opts.undoLimit) &&
    opts.undoLimit >= 0
      ? Math.floor(opts.undoLimit)
      : UNDO_LIMIT_DEFAULT;

  function notify(): void {
    // 订阅者（render）异常静默吞掉，与 events 模块同语义：不阻断其他监听者
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](current);
      } catch {
        /* 静默 */
      }
    }
  }

  return {
    get: () => current,

    commit(next: S): void {
      undoStack.push(current);
      if (undoStack.length > undoLimit) undoStack.shift();
      current = next;
      notify();
    },

    replace(next: S): void {
      current = next;
      notify();
    },

    undo(): S | null {
      const prev = undoStack.pop();
      if (prev === undefined) return null;
      current = prev;
      notify();
      return current;
    },

    canUndo: () => undoStack.length > 0,
    undoDepth: () => undoStack.length,

    serialize: () => ({ v: STATE_SCHEMA_VERSION, current }),

    deserialize(data: Serialized<S>): boolean {
      if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
      if (data.v !== STATE_SCHEMA_VERSION) return false;
      if (!("current" in data) || data.current === undefined) return false;
      // replace 语义（契约：载入存档不入 undo 栈）；已入栈的历史保留
      current = data.current;
      notify();
      return true;
    },

    onChange(fn: (s: S) => void): () => void {
      listeners.push(fn);
      return function () {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
  };
}
