"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChartColumn, ClipboardCheck, House, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: ReactNode; deciders?: true }[] = [
  { href: "/", label: "Overview", icon: <House /> },
  { href: "/requests/new", label: "New request", icon: <Plus /> },
  { href: "/requests", label: "My requests", icon: <List /> },
  { href: "/decisions", label: "Decisions", icon: <ClipboardCheck />, deciders: true },
  { href: "/balances", label: "Balances", icon: <ChartColumn /> },
];

/**
 * Іконка пункту, а поки перехід на його сторінку ще чекає сервера — спінер на її місці (useLinkStatus). Спінер
 * з'являється лише через 100 ms, щоб швидкий перехід не блимав; розмір той самий, тож рядок не зсувається.
 */
function NavIcon({ icon }: { icon: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative grid size-4 shrink-0 place-items-center">
      <span className={cn("contents", pending && "*:animate-pending-out")}>{icon}</span>
      {pending && (
        <span aria-hidden="true" className="absolute inset-0.5 animate-pending-in">
          <span className="block size-full rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
        </span>
      )}
    </span>
  );
}

/**
 * canDecide — роль manager чи admin: лише їм пункт «Decisions» (матриця прав requirements/product.md). Лічильники:
 * у «My requests» — власні записи, що чекають рішення; у «Decisions» — ті, що чекають рішення цього користувача
 * (на primary, DESIGN.md, AppNav).
 */
export function SidebarNav({ awaiting, toDecide, canDecide }: { awaiting: number; toDecide: number; canDecide: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {LINKS.filter((l) => !l.deciders || canDecide).map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-(--duration-fast) ease-out [&_svg]:size-4 [&_svg]:shrink-0",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <NavIcon icon={icon} />
            {label}
            {href === "/requests" && awaiting > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-status-awaiting px-1.5 text-[11px] font-semibold tabular-nums text-status-awaiting-foreground">
                {awaiting}
                <span className="sr-only"> awaiting decision</span>
              </span>
            )}
            {href === "/decisions" && toDecide > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {toDecide}
                <span className="sr-only"> awaiting your decision</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
