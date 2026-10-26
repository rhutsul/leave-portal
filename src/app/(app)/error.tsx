"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

// Неочікувана помилка сторінки після входу: меню лишається (layout вище межі), сторінку можна завантажити ще раз.
// Подробиць помилки не показуємо — у production Next.js і так передає лише digest (error.md у документації Next.js).
// Клієнтський код може кинути й не Error (null, рядок): тоді показуємо ту саму сторінку, лише без ідентифікатора.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <>
      <PageHeader title="This page could not be loaded" />
      <Alert variant="destructive" role="alert">
        <CircleAlert />
        <AlertTitle>Something went wrong on our side</AlertTitle>
        <AlertDescription>
          Your data is safe. Try again, and if the page still does not load, come back later.
          {digest && <span className="mt-1 block font-mono text-xs">Error ID: {digest}</span>}
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw />
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to Overview
        </Link>
      </div>
    </>
  );
}
