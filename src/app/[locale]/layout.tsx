// 语言段布局：文档壳（<html lang>）+ 站点 chrome（header/footer）。
//
// 静态导出：generateStaticParams 只产出 ENABLED_LOCALES（en、zh），
// 扩语言时只需改 src/lib/i18n/config.ts 的 ENABLED_LOCALES 并补字典。
// root layout（src/app/layout.tsx）是 pass-through，html/body 在此提供，
// 以便 <html lang> 跟随语言。

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Analytics from "@/components/Analytics";
import {
  ENABLED_LOCALES,
  SITE_URL,
  t,
  type Locale,
} from "@/lib/i18n";

export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

// 布局级默认元数据；各页面（首页/about）用 page 级 metadata 覆盖
// title/description，并提供各自的 canonical + hreflang。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t(locale, "site.home.title"),
      template: "%s — E-Ink Games",
    },
    description: t(locale, "site.home.description"),
    // 零外部请求（§4.4）：favicon 用内联 SVG 文件（public/favicon.svg），
    // 无 PNG/ICO 链，避免多余位图请求。
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // 静态导出下只会产出 ENABLED_LOCALES；此守卫防御未来的动态渲染路径。
  if (!(ENABLED_LOCALES as readonly string[]).includes(locale)) {
    notFound();
  }
  const loc = locale as Locale;

  return (
    <html lang={loc}>
      <body>
        <div className="ink-page">
          <a className="site-skip" href="#main-content">
            {t(loc, "site.chrome.skipToContent")}
          </a>

          <header className="site-header">
            <div>
              <p className="site-brand">
                <Link href={`/${loc}/`}>{t(loc, "site.chrome.brand")}</Link>
              </p>
              <p className="site-tagline">
                {t(loc, "site.chrome.tagline")}
              </p>
            </div>
            <nav className="site-nav" aria-label={t(loc, "site.chrome.nav.label")}>
              {/* 首页即游戏目录；分类页上线后由目录任务在此扩充 */}
              <Link href={`/${loc}/`}>{t(loc, "site.chrome.nav.games")}</Link>
              <Link href={`/${loc}/about/`}>
                {t(loc, "site.chrome.nav.about")}
              </Link>
            </nav>
          </header>

          <main id="main-content">{children}</main>

          <footer className="site-footer">
            {/* 导流条（实施方案 §6.4）：免费站唯一 KPI，导流主站 e-ink.me */}
            <p className="site-family">
              <a href="https://e-ink.me" rel="noopener">
                {t(loc, "site.chrome.footer.family")} —{" "}
                {t(loc, "site.chrome.footer.familyCta")}
              </a>
            </p>
            <p className="site-rights">
              {t(loc, "site.chrome.footer.rights")}
            </p>
          </footer>

          {/* [analytics 注入位] GA4 + Umami，由 NEXT_PUBLIC_GA4_ID /
           * NEXT_PUBLIC_UMAMI_ID / NEXT_PUBLIC_UMAMI_SRC 环境变量门控（见
           * src/components/Analytics.tsx 与 .env.example）——未设置时组件
           * 返回 null，零输出、零外域请求（§4.4 性能预算）。 */}
          <Analytics />
        </div>
      </body>
    </html>
  );
}
