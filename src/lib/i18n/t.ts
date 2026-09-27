// 极简 i18n 取词：点路径查嵌套字典；缺键或缺整份字典时回退英文（en），
// 仍缺失则原样回显 key（便于在页面上肉眼发现漏译）。

import { DEFAULT_LOCALE, ENABLED_LOCALES, type Locale } from "./config";
import type { Messages } from "./messages/en";
import en from "./messages/en";
import zh from "./messages/zh";

const dictionaries: Partial<Record<Locale, Messages>> = { en, zh };

function lookup(dict: Messages | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node !== null && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function t(locale: string, key: string): string {
  const loc: Locale = (ENABLED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : DEFAULT_LOCALE;
  return lookup(dictionaries[loc], key) ?? lookup(dictionaries[DEFAULT_LOCALE], key) ?? key;
}
