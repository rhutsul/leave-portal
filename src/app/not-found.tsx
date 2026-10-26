import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page not found · Leave portal" };

// Адреса, якої немає в порталі: пояснення й посилання на головну (DESIGN.md, розділ 6). Поза меню — сторінка
// показується й без входу.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-8 text-sm text-foreground">
      <EmptyState
        className="w-full max-w-md"
        icon={<SearchX className="size-5" aria-hidden="true" />}
        titleAs="h1"
        title="Page not found"
        text="This address is not part of the leave portal. Check the link or start from the overview."
        action={
          <Link href="/" className={buttonVariants()}>
            Go to Overview
          </Link>
        }
      />
    </main>
  );
}
