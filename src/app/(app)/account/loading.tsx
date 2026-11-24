import { HeaderShape, LoadingPage } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Account: заголовок без дії; картка даних (три рядки) і картка форми пароля (три поля й кнопка).
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex max-w-md flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 rounded-md" />
            </div>
          ))}
          <div className="flex max-w-md justify-end">
            <Skeleton className="h-9 w-36 rounded-md max-sm:w-full" />
          </div>
        </div>
      </div>
    </LoadingPage>
  );
}
