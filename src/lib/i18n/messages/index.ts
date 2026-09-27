// 字典聚合表：t.ts 的唯一数据源。
// 新增语言 = 补 messages/{locale}.ts（`const xx: Messages` 注解式约束）+
// 在此加一行 import 与登记——其余管道（t() 回退、页面消费）自动生效。

import type { Locale } from "../config";
import type { Messages } from "./en";
import en from "./en";
import zh from "./zh";
import de from "./de";
import es from "./es";
import fr from "./fr";
import it from "./it";
import pt from "./pt";
import ja from "./ja";

export const dictionaries: Partial<Record<Locale, Messages>> = {
  en,
  zh,
  de,
  es,
  fr,
  it,
  pt,
  ja,
};
