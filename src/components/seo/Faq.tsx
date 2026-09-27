// FAQ 区块（server component）：语义 HTML（h3 + p）。
// 对应的 FAQPage JSON-LD 由页面层用 <JsonLd> 单独输出（契约 §8.2/§8.3）。

export interface FaqItem {
  q: string;
  a: string;
}

export default function Faq({
  items,
  title,
}: {
  items: readonly FaqItem[];
  title?: string;
}) {
  return (
    <section className="seo-faq">
      {title ? <h2>{title}</h2> : null}
      {items.map((item) => (
        <div key={item.q} className="seo-faq__item">
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </div>
      ))}
    </section>
  );
}
