// 统计脚本门控注入（server component，构建期求值）。
//
// GA4 与 Umami 互相独立：
//   NEXT_PUBLIC_GA4_ID    Google Analytics 4 衡量 ID（G-XXXXXXXX）——未设置 = 完全不注入
//   NEXT_PUBLIC_UMAMI_*   Umami 覆盖值（可选）——未设置时使用下方内置默认值
//
// Umami 接入参数直接内置（2026-09-27 站长裁决）：website id 本就会随页面
// HTML 公开渲染给所有访客，不构成机密；src 为自托管实例地址。
// GA4 保持纯环境变量门控：未设置时零输出、零外域请求（§4.4）。
// 格式校验防呆：ID/URL 形状不对时构建期 warn 并跳过，绝不把畸形值拼进页面。

const GA4_RE = /^G-[A-Z0-9]{6,12}$/i;

// 内置 Umami（自托管 umami.selenium39.me）；env 设置时覆盖内置值。
const DEFAULT_UMAMI_SRC = "https://umami.selenium39.me/script.js";
const DEFAULT_UMAMI_ID = "1d1fb9fa-b17e-4b56-8f34-bcf9b89143e4";

export default function Analytics() {
  const ga4 = process.env.NEXT_PUBLIC_GA4_ID;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_ID ?? DEFAULT_UMAMI_ID;
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC ?? DEFAULT_UMAMI_SRC;

  const ga4Ok = ga4 ? GA4_RE.test(ga4) : false;
  if (ga4 && !ga4Ok) {
    console.warn(
      `[analytics] NEXT_PUBLIC_GA4_ID="${ga4}" 不是合法 GA4 衡量 ID（应形如 G-XXXXXXXXXX），已跳过注入`,
    );
  }

  const umamiOk = Boolean(umamiId) && /^https:\/\//.test(umamiSrc);
  if (!umamiOk) {
    console.warn(
      "[analytics] Umami 配置非法（ID 缺失或 SRC 非 https://），已跳过注入",
    );
  }

  return (
    <>
      {ga4Ok ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} />
          <script
            dangerouslySetInnerHTML={{
              __html:
                `window.dataLayer=window.dataLayer||[];` +
                `function gtag(){dataLayer.push(arguments);}` +
                `gtag('js',new Date());gtag('config','${ga4}');`,
            }}
          />
        </>
      ) : null}
      {/* Umami 官方 snippet 语义：defer + data-website-id */}
      {umamiOk ? (
        <script defer src={umamiSrc} data-website-id={umamiId} />
      ) : null}
    </>
  );
}
