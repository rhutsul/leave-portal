import type { ReactNode } from "react";

/** Заголовок сторінки: над ним — необов'язковий шлях, праворуч — дії. */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {breadcrumb && <div className="mb-1.5 text-[13px] text-muted-foreground">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2.5">{actions}</div>}
    </div>
  );
}
