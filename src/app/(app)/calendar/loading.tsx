import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// School calendar: заголовок, рядок навчального року з перемикачем і таблиця закриттів.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-8 w-64 rounded-md" />
      </div>
      <RowsShape rows={4} />
    </LoadingPage>
  );
}
