import { HeaderShape, LoadingPage } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// School calendar: заголовок, рядок навчального року з перемикачем, сітка місяців і список закриттів (від lg — праворуч).
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-8 w-64 rounded-md" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-lg border border-border bg-card px-3 py-5 md:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] md:gap-x-6 md:px-5">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-36 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </LoadingPage>
  );
}
