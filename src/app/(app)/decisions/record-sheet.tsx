"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Запис «Decisions» у панелі справа (рішення користувача: список на всю ширину, запис — поверх нього). Відкрита, коли
 * в посиланні є `?record=`; закрити (Esc, хрестик, клік повз) — повернутись до списку вкладки. «Previous / Next» і
 * клавіші ↑/↓ (не в полі коментаря) переходять між записами списку, не закриваючи панель.
 */
export function RecordSheet({
  title,
  description,
  badge,
  position,
  closeHref,
  prevHref,
  nextHref,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  /** "2 of 6" — де цей запис у списку; null — запису немає в списку (відмова). */
  position: string | null;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      // Поки відкрите підтвердження Approve чи Reject, стрілки належать йому.
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      const href = event.key === "ArrowUp" ? prevHref : event.key === "ArrowDown" ? nextHref : null;
      if (!href) return;
      event.preventDefault();
      router.push(href, { scroll: false });
    }
    // Фаза захоплення: усередині Dialog Base UI клавіші до window не доходять.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [prevHref, nextHref, router]);

  const step = buttonVariants({ variant: "ghost", size: "icon-sm" });

  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent aria-label="Selected record">
        <SheetHeader
          actions={
            position && (
              <>
                <span className="mr-1 text-xs tabular-nums text-muted-foreground">{position}</span>
                {prevHref ? (
                  <Link href={prevHref} scroll={false} aria-label="Previous record" aria-keyshortcuts="ArrowUp" className={step}>
                    <ChevronUp />
                  </Link>
                ) : (
                  <span aria-hidden="true" className={cn(step, "opacity-40")}>
                    <ChevronUp />
                  </span>
                )}
                {nextHref ? (
                  <Link href={nextHref} scroll={false} aria-label="Next record" aria-keyshortcuts="ArrowDown" className={step}>
                    <ChevronDown />
                  </Link>
                ) : (
                  <span aria-hidden="true" className={cn(step, "opacity-40")}>
                    <ChevronDown />
                  </span>
                )}
              </>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <SheetTitle>{title}</SheetTitle>
            {badge}
          </div>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
