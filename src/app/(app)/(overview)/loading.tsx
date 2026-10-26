import { BalanceCardsShape, HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Overview: привітання, найближчі відпустки поруч із лічильником «Awaiting decision», нижче — залишки.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <div className="flex flex-wrap items-stretch gap-4">
        <RowsShape rows={3} className="min-w-0 flex-[999_1_520px]" />
        <div className="flex flex-[1_1_260px] flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="mt-auto h-4 w-28" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <BalanceCardsShape />
      </div>
    </LoadingPage>
  );
}
