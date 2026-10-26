import { BalanceCardsShape, HeaderShape, LoadingPage } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Balances: заголовок, панель вибору (працівник ліворуч, роки праворуч), рядок року й картки залишків з подробицями.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <Skeleton className="h-9 w-80 rounded-md" />
        <Skeleton className="h-8 w-64 rounded-md" />
      </div>
      <Skeleton className="h-5 w-52" />
      <BalanceCardsShape detailed />
    </LoadingPage>
  );
}
