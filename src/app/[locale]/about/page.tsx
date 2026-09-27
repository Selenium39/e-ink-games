// 关于页（占位版）：品牌一句话 + 导流主站段落占位。
// 长文案与 FAQ 由后续内容任务填充（实施方案 §6.2 长尾策略）。

import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: t(locale, "site.about.title"),
    description: t(locale, "site.about.intro"),
    // 与首页/游戏页同源（路径感知版 canonical + hreflang 全集）
    alternates: alternatesFor(`/${locale}/about/`),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="site-about">
      <h1 className="site-home-title">{t(locale, "site.about.h1")}</h1>
      <p className="site-intro">{t(locale, "site.about.intro")}</p>

      <hr className="ink-rule ink-rule--thick" />

      <section className="site-section site-about-family" aria-labelledby="family-heading">
        <h2 id="family-heading">{t(locale, "site.about.familyTitle")}</h2>
        {/* 导流主站：段落为占位文案，由 about 内容任务替换成正式版本 */}
        <p>
          {t(locale, "site.about.familyPlaceholder")}{" "}
          <a href="https://e-ink.me" rel="noopener">
            {t(locale, "site.about.familyCta")}
          </a>
        </p>
      </section>

      <p className="site-back">
        <Link href={`/${locale}/`}>← {t(locale, "site.chrome.nav.games")}</Link>
      </p>
    </div>
  );
}
