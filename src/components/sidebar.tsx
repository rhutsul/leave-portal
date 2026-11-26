"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { preferenceCookie, SIDEBAR_COOKIE, type Theme } from "@/lib/preferences";
import { cn, initials } from "@/lib/utils";
import { Button } from "./ui/button";
import { Logo } from "./ui/logo";
import { ThemeMenu } from "./ui/theme-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { SidebarNav } from "./sidebar-nav";

/** Ctrl+B (на Mac — Cmd+B) згортає панель, але не в полі вводу: там це звичне «жирний». */
function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Бічна навігація (DESIGN.md, AppNav): знак і назва порталу, тема й згортання; розділи ролі; внизу — хто увійшов і
 * вихід. Згорнута (ADR 0005) — лише іконки з підказками, усе так само працює; стан — у cookie, яку читає
 * (app)/layout.tsx, тож після перезавантаження панель одразу потрібної ширини.
 */
export function Sidebar({
  name,
  email,
  awaiting,
  toDecide,
  canDecide,
  isAdmin = false,
  theme,
  initialCollapsed,
}: {
  name: string;
  email: string;
  awaiting: number;
  /** Записи «Awaiting decision», які користувач може вирішити (лічильник «Decisions»). */
  toDecide: number;
  canDecide: boolean;
  isAdmin?: boolean;
  theme: Theme;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => setCollapsed((was) => !was), []);

  // Cookie — поза оновленням стану (воно має бути чистим): читає її (app)/layout.tsx під час наступного рендеру.
  useEffect(() => {
    document.cookie = preferenceCookie(SIDEBAR_COOKIE, collapsed ? "collapsed" : null);
  }, [collapsed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // code, а не key: в українській розкладці key — «и». Без Shift (Ctrl+Shift+B — панель закладок) і без повтору.
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyB";
      // Вужче за lg бічної панелі немає (меню — з кнопки в шапці, ADR 0008): Ctrl+B нічого не робить.
      const wide = window.matchMedia("(min-width: 64rem)").matches;
      if (shortcut && wide && !event.repeat && !isEditable(event.target)) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col lg:flex overflow-x-hidden border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-(--duration-base) ease-out",
        collapsed ? "w-15" : "w-55",
      )}
    >
      <div
        className={cn(
          "flex border-b border-border py-3",
          collapsed ? "flex-col items-center gap-1.5" : "items-center gap-0.5 pr-2 pl-4",
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-2 text-[15px] font-semibold text-foreground", !collapsed && "flex-1")}>
          <Logo />
          {/* Назву видно лише в розгорнутій панелі; згорнута — знак, назва лишається для зчитувача екрана. */}
          <span className={cn("truncate", collapsed && "sr-only")}>Leave Portal</span>
        </div>
        <ThemeMenu initial={theme} side={collapsed ? "right" : "bottom"} align={collapsed ? "start" : "end"} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggle}
                aria-label={toggleLabel}
                aria-keyshortcuts="Control+B Meta+B"
              />
            }
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </TooltipTrigger>
          <TooltipContent side={collapsed ? "right" : "bottom"}>{toggleLabel} · Ctrl+B</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        <SidebarNav awaiting={awaiting} toDecide={toDecide} canDecide={canDecide} isAdmin={isAdmin} collapsed={collapsed} />
      </div>

      <div
        className={cn(
          "flex border-t border-border py-3",
          collapsed ? "flex-col items-center gap-2" : "items-center gap-2.5 pr-3 pl-4",
        )}
      >
        <AccountLink name={name} email={email} collapsed={collapsed} />
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </aside>
  );
}

/**
 * Акаунт унизу панелі: ініціали, ім'я й email — посилання на /account (ADR 0011). Згорнута панель — лише ініціали з
 * підказкою; назва посилання «Account: …» — для зчитувача екрана й Tab.
 */
function AccountLink({ name, email, collapsed }: { name: string; email: string; collapsed: boolean }) {
  const current = usePathname() === "/account";
  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger
        render={
          <Link
            href="/account"
            aria-label={`Account: ${name}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-md transition-colors duration-(--duration-fast) ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              collapsed ? "p-0.5" : "-my-1 -ml-1.5 flex-1 px-1.5 py-1",
              current && "bg-sidebar-accent",
            )}
          />
        }
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {initials(name)}
        </span>
        <span className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
          <span data-testid="user-name" className="block truncate text-[13px] font-medium text-foreground">
            {name}
          </span>
          <span data-testid="user-email" className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">
        Account · {name} · {email}
      </TooltipContent>
    </Tooltip>
  );
}
