import { LoadingPage, RowsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Overview v3: шапка з привітанням і місяцем, смуга чисел, діаграма на два тижні, «Next leave» і «To decide» поруч, стрічка дій.
export default function Loading() {
  return (
    <LoadingPage>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-b border-border pb-6">
        <div className="flex min-w-[260px] flex-[1_1_260px] flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="mt-1.5 h-9 w-36" />
        </div>
        <Skeleton className="h-48 min-w-[320px] flex-[0_1_400px]" />
      </div>
      <div className="@container overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-2 gap-px bg-border @2xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2.5 bg-card px-5 py-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
        </div>
      </div>
      <RowsShape rows={3} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-6">
        <RowsShape rows={3} />
        <RowsShape rows={3} />
      </div>
      <RowsShape rows={4} />
    </LoadingPage>
  );
}
