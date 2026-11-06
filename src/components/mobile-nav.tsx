"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LogOut, Menu, XIcon } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { Theme } from "@/lib/preferences";
import { initials } from "@/lib/utils";
import { Button } from "./ui/button";
import { Logo } from "./ui/logo";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "./ui/sheet";
import { ThemeMenu } from "./ui/theme-menu";
import { SidebarNav } from "./sidebar-nav";

/** Фокус «ніде»: на `body` чи ще в меню, що закривається. Тоді його можна перенести на заголовок. */
function focusIsFree(heading: HTMLElement | null) {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  return active !== heading && active.closest('[data-slot="sheet-content"]') !== null;
}

/**
 * Заголовок сторінки отримує фокус після переходу з меню: зчитувач екрана починає з нової сторінки. Меню ще може
 * закриватись, а сторінка — спершу показати скелетон і потім замінити його вмістом разом із заголовком; тому до 2 с
 * повторюємо, поки фокус «ніде», — і зупиняємось, щойно користувач сам перевів фокус деінде.
 */
function focusHeading() {
  const until = Date.now() + 2000;
  const step = () => {
    const heading = document.querySelector<HTMLElement>("main h1");
    if (heading && focusIsFree(heading)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    const active = document.activeElement;
    const ours = active === heading || focusIsFree(heading);
    if (Date.now() < until && ours) setTimeout(step, 100);
  };
  step();
}

/**
 * Навігація вужче за `lg` (ADR 0008, DESIGN.md §12): липка «скляна» шапка з кнопкою меню, знаком і назвою; меню —
 * `Sheet` зліва з тими самими пунктами й лічильниками, вибором теми й акаунтом. Вибір пункту закриває меню, а фокус
 * переходить на заголовок нової сторінки; Esc чи клік повз меню повертає фокус на «Open menu». Від `lg` — бічна панель
 * (Sidebar), а ця шапка схована.
 */
export function MobileNav({
  name,
  email,
  awaiting,
  toDecide,
  canDecide,
  theme,
}: {
  name: string;
  email: string;
  awaiting: number;
  toDecide: number;
  canDecide: boolean;
  theme: Theme;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = search ? `${pathname}?${search}` : pathname;
  // Меню закрили вибором пункту: фокус — на заголовок нової сторінки, а не назад на «Open menu» (finalFocus вимкнено,
  // поки триває такий перехід; знову відкрите меню повертає звичну поведінку).
  const viaLink = useRef(false);
  // Заголовок наступної сторінки — один раз, для цього переходу.
  const headingPending = useRef(false);

  useEffect(() => {
    if (!headingPending.current) return;
    headingPending.current = false;
    focusHeading();
  }, [location]);

  function onNavClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as Element).closest("a");
    if (!link) return;
    viaLink.current = true;
    setOpen(false);
    // Той самий пункт — сторінка не зміниться, тож і ефект вище не спрацює: фокус — одразу.
    const url = new URL(link.href);
    const same = `${url.pathname}${url.search}` === location;
    headingPending.current = !same;
    if (same) focusHeading();
  }

  function onOpenChange(next: boolean) {
    if (next) viaLink.current = false;
    setOpen(next);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-border/70 bg-background/80 pr-3 pl-1 backdrop-blur-md backdrop-saturate-125 lg:hidden">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Open menu" onClick={() => onOpenChange(true)}>
          <Menu className="size-5" />
        </Button>
        <SheetContent
          side="left"
          className="max-w-[300px] bg-sidebar/95 text-sidebar-foreground"
          finalFocus={() => !viaLink.current}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-14 items-center gap-1 border-b border-border pr-2 pl-4">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-semibold text-foreground">
              <Logo />
              <span className="truncate">Leave Portal</span>
            </span>
            <ThemeMenu initial={theme} />
            <SheetClose render={<Button variant="ghost" size="icon" className="size-11" aria-label="Close menu" />}>
              <XIcon className="size-5" />
            </SheetClose>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4" onClick={onNavClick}>
            <SidebarNav awaiting={awaiting} toDecide={toDecide} canDecide={canDecide} collapsed={false} />
          </div>
          <div className="flex items-center gap-2.5 border-t border-border py-3 pr-2 pl-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
            >
              {initials(name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon" className="size-11" aria-label="Sign out" title="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
      <Link href="/" className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-foreground">
        <Logo />
        <span className="truncate">Leave Portal</span>
      </Link>
    </header>
  );
}
