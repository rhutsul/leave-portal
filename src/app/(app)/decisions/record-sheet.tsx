"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Набраний, але не надісланий коментар менеджера в панелі. */
function hasDraft(popup: Element | null) {
  return Boolean(popup?.querySelector<HTMLTextAreaElement>("textarea")?.value.trim());
}

/**
 * Запис «Decisions» у панелі справа (рішення користувача: список на всю ширину, запис — поверх нього). Відкрита, коли
 * в посиланні є `?record=`; закрити — повернутись до списку вкладки. Esc і клік повз панель не закривають її, поки в
 * полі коментаря є текст: щоб не загубити набране; хрестик закриває завжди. «Previous / Next» і клавіші ↑/↓ (коли
 * фокус у шапці панелі — там він і стоїть після відкриття) переходять між записами списку, не закриваючи панель.
 * Переходи — `replace`: «Назад» у браузері веде зі сторінки, а не по кожному переглянутому запису.
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
  /** "2 of 6" — де цей запис у списку; null — запису немає в списку (відмова чи вже вирішений). */
  position: string | null;
  closeHref: string;
  prevHref: string | null;
  nextHref: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const go = (href: string) => router.replace(href, { scroll: false });

  function onHeaderKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const href = event.key === "ArrowUp" ? prevHref : event.key === "ArrowDown" ? nextHref : null;
    if (!href) return;
    event.preventDefault();
    go(href);
  }

  return (
    <Sheet
      open
      onOpenChange={(open, details) => {
        if (open) return;
        const popup = document.querySelector('[data-slot="sheet-content"]');
        if ((details.reason === "escape-key" || details.reason === "outside-press") && hasDraft(popup)) {
          details.cancel();
          return;
        }
        go(closeHref);
      }}
    >
      <SheetContent>
        <SheetHeader
          onKeyDown={onHeaderKey}
          actions={
            position && (
              <>
                <span className="mr-1 text-xs tabular-nums text-muted-foreground">{position}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous record"
                  aria-keyshortcuts="ArrowUp"
                  disabled={!prevHref}
                  onClick={() => prevHref && go(prevHref)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next record"
                  aria-keyshortcuts="ArrowDown"
                  disabled={!nextHref}
                  onClick={() => nextHref && go(nextHref)}
                >
                  <ChevronDown />
                </Button>
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
