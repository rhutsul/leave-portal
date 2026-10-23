import type { ReactNode } from "react";

/** Біла картка з рамкою — основний контейнер сторінок. */
export function Card({
  as: Tag = "section",
  className = "",
  children,
  ...rest
}: {
  as?: "section" | "div" | "aside" | "article";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Tag className={`rounded-2xl border border-border bg-card shadow-xs ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Заголовок картки з дією праворуч. */
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {action}
    </header>
  );
}
