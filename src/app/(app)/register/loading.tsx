import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Register: заголовок з «Download CSV», панель вибору (підрозділ ліворуч, місяць праворуч), рядок підрозділу й місяця,
// таблиця реєстру й підсумок.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
        <Skeleton className="h-9 w-72 rounded-md" />
        <Skeleton className="h-8 w-56 rounded-md" />
      </div>
      <Skeleton className="h-5 w-60" />
      <RowsShape rows={6} />
      <Skeleton className="h-4 w-96 max-w-full" />
    </LoadingPage>
  );
}
