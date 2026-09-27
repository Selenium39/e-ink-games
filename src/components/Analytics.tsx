// 统计脚本门控注入（server component，构建期求值）。
//
// 三个环境变量全部可选、互相独立：
//   NEXT_PUBLIC_GA4_ID    Google Analytics 4 衡量 ID（G-XXXXXXXX）
//   NEXT_PUBLIC_UMAMI_ID  Umami 网站 ID
//   NEXT_PUBLIC_UMAMI_SRC Umami 脚本地址（自托管，https://…/script.js）
//
// 未设置 = 该统计源完全不渲染任何标签（零输出、零外域请求）——静态导出下
// env 缺失时本组件返回 null，HTML 里不留任何痕迹（§4.4 零请求红线）。
// 格式校验防呆：ID/URL 形状不对时构建期 warn 并跳过，绝不把畸形值拼进页面。
// 变量名与占位注释见 .env.example；仓库中不得出现任何真实 key（安全红线）。

const GA4_RE = /^G-[A-Z0-9]{6,12}$/i;

export default function Analytics() {
  const ga4 = process.env.NEXT_PUBLIC_GA4_ID;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_ID;
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;

  const ga4Ok = ga4 ? GA4_RE.test(ga4) : false;
  if (ga4 && !ga4Ok) {
    console.warn(
      `[analytics] NEXT_PUBLIC_GA4_ID="${ga4}" 不是合法 GA4 衡量 ID（应形如 G-XXXXXXXXXX），已跳过注入`,
    );
  }

  const umamiOk =
    Boolean(umamiId) && Boolean(umamiSrc) && /^https:\/\//.test(umamiSrc as string);
  if (umamiId && umamiSrc && !umamiOk) {
    console.warn(
      "[analytics] NEXT_PUBLIC_UMAMI_ID / NEXT_PUBLIC_UMAMI_SRC 需成对设置且 SRC 须为 https:// 地址，已跳过注入",
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
