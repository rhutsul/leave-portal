import { BalanceCardsShape, HeaderShape, LoadingPage } from "@/components/loading-shapes";
import { Skeleton } from "@/components/ui/skeleton";

// Balances: заголовок, рядок навчального року з переходами між роками і картки залишків з подробицями.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-52" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <BalanceCardsShape detailed />
    </LoadingPage>
  );
}
