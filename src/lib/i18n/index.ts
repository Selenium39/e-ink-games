// i18n 模块统一出口：import { t, ENABLED_LOCALES, hreflangAlternates } from "@/lib/i18n";

export { locales, ENABLED_LOCALES, DEFAULT_LOCALE, SITE_URL, hreflangAlternates } from "./config";
export type { Locale } from "./config";
export { t } from "./t";
