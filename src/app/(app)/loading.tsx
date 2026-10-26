import { Skeleton } from "@/components/ui/skeleton";

// Поки сторінка завантажує дані — Skeleton у формі майбутнього вмісту: заголовок, опис і таблиця (DESIGN.md, розділ 6).
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5 shadow-sm">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9 w-4/5" />
      </div>
    </div>
  );
}
