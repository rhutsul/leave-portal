import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Request on behalf: заголовок, поле пошуку й список працівників.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <div className="flex max-w-sm flex-col gap-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 rounded-md" />
      </div>
      <RowsShape rows={5} />
    </LoadingPage>
  );
}
