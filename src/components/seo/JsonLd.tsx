// JSON-LD 输出（server component）：接受 schema.org 对象数组，每项一个
// <script type="application/ld+json">。文案由页面从内容文件组装（契约 §8.3），
// 本组件不做任何业务解释。

export type JsonLdObject = Record<string, unknown>;

export default function JsonLd({ data }: { data: readonly JsonLdObject[] }) {
  return (
    <>
      {data.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // `<` 转义为 <：防止内容中闭合 script 标签（JSON-LD 值来源为内容文件，仍按防御处理）
            __html: JSON.stringify(obj).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
