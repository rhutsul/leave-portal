import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Будівельні блоки loading.tsx: Skeleton у формі майбутнього вмісту (DESIGN.md, розділ 6). Кожна сторінка складає
 * з них свою форму, щоб після завантаження нічого не стрибало.
 */
export function LoadingPage({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** PageHeader: заголовок, рядок опису, праворуч — основна дія; `breadcrumb` — шлях над заголовком. */
export function HeaderShape({ action = true, breadcrumb = false }: { action?: boolean; breadcrumb?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2.5">
        {breadcrumb && <Skeleton className="h-3.5 w-24" />}
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-36 rounded-md" />}
    </div>
  );
}

/** Ряд вкладок-фільтрів (My requests, Decisions, кроки New request). */
export function TabsShape({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {widths.map((w, i) => (
        <Skeleton key={i} className={cn("h-8 rounded-md", w)} />
      ))}
    </div>
  );
}

/** Картка з рядками таблиці чи списку. */
export function RowsShape({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-9", i === rows - 1 && "w-4/5")} />
      ))}
    </div>
  );
}

/** Рядок карток залишків (BalanceCards); `detailed` — з подробицями під Sick і Personal, як на /balances. */
export function BalanceCardsShape({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-24" />
          {i < 2 && <Skeleton className="h-1.5 rounded-full" />}
          <Skeleton className="h-3 w-20" />
          {detailed && i < 2 && (
            <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2.5">
              <Skeleton className="h-3.5" />
              <Skeleton className="h-3.5" />
              <Skeleton className="h-3.5" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
