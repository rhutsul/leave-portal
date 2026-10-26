import { HeaderShape, LoadingPage, TabsShape } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// New request: кроки форми, ліворуч — картка кроку з календарем, праворуч — підсумок «Your request».
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} breadcrumb />
      <TabsShape widths={["w-20", "w-24", "w-20", "w-24"]} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-lg border border-border bg-card px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-7">
            <Skeleton className="h-72 w-72 rounded-md" />
            <div className="flex min-w-56 flex-1 flex-col gap-2.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-14 rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex max-w-full flex-[1_1_300px] flex-col gap-3.5 rounded-lg border border-border bg-card px-5 py-4.5 shadow-sm">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    </LoadingPage>
  );
}
