// 面包屑（server component）：nav > ol > li 语义结构。
// 对应的 BreadcrumbList JSON-LD 由页面层用 <JsonLd> 单独输出。

export interface BreadcrumbCrumb {
  name: string;
  href: string;
}

const CSS = `
.seo-breadcrumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:0 .375rem;font-size:.875rem}
.seo-breadcrumbs li{display:flex;gap:.375rem}
`;

export default function Breadcrumbs({
  items,
  label = "Breadcrumb",
}: {
  items: readonly BreadcrumbCrumb[];
  label?: string;
}) {
  return (
    <nav className="seo-breadcrumbs" aria-label={label}>
      <style href="seo-breadcrumbs" precedence="default">{CSS}</style>
      <ol>
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={crumb.href}>
              {isLast ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <>
                  <a href={crumb.href}>{crumb.name}</a>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
